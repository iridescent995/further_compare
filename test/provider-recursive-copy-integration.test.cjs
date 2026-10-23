'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs'),{localFolderEndpoint,ProviderFolderService}=require('../desktop/provider-folder-service.cjs'),{FolderAlignment}=require('../desktop/folder-alignment.cjs');
const {SftpFolderProvider}=require('../desktop/sftp-folder-provider.cjs'),{connectSftp}=require('../desktop/sftp-connection.cjs');
const {prepareSftpDirectory,createSftpDirectory,finalizeSftpDirectory}=require('../desktop/sftp-transfer-directories.cjs'),{prepareLocalDirectory,createLocalDirectory,finalizeLocalDirectory}=require('../desktop/local-transfer-directories.cjs');
const {transferFileToSftp}=require('../desktop/sftp-transfer-writer.cjs'),{transferFileToLocal}=require('../desktop/local-transfer-writer.cjs');
const {prepareRecursiveProviderCopy,executeRecursiveProviderCopy}=require('../desktop/provider-recursive-copy.cjs');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
async function until(check){const end=Date.now()+5000;while(!check()){if(Date.now()>end)throw Error('Fixture event deadline');await new Promise(resolve=>setTimeout(resolve,10));}}
async function fixture(t,from='remote',to='remote',{large=false,timeout=10000}={}){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-recursive-copy-'))),backupRoot=path.join(root,'recovery'),controls={},connections=[],services={};
 for(const name of ['source/tree/newdeep/empty','source/tree/empty','target/copied','recovery'])await fs.mkdir(path.join(root,name),{recursive:true});
 const binary=Buffer.alloc(large?11*1024*1024+5:131077);for(let i=0;i<binary.length;i++)binary[i]=i%251;
 const files={'tree/newdeep/data.bin':binary,'tree/replace.bin':Buffer.from([0,255,1,254]),'tree/same.bin':Buffer.from('same'),'tree/hidden.tmp':Buffer.from('filtered')},original=Buffer.from([4,3,2,1]);
 for(const [name,bytes]of Object.entries(files))await fs.writeFile(path.join(root,'source',name),bytes);await fs.writeFile(path.join(root,'target/copied/replace.bin'),original);await fs.writeFile(path.join(root,'target/copied/same.bin'),files['tree/same.bin']);
 for(const dir of ['tree/empty','tree/newdeep/empty','tree/newdeep']){await fs.chmod(path.join(root,'source',dir),0o751);await fs.utimes(path.join(root,'source',dir),1234567000,1234567000);}
 const server=await createSftpServer({root,controls,writes:true,extensions:{'posix-rename@openssh.com':'1','fsync@openssh.com':'1'}});
 t.after(async()=>{for(const connection of connections)await connection.close();await until(()=>server.events.handlesOpened===server.events.handlesClosed);await server.close();await fs.rm(root,{recursive:true,force:true});});
 async function endpoint(kind,name){if(kind==='local'){const service=new FolderService(path.join(root,'backup-'+name));await service.select('a',path.join(root,name));services[name]=service;return localFolderEndpoint(service,'a');}const connection=await connectSftp({host:server.host,port:server.port,username:'fixture-user',password:'fixture-secret',expectedFingerprint:server.fingerprint,requestTimeoutMs:timeout});connections.push(connection);return SftpFolderProvider.create(connection,'/'+name);}
 const source=await endpoint(from,'source'),destination=await endpoint(to,'target'),service=new ProviderFolderService({a:source,b:destination}),endpointKinds={a:from,b:to},alignment=new FolderAlignment([{a:'tree',b:'copied',kind:'directory'}],endpointKinds),options={endpointKinds,alignment,scope:{exclude:'*.tmp'}};
 let mutationChecks=0;const assertBackup=async()=>{const dirs=await fs.readdir(backupRoot);assert.ok(dirs.length);let found=false;for(const name of dirs){const manifest=JSON.parse(await fs.readFile(path.join(backupRoot,name,'manifest.json'),'utf8'));for(const item of manifest.files)if(item.path==='copied/replace.bin'){assert.deepEqual(await fs.readFile(path.join(backupRoot,name,item.backupName)),original);found=true;}}assert.ok(found,'Replacement recovery must be complete before first mutation');mutationChecks++;};
 const adapters={backupRoot,
  prepareDirectory:({destination,targetPath,signal})=>to==='remote'?prepareSftpDirectory(destination,targetPath,{signal}):prepareLocalDirectory(services.target,'a',targetPath,{signal}),
  createDirectory:async({prepared,signal})=>{await assertBackup();return to==='remote'?createSftpDirectory(prepared,{signal}):createLocalDirectory(prepared,{signal});},
  writeFile:async args=>{await assertBackup();return to==='remote'?transferFileToSftp(args.source,args.sourcePath,args.sourceObservation,args.destination,args.targetPath,args.targetObservation,{signal:args.signal}):transferFileToLocal(args.source,args.sourcePath,args.sourceObservation,services.target,'a',args.targetPath,args.targetObservation,{signal:args.signal});},
  finalizeDirectory:async({created,sourceMetadata,expectedChildren,signal})=>{await assertBackup();return to==='remote'?finalizeSftpDirectory(created,sourceMetadata,expectedChildren,{signal}):finalizeLocalDirectory(created,sourceMetadata,expectedChildren,{signal});}
 };
 const prepare=()=>prepareRecursiveProviderCopy(service,'a',['tree'],options);
 const sourceUnchanged=async()=>{for(const [name,bytes]of Object.entries(files))assert.deepEqual(await fs.readFile(path.join(root,'source',name)),bytes);assert.ok(!server.events.requests.some(row=>['mkdir','setstat','remove','rename'].includes(row[0])&&String(row[1]).startsWith('/source/')));};
 return {root,files,original,controls,server,adapters,prepare,service,options,sourceUnchanged,get mutationChecks(){return mutationChecks;}};
}
for(const [from,to]of [['local','remote'],['remote','local'],['remote','remote']])test(from+' to '+to+' recursive executor copies mapped filtered subtrees with backups and final metadata',{timeout:60000},async t=>{
 const f=await fixture(t,from,to,{large:true}),plan=await f.prepare(),result=await executeRecursiveProviderCopy(plan,f.adapters);assert.ok(result.items.every(item=>['completed','skipped'].includes(item.status)));assert.ok(result.skipped>=1);assert.ok(f.mutationChecks>0);
 for(const name of ['tree/newdeep/data.bin','tree/replace.bin','tree/same.bin'])assert.deepEqual(await fs.readFile(path.join(f.root,'target',name.replace('tree/','copied/'))),f.files[name]);await assert.rejects(fs.access(path.join(f.root,'target/copied/hidden.tmp')));
 for(const dir of ['empty','newdeep','newdeep/empty']){const stat=await fs.stat(path.join(f.root,'target/copied',dir));assert.equal(stat.mode&0o777,0o751);assert.equal(Math.floor(stat.mtimeMs/1000),1234567000);}assert.deepEqual(await fs.readdir(path.join(f.root,'target/copied/newdeep/empty')),[]);assert.ok(result.backupPath);await assert.rejects(executeRecursiveProviderCopy(plan,f.adapters));await f.sourceUnchanged();
});
test('recursive executor reports partial mid-file failure and retains recovery and completed directories',{timeout:30000},async t=>{
 const f=await fixture(t,'local','remote'),plan=await f.prepare();let calls=0,error;const adapters={...f.adapters,writeFile:args=>{if(++calls===2)f.controls.failMethods=new Set(['WRITE']);return f.adapters.writeFile(args);}};
 try{await executeRecursiveProviderCopy(plan,adapters);}catch(caught){error=caught;}assert.ok(error?.outcome);assert.ok(error.outcome.items.some(item=>item.status==='completed'));assert.ok(error.outcome.items.some(item=>item.status==='failed'));assert.ok(error.outcome.items.some(item=>item.status==='unattempted'));assert.ok(error.outcome.backupPath);assert.equal(calls,2);await f.sourceUnchanged();await assert.rejects(executeRecursiveProviderCopy(plan,f.adapters));
});
test('lost directory acknowledgment produces unknown outcome without automatic retry',{timeout:30000},async t=>{
 const f=await fixture(t,'local','remote',{timeout:200}),plan=await f.prepare();f.controls.holdMkdirAck=true;let error;try{await executeRecursiveProviderCopy(plan,f.adapters);}catch(caught){error=caught;}assert.ok(error?.outcome);assert.ok(error.outcome.items.some(item=>item.status==='unknown'));assert.equal(f.server.events.requests.filter(row=>row[0]==='mkdir').length,1);assert.ok(error.outcome.backupPath);await f.sourceUnchanged();
});
for(const phase of ['createDirectory','writeFile','finalizeDirectory'])test('recursive cancellation during '+phase+' retains completed outcomes and recovery',{timeout:30000},async t=>{
 const f=await fixture(t,'local','remote'),plan=await f.prepare(),controller=new AbortController();let reached=false,error;const adapters={...f.adapters,signal:controller.signal,[phase]:async args=>{reached=true;controller.abort();return f.adapters[phase](args);}};
 try{await executeRecursiveProviderCopy(plan,adapters);}catch(caught){error=caught;}assert.ok(reached);assert.ok(error?.outcome);assert.ok(error.outcome.backupPath);assert.ok(error.outcome.items.some(item=>item.status==='unattempted'||item.status==='failed'||item.status==='cancelled'));await f.sourceUnchanged();
});
test('cancellation while remote backup is reading sends no destination writes',{timeout:30000},async t=>{
 const f=await fixture(t),plan=await f.prepare(),controller=new AbortController();let held=false;f.controls.onRequest=async(name,args)=>{if(name==='OPEN'&&args[0]==='/target/copied/replace.bin'&&(await fs.readdir(f.adapters.backupRoot)).length>0)f.controls.holdReads=true;if(name==='READ'&&f.controls.holdReads)held=true;};
 const pending=executeRecursiveProviderCopy(plan,{...f.adapters,signal:controller.signal}),rejection=assert.rejects(pending);await until(()=>held);controller.abort();await rejection;assert.ok(!f.server.events.requests.some(row=>['mkdir','write','setstat'].includes(row[0])));assert.deepEqual((await fs.readdir(path.join(f.root,'target/copied'))).sort(),['replace.bin','same.bin']);await f.sourceUnchanged();
});
for(const mutation of ['namespace','source'])test('stale '+mutation+' rejects recursive execution before destination changes',{timeout:30000},async t=>{
 const f=await fixture(t),plan=await f.prepare();if(mutation==='namespace')await fs.writeFile(path.join(f.root,'source/tree/newdeep/late.bin'),'new');else{const file=path.join(f.root,'source/tree/replace.bin'),stat=await fs.stat(file);await fs.writeFile(file,Buffer.from([8,7,6,5]));await fs.utimes(file,stat.atime,stat.mtime);}await assert.rejects(executeRecursiveProviderCopy(plan,f.adapters));assert.equal(f.mutationChecks,0);assert.deepEqual((await fs.readdir(path.join(f.root,'target/copied'))).sort(),['replace.bin','same.bin']);assert.deepEqual(await fs.readFile(path.join(f.root,'target/copied/replace.bin')),f.original);
});
