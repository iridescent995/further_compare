'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs');
const {localFolderEndpoint,ProviderFolderService}=require('../desktop/provider-folder-service.cjs');
const {FolderAlignment}=require('../desktop/folder-alignment.cjs');
const {transferFileToLocal}=require('../desktop/local-transfer-writer.cjs');
const {prepareLocalDirectory,createLocalDirectory,finalizeLocalDirectory}=require('../desktop/local-transfer-directories.cjs');
const {prepareRecursiveProviderCopy,revalidateRecursiveProviderCopy,revokeRecursiveProviderCopy,executeRecursiveProviderCopy}=require('../desktop/provider-recursive-copy.cjs');
async function setup(t,a={},b={}){
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-recursive-authority-')));t.after(()=>fs.rm(base,{recursive:true,force:true}));const left=path.join(base,'left'),right=path.join(base,'right'),backupRoot=path.join(base,'recovery');for(const root of [left,right,backupRoot])await fs.mkdir(root);
 for(const [root,values]of [[left,a],[right,b]])for(const [name,content]of Object.entries(values)){if(content===null)await fs.mkdir(path.join(root,name),{recursive:true});else{await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),content);}}
 const native=new FolderService(path.join(base,'history'));await native.select('a',left);await native.select('b',right);const endpoints={a:localFolderEndpoint(native,'a'),b:localFolderEndpoint(native,'b')},service=new ProviderFolderService(endpoints);
 const callbacks={backupRoot,writeFile:({source,sourcePath,sourceObservation,targetPath,targetObservation,signal})=>transferFileToLocal(source,sourcePath,sourceObservation,native,'b',targetPath,targetObservation,{signal}),prepareDirectory:({targetPath,signal})=>prepareLocalDirectory(native,'b',targetPath,{signal}),createDirectory:({prepared,signal})=>createLocalDirectory(prepared,{signal}),finalizeDirectory:({created,sourceMetadata,expectedChildren,signal})=>finalizeLocalDirectory(created,sourceMetadata,expectedChildren,{signal})};
 return {base,left,right,backupRoot,native,endpoints,service,callbacks,prepare:(selections=[''],options={})=>prepareRecursiveProviderCopy(service,'a',selections,{endpointKinds:{a:'local',b:'local'},...options})};
}
test('review is immutable and forged or consumed authority cannot execute',async t=>{
 const f=await setup(t,{file:'same'},{file:'same'}),plan=await f.prepare(['file']);assert.equal(plan.operations[0].action,'skip');assert.equal(plan.totalBytes,0);assert.throws(()=>plan.operations.push({}),TypeError);await assert.rejects(executeRecursiveProviderCopy(JSON.parse(JSON.stringify(plan)),f.callbacks),/unavailable/);const result=await executeRecursiveProviderCopy(plan,f.callbacks);assert.equal(result.skipped,1);assert.equal(result.completed,0);await assert.rejects(executeRecursiveProviderCopy(plan,f.callbacks),/unavailable/);
});
test('directory-only plan creates parent first and finalizes deepest first',async t=>{
 const f=await setup(t,{'a/b/c':null},{}),plan=await f.prepare(['a']);assert.deepEqual(plan.operations.map(x=>[x.action,x.target]),[['create-directory','a'],['create-directory','a/b'],['create-directory','a/b/c'],['finalize-directory','a/b/c'],['finalize-directory','a/b'],['finalize-directory','a']]);const result=await executeRecursiveProviderCopy(plan,f.callbacks);assert.equal(result.completed,6);assert.equal(result.backupPath,null);assert.equal((await fs.stat(path.join(f.right,'a/b/c'))).isDirectory(),true);
});
test('failure before first write leaves all operations unattempted',async t=>{
 const f=await setup(t,{a:'new-a'},{a:'old-a'}),plan=await f.prepare();await fs.writeFile(path.join(f.left,'a'),'drift');await assert.rejects(executeRecursiveProviderCopy(plan,f.callbacks),e=>e.outcome.completed===0&&e.outcome.items.every(x=>x.status==='unattempted'));assert.equal(await fs.readFile(path.join(f.right,'a'),'utf8'),'old-a');
});
test('unknown directory publication preserves explicit unknown creation and untouched later operations',async t=>{
 const f=await setup(t,{'a/empty':null},{}),plan=await f.prepare();await assert.rejects(executeRecursiveProviderCopy(plan,{...f.callbacks,createDirectory:async()=>{throw Object.assign(Error('lost acknowledgement'),{code:'DIRECTORY_OUTCOME_UNKNOWN',created:null,acknowledged:false});}}),e=>e.outcome.items[0].status==='unknown'&&e.outcome.items[0].created===null&&e.outcome.items.slice(1).every(x=>x.status==='unattempted'));
});
test('failed restrictive metadata finalization retains successful directory creation',async t=>{
 const f=await setup(t,{empty:null},{}),plan=await f.prepare();await assert.rejects(executeRecursiveProviderCopy(plan,{...f.callbacks,finalizeDirectory:async()=>{throw Object.assign(Error('partial metadata'),{code:3,created:true,metadataSubmitted:true,metadataMayHaveChanged:true});}}),e=>e.outcome.items[0].status==='completed'&&e.outcome.items[1].status==='failed'&&e.outcome.items[1].metadataMayHaveChanged);assert.equal((await fs.stat(path.join(f.right,'empty'))).isDirectory(),true);
});
test('pre-aborted execution consumes plan without mutation',async t=>{
 const f=await setup(t,{a:'a'},{}),plan=await f.prepare(),controller=new AbortController();controller.abort();await assert.rejects(executeRecursiveProviderCopy(plan,{...f.callbacks,signal:controller.signal}),e=>e.outcome.cancelled&&e.outcome.items.every(x=>x.status==='unattempted'));assert.deepEqual(await fs.readdir(f.right),[]);await assert.rejects(executeRecursiveProviderCopy(plan,f.callbacks),/unavailable/);
});

test('Windows root overlap policy includes drive case and UNC while keeping siblings distinct',()=>{const {localRootsOverlap}=require('../desktop/provider-recursive-copy.cjs');assert.equal(localRootsOverlap('C:\\Work','c:\\work\\nested','win32'),true);assert.equal(localRootsOverlap('C:\\Work','C:\\Workspace','win32'),false);assert.equal(localRootsOverlap('C:\\Work','D:\\Work','win32'),false);assert.equal(localRootsOverlap('\\\\server\\share\\root','\\\\SERVER\\share\\root\\nested','win32'),true);assert.equal(localRootsOverlap('/tmp/a','/tmp/a-other','darwin'),false);});
test('finalization cannot replace retained owned directory identity with another token',async t=>{
 const f=await setup(t,{empty:null},{}),plan=await f.prepare();await assert.rejects(executeRecursiveProviderCopy(plan,{...f.callbacks,finalizeDirectory:async args=>{const result=await f.callbacks.finalizeDirectory(args);return {observation:{...result.observation,metadata:{...result.observation.metadata,identity:'unrelated-directory'}}};}}),e=>e.outcome.items[0].status==='completed'&&e.outcome.items[1].status==='verification-failed'&&e.outcome.completed===1);
});
test('same remote host key across hostname and port aliases cannot bypass root overlap guard',async t=>{
 const f=await setup(t,{a:'source'},{});Object.assign(f.endpoints.a,{root:'/shared',connection:{host:'localhost',port:22,fingerprint:'trusted-key'}});Object.assign(f.endpoints.b,{root:'/shared/subdir',connection:{host:'127.0.0.1',port:2222,fingerprint:'trusted-key'}});await assert.rejects(f.prepare(['a'],{endpointKinds:{a:'remote',b:'remote'}}),/overlap/);
});
