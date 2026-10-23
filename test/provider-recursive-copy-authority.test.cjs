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
async function manifests(root){const result=[];for(const name of await fs.readdir(root)){const full=path.join(root,name);if((await fs.stat(full)).isDirectory()){const filename=path.join(full,'manifest.json');try{result.push({directory:full,...JSON.parse(await fs.readFile(filename,'utf8'))});}catch(error){if(error.code!=='ENOENT')throw error;}}}return result;}
async function failure(promise){try{await promise;assert.fail('Expected operation failure');}catch(error){assert.ok(error.outcome,'Execution error must retain outcome');return error;}}
test('all replacement recovery bytes are verified before the first destination mutation',async t=>{
 const f=await setup(t,{'new/child/a':'new-a','new/child/b':'new-b',replaceA:'new-A',replaceB:'new-B'},{replaceA:'old-A',replaceB:'old-B'}),plan=await f.prepare();let checked=false;
 const assertBackups=async()=>{if(checked)return;checked=true;const backups=await manifests(f.backupRoot),recovered=new Map();for(const manifest of backups)for(const file of manifest.files)recovered.set(file.path,await fs.readFile(path.join(manifest.directory,file.backupName),'utf8'));assert.equal(recovered.get('replaceA'),'old-A');assert.equal(recovered.get('replaceB'),'old-B');assert.equal(await fs.readFile(path.join(f.right,'replaceA'),'utf8'),'old-A');assert.equal(await fs.readFile(path.join(f.right,'replaceB'),'utf8'),'old-B');};
 const outcome=await executeRecursiveProviderCopy(plan,{...f.callbacks,createDirectory:async args=>{await assertBackups();return f.callbacks.createDirectory(args);},writeFile:async args=>{await assertBackups();return f.callbacks.writeFile(args);}});assert.equal(checked,true);assert.equal(outcome.items.filter(item=>item.status==='completed').length,outcome.completed);assert.equal(await fs.readFile(path.join(f.right,'new','child','a'),'utf8'),'new-a');assert.equal(await fs.readFile(path.join(f.right,'replaceB'),'utf8'),'new-B');
});
test('source roots inside destination roots and destination inside source roots reject before mutation',async t=>{
 for(const direction of ['target-inside','source-inside']){const f=await setup(t,{file:'source'},{}),nested=path.join(f.left,'nested');await fs.mkdir(nested);await fs.writeFile(path.join(nested,'file'),'nested source');const other=new FolderService(path.join(f.base,'other-history'));await other.select('b',direction==='target-inside'?nested:f.left);const sourceNative=new FolderService(path.join(f.base,'source-history'));await sourceNative.select('a',direction==='target-inside'?f.left:nested);const service=new ProviderFolderService({a:localFolderEndpoint(sourceNative,'a'),b:localFolderEndpoint(other,'b')});await assert.rejects(prepareRecursiveProviderCopy(service,'a',[''],{endpointKinds:{a:'local',b:'local'}}),/overlap|alias|root|source|destination/i);assert.deepEqual(await fs.readdir(f.backupRoot),[]);assert.equal(await fs.readFile(path.join(f.left,'file'),'utf8'),'source');}
});
test('selected source file and target hardlink alias reject before write',async t=>{
 const f=await setup(t,{file:'source'},{});await fs.link(path.join(f.left,'file'),path.join(f.right,'file'));await assert.rejects(f.prepare(['file']),/alias|same|source|destination/i);assert.equal(await fs.readFile(path.join(f.left,'file'),'utf8'),'source');assert.deepEqual(await fs.readdir(f.backupRoot),[]);
});
test('external namespace mutation after first verified write stops later writes',async t=>{
 const f=await setup(t,{a:'new-a',b:'new-b'},{}),plan=await f.prepare();let calls=0;
 const error=await failure(executeRecursiveProviderCopy(plan,{...f.callbacks,writeFile:async args=>{const result=await f.callbacks.writeFile(args);if(++calls===1)await fs.writeFile(path.join(f.right,'external'),'keep');return result;}}));assert.equal(calls,1);assert.equal(error.outcome.items.filter(item=>item.status==='completed').length,1);assert.equal(error.outcome.completed,1);assert.equal(await fs.readFile(path.join(f.right,'external'),'utf8'),'keep');assert.equal((await fs.readdir(f.right)).length,2);
});
test('Stop immediately after acknowledged write preserves that success exactly',async t=>{
 const f=await setup(t,{a:'new-a',b:'new-b'},{}),plan=await f.prepare(),controller=new AbortController();let calls=0;
 const error=await failure(executeRecursiveProviderCopy(plan,{...f.callbacks,signal:controller.signal,writeFile:async args=>{const result=await f.callbacks.writeFile(args);calls++;controller.abort();return result;}}));assert.equal(calls,1);assert.equal(error.outcome.completed,1);assert.equal(error.outcome.items.filter(item=>item.status==='completed').length,1);assert.equal(error.outcome.items.filter(item=>item.status==='unattempted').length,1);assert.equal((await fs.readdir(f.right)).length,1);
});
test('later source mutation after first write preserves prior completion and original later destination',async t=>{
 const f=await setup(t,{a:'new-a',b:'new-b'},{a:'old-a',b:'old-b'}),plan=await f.prepare();let calls=0;
 const error=await failure(executeRecursiveProviderCopy(plan,{...f.callbacks,writeFile:async args=>{const result=await f.callbacks.writeFile(args);if(++calls===1)await fs.writeFile(path.join(f.left,'b'),'EDIT!');return result;}}));assert.equal(calls,1);assert.equal(error.outcome.completed,1);assert.equal(await fs.readFile(path.join(f.right,'a'),'utf8'),'new-a');assert.equal(await fs.readFile(path.join(f.right,'b'),'utf8'),'old-b');assert.ok((await manifests(f.backupRoot)).length>0);
});
test('directory source metadata changes after review reject before creating destination',async t=>{
 if(process.platform==='win32')return;const f=await setup(t,{folder:null},{}),plan=await f.prepare(['folder']);await fs.chmod(path.join(f.left,'folder'),0o711);await assert.rejects(revalidateRecursiveProviderCopy(plan));await failure(executeRecursiveProviderCopy(plan,f.callbacks));assert.deepEqual(await fs.readdir(f.right),[]);
});
test('review revoked and executed plans cannot be reused or reconstructed',async t=>{
 const f=await setup(t,{file:'data'},{}),revoked=await f.prepare(['file']);revokeRecursiveProviderCopy(revoked);await assert.rejects(revalidateRecursiveProviderCopy(revoked));await assert.rejects(executeRecursiveProviderCopy(revoked,f.callbacks));assert.deepEqual(await fs.readdir(f.right),[]);
 const plan=await f.prepare(['file']);await assert.rejects(executeRecursiveProviderCopy({...plan},f.callbacks));const result=await executeRecursiveProviderCopy(plan,f.callbacks);assert.equal(result.completed,1);await assert.rejects(executeRecursiveProviderCopy(plan,f.callbacks));
});
test('revocation during a writer retains verified completion and prevents later mutation',async t=>{
 const f=await setup(t,{a:'A',b:'B'},{}),plan=await f.prepare();let calls=0;const error=await failure(executeRecursiveProviderCopy(plan,{...f.callbacks,writeFile:async args=>{const result=await f.callbacks.writeFile(args);calls++;revokeRecursiveProviderCopy(plan);return result;}}));assert.equal(calls,1);assert.equal(error.outcome.completed,1);assert.equal((await fs.readdir(f.right)).length,1);
});
test('manual directory mapping preserves selected namespace and copies required ancestors',async t=>{
 const f=await setup(t,{'source/nested/file':'data','source/empty':null,outside:'untouched'},{}),alignment=new FolderAlignment([{a:'source',b:'target',kind:'directory'}]),plan=await f.prepare(['source'],{alignment});await executeRecursiveProviderCopy(plan,f.callbacks);assert.equal(await fs.readFile(path.join(f.right,'target','nested','file'),'utf8'),'data');assert.equal((await fs.stat(path.join(f.right,'target','empty'))).isDirectory(),true);assert.deepEqual(await fs.readdir(f.right),['target']);
});
test('ignored sibling directories remain untouched without preventing a valid copy',async t=>{
 const f=await setup(t,{file:'source','.git/config':'source ignored'},{'.git/config':'target ignored'}),plan=await f.prepare(['file']);const outcome=await executeRecursiveProviderCopy(plan,f.callbacks);assert.equal(outcome.completed,1);assert.equal(await fs.readFile(path.join(f.right,'file'),'utf8'),'source');assert.equal(await fs.readFile(path.join(f.right,'.git','config'),'utf8'),'target ignored');
});
test('native callback result from another root cannot authorize successful publication',async t=>{
 const f=await setup(t,{file:'source'},{}),plan=await f.prepare(['file']);const error=await failure(executeRecursiveProviderCopy(plan,{...f.callbacks,writeFile:async args=>{const result=await f.callbacks.writeFile(args);return {...result,observation:{...result.observation,root:{...result.observation.root,identity:'other-root'}}};}}));assert.equal(error.outcome.completed,0);assert.ok(['unknown','verification-failed'].includes(error.outcome.items[0].status));assert.equal(await fs.readFile(path.join(f.right,'file'),'utf8'),'source');
});
test('native callback metadata for the wrong target cannot count as verified completion',async t=>{
 const f=await setup(t,{file:'source'},{}),plan=await f.prepare(['file']);const error=await failure(executeRecursiveProviderCopy(plan,{...f.callbacks,writeFile:async args=>{const result=await f.callbacks.writeFile(args);return {...result,observation:{...result.observation,metadata:{...result.observation.metadata,path:'different-target'}}};}}));assert.equal(error.outcome.completed,0);assert.ok(['unknown','verification-failed'].includes(error.outcome.items[0].status));assert.equal(await fs.readFile(path.join(f.right,'file'),'utf8'),'source');
});
test('external replacement of an earlier copied file during a later write cannot finish successfully',async t=>{
 const f=await setup(t,{a:'A',b:'B'},{}),plan=await f.prepare();let calls=0;const error=await failure(executeRecursiveProviderCopy(plan,{...f.callbacks,writeFile:async args=>{const result=await f.callbacks.writeFile(args);if(++calls===2)await fs.writeFile(path.join(f.right,'a'),'external');return result;}}));assert.equal(calls,2);assert.equal(error.outcome.completed,2);assert.equal(await fs.readFile(path.join(f.right,'a'),'utf8'),'external');assert.equal(await fs.readFile(path.join(f.right,'b'),'utf8'),'B');
});
test('external destination root permission changes during publication are not adopted as owned changes',async t=>{
 if(process.platform==='win32')return;
 const f=await setup(t,{a:'A',b:'B'},{}),plan=await f.prepare();let calls=0;const error=await failure(executeRecursiveProviderCopy(plan,{...f.callbacks,writeFile:async args=>{const result=await f.callbacks.writeFile(args);if(++calls===1)await fs.chmod(f.right,0o711);return result;}}));assert.equal(calls,1);assert.equal(error.outcome.completed,1);assert.equal((await fs.stat(f.right)).mode&0o777,0o711);await fs.chmod(f.right,0o700);
});
test('incoherent native file observation cannot count as verified completion',async t=>{
 for(const field of ['sha256','byteLength','size','identity','stamp']){const f=await setup(t,{file:'source'},{}),plan=await f.prepare(['file']);const error=await failure(executeRecursiveProviderCopy(plan,{...f.callbacks,writeFile:async args=>{const result=await f.callbacks.writeFile(args),observation={...result.observation,metadata:{...result.observation.metadata}};if(field==='sha256')observation.sha256='0'.repeat(64);else if(field==='byteLength')observation.byteLength++;else observation.metadata[field]=field==='size'?999:'';return {...result,observation};}}));assert.equal(error.outcome.completed,0,field);assert.ok(['unknown','verification-failed'].includes(error.outcome.items[0].status),field);}
});
