'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {snapshotProviderFile}=require('../desktop/provider-file-snapshot.cjs');
const {backupProviderFiles}=require('../desktop/provider-transfer-backup.cjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(files){
 const state={files:new Map(Object.entries(files).map(([name,bytes])=>[name,Buffer.from(bytes)])),opened:0,closed:0,writes:0,hook:null};
 const info=relative=>{const bytes=state.files.get(relative);return bytes?{path:relative,kind:'file',identity:'file:'+relative,stamp:'unchanged-metadata',size:bytes.length,strongRevision:false}:null;};
 const provider={inspectRoot:async()=>({path:'opaque-remote-root',identity:'remote-root',stamp:'root-stamp'}),inspectEntry:async relative=>info(relative),openFileReader:async relative=>{const bytes=state.files.get(relative);let offset=0;state.opened++;return {metadata:info(relative),read:async max=>{await state.hook?.(relative,offset);if(offset>=bytes.length)return null;const chunk=bytes.subarray(offset,offset+Math.min(max,3));offset+=chunk.length;return chunk;},validate:async()=>info(relative),close:async()=>{state.closed++;}};},write:async()=>{state.writes++;throw Error('Source must remain read-only');}};
 const entries=async()=>Promise.all([...state.files.keys()].map(async relative=>({path:relative,observation:await snapshotProviderFile(provider,relative)})));
 return {provider,state,entries};
}
async function temp(t){const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-provider-backup-')));t.after(()=>fs.rm(base,{recursive:true,force:true}));const root=path.join(base,'backups');await fs.mkdir(root);return {base,root};}
async function publishedManifests(root){const found=[];async function visit(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true}).catch(()=>[])){const file=path.join(directory,entry.name);if(entry.isDirectory())await visit(file);else if(entry.name.endsWith('.json')){try{found.push({path:file,value:JSON.parse(await fs.readFile(file,'utf8'))});}catch{}}}}await visit(root);return found;}
function readonly(f){assert.equal(f.state.writes,0);assert.equal(f.state.opened,f.state.closed);}
test('backs up binary, empty and colon/Unicode paths with exact recoverable bytes and opaque local names',async t=>{
 const {root}=await temp(t),f=fixture({'nested/report:résumé #1.bin':Buffer.from([0,255,128,13,10,42]),'empty.txt':Buffer.alloc(0)}),entries=await f.entries();
 const result=await backupProviderFiles(f.provider,entries,root);
 assert.deepEqual(result.durability,{filesSynced:true,directoryEntriesSynced:process.platform!=='win32'});
 assert.equal(path.dirname(result.backupPath),root);assert.equal(path.dirname(result.manifestPath),result.backupPath);assert.equal(result.files.length,2);
 const manifest=JSON.parse(await fs.readFile(result.manifestPath,'utf8'));
 for(const record of result.files){assert.equal(path.basename(record.backupName),record.backupName);assert.ok(!/[\\/:]/.test(record.backupName));assert.notEqual(record.backupName,record.path);const expected=f.state.files.get(record.path);assert.ok(expected);assert.equal(record.byteLength,expected.length);assert.equal(record.sha256,hash(expected));assert.deepEqual(await fs.readFile(path.join(result.backupPath,record.backupName)),expected);}
 assert.equal(manifest.version,1);assert.equal(manifest.kind,'provider-transfer-backup');assert.deepEqual(manifest.files.map(({observation,...record})=>record),result.files);for(const record of manifest.files){const approved=entries.find(entry=>entry.path===record.path).observation;assert.equal(record.observation.sha256,approved.sha256);assert.equal(record.observation.byteLength,approved.byteLength);assert.deepEqual(record.observation.root,approved.root);assert.deepEqual(record.observation.metadata,approved.metadata);}assert.equal(new Set(result.files.map(record=>record.backupName)).size,2);readonly(f);
});
test('same-size metadata-preserving source changes reject backup and publish no complete manifest',async t=>{
 const {root}=await temp(t),f=fixture({'file.txt':'AAAA'}),entries=await f.entries();f.state.files.set('file.txt',Buffer.from('BBBB'));
 await assert.rejects(backupProviderFiles(f.provider,entries,root));assert.deepEqual(await publishedManifests(root),[]);readonly(f);
});
test('provider read failure cleans partial output without publishing a manifest',async t=>{
 const {root}=await temp(t),f=fixture({'first.bin':'first','second.bin':'second'}),entries=await f.entries();f.state.hook=(relative,offset)=>{if(relative==='second.bin'&&offset>0)throw Error('source read failed');};
 await assert.rejects(backupProviderFiles(f.provider,entries,root),/source read failed/);assert.deepEqual(await publishedManifests(root),[]);readonly(f);
});
test('abort while streaming closes source handles and publishes no complete manifest',async t=>{
 const {root}=await temp(t),f=fixture({'file.bin':'multiple chunks'}),entries=await f.entries(),controller=new AbortController();f.state.hook=()=>controller.abort();
 await assert.rejects(backupProviderFiles(f.provider,entries,root,{signal:controller.signal}),{code:'ABORT_ERR'});assert.deepEqual(await publishedManifests(root),[]);readonly(f);
});
test('pre-aborted backups do not create output or open another reader',async t=>{
 const {root}=await temp(t),f=fixture({'file.bin':'data'}),entries=await f.entries(),before=f.state.opened,controller=new AbortController();controller.abort();
 await assert.rejects(backupProviderFiles(f.provider,entries,root,{signal:controller.signal}),{code:'ABORT_ERR'});assert.equal(f.state.opened,before);assert.deepEqual(await fs.readdir(root),[]);readonly(f);
});
test('rejects a symlink backup root without writing through to its target',async t=>{
 const {base,root}=await temp(t),link=path.join(base,'linked-backups');await fs.symlink(root,link);const f=fixture({'file.bin':'data'}),entries=await f.entries();
 await assert.rejects(backupProviderFiles(f.provider,entries,link));assert.deepEqual(await fs.readdir(root),[]);readonly(f);
});
test('rejects backup roots reached through a symlink ancestor',async t=>{
 const {base,root}=await temp(t),outside=path.join(base,'real-parent');await fs.mkdir(outside);await fs.mkdir(path.join(outside,'child'));const link=path.join(root,'alias');await fs.symlink(outside,link);const f=fixture({'file.bin':'data'}),entries=await f.entries();
 await assert.rejects(backupProviderFiles(f.provider,entries,path.join(link,'child')));assert.deepEqual(await fs.readdir(path.join(outside,'child')),[]);readonly(f);
});
test('a regular file cannot serve as a backup directory',async t=>{
 const {base}=await temp(t),root=path.join(base,'occupied');await fs.writeFile(root,'keep me');const f=fixture({'file.bin':'data'}),entries=await f.entries();
 await assert.rejects(backupProviderFiles(f.provider,entries,root));assert.equal(await fs.readFile(root,'utf8'),'keep me');readonly(f);
});
test('duplicate and traversal source entries are rejected',async t=>{
 const {root}=await temp(t),f=fixture({'file.bin':'data'}),entries=await f.entries();
 await assert.rejects(backupProviderFiles(f.provider,[entries[0],entries[0]],root));
 await assert.rejects(backupProviderFiles(f.provider,[{...entries[0],path:'../outside'}],root));assert.deepEqual(await publishedManifests(root),[]);readonly(f);
});
test('entry cap rejects an oversized review before opening source readers',async t=>{
 const {root}=await temp(t),f=fixture({'file.bin':'data'}),[entry]=await f.entries(),before=f.state.opened;
 const entries=Array.from({length:1001},(_,index)=>({...entry,path:'file-'+index+'.bin'}));
 await assert.rejects(backupProviderFiles(f.provider,entries,root));assert.equal(f.state.opened,before);assert.deepEqual(await fs.readdir(root),[]);readonly(f);
});
test('backup-directory replacement during streaming cannot overwrite or remove the replacement',async t=>{
 const {base,root}=await temp(t),f=fixture({'file.bin':'several binary chunks'}),entries=await f.entries();let replaced=false,operationPath;const retained=path.join(base,'retained-original-backup');
 f.state.hook=async()=>{if(replaced)return;const folders=await fs.readdir(root,{withFileTypes:true});const folder=folders.find(entry=>entry.isDirectory());assert.ok(folder);operationPath=path.join(root,folder.name);await fs.rename(operationPath,retained);await fs.writeFile(operationPath,'replacement owned by someone else');replaced=true;};
 await assert.rejects(backupProviderFiles(f.provider,entries,root));assert.equal(replaced,true);assert.equal(await fs.readFile(operationPath,'utf8'),'replacement owned by someone else');assert.deepEqual(await publishedManifests(root),[]);assert.deepEqual(await publishedManifests(retained),[]);readonly(f);
});
test('corruption of an earlier backup during a later stream prevents a completed manifest',async t=>{
 const {root}=await temp(t),f=fixture({'first.bin':'first','second.bin':'second'}),entries=await f.entries();let corrupted=false;
 f.state.hook=async(relative)=>{if(relative!=='second.bin'||corrupted)return;const [directory]=await fs.readdir(root);const operation=path.join(root,directory);for(const filename of await fs.readdir(operation)){const file=path.join(operation,filename);if(filename.endsWith('.bin')&&(await fs.stat(file)).size===5){await fs.writeFile(file,'XXXXX');corrupted=true;break;}}assert.equal(corrupted,true);};
 await assert.rejects(backupProviderFiles(f.provider,entries,root));assert.equal(corrupted,true);assert.deepEqual(await publishedManifests(root),[]);readonly(f);
});
test('an unexpected manifest created during streaming is preserved without replacement',async t=>{
 const {root}=await temp(t),f=fixture({'file.bin':'streaming bytes'}),entries=await f.entries();let injected;
 f.state.hook=async()=>{if(injected)return;const [directory]=await fs.readdir(root);injected=path.join(root,directory,'manifest.json');await fs.writeFile(injected,'external owner manifest',{flag:'wx'});};
 await assert.rejects(backupProviderFiles(f.provider,entries,root));assert.equal(await fs.readFile(injected,'utf8'),'external owner manifest');readonly(f);
});
test('manifest observations omit unrelated provider fields and recovery files are private',async t=>{
 const {root}=await temp(t),f=fixture({'file.bin':'sensitive bytes'}),entries=await f.entries();entries[0].observation.password='do not serialize';entries[0].observation.root.password='do not serialize';entries[0].observation.metadata.credential='do not serialize';
 const result=await backupProviderFiles(f.provider,entries,root),text=await fs.readFile(result.manifestPath,'utf8'),manifest=JSON.parse(text);assert.equal(text.includes('do not serialize'),false);assert.deepEqual(Object.keys(manifest.files[0].observation).sort(),['byteLength','metadata','root','sha256']);
 if(process.platform!=='win32'){assert.equal((await fs.stat(result.backupPath)).mode&0o777,0o700);for(const file of [result.manifestPath,...result.files.map(record=>path.join(result.backupPath,record.backupName))])assert.equal((await fs.stat(file)).mode&0o777,0o600);}readonly(f);
});
test('recursive backup opt-in preserves one complete manifest beyond the selected-file cap',{timeout:30000},async t=>{
 const {root}=await temp(t),f=fixture(Object.fromEntries(Array.from({length:1001},(_,i)=>['entry-'+i,Buffer.alloc(0)]))),entries=await f.entries();
 const result=await backupProviderFiles(f.provider,entries,root,{maxFiles:50000});const manifest=JSON.parse(await fs.readFile(result.manifestPath,'utf8'));
 assert.equal(result.files.length,1001);assert.equal(manifest.files.length,1001);assert.equal((await publishedManifests(root)).length,1);assert.equal(new Set(manifest.files.map(x=>x.path)).size,1001);assert.ok(manifest.files.every(x=>x.sha256===hash(Buffer.alloc(0))&&x.byteLength===0));readonly(f);
});
test('invalid recursive recovery limits and excess entries fail before source IO or writes',async t=>{
 const {root}=await temp(t),f=fixture({a:'a',b:'b'}),entries=await f.entries(),before=f.state.opened;
 for(const maxFiles of [0,-1,1.5,50001,Infinity,'50000',null])await assert.rejects(backupProviderFiles(f.provider,entries,root,{maxFiles}),/limit/);
 await assert.rejects(backupProviderFiles(f.provider,entries,root,{maxFiles:1}),/unique backup/);assert.equal(f.state.opened,before);assert.deepEqual(await fs.readdir(root),[]);
});
async function withDirectorySync(syncRecoveryDirectories){
 const vm=require('node:vm'),{createRequire}=require('node:module'),filename=require.resolve('../desktop/provider-transfer-backup.cjs'),nativeRequire=createRequire(filename),module={exports:{}};
 const source=await fs.readFile(filename,'utf8');
 vm.runInThisContext('(function(require,module,exports){'+source+'\n})',{filename})(name=>name==='./recovery-directory-sync.cjs'?{syncRecoveryDirectories}:nativeRequire(name),module,module.exports);
 return module.exports.backupProviderFiles;
}
test('directory durability gate runs only after all backup bytes and completion manifest exist',async t=>{
 const {root}=await temp(t),f=fixture({one:'first',two:'second'}),entries=await f.entries();let called=0;
 const backup=await withDirectorySync(async(operation,recovery)=>{called++;assert.equal(recovery.path,root);const manifest=JSON.parse(await fs.readFile(path.join(operation.path,'manifest.json'),'utf8'));assert.equal(manifest.files.length,2);for(const record of manifest.files)assert.equal(hash(await fs.readFile(path.join(operation.path,record.backupName))),record.sha256);assert.equal((await fs.readdir(operation.path)).some(name=>name.endsWith('.tmp')),false);return {durability:{filesSynced:true,directoryEntriesSynced:false},durabilityWarning:'test platform lacks directory flushing'};});
 const result=await backup(f.provider,entries,root);assert.equal(called,1);assert.deepEqual(result.durability,{filesSynced:true,directoryEntriesSynced:false});assert.equal(result.durabilityWarning,'test platform lacks directory flushing');readonly(f);
});
test('directory flush failure prevents successful backup and removes only owned recovery entries',async t=>{
 const {root}=await temp(t),f=fixture({one:'first'}),entries=await f.entries();const backup=await withDirectorySync(async()=>{throw Object.assign(Error('directory flush failed'),{code:'EIO'});});
 await assert.rejects(backup(f.provider,entries,root),{code:'EIO'});assert.deepEqual(await fs.readdir(root),[]);readonly(f);
});
