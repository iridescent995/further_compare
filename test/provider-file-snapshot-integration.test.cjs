'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {snapshotProviderFile}=require('../desktop/provider-file-snapshot.cjs');
const {FolderService}=require('../desktop/folders.cjs');
const {localFolderEndpoint}=require('../desktop/provider-folder-service.cjs');
const {SftpFolderProvider}=require('../desktop/sftp-folder-provider.cjs');
const {connectSftp}=require('../desktop/sftp-connection.cjs');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){const end=Date.now()+3000;while(!check()){if(Date.now()>end)throw Error('Remote handles were not released');await new Promise(resolve=>setTimeout(resolve,10));}}
async function fixture(t){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-snapshot-integration-'))),folder=path.join(root,'files');await fs.mkdir(folder);
 const bytes=Buffer.alloc(11*1024*1024+7);for(let i=0;i<bytes.length;i++)bytes[i]=(i*31)%256;
 await fs.writeFile(path.join(folder,'binary.bin'),bytes);await fs.writeFile(path.join(folder,'empty.bin'),Buffer.alloc(0));
 const server=await createSftpServer({root,readChunk:65536}),connection=await connectSftp({host:server.host,port:server.port,username:'fixture-user',password:'fixture-secret',expectedFingerprint:server.fingerprint});
 t.after(async()=>{await connection.close();await until(()=>server.events.handlesOpened===server.events.handlesClosed);await server.close();await fs.rm(root,{recursive:true,force:true});});
 const service=new FolderService(path.join(root,'backups'));await service.select('a',folder);
 return {folder,bytes,server,connection,local:localFolderEndpoint(service,'a'),remote:await SftpFolderProvider.create(connection,'/files')};
}
function observed(provider){
 const state={reads:0,closes:0,maxRequested:0};return {state,provider:{
  inspectRoot:options=>provider.inspectRoot(options),inspectEntry:(relative,options)=>provider.inspectEntry(relative,options),
  async openFileReader(relative,options){const reader=await provider.openFileReader(relative,options);return {metadata:reader.metadata,read:async max=>{state.reads++;state.maxRequested=Math.max(state.maxRequested,max);return reader.read(max);},validate:()=>reader.validate(),close:async()=>{state.closes++;await reader.close();}};}
 }};
}
for(const name of ['binary.bin','empty.bin'])test('local and SFTP streamed snapshots agree for '+name,{timeout:30000},async t=>{
 const f=await fixture(t),expected=name==='empty.bin'?Buffer.alloc(0):f.bytes,expectedHash=createHash('sha256').update(expected).digest('hex'),results=[];
 assert.ok(f.bytes.length>10*1024*1024);
 for(const kind of ['local','remote']){
  const watch=observed(f[kind]),sinkHash=createHash('sha256');let offset=0,chunks=0,sinkActive=false;
  const result=await snapshotProviderFile(watch.provider,name,{onChunk:async(chunk,position)=>{
   assert.equal(sinkActive,false,'Sink calls must not overlap');sinkActive=true;assert.equal(position,offset);assert.ok(chunk.length>0&&chunk.length<=65536);
   const reads=watch.state.reads;await tick();assert.equal(watch.state.reads,reads,'Reader must await sink before issuing next read');sinkHash.update(chunk);offset+=chunk.length;chunks++;sinkActive=false;
  }});
  assert.equal(result.byteLength,expected.length);assert.equal(offset,expected.length);assert.equal(result.sha256,expectedHash);assert.equal(sinkHash.digest('hex'),expectedHash);assert.equal(watch.state.closes,1);assert.ok(watch.state.maxRequested<=65536);assert.equal(chunks===0,expected.length===0);results.push(result);
 }
 assert.equal(results[0].sha256,results[1].sha256);await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
});
for(const kind of ['local','remote']){
 test(kind+' snapshot cancellation closes the real reader',{timeout:15000},async t=>{
  const f=await fixture(t),watch=observed(f[kind]),controller=new AbortController();let sinks=0;
  await assert.rejects(snapshotProviderFile(watch.provider,'binary.bin',{signal:controller.signal,onChunk:async()=>{sinks++;await tick();controller.abort();}}),error=>error.code==='ABORT_ERR'||/abort|cancel/i.test(error.message));
  assert.equal(sinks,1);assert.equal(watch.state.closes,1);await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
  assert.deepEqual(await fs.readFile(path.join(f.folder,'binary.bin')),f.bytes,'Cancellation never modifies the source');
 });
 test(kind+' snapshot rejects observed source mutation and closes the reader',{timeout:15000},async t=>{
  const f=await fixture(t),watch=observed(f[kind]);let mutated=false;
  await assert.rejects(snapshotProviderFile(watch.provider,'binary.bin',{onChunk:async()=>{if(!mutated){mutated=true;await fs.appendFile(path.join(f.folder,'binary.bin'),Buffer.from([1]));}}}),/changed|stale|grew/i);
  assert.ok(mutated);assert.equal(watch.state.closes,1);await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
 });
}
