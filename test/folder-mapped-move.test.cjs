'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs');
const {FolderTree}=require('../desktop/folder-tree.cjs');
const {MappedFolderOperations}=require('../desktop/folder-mapped-operations.cjs');
const {previewMove}=require('../desktop/folder-move.cjs');
async function fixture(t){
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-mapped-move-')));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const roots={a:path.join(base,'a'),b:path.join(base,'b')};for(const root of Object.values(roots))await fs.mkdir(root);
 const write=async(side,relative,text)=>{const full=path.join(roots[side],relative);await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,text);};
 await write('a','old/first.txt','left first');await write('b','new/first-paired.txt','right first');await write('a','old/second.txt','left second');await write('b','new/second-paired.txt','right second');await write('b','new/keep.txt','unrelated');
 const service=new FolderService(path.join(base,'backups'));for(const side of ['a','b'])await service.select(side,roots[side]);
 const tree=new FolderTree(service);await tree.setAlignment([{a:'old/first.txt',b:'new/first-paired.txt',kind:'file'},{a:'old/second.txt',b:'new/second-paired.txt',kind:'file'}]);
 return {base,service,tree,roots,write,operations:new MappedFolderOperations(service,tree)};
}
const read=(root,relative)=>fs.readFile(path.join(root,relative),'utf8');
const absent=(root,relative)=>assert.rejects(()=>fs.lstat(path.join(root,relative)),{code:'ENOENT'});
test('mapped move uses actual paths in both directions and keeps backups for both names',async t=>{
 for(const side of ['a','b']){
  const {operations,roots}=await fixture(t);const target=side==='a'?'b':'a',sourcePath=side==='a'?'old/first.txt':'new/first-paired.txt',targetPath=side==='a'?'new/first-paired.txt':'old/first.txt';
  const before=await read(roots[side],sourcePath),prior=await read(roots[target],targetPath),plan=await operations.previewMove(side,[sourcePath]);
  const move=plan.operations.find(op=>op.action==='move');assert.equal(move.sourcePath,sourcePath);assert.equal(move.targetPath,targetPath);
  plan.operations.splice(0);const result=await operations.execute(plan.id);await absent(roots[side],sourcePath);assert.equal(await read(roots[target],targetPath),before);
  assert.equal(await read(result.backupPath,'source/'+sourcePath),before);assert.equal(await read(result.backupPath,'destination/'+targetPath),prior);await assert.rejects(()=>operations.execute(plan.id),/Preview/);
 }
});
test('mapped directory move follows cross-parent descendants and preserves unrelated targets',async t=>{
 const {operations,roots}=await fixture(t);const plan=await operations.previewMove('a',['old']);await operations.execute(plan.id);await absent(roots.a,'old');
 assert.equal(await read(roots.b,'new/first-paired.txt'),'left first');assert.equal(await read(roots.b,'new/second-paired.txt'),'left second');assert.equal(await read(roots.b,'new/keep.txt'),'unrelated');assert.ok((await fs.stat(path.join(roots.b,'old'))).isDirectory());
});
test('mapped move restores actual source and target paths after partial installation or removal',async t=>{
 for(const failure of ['install','remove-source']){
  const {service,tree,roots}=await fixture(t);let steps=0;
  const plan=await previewMove(service,'a',['old'],null,{targetPath:p=>tree.alignment.counterpart('a',p),beforeStep:async({phase})=>{if(phase===failure&&++steps===2)throw Error('injected mapped failure');}});
  let error;try{await plan.service.execute(plan.preview.id);}catch(e){error=e;}assert.ok(error);assert.deepEqual(error.rollbackErrors,[]);
  for(const [name,paired]of [['first','first-paired'],['second','second-paired']]){assert.equal(await read(roots.a,'old/'+name+'.txt'),'left '+name);assert.equal(await read(roots.b,'new/'+paired+'.txt'),'right '+name);}
  assert.equal(JSON.parse(await read(error.backupPath,'manifest.json')).status,'rolled-back');assert.equal(await read(roots.b,'new/keep.txt'),'unrelated');
 }
});
test('refresh and source changes invalidate mapped move previews',async t=>{
 const first=await fixture(t),plan=await first.operations.previewMove('a',['old/first.txt']);await first.tree.refresh();await assert.rejects(()=>first.operations.execute(plan.id),/alignment changed/);assert.equal(await read(first.roots.a,'old/first.txt'),'left first');
 const second=await fixture(t),next=await second.operations.previewMove('a',['old/first.txt']);await second.write('a','old/first.txt','external edit');await assert.rejects(()=>second.operations.execute(next.id),/changed/);assert.equal(await read(second.roots.b,'new/first-paired.txt'),'right first');
});
test('mapped move refuses displaced source entries and endpoint type changes',async t=>{
 const {operations,roots,write}=await fixture(t);await write('a','new/first-paired.txt','displaced');await assert.rejects(()=>operations.previewMove('a',['new/first-paired.txt']),/displaced/);
 await fs.unlink(path.join(roots.a,'old/first.txt'));await fs.mkdir(path.join(roots.a,'old/first.txt'));await assert.rejects(()=>operations.previewMove('a',['old/first.txt']),/changed type/);
});
test('context invalidation after source removal still rolls back against captured roots',async t=>{
 const {service,tree,roots}=await fixture(t);let valid=true,removals=0;
 const plan=await previewMove(service,'a',['old'],null,{targetPath:p=>tree.alignment.counterpart('a',p),validateContext:async()=>{if(!valid)throw Error('context changed');},beforeStep:async({phase})=>{if(phase==='remove-source'&&++removals===2)valid=false;}});
 let error;try{await plan.service.execute(plan.preview.id);}catch(e){error=e;}assert.ok(error);assert.match(error.message,/context changed/);assert.deepEqual(error.rollbackErrors,[]);
 for(const [name,paired]of [['first','first-paired'],['second','second-paired']]){assert.equal(await read(roots.a,'old/'+name+'.txt'),'left '+name);assert.equal(await read(roots.b,'new/'+paired+'.txt'),'right '+name);}
});
test('mapped move restores removed source directories after late failure',async t=>{
 const {service,tree,roots}=await fixture(t);
 const plan=await previewMove(service,'a',['old'],null,{targetPath:p=>tree.alignment.counterpart('a',p),beforeStep:async({phase})=>{if(phase==='complete')throw Error('late failure');}});
 let error;try{await plan.service.execute(plan.preview.id);}catch(e){error=e;}assert.ok(error);assert.deepEqual(error.rollbackErrors,[]);assert.equal(await read(roots.a,'old/first.txt'),'left first');assert.equal(await read(roots.b,'new/first-paired.txt'),'right first');await absent(roots.b,'old');
});
test('mapped move preserves metadata on a newly created differently named directory',async t=>{
 const {service,tree,roots}=await fixture(t);await tree.setAlignment([{a:'old',b:'new',kind:'directory'}]);await fs.rm(path.join(roots.b,'new'),{recursive:true});
 const time=new Date('2020-02-03T04:05:06Z');await fs.utimes(path.join(roots.a,'old'),time,time);if(process.platform!=='win32')await fs.chmod(path.join(roots.a,'old'),0o750);
 const operations=new MappedFolderOperations(service,tree),plan=await operations.previewMove('a',['old']);await operations.execute(plan.id);const stat=await fs.stat(path.join(roots.b,'new'));
 assert.ok(Math.abs(stat.mtimeMs-time.getTime())<2);if(process.platform!=='win32')assert.equal(stat.mode&0o777,0o750);assert.equal(await read(roots.b,'new/first.txt'),'left first');await absent(roots.a,'old');
});
test('invalid mapped destination paths, collisions and file-parent conflicts reject before writes',async t=>{
 const {service,roots}=await fixture(t);
 const mappings=[()=>null,()=>'/escape',()=> '../escape',()=> 'C:escape',()=> 'one.txt',p=>p.endsWith('first.txt')?'Folder/one':'folder/two',p=>p.endsWith('first.txt')?'parent':'parent/child'];
 for(const targetPath of mappings)await assert.rejects(()=>previewMove(service,'a',['old/first.txt','old/second.txt'],null,{targetPath}));
 assert.equal(await read(roots.a,'old/first.txt'),'left first');assert.equal(await read(roots.b,'new/first-paired.txt'),'right first');
});
test('external edits to a mapped destination survive partial rollback',async t=>{
 const {service,tree,roots}=await fixture(t);let removed=0;
 const plan=await previewMove(service,'a',['old'],null,{targetPath:p=>tree.alignment.counterpart('a',p),beforeStep:async({phase})=>{if(phase==='remove-source'&&++removed===2){await fs.writeFile(path.join(roots.b,'new/first-paired.txt'),'external destination');throw Error('external conflict');}}});
 let error;try{await plan.service.execute(plan.preview.id);}catch(e){error=e;}assert.ok(error);assert.ok(error.rollbackErrors.length);assert.equal(await read(roots.b,'new/first-paired.txt'),'external destination');assert.equal(await read(roots.a,'old/first.txt'),'left first');assert.equal(await read(roots.b,'new/second-paired.txt'),'right second');assert.equal(await read(error.backupPath,'destination/new/first-paired.txt'),'right first');
});
