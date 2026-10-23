'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs'),{FolderTree}=require('../desktop/folder-tree.cjs'),{MappedFolderOperations}=require('../desktop/folder-mapped-operations.cjs');
async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'fc-mirror-subtrees-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const roots={a:path.join(base,'a'),b:path.join(base,'b')};for(const root of Object.values(roots))await fs.mkdir(root);
 const write=async(side,p,text)=>{await fs.mkdir(path.dirname(path.join(roots[side],p)),{recursive:true});await fs.writeFile(path.join(roots[side],p),text);};
 for(const side of ['a','b']){await write(side,'selected/deep/change.txt',`${side} changed`);await write(side,'selected/skip.bin',`${side} excluded`);await write(side,'sibling/keep.txt',`${side} sibling`);}
 const service=new FolderService(path.join(base,'backup'));for(const side of ['a','b'])await service.select(side,roots[side]);const tree=new FolderTree(service);
 return {roots,write,tree,service,operations:()=>new MappedFolderOperations(service,tree),read:(side,p)=>fs.readFile(path.join(roots[side],p),'utf8')};
}
test('selected collapsed directory mirrors every descendant in both directions without touching siblings',async t=>{
 for(const source of ['a','b']){
  const f=await fixture(t),target=source==='a'?'b':'a';
  await f.write(source,'selected/new/created.txt','new source');await f.write(target,'selected/obsolete/removed.txt','old target');
  // No tree expansion is performed: descendants must come from the disk inventory.
  const op=f.operations(),p=await op.preview('sync',`${source}-to-${target}`,['selected'],null,true);
  assert.ok(p.operations.some(x=>x.path==='selected/deep/change.txt'&&x.action==='copy'));
  assert.ok(p.operations.some(x=>x.path==='selected/new/created.txt'&&x.action==='copy'));
  assert.ok(p.operations.some(x=>x.path==='selected/obsolete/removed.txt'&&x.action==='delete'));
  assert.ok(p.operations.every(x=>x.path==='selected'||x.path.startsWith('selected/')));
  await op.execute(p.id);
  assert.equal(await f.read(target,'selected/deep/change.txt'),`${source} changed`);
  assert.equal(await f.read(target,'selected/new/created.txt'),'new source');
  await assert.rejects(()=>f.read(target,'selected/obsolete/removed.txt'),{code:'ENOENT'});
  assert.equal(await f.read(target,'sibling/keep.txt'),`${target} sibling`);
  assert.equal(await f.read(source,'sibling/keep.txt'),`${source} sibling`);
 }
});
test('subtree mirror filters preserve excluded files and their target-only parent directories',async t=>{
 const f=await fixture(t);await f.write('b','selected/obsolete/remove.txt','remove');await f.write('b','selected/obsolete/keep.bin','keep');
 const op=f.operations(),p=await op.preview('sync','a-to-b',['selected'],{include:'*.txt'},true);
 assert.ok(p.operations.some(x=>x.path==='selected/obsolete/remove.txt'&&x.action==='delete'));
 assert.ok(!p.operations.some(x=>x.path.endsWith('.bin')||x.path==='selected/obsolete'));
 await op.execute(p.id);assert.equal(await f.read('b','selected/skip.bin'),'b excluded');assert.equal(await f.read('b','selected/obsolete/keep.bin'),'keep');
 await assert.rejects(()=>f.read('b','selected/obsolete/remove.txt'),{code:'ENOENT'});
 assert.equal(await f.read('b','sibling/keep.txt'),'b sibling');
});
test('mapped subtree mirrors use target namespace and actual endpoint exclusions in both directions',async t=>{
 for(const source of ['a','b']){
  const f=await fixture(t),target=source==='a'?'b':'a';
  await f.write('a','left/source.txt','left source');await f.write('b','right/renamed.txt','right source');
  await f.write('a','left/deep/common.txt','left nested');await f.write('b','right/deep/common.txt','right nested');
  await f.tree.setAlignment([{a:'left',b:'right',kind:'directory'},{a:'left/source.txt',b:'right/renamed.txt',kind:'file'}]);
  const root=target==='a'?'left':'right',file=target==='a'?'left/source.txt':'right/renamed.txt';
  for(const exclude of ['left/source.txt','right/renamed.txt']){
   const p=await f.operations().preview('sync',`${source}-to-${target}`,[root],{exclude},true);
   assert.ok(!p.operations.some(x=>x.path===file));assert.ok(p.operations.some(x=>x.path===`${root}/deep/common.txt`));
  }
  const op=f.operations(),p=await op.preview('sync',`${source}-to-${target}`,[root],{},true);
  const copy=p.operations.find(x=>x.path===file);assert.equal(copy.sourcePath,source==='a'?'left/source.txt':'right/renamed.txt');
  await op.execute(p.id);assert.equal(await f.read(target,file),source==='a'?'left source':'right source');
  assert.equal(await f.read(target,'selected/deep/change.txt'),`${target} changed`);
 }
});
test('selected reserved counterpart is rejected unless excluded by scope',async t=>{
 const f=await fixture(t);await f.write('a','selected/source.txt','source');await f.write('b','selected/renamed.txt','target');await f.write('b','selected/source.txt','reserved');
 await f.tree.setAlignment([{a:'selected/source.txt',b:'selected/renamed.txt',kind:'file'}]);
 await assert.rejects(()=>f.operations().preview('sync','a-to-b',['selected'],{},true),/reserved alignment counterpart/);
 const op=f.operations(),p=await op.preview('sync','a-to-b',['selected'],{exclude:'selected/source.txt'},true);
 await op.execute(p.id);assert.equal(await f.read('b','selected/source.txt'),'reserved');assert.equal(await f.read('b','selected/renamed.txt'),'target');
});
test('disk changes after recursive preview reject before any target changes',async t=>{
 for(const changedSide of ['a','b']){
  const f=await fixture(t),op=f.operations(),p=await op.preview('sync','a-to-b',['selected'],{},true);
  await f.write(changedSide,'selected/deep/new-after-preview.txt','external');
  await assert.rejects(()=>op.execute(p.id),/changed after preview/);
  assert.equal(await f.read('b','selected/deep/change.txt'),'b changed');assert.equal(await f.read('b','sibling/keep.txt'),'b sibling');
 }
});
test('existing exact selections do not implicitly mirror directory children',async t=>{
 const f=await fixture(t);
 for(const scope of [null,{}]){
  const p=await f.operations().preview('sync','a-to-b',['selected'],scope);
  assert.ok(!p.operations.some(x=>x.path.startsWith('selected/')));
 }
 const op=f.operations(),p=await op.preview('sync','a-to-b',['selected/deep/change.txt'],{},true);
 assert.deepEqual(p.operations.map(x=>x.path),['selected/deep/change.txt']);await op.execute(p.id);
 assert.equal(await f.read('b','selected/skip.bin'),'b excluded');
 await assert.rejects(()=>f.operations().preview('sync','a-to-b',[],{},true),/Choose selected entries/);
 await assert.rejects(()=>f.operations().preview('sync','a-to-b',['missing'],{},true),/Selection changed/);
});
