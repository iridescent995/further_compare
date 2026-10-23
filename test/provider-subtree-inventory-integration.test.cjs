'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs'),{localFolderEndpoint}=require('../desktop/provider-folder-service.cjs');
const {SftpFolderProvider}=require('../desktop/sftp-folder-provider.cjs'),{connectSftp}=require('../desktop/sftp-connection.cjs');
const {scanProviderSubtrees}=require('../desktop/provider-subtree-inventory.cjs');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
async function until(check){const end=Date.now()+3000;while(!check()){if(Date.now()>end)throw Error('Remote handles not released');await new Promise(resolve=>setTimeout(resolve,10));}}
async function fixture(t){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-subtree-integration-'))),controls={},folder=path.join(root,'files');await fs.mkdir(path.join(folder,'chain','java','oracle','leaf'),{recursive:true});await fs.mkdir(path.join(folder,'empty'));await fs.mkdir(path.join(folder,'.git'));await fs.mkdir(path.join(folder,'mutation'));
 await fs.writeFile(path.join(folder,'chain/java/oracle/leaf/résumé:日本語.bin'),Buffer.from([0,255]));await fs.writeFile(path.join(folder,'.git/private'),'ignored');await fs.writeFile(path.join(folder,'excluded.txt'),'excluded');await fs.writeFile(path.join(folder,'mutation/first.bin'),'same');await fs.symlink('chain',path.join(folder,'alias'));
 const server=await createSftpServer({root,controls}),connection=await connectSftp({host:server.host,port:server.port,username:'fixture-user',password:'fixture-secret',expectedFingerprint:server.fingerprint});
 t.after(async()=>{await connection.close();await until(()=>server.events.handlesOpened===server.events.handlesClosed);await server.close();await fs.rm(root,{recursive:true,force:true});});
 const service=new FolderService(path.join(root,'backup'));await service.select('a',folder);const local=localFolderEndpoint(service,'a'),remote=await SftpFolderProvider.create(connection,'/files');
 return {folder,server,controls,connection,local,remote,noReads(){assert.ok(!server.events.requests.some(row=>['open','read','write'].includes(row[0])),'Inventory must not open or read file contents');}};
}
for(const kind of ['local','remote']){
 test(kind+' inventory expands collapsed chains once and includes empty folders and source names',{timeout:15000},async t=>{
  const f=await fixture(t),endpoint=f[kind];let contentOpens=0;const tracked={...endpoint,inspectRoot:options=>endpoint.inspectRoot(options),inspectEntry:(relative,options)=>endpoint.inspectEntry(relative,options),enumerateDirectory:(relative,options)=>endpoint.enumerateDirectory(relative,options),openFileReader:()=>{contentOpens++;throw Error('No file contents allowed');}};
  const result=await scanProviderSubtrees(tracked,['chain','chain/java','empty']);assert.equal(result.complete,true);assert.ok(Object.isFrozen(result));const paths=result.entries.map(entry=>entry.path);assert.equal(paths.length,new Set(paths).size);
  for(const name of ['chain','chain/java','chain/java/oracle','chain/java/oracle/leaf','chain/java/oracle/leaf/résumé:日本語.bin','empty'])assert.ok(paths.includes(name),name);
  assert.ok(!paths.includes('mutation'));assert.deepEqual(result.directories.find(entry=>entry.path==='empty').children,[]);assert.equal(contentOpens,0);f.noReads();await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
 });
 test(kind+' inventory reports ignored, excluded and symlink entries without following them',{timeout:15000},async t=>{
  const f=await fixture(t),result=await scanProviderSubtrees(f[kind],[''],{isIgnoredPath:relative=>relative.split('/').includes('.git'),isExcludedPath:relative=>relative==='excluded.txt'});
  const diagnostics=new Map(result.exclusions.map(entry=>[entry.path,entry.reason]));assert.equal(diagnostics.get('.git'),'ignored');assert.equal(diagnostics.get('excluded.txt'),'excluded');assert.equal(diagnostics.get('alias'),'unsupported');assert.ok(!result.entries.some(entry=>entry.path.startsWith('.git/')||entry.path.startsWith('alias/')));f.noReads();
 });
 test(kind+' inventory rejects namespace mutation even after directory timestamps restored',{timeout:15000},async t=>{
  const f=await fixture(t),endpoint=f[kind],directory=path.join(f.folder,'mutation');let changed=false;
  const wrapped={inspectRoot:options=>endpoint.inspectRoot(options),inspectEntry:(relative,options)=>endpoint.inspectEntry(relative,options),async *enumerateDirectory(relative,options){for await(const entry of endpoint.enumerateDirectory(relative,options))yield entry;if(relative==='mutation'&&!changed){changed=true;const before=await fs.stat(directory);await fs.rename(path.join(directory,'first.bin'),path.join(directory,'other.bin'));await fs.utimes(directory,before.atime,before.mtime);assert.equal(Math.floor((await fs.stat(directory)).mtimeMs/1000),Math.floor(before.mtimeMs/1000));}}};
  await assert.rejects(scanProviderSubtrees(wrapped,['mutation']));assert.equal(changed,true);f.noReads();await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
 });
 test(kind+' inventory limits reject incomplete results and release enumeration handles',{timeout:15000},async t=>{
  const f=await fixture(t);for(const limits of [{maxEntries:1},{maxNodes:1},{maxDepth:1}])await assert.rejects(scanProviderSubtrees(f[kind],['chain'],limits));f.noReads();await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
 });
}
test('remote held directory enumeration cancellation closes handles without content reads',{timeout:15000},async t=>{
 const f=await fixture(t),controller=new AbortController();f.controls.holdMethods=new Set(['READDIR']);const pending=scanProviderSubtrees(f.remote,['chain'],{signal:controller.signal}),rejection=assert.rejects(pending,error=>error.code==='ABORT_ERR'||/cancel|abort/i.test(error.message));await until(()=>f.server.events.requests.some(row=>row[0]==='readdir'));controller.abort();await rejection;await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);f.noReads();
});
