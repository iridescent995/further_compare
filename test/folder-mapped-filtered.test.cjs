'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs'),{FolderTree}=require('../desktop/folder-tree.cjs'),{MappedFolderOperations}=require('../desktop/folder-mapped-operations.cjs');
async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'fc-filtered-map-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const roots={a:path.join(base,'a'),b:path.join(base,'b')};for(const root of Object.values(roots))await fs.mkdir(root);
 const write=async(side,p,text)=>{await fs.mkdir(path.dirname(path.join(roots[side],p)),{recursive:true});await fs.writeFile(path.join(roots[side],p),text);};
 await write('a','left/a.txt','alpha');await write('a','left/skip.bin','left retained');await write('b','right/renamed.txt','beta');await write('b','right/skip.bin','right retained');
 const service=new FolderService(path.join(base,'backup'));for(const side of ['a','b'])await service.select(side,roots[side]);const tree=new FolderTree(service);
 await tree.setAlignment([{a:'left',b:'right',kind:'directory'},{a:'left/a.txt',b:'right/renamed.txt',kind:'file'}]);
 return {roots,write,tree,service,operations:()=>new MappedFolderOperations(service,tree),read:(side,p)=>fs.readFile(path.join(roots[side],p),'utf8')};
}
test('filtered mapped directory copy applies actual masks and preserves excluded descendants in both directions',async t=>{
 for(const side of ['a','b']){const f=await fixture(t),op=f.operations(),plan=await op.previewCopy(side,[side==='a'?'left':'right'],{include:'*.txt'});assert.equal(plan.operations.filter(x=>x.action==='copy').length,1);await op.execute(plan.id);assert.equal(await f.read(side==='a'?'b':'a',side==='a'?'right/renamed.txt':'left/a.txt'),side==='a'?'alpha':'beta');assert.equal(await f.read('b','right/skip.bin'),'right retained');assert.equal(await f.read('a','left/skip.bin'),'left retained');}
});
test('either actual aligned endpoint exclusion blocks copy, and source masks are not projected',async t=>{
 const f=await fixture(t);
 for(const exclude of ['left/a.txt','right/renamed.txt']){const p=await f.operations().previewCopy('a',['left'],{include:'*.txt',exclude});assert.equal(p.operations.length,0);}
 const op=f.operations(),p=await op.previewCopy('a',['left'],{include:'left/a.txt'});assert.equal(p.operations.filter(x=>x.action==='copy').length,1);await op.execute(p.id);assert.equal(await f.read('b','right/renamed.txt'),'alpha');
});
test('normalized status excludes equal text while raw byte differences remain transferable',async t=>{
 const f=await fixture(t);await f.write('a','left/a.txt','A B\n');await f.write('b','right/renamed.txt','ab\n');
 const rules={mode:'text-whitespace-case'};
 const hidden=await f.operations().previewCopy('a',['left/a.txt'],{status:'diff',rules});assert.equal(hidden.operations.length,0);
 const op=f.operations(),p=await op.previewCopy('a',['left/a.txt'],{status:'same',rules});assert.equal(p.operations.filter(x=>x.action==='copy').length,1);await op.execute(p.id);assert.equal(await f.read('b','right/renamed.txt'),'A B\n');
});
test('mtime eligibility uses original sides and stale excluded counterparts invalidate preview',async t=>{
 const f=await fixture(t);await fs.utimes(path.join(f.roots.a,'left/a.txt'),100,100);await fs.utimes(path.join(f.roots.b,'right/renamed.txt'),200,200);
 assert.equal((await f.operations().previewCopy('a',['left/a.txt'],{status:'newer-left'})).operations.length,0);
 const op=f.operations(),p=await op.previewCopy('a',['left'],{include:'*.txt',status:'newer-right'});assert.equal(p.operations.filter(x=>x.action==='copy').length,1);await f.write('b','right/skip.bin','external');await assert.rejects(()=>op.execute(p.id),/changed after preview/);assert.equal(await f.read('b','right/renamed.txt'),'beta');
});
test('cross-parent mapped child copies with needed scaffolding only',async t=>{
 const f=await fixture(t);await f.write('b','elsewhere/target.txt','other');await f.tree.setAlignment([{a:'left/a.txt',b:'elsewhere/target.txt',kind:'file'}]);
 const op=f.operations(),p=await op.previewCopy('a',['left'],{include:'a.txt'});assert.deepEqual(p.operations.filter(x=>x.action==='copy').map(x=>x.path),['elsewhere/target.txt']);await op.execute(p.id);assert.equal(await f.read('b','elsewhere/target.txt'),'alpha');assert.equal(await f.read('b','right/renamed.txt'),'beta');
});
