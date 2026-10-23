'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs'),{localFolderEndpoint}=require('../desktop/provider-folder-service.cjs');
const {SftpFolderProvider}=require('../desktop/sftp-folder-provider.cjs'),{connectSftp}=require('../desktop/sftp-connection.cjs');
const {snapshotProviderFile}=require('../desktop/provider-file-snapshot.cjs'),{transferFileToSftp}=require('../desktop/sftp-transfer-writer.cjs');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
async function until(check){const end=Date.now()+3000;while(!check()){if(Date.now()>end)throw Error('Fixture handles not released');await new Promise(resolve=>setTimeout(resolve,10));}}
async function fixture(t,kind='local',requestTimeoutMs=10000){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-transfer-writer-'))),controls={},connections=[];for(const side of ['source','target'])await fs.mkdir(path.join(root,side));
 const binary=Buffer.alloc(11*1024*1024+5);for(let i=0;i<binary.length;i++)binary[i]=i%251;
 const files={'large.bin':binary,'empty.bin':Buffer.alloc(0),'small.bin':Buffer.from([0,255,1,254])};for(const [name,data]of Object.entries(files))await fs.writeFile(path.join(root,'source',name),data);
 await fs.writeFile(path.join(root,'target','existing.bin'),Buffer.from([3,2,1,0]));
 const server=await createSftpServer({root,controls,writes:true,extensions:{'posix-rename@openssh.com':'1','fsync@openssh.com':'1'}});
 t.after(async()=>{for(const connection of connections)await connection.close();await until(()=>server.events.handlesOpened===server.events.handlesClosed);await server.close();await fs.rm(root,{recursive:true,force:true});});
 const remote=async side=>{const connection=await connectSftp({host:server.host,port:server.port,username:'fixture-user',password:'fixture-secret',expectedFingerprint:server.fingerprint,requestTimeoutMs});connections.push(connection);return SftpFolderProvider.create(connection,'/'+side);};
 let source;if(kind==='local'){const service=new FolderService(path.join(root,'backups'));await service.select('a',path.join(root,'source'));source=localFolderEndpoint(service,'a');}else source=await remote('source');
 const destination=await remote('target');const run=async(name,target,existing=false)=>transferFileToSftp(source,name,await snapshotProviderFile(source,name),destination,target,existing?await snapshotProviderFile(destination,target):null);
 return {root,source,destination,controls,server,connections,files,run};
}
for(const kind of ['local','remote'])test(kind+' source streams large binary and empty new/replacement files to SFTP',{timeout:30000},async t=>{
 const f=await fixture(t,kind);
 for(const [name,target,existing]of [['large.bin','new-large.bin',false],['empty.bin','new-empty.bin',false],['large.bin','existing.bin',true],['empty.bin','existing.bin',true]]){
  const result=await f.run(name,target,existing);assert.deepEqual(await fs.readFile(path.join(f.root,'target',target)),f.files[name]);assert.equal(result.byteLength,f.files[name].length);assert.equal(result.sha256,result.observation.sha256);
 }
 assert.deepEqual((await fs.readdir(path.join(f.root,'target'))).sort(),['existing.bin','new-empty.bin','new-large.bin']);
 const writes=f.server.events.requests.filter(row=>row[0]==='write');assert.ok(writes.length>0);assert.ok(writes.every(row=>row[3].length/2<=65536),'Writes must stay bounded to64KiB');
 assert.equal(f.server.events.requests.filter(row=>row[0]==='rename').length,2);await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
});
for(const changed of ['source','target'])test('same-size '+changed+' mutation with restored mtime rejects without replacement',{timeout:15000},async t=>{
 const f=await fixture(t,'remote'),source=await snapshotProviderFile(f.source,'small.bin'),target=await snapshotProviderFile(f.destination,'existing.bin'),file=path.join(f.root,changed,changed==='source'?'small.bin':'existing.bin'),stat=await fs.stat(file),modified=Buffer.from([8,7,6,5]);
 await fs.writeFile(file,modified);await fs.utimes(file,stat.atime,stat.mtime);await assert.rejects(transferFileToSftp(f.source,'small.bin',source,f.destination,'existing.bin',target));
 assert.deepEqual(await fs.readFile(path.join(f.root,'target','existing.bin')),changed==='target'?modified:Buffer.from([3,2,1,0]));assert.deepEqual(await fs.readdir(path.join(f.root,'target')),['existing.bin']);
});
test('new target appearing at standard rename is never overwritten and stage is cleaned',{timeout:15000},async t=>{
 const f=await fixture(t),created=Buffer.from('external owner');f.controls.beforeStandardRename=async(_from,to)=>fs.writeFile(path.join(f.root,to),'external owner');
 await assert.rejects(f.run('small.bin','appeared.bin'));assert.deepEqual(await fs.readFile(path.join(f.root,'target','appeared.bin')),created);assert.deepEqual((await fs.readdir(path.join(f.root,'target'))).sort(),['appeared.bin','existing.bin']);
});
test('failed stage write preserves destination and removes only stage',{timeout:15000},async t=>{
 const f=await fixture(t);f.controls.failMethods=new Set(['WRITE']);await assert.rejects(f.run('small.bin','existing.bin',true));assert.deepEqual(await fs.readFile(path.join(f.root,'target','existing.bin')),Buffer.from([3,2,1,0]));assert.deepEqual(await fs.readdir(path.join(f.root,'target')),['existing.bin']);await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
});
for(const replace of [false,true])test('lost '+(replace?'replacement':'creation')+' rename acknowledgment reports unknown committed outcome',{timeout:15000},async t=>{
 const f=await fixture(t,'local',200);if(replace)f.controls.holdExtendedAck=new Set(['posix-rename@openssh.com']);else f.controls.holdStandardRenameAck=true;
 const target=replace?'existing.bin':'new.bin';await assert.rejects(f.run('small.bin',target,replace),{code:'TRANSFER_OUTCOME_UNKNOWN'});assert.deepEqual(await fs.readFile(path.join(f.root,'target',target)),f.files['small.bin']);assert.equal(f.server.events.requests.filter(row=>row[0]==='rename').length,replace?0:1,'Unknown publication is never retried');
});
