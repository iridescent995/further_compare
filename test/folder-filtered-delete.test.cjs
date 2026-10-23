'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs'),{FolderTree}=require('../desktop/folder-tree.cjs'),{previewFilteredDelete}=require('../desktop/folder-filtered-delete.cjs');
async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'fc-filter-delete-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));const roots={a:path.join(base,'a'),b:path.join(base,'b')};for(const root of Object.values(roots))await fs.mkdir(root);
 const write=async(s,p,data)=>{await fs.mkdir(path.dirname(path.join(roots[s],p)),{recursive:true});await fs.writeFile(path.join(roots[s],p),data);};
 await write('a','left/a.txt','one');await write('a','left/hidden.bin','left hidden');await write('b','right/b.txt','two');await write('b','right/hidden.bin','right hidden');
 const service=new FolderService(path.join(base,'backup'));for(const s of ['a','b'])await service.select(s,roots[s]);const tree=new FolderTree(service);await tree.setAlignment([{a:'left',b:'right',kind:'directory'},{a:'left/a.txt',b:'right/b.txt',kind:'file'}]);
 return {roots,service,tree,write,read:(s,p)=>fs.readFile(path.join(roots[s],p),'utf8'),preview:(s,paths,scope)=>previewFilteredDelete(service,tree,s,paths,scope)};
}
test('filtered delete executes only matching actual paths and keeps hidden children in both directions',async t=>{
 for(const side of ['a','b']){const f=await fixture(t),root=side==='a'?'left':'right',file=side==='a'?'a.txt':'b.txt',p=await f.preview(side,[root],{include:'*.txt'});assert.deepEqual(p.preview.operations.map(o=>o.path),[root+'/'+file]);p.preview.operations.push({action:'delete',path:root+'/hidden.bin'});const result=await p.service.execute(p.preview.id);assert.equal(result.completed,1);await assert.rejects(()=>f.read(side,root+'/'+file),{code:'ENOENT'});assert.equal(await f.read(side,root+'/hidden.bin'),side==='a'?'left hidden':'right hidden');assert.equal(await f.read(side==='a'?'b':'a',side==='a'?'right/b.txt':'left/a.txt'),side==='a'?'two':'one');}
});
test('either aligned endpoint exclusion protects files and source directories',async t=>{
 for(const exclude of ['left/a.txt','right/b.txt']){const f=await fixture(t),p=await f.preview('a',['left'],{include:'*.txt',exclude});assert.equal(p.preview.operations.length,0);await p.service.execute(p.preview.id);assert.equal(await f.read('a','left/a.txt'),'one');}
});
test('full scoped directory deletion removes eligible empty directories only',async t=>{
 const f=await fixture(t);await fs.mkdir(path.join(f.roots.a,'left/empty'));const p=await f.preview('a',['left'],{});assert.ok(p.preview.operations.some(o=>o.path==='left'&&o.action==='delete-folder'));await p.service.execute(p.preview.id);await assert.rejects(()=>fs.stat(path.join(f.roots.a,'left')),{code:'ENOENT'});assert.equal(await f.read('b','right/b.txt'),'two');
});
test('normalized equality and timestamp rules apply to original aligned sides',async t=>{
 const f=await fixture(t);await f.write('a','left/a.txt','A B\n');await f.write('b','right/b.txt','ab\n');
 assert.equal((await f.preview('a',['left/a.txt'],{status:'diff',rules:{mode:'text-whitespace-case'}})).preview.operations.length,0);
 await fs.utimes(path.join(f.roots.a,'left/a.txt'),100,100);await fs.utimes(path.join(f.roots.b,'right/b.txt'),101,101);
 assert.equal((await f.preview('a',['left/a.txt'],{status:'same',rules:{mode:'modified',timeToleranceMs:1500}})).preview.operations.length,1);
 assert.equal((await f.preview('a',['left/a.txt'],{status:'newer-left'})).preview.operations.length,0);
 const p=await f.preview('a',['left/a.txt'],{status:'newer-right'});await p.service.execute(p.preview.id);await assert.rejects(()=>f.read('a','left/a.txt'),{code:'ENOENT'});
});
test('changed excluded source or counterpart invalidates deletion before writes',async t=>{
 for(const changeSide of ['a','b']){const f=await fixture(t),p=await f.preview('a',['left'],{include:'*.txt'});await f.write(changeSide,changeSide==='a'?'left/hidden.bin':'right/hidden.bin','edited');await assert.rejects(()=>p.service.execute(p.preview.id),/changed after preview/);assert.equal(await f.read('a','left/a.txt'),'one');}
});
test('cross-parent alignment masks, tree revision, and replay protection are enforced',async t=>{
 const f=await fixture(t);await f.tree.setAlignment([{a:'left/a.txt',b:'right/b.txt',kind:'file'}]);const p=await f.preview('a',['left/a.txt'],{include:'right/b.txt'});assert.equal(p.preview.operations.length,1);await f.tree.refresh();await assert.rejects(()=>p.service.execute(p.preview.id),/revision/);assert.equal(await f.read('a','left/a.txt'),'one');
 const next=await f.preview('a',['left/a.txt'],{});await next.service.execute(next.preview.id);await assert.rejects(()=>next.service.execute(next.preview.id));
});
test('filtered deletion supports a single comparison root',async t=>{
 const f=await fixture(t);f.service.roots.b=null;const tree=new FolderTree(f.service);
 const p=await previewFilteredDelete(f.service,tree,'a',['left'],{include:'*.txt'});await p.service.execute(p.preview.id);
 await assert.rejects(()=>f.read('a','left/a.txt'),{code:'ENOENT'});assert.equal(await f.read('a','left/hidden.bin'),'left hidden');
});
