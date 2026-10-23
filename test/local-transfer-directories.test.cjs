'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs');
const {prepareLocalDirectory,createLocalDirectory,finalizeLocalDirectory}=require('../desktop/local-transfer-directories.cjs');
async function setup(t){
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-local-dirs-')));t.after(()=>fs.rm(base,{recursive:true,force:true}));const root=path.join(base,'root');await fs.mkdir(root);const service=new FolderService(path.join(base,'backups'));await service.select('b',root);return {base,root,service};
}
const prepare=(f,p='new',options)=>prepareLocalDirectory(f.service,'b',p,options);
const meta={kind:'directory',mode:0o40750,mtime:1700000000000};
async function child(f,relative){const value=await f.service.inspectEntry('b',relative);return {name:path.basename(relative),kind:value.kind,identity:value.identity,stamp:value.stamp};}
test('private exclusive directory creation returns frozen opaque authority and finalized metadata',async t=>{
 const f=await setup(t),plan=await prepare(f);assert.ok(Object.isFrozen(plan)&&Object.isFrozen(plan.observation));assert.equal(plan.observation.target,null);
 const created=await createLocalDirectory(plan);assert.ok(Object.isFrozen(created));const stat=await fs.stat(path.join(f.root,'new'));if(process.platform!=='win32')assert.equal(stat.mode&0o777,0o700);
 const finalized=await finalizeLocalDirectory(created,meta,[]),after=await fs.stat(path.join(f.root,'new'));assert.equal(finalized.observation.metadata.kind,'directory');if(process.platform!=='win32')assert.equal(after.mode&0o777,0o750);assert.ok(Math.abs(after.mtimeMs-meta.mtime)<=1);
 await assert.rejects(createLocalDirectory(plan),/consumed/);await assert.rejects(finalizeLocalDirectory(created,meta,[]),/consumed/);
});
test('existing directories and files are never adopted or modified',async t=>{
 const f=await setup(t);await fs.mkdir(path.join(f.root,'existing'),{mode:0o755});await fs.writeFile(path.join(f.root,'file'),'preserve');
 for(const name of ['existing','file'])await assert.rejects(prepare(f,name));assert.equal(await fs.readFile(path.join(f.root,'file'),'utf8'),'preserve');
 const plan=await prepare(f);await fs.mkdir(path.join(f.root,'new'));await fs.writeFile(path.join(f.root,'new','external'),'keep');await assert.rejects(createLocalDirectory(plan));assert.equal(await fs.readFile(path.join(f.root,'new','external'),'utf8'),'keep');
});
test('parent authority replacement after review rejects creation',async t=>{
 const f=await setup(t);await fs.mkdir(path.join(f.root,'parent'));const plan=await prepare(f,'parent/new');await fs.rename(path.join(f.root,'parent'),path.join(f.root,'old'));await fs.mkdir(path.join(f.root,'parent'));await assert.rejects(createLocalDirectory(plan),{code:'STALE_SOURCE'});await assert.rejects(fs.stat(path.join(f.root,'parent','new')),{code:'ENOENT'});
});
test('root change after review rejects creation and missing parents are not created',async t=>{
 const f=await setup(t);await assert.rejects(prepare(f,'missing/new'));const plan=await prepare(f);const other=path.join(f.base,'other');await fs.mkdir(other);await f.service.select('b',other);await assert.rejects(createLocalDirectory(plan),{code:'STALE_SOURCE'});assert.deepEqual(await fs.readdir(other),[]);
});
test('parent and leaf symlinks reject without touching their targets',async t=>{
 const f=await setup(t),outside=path.join(f.base,'outside');await fs.mkdir(outside);await fs.symlink(outside,path.join(f.root,'link'),'dir');await assert.rejects(prepare(f,'link/new'));await assert.rejects(prepare(f,'link'));assert.deepEqual(await fs.readdir(outside),[]);
});
test('case and Unicode aliases reject before creation',async t=>{
 const f=await setup(t);await fs.mkdir(path.join(f.root,'Existing'));await assert.rejects(prepare(f,'existing'),/spell|missing|exists/i);await fs.mkdir(path.join(f.root,'café'));await assert.rejects(prepare(f,'cafe\u0301'),/spell|missing|exists/i);
});
test('finalization verifies exact child names types identities and stamps',async t=>{
 for(const mutation of ['extra','missing','replaced','changed']){const f=await setup(t),created=await createLocalDirectory(await prepare(f)),full=path.join(f.root,'new');await fs.writeFile(path.join(full,'file'),'original');const expected=[await child(f,'new/file')];
 if(mutation==='extra')await fs.writeFile(path.join(full,'extra'),'external');if(mutation==='missing')await fs.unlink(path.join(full,'file'));if(mutation==='replaced'){await fs.rename(path.join(full,'file'),path.join(f.root,'old-file'));await fs.writeFile(path.join(full,'file'),'original');}if(mutation==='changed')await fs.writeFile(path.join(full,'file'),'different');
 await assert.rejects(finalizeLocalDirectory(created,meta,expected),e=>e.created===true&&e.metadataApplied===false);if(process.platform!=='win32')assert.equal((await fs.stat(full)).mode&0o777,0o700);
 }
});
test('finalization handles owned nested operations deepest first',async t=>{
 const f=await setup(t),parent=await createLocalDirectory(await prepare(f)),nested=await createLocalDirectory(await prepare(f,'new/child'));await fs.writeFile(path.join(f.root,'new','child','file'),'data');await finalizeLocalDirectory(nested,meta,[await child(f,'new/child/file')]);const result=await finalizeLocalDirectory(parent,meta,[await child(f,'new/child')]);assert.equal(result.observation.metadata.path,'new');assert.equal(await fs.readFile(path.join(f.root,'new','child','file'),'utf8'),'data');
});
test('replaced owned directory or symlink is never finalized',async t=>{
 for(const symlink of [false,true]){const f=await setup(t),created=await createLocalDirectory(await prepare(f));await fs.rename(path.join(f.root,'new'),path.join(f.root,'original'));if(symlink)await fs.symlink(path.join(f.root,'original'),path.join(f.root,'new'),'dir');else await fs.mkdir(path.join(f.root,'new'),{mode:0o755});await assert.rejects(finalizeLocalDirectory(created,meta,[]));if(process.platform!=='win32')assert.equal((await fs.stat(path.join(f.root,'original'))).mode&0o777,0o700);}
});
test('pre-cancellation creates nothing and finalization retains known created directory',async t=>{
 const f=await setup(t),controller=new AbortController();controller.abort();await assert.rejects(prepare(f,'new',{signal:controller.signal}),{code:'ABORT_ERR'});const plan=await prepare(f);await assert.rejects(createLocalDirectory(plan,{signal:controller.signal}),{code:'ABORT_ERR'});assert.deepEqual(await fs.readdir(f.root),[]);const created=await createLocalDirectory(plan);await assert.rejects(finalizeLocalDirectory(created,meta,[],{signal:controller.signal}),{code:'ABORT_ERR'});assert.equal((await fs.stat(path.join(f.root,'new'))).isDirectory(),true);
});
test('creation verification failure reports partial creation and never removes contents',async t=>{
 const f=await setup(t),plan=await prepare(f),inspect=f.service.inspectEntry.bind(f.service);let injected=false;f.service.inspectEntry=async(side,relative)=>{const result=await inspect(side,relative);if(relative==='new'&&result&&!injected){injected=true;await fs.writeFile(path.join(f.root,'new','external'),'keep');}return result;};await assert.rejects(createLocalDirectory(plan),e=>e.code==='DIRECTORY_VERIFICATION_FAILED'&&e.created===true&&e.operation==='create');assert.equal(await fs.readFile(path.join(f.root,'new','external'),'utf8'),'keep');
});
test('metadata verification failure preserves applied outcome',async t=>{
 const f=await setup(t),created=await createLocalDirectory(await prepare(f)),inspect=f.service.inspectEntry.bind(f.service);f.service.inspectEntry=async(side,relative)=>{const result=await inspect(side,relative);if(relative==='new'&&result&&Math.abs(result.mtime-meta.mtime)<=1)return {...result,identity:'changed-after-metadata'};return result;};await assert.rejects(finalizeLocalDirectory(created,meta,[]),e=>e.code==='DIRECTORY_VERIFICATION_FAILED'&&e.metadataApplied===true&&e.acknowledged===true&&e.operation==='finalize');assert.ok(Math.abs((await fs.stat(path.join(f.root,'new'))).mtimeMs-meta.mtime)<=1);
});
test('restrictive directory mode can finalize without requiring children remain readable',async t=>{
 const f=await setup(t),created=await createLocalDirectory(await prepare(f)),full=path.join(f.root,'new');await fs.writeFile(path.join(full,'file'),'data');const expected=[await child(f,'new/file')];try{const result=await finalizeLocalDirectory(created,{kind:'directory',mode:0,mtime:meta.mtime},expected);assert.equal(result.observation.metadata.kind,'directory');if(process.platform!=='win32')assert.equal((await fs.stat(full)).mode&0o777,0);}finally{await fs.chmod(full,0o700);}
});
test('forged tokens, incomplete namespaces, malformed paths and metadata reject',async t=>{
 const f=await setup(t);for(const value of ['','../outside','/absolute','a\\b','a\0b'])await assert.rejects(prepare(f,value));await assert.rejects(createLocalDirectory({relative:'new'}));const created=await createLocalDirectory(await prepare(f));await assert.rejects(finalizeLocalDirectory({...created},meta,[]));await assert.rejects(finalizeLocalDirectory(created,{kind:'file'},[]));await assert.rejects(finalizeLocalDirectory(created,{kind:'directory',mode:-1},[]));await assert.rejects(finalizeLocalDirectory(created,meta,[{name:'file',kind:'file'}]));await finalizeLocalDirectory(created,meta,[]);
});
test('child appearing during namespace metadata checks rejects before finalization',async t=>{
 const f=await setup(t),created=await createLocalDirectory(await prepare(f)),full=path.join(f.root,'new');await fs.writeFile(path.join(full,'file'),'data');const expected=[await child(f,'new/file')],inspect=f.service.inspectEntry.bind(f.service);let added=false;
 f.service.inspectEntry=async(side,relative)=>{const value=await inspect(side,relative);if(relative==='new/file'&&!added){added=true;await fs.writeFile(path.join(full,'external'),'keep');}return value;};
 await assert.rejects(finalizeLocalDirectory(created,meta,expected),error=>error.code==='STALE_SOURCE'&&error.metadataApplied===false);assert.equal(await fs.readFile(path.join(full,'external'),'utf8'),'keep');
});
test('external directory mode change before finalization is preserved',async t=>{
 if(process.platform==='win32')return;
 const f=await setup(t),created=await createLocalDirectory(await prepare(f)),full=path.join(f.root,'new');await fs.chmod(full,0o755);await assert.rejects(finalizeLocalDirectory(created,meta,[]),error=>error.code==='STALE_SOURCE'&&error.metadataApplied===false);assert.equal((await fs.stat(full)).mode&0o777,0o755);
});
test('root and parent permission changes after review reject directory creation',async t=>{
 if(process.platform==='win32')return;
 for(const changed of ['root','parent']){const f=await setup(t);await fs.mkdir(path.join(f.root,'parent'),{mode:0o700});const plan=await prepare(f,'parent/new'),target=changed==='root'?f.root:path.join(f.root,'parent');await fs.chmod(target,0o711);await assert.rejects(createLocalDirectory(plan),{code:'STALE_SOURCE'});await assert.rejects(fs.stat(path.join(f.root,'parent','new')),{code:'ENOENT'});await fs.chmod(target,0o700);}
});
test('parent permission changes before owned-child finalization reject',async t=>{
 if(process.platform==='win32')return;
 const f=await setup(t);await fs.mkdir(path.join(f.root,'parent'),{mode:0o700});const created=await createLocalDirectory(await prepare(f,'parent/new'));await fs.chmod(path.join(f.root,'parent'),0o755);await assert.rejects(finalizeLocalDirectory(created,meta,[]),error=>error.code==='STALE_SOURCE'&&error.metadataApplied===false);assert.equal((await fs.stat(path.join(f.root,'parent','new'))).mode&0o777,0o700);
});
test('fractional source timestamps survive finalization without Date truncation',async t=>{
 const f=await setup(t);
 // Date truncation plus filesystem microsecond rounding previously exceeded the
 // unchanged 1 ms verification threshold at this real epoch boundary.
 for(const [index,mtime]of [1792750000001.9998,1792750000003.9998,0.9998].entries()){
  const relative='fractional-'+index,created=await createLocalDirectory(await prepare(f,relative));
  const result=await finalizeLocalDirectory(created,{kind:'directory',mode:0o40700,mtime},[]);
  const actual=await fs.stat(path.join(f.root,relative));assert.ok(Math.abs(actual.mtimeMs-mtime)<=1,`${actual.mtimeMs} vs ${mtime}`);assert.equal(result.observation.metadata.kind,'directory');
 }
});
