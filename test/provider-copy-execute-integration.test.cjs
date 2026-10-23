'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs'),{localFolderEndpoint}=require('../desktop/provider-folder-service.cjs');
const {SftpFolderProvider}=require('../desktop/sftp-folder-provider.cjs'),{connectSftp}=require('../desktop/sftp-connection.cjs');
const {prepareProviderCopy,executeProviderCopy}=require('../desktop/provider-transfer-preview.cjs');
const {transferFileToSftp}=require('../desktop/sftp-transfer-writer.cjs'),{transferFileToLocal}=require('../desktop/local-transfer-writer.cjs');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
async function until(check){const end=Date.now()+3000;while(!check()){if(Date.now()>end)throw Error('Fixture handles not released');await new Promise(resolve=>setTimeout(resolve,10));}}
const mappings=[{source:'new.bin',target:'created.bin'},{source:'replace.bin',target:'existing.bin'},{source:'same.bin',target:'same.bin'}];
async function fixture(t,from,to){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-execute-integration-'))),backupRoot=path.join(root,'recovery'),controls={},connections=[],services={};for(const side of ['source','target','recovery'])await fs.mkdir(path.join(root,side));
 const files={'new.bin':Buffer.alloc(0),'replace.bin':Buffer.from([0,255,1,254]),'same.bin':Buffer.from([9,0,8,255])},original=Buffer.from([1,2,3,4]);
 for(const [name,bytes]of Object.entries(files))await fs.writeFile(path.join(root,'source',name),bytes);await fs.writeFile(path.join(root,'target','existing.bin'),original);await fs.writeFile(path.join(root,'target','same.bin'),files['same.bin']);
 const server=await createSftpServer({root,controls,writes:true,extensions:{'posix-rename@openssh.com':'1','fsync@openssh.com':'1'}});
 t.after(async()=>{for(const connection of connections)await connection.close();await until(()=>server.events.handlesOpened===server.events.handlesClosed);await server.close();await fs.rm(root,{recursive:true,force:true});});
 const endpoint=async(kind,side)=>{if(kind==='local'){const service=new FolderService(path.join(root,'service-backup-'+side));await service.select('a',path.join(root,side));services[side]=service;return localFolderEndpoint(service,'a');}const connection=await connectSftp({host:server.host,port:server.port,username:'fixture-user',password:'fixture-secret',expectedFingerprint:server.fingerprint});connections.push(connection);return SftpFolderProvider.create(connection,'/'+side);};
 const source=await endpoint(from,'source'),destination=await endpoint(to,'target');let writerCalls=0;const verifiedBackups=[];
 const writeFile=async args=>{
  const dirs=await fs.readdir(backupRoot);assert.equal(dirs.length,1,'All recovery files must exist before writer is called');const backupPath=path.join(backupRoot,dirs[0]),manifest=JSON.parse(await fs.readFile(path.join(backupPath,'manifest.json'),'utf8'));assert.equal(manifest.files.length,1);assert.equal(manifest.files[0].path,'existing.bin');assert.deepEqual(await fs.readFile(path.join(backupPath,manifest.files[0].backupName)),original);verifiedBackups.push(backupPath);writerCalls++;
  if(to==='remote')return transferFileToSftp(args.source,args.sourcePath,args.sourceObservation,args.destination,args.targetPath,args.targetObservation,{signal:args.signal});
  return transferFileToLocal(args.source,args.sourcePath,args.sourceObservation,services.target,'a',args.targetPath,args.targetObservation,{signal:args.signal});
 };
 return {root,backupRoot,controls,server,source,destination,files,original,writeFile,verifiedBackups,get writerCalls(){return writerCalls;}};
}
for(const [from,to]of [['local','remote'],['remote','local'],['remote','remote']])test(from+' to '+to+' executes mixed batch only after verified recovery backup',{timeout:15000},async t=>{
 const f=await fixture(t,from,to),plan=await prepareProviderCopy(f.source,f.destination,mappings),progress=[];
 const result=await executeProviderCopy(plan,{backupRoot:f.backupRoot,writeFile:f.writeFile,onProgress:value=>progress.push(value)});
 assert.equal(result.completed,2);assert.equal(result.skipped,1);assert.deepEqual(result.items.map(item=>item.status),['completed','completed','skipped']);assert.equal(f.writerCalls,2);assert.ok(f.verifiedBackups.every(value=>value===result.backupPath));
 for(const item of mappings)assert.deepEqual(await fs.readFile(path.join(f.root,'target',item.target)),f.files[item.source]);
 for(const [name,bytes]of Object.entries(f.files))assert.deepEqual(await fs.readFile(path.join(f.root,'source',name)),bytes);
 assert.deepEqual(progress.at(-1),{completed:2,skipped:1,total:3});await assert.rejects(executeProviderCopy(plan,{backupRoot:f.backupRoot,writeFile:f.writeFile}));assert.equal(f.writerCalls,2);await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
});
test('mid-batch SFTP write failure retains prior completion and recovery while leaving later items unattempted',{timeout:15000},async t=>{
 const f=await fixture(t,'local','remote'),plan=await prepareProviderCopy(f.source,f.destination,mappings);let calls=0,error;
 try{await executeProviderCopy(plan,{backupRoot:f.backupRoot,writeFile:async args=>{if(++calls===2)f.controls.failMethods=new Set(['WRITE']);return f.writeFile(args);}});}catch(caught){error=caught;}
 assert.ok(error);assert.equal(error.completed,1);assert.deepEqual(error.outcome.items.map(item=>item.status),['completed','failed','unattempted']);assert.equal(error.outcome.items[0].published,true);assert.equal(calls,2);assert.ok(error.backupPath);
 assert.deepEqual(await fs.readFile(path.join(f.root,'target','created.bin')),Buffer.alloc(0));assert.deepEqual(await fs.readFile(path.join(f.root,'target','existing.bin')),f.original);assert.deepEqual(await fs.readFile(path.join(f.root,'target','same.bin')),f.files['same.bin']);
 const manifest=JSON.parse(await fs.readFile(path.join(error.backupPath,'manifest.json'),'utf8'));assert.deepEqual(await fs.readFile(path.join(error.backupPath,manifest.files[0].backupName)),f.original);
 assert.deepEqual((await fs.readdir(path.join(f.root,'target'))).sort(),['created.bin','existing.bin','same.bin']);await assert.rejects(executeProviderCopy(plan,{backupRoot:f.backupRoot,writeFile:f.writeFile}));await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
});
