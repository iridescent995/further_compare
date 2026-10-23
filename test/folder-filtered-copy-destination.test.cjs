'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs'),{FolderTree}=require('../desktop/folder-tree.cjs'),{previewFilteredCopyToFolder}=require('../desktop/folder-filtered-copy-destination.cjs');
async function fixture(t,oneSide=false){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'fc-filter-copy-out-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));const roots={a:path.join(base,'a'),b:path.join(base,'b'),external:path.join(base,'out')};for(const root of Object.values(roots))await fs.mkdir(root);
 const write=async(s,p,data)=>{await fs.mkdir(path.dirname(path.join(roots[s],p)),{recursive:true});await fs.writeFile(path.join(roots[s],p),data);};
 await write('a','left/a.txt','one');await write('a','left/keep.bin','source keep');await write('b','right/b.txt','one');await write('b','right/keep.bin','counterpart keep');await write('external','left/a.txt','external different');
 const active=new FolderService(path.join(base,'backup'));await active.select('a',roots.a);if(!oneSide)await active.select('b',roots.b);const tree=new FolderTree(active);
 if(!oneSide)await tree.setAlignment([{a:'left',b:'right',kind:'directory'},{a:'left/a.txt',b:'right/b.txt',kind:'file'}]);
 return {active,tree,roots,write,read:(s,p)=>fs.readFile(path.join(roots[s],p),'utf8'),preview:(s,paths,scope,choose=async()=>roots.external)=>previewFilteredCopyToFolder(active,tree,s,paths,scope,choose)};
}
test('external copy filters by original aligned comparison and transfers original names in both directions',async t=>{
 for(const side of ['a','b']){const f=await fixture(t),root=side==='a'?'left':'right',file=side==='a'?'a.txt':'b.txt';const p=await f.preview(side,[root],{include:'*.txt',status:'same'});assert.equal(p.preview.operations.filter(o=>o.action==='copy').length,1);await p.service.execute(p.preview.id);assert.equal(await f.read('external',root+'/'+file),'one');await assert.rejects(()=>f.read('external',root+'/keep.bin'),{code:'ENOENT'});assert.equal(await f.read(side,root+'/'+file),'one');}
});
test('original equal status excludes copy despite different external target and either endpoint exclusions apply',async t=>{
 for(const scope of [{status:'diff',include:'*.txt'},{exclude:'left/a.txt',include:'*.txt'},{exclude:'right/b.txt',include:'*.txt'}]){const f=await fixture(t),p=await f.preview('a',['left'],scope);assert.equal(p.preview.operations.filter(o=>o.action==='copy').length,0);await p.service.execute(p.preview.id);assert.equal(await f.read('external','left/a.txt'),'external different');}
});
test('normalized and timestamp rules classify original pair',async t=>{
 const f=await fixture(t);await f.write('a','left/a.txt','A B\n');await f.write('b','right/b.txt','ab\n');const p=await f.preview('a',['left/a.txt'],{status:'same',rules:{mode:'text-whitespace-case'}});await p.service.execute(p.preview.id);assert.equal(await f.read('external','left/a.txt'),'A B\n');
 const g=await fixture(t);await fs.utimes(path.join(g.roots.a,'left/a.txt'),100,100);await fs.utimes(path.join(g.roots.b,'right/b.txt'),101,101);assert.equal((await g.preview('a',['left/a.txt'],{status:'newer-left'})).preview.operations.length,0);const q=await g.preview('a',['left/a.txt'],{status:'newer-right'});await q.service.execute(q.preview.id);assert.equal(await g.read('external','left/a.txt'),'one');
});
test('stale source, original counterpart, and external destination invalidate copy before writes',async t=>{
 for(const side of ['a','b','external']){const f=await fixture(t),p=await f.preview('a',['left'],{include:'*.txt'});await f.write(side,side==='b'?'right/keep.bin':side==='a'?'left/keep.bin':'left/a.txt','edited');await assert.rejects(()=>p.service.execute(p.preview.id),/changed after preview/);assert.equal(await f.read('external','left/a.txt'),side==='external'?'edited':'external different');}
});
test('missing opposite root supports one-sided filtering and later selection invalidates preview',async t=>{
 const f=await fixture(t,true),p=await f.preview('a',['left'],{status:'left',include:'*.txt'});await p.service.execute(p.preview.id);assert.equal(await f.read('external','left/a.txt'),'one');
 const g=await fixture(t,true),q=await g.preview('a',['left'],{status:'left'});await g.active.select('b',g.roots.b);await assert.rejects(()=>q.service.execute(q.preview.id),/changed|revision/);assert.equal(await g.read('external','left/a.txt'),'external different');
});
test('cancellation and returned preview mutations cannot widen writes',async t=>{
 const f=await fixture(t);assert.equal(await f.preview('a',['left'],{},async()=>null),null);const p=await f.preview('a',['left'],{include:'*.txt'});p.preview.operations.push({path:'left/keep.bin',action:'copy'});await p.service.execute(p.preview.id);await assert.rejects(()=>f.read('external','left/keep.bin'),{code:'ENOENT'});
});
