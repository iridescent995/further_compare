'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs'),{localFolderEndpoint}=require('../desktop/provider-folder-service.cjs');
const {SftpFolderProvider}=require('../desktop/sftp-folder-provider.cjs'),{connectSftp}=require('../desktop/sftp-connection.cjs');
const {snapshotProviderFile}=require('../desktop/provider-file-snapshot.cjs'),{transferFileToLocal}=require('../desktop/local-transfer-writer.cjs');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
async function until(check){const end=Date.now()+3000;while(!check()){if(Date.now()>end)throw Error('Fixture handles not released');await new Promise(resolve=>setTimeout(resolve,10));}}
async function fixture(t){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-local-writer-'))),controls={},remoteRoot=path.join(root,'remote'),localRoot=path.join(root,'local');await fs.mkdir(remoteRoot);await fs.mkdir(localRoot);
 const binary=Buffer.alloc(11*1024*1024+5);for(let i=0;i<binary.length;i++)binary[i]=i%251;
 const files={'large.bin':binary,'empty.bin':Buffer.alloc(0),'résumé 日本語.bin':Buffer.from([0,255,1,254])};for(const [name,bytes]of Object.entries(files))await fs.writeFile(path.join(remoteRoot,name),bytes);
 await fs.writeFile(path.join(localRoot,'existing.bin'),Buffer.from([3,2,1,0]));
 const server=await createSftpServer({root:remoteRoot,controls}),connection=await connectSftp({host:server.host,port:server.port,username:'fixture-user',password:'fixture-secret',expectedFingerprint:server.fingerprint});
 t.after(async()=>{await connection.close();await until(()=>server.events.handlesOpened===server.events.handlesClosed);await server.close();await fs.rm(root,{recursive:true,force:true});});
 const source=await SftpFolderProvider.create(connection,'/'),service=new FolderService(path.join(root,'backups'));await service.select('b',localRoot);const destination=localFolderEndpoint(service,'b');
 const run=async(name,target,existing=false)=>transferFileToLocal(source,name,await snapshotProviderFile(source,name),service,'b',target,existing?await snapshotProviderFile(destination,target):null);
 const noRemoteWrites=()=>assert.ok(!server.events.requests.some(row=>['write','remove','rename','fsetstat','setstat','mkdir','rmdir','extended'].includes(row[0])||row[0]==='open'&&row[2]!==1),'SFTP source must remain read-only');
 return {root,remoteRoot,localRoot,controls,files,server,connection,source,service,destination,run,noRemoteWrites};
}
test('SFTP to local streams large binary, empty and mapped Unicode files with exact output',{timeout:30000},async t=>{
 const f=await fixture(t);
 for(const [name,target,existing]of [['large.bin','new-large.bin',false],['empty.bin','new-empty.bin',false],['large.bin','existing.bin',true],['empty.bin','existing.bin',true],['résumé 日本語.bin','mapped 中文.bin',false]]){
  const result=await f.run(name,target,existing);assert.deepEqual(await fs.readFile(path.join(f.localRoot,target)),f.files[name]);assert.equal(result.byteLength,f.files[name].length);assert.equal(result.sha256,result.observation.sha256);
 }
 assert.deepEqual((await fs.readdir(f.localRoot)).sort(),['existing.bin','mapped 中文.bin','new-empty.bin','new-large.bin']);
 for(const [name,bytes]of Object.entries(f.files))assert.deepEqual(await fs.readFile(path.join(f.remoteRoot,name)),bytes);f.noRemoteWrites();await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
});
for(const changed of ['source','destination'])test('local transfer rejects same-sized '+changed+' mutation with restored mtime',{timeout:15000},async t=>{
 const f=await fixture(t),name='résumé 日本語.bin',sourceObservation=await snapshotProviderFile(f.source,name),targetObservation=await snapshotProviderFile(f.destination,'existing.bin'),file=path.join(changed==='source'?f.remoteRoot:f.localRoot,changed==='source'?name:'existing.bin'),stat=await fs.stat(file),modified=Buffer.from([8,7,6,5]);
 await fs.writeFile(file,modified);await fs.utimes(file,stat.atime,stat.mtime);
 await assert.rejects(transferFileToLocal(f.source,name,sourceObservation,f.service,'b','existing.bin',targetObservation));
 assert.deepEqual(await fs.readFile(path.join(f.localRoot,'existing.bin')),changed==='destination'?modified:Buffer.from([3,2,1,0]));assert.deepEqual(await fs.readdir(f.localRoot),['existing.bin']);f.noRemoteWrites();
});
test('local target appearing while source is read is retained and stage removed',{timeout:15000},async t=>{
 const f=await fixture(t),name='résumé 日本語.bin',observation=await snapshotProviderFile(f.source,name);let appeared=false;
 f.controls.onRequest=async method=>{if(method==='READ'&&!appeared){appeared=true;await fs.writeFile(path.join(f.localRoot,'appeared.bin'),'external owner');}};
 await assert.rejects(transferFileToLocal(f.source,name,observation,f.service,'b','appeared.bin',null));assert.ok(appeared);assert.equal(await fs.readFile(path.join(f.localRoot,'appeared.bin'),'utf8'),'external owner');assert.deepEqual((await fs.readdir(f.localRoot)).sort(),['appeared.bin','existing.bin']);f.noRemoteWrites();
});
test('cancelling held SFTP source read removes local stage and closes remote handles',{timeout:15000},async t=>{
 const f=await fixture(t),observation=await snapshotProviderFile(f.source,'large.bin'),controller=new AbortController(),readCount=f.server.events.requests.filter(row=>row[0]==='read').length;
 f.controls.holdReads=true;const pending=transferFileToLocal(f.source,'large.bin',observation,f.service,'b','cancelled.bin',null,{signal:controller.signal}),rejection=assert.rejects(pending,error=>error.code==='ABORT_ERR'||/abort|cancel/i.test(error.message));
 await until(()=>f.server.events.requests.filter(row=>row[0]==='read').length>readCount);controller.abort();await rejection;await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);assert.deepEqual(await fs.readdir(f.localRoot),['existing.bin']);assert.deepEqual(await fs.readFile(path.join(f.remoteRoot,'large.bin')),f.files['large.bin']);f.noRemoteWrites();
});
