'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs'),{FolderTree}=require('../desktop/folder-tree.cjs'),{previewFilteredMove}=require('../desktop/folder-filtered-move.cjs');
async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'fc-filter-move-adapter-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));const roots={a:path.join(base,'a'),b:path.join(base,'b'),external:path.join(base,'external')};for(const root of Object.values(roots))await fs.mkdir(root);
 const write=async(s,p,data)=>{await fs.mkdir(path.dirname(path.join(roots[s],p)),{recursive:true});await fs.writeFile(path.join(roots[s],p),data);};
 await write('a','left/a.txt','left bytes');await write('a','left/keep.bin','left keep');await write('b','right/b.txt','right bytes');await write('b','right/keep.bin','right keep');
 const service=new FolderService(path.join(base,'backup'));for(const s of ['a','b'])await service.select(s,roots[s]);const tree=new FolderTree(service);await tree.setAlignment([{a:'left',b:'right',kind:'directory'},{a:'left/a.txt',b:'right/b.txt',kind:'file'}]);
 return {roots,service,tree,write,read:(s,p)=>fs.readFile(path.join(roots[s],p),'utf8'),preview:(s,paths,scope,choose=null,options={})=>previewFilteredMove(service,tree,s,paths,scope,choose,options)};
}
test('filtered move applies actual alignment in both directions and retains hidden source descendants',async t=>{
 for(const side of ['a','b']){const f=await fixture(t),root=side==='a'?'left':'right',name=side==='a'?'a.txt':'b.txt',target=side==='a'?'b':'a',destination=side==='a'?'right/b.txt':'left/a.txt';
 const p=await f.preview(side,[root],{include:'*.txt'});assert.equal(p.preview.operations.filter(o=>o.action==='move').length,1);const result=await p.service.execute(p.preview.id);assert.equal(result.retainedDirectories,1);await assert.rejects(()=>f.read(side,root+'/'+name),{code:'ENOENT'});assert.equal(await f.read(target,destination),side==='a'?'left bytes':'right bytes');assert.equal(await f.read(side,root+'/keep.bin'),side==='a'?'left keep':'right keep');}
});
test('external move uses original counterpart for equality and original path for destination',async t=>{
 const f=await fixture(t);await f.write('b','right/b.txt','left bytes');await f.write('external','left/a.txt','different external');
 const diff=await f.preview('a',['left/a.txt'],{status:'diff'},async()=>f.roots.external);assert.equal(diff.preview.operations.filter(o=>o.action==='move').length,0);await diff.service.execute(diff.preview.id);assert.equal(await f.read('a','left/a.txt'),'left bytes');
 const same=await f.preview('a',['left/a.txt'],{status:'same'},async()=>f.roots.external);await same.service.execute(same.preview.id);assert.equal(await f.read('external','left/a.txt'),'left bytes');assert.equal(await f.read('b','right/b.txt'),'left bytes');await assert.rejects(()=>f.read('a','left/a.txt'),{code:'ENOENT'});
});
test('either aligned endpoint mask protects matching source files',async t=>{
 for(const exclude of ['left/a.txt','right/b.txt']){const f=await fixture(t),p=await f.preview('a',['left'],{include:'*.txt',exclude});assert.equal(p.preview.operations.filter(o=>o.action==='move').length,0);await p.service.execute(p.preview.id);assert.equal(await f.read('a','left/a.txt'),'left bytes');}
});
test('normalized and timestamp eligibility use original aligned file snapshots',async t=>{
 const f=await fixture(t);await f.write('a','left/a.txt','A B\n');await f.write('b','right/b.txt','ab\n');
 const equal=await f.preview('a',['left/a.txt'],{status:'diff',rules:{mode:'text-whitespace-case'}});assert.equal(equal.preview.operations.length,0);
 await fs.utimes(path.join(f.roots.a,'left/a.txt'),100,100);await fs.utimes(path.join(f.roots.b,'right/b.txt'),101,101);
 const tolerance=await f.preview('a',['left/a.txt'],{status:'same',rules:{mode:'modified',timeToleranceMs:1500}});assert.equal(tolerance.preview.operations.filter(o=>o.action==='move').length,1);
 assert.equal((await f.preview('a',['left/a.txt'],{status:'newer-left'})).preview.operations.length,0);
 const newer=await f.preview('a',['left/a.txt'],{status:'newer-right'});await newer.service.execute(newer.preview.id);assert.equal(await f.read('b','right/b.txt'),'A B\n');
});
test('original counterpart changes invalidate an external move before source or destination writes',async t=>{
 const f=await fixture(t),p=await f.preview('a',['left'],{include:'*.txt'},async()=>f.roots.external);await f.write('b','right/keep.bin','changed counterpart');await assert.rejects(()=>p.service.execute(p.preview.id),/counterpart changed/);assert.equal(await f.read('a','left/a.txt'),'left bytes');await assert.rejects(()=>f.read('external','left/a.txt'),{code:'ENOENT'});
});
test('ignored descendants participate in explicit move scope and excluded ignored children retain source directory',async t=>{
 for(const exclude of ['', '.git']){const f=await fixture(t);await f.write('a','left/.git/config','configuration');const p=await f.preview('a',['left'],{exclude});const result=await p.service.execute(p.preview.id);
 if(exclude){assert.equal(await f.read('a','left/.git/config'),'configuration');assert.ok(result.retainedDirectories>=1);await assert.rejects(()=>f.read('b','right/.git/config'),{code:'ENOENT'});}else{assert.equal(await f.read('b','right/.git/config'),'configuration');await assert.rejects(()=>fs.stat(path.join(f.roots.a,'left')),{code:'ENOENT'});}}
});
test('counterpart changed during backup rejects external move before installation',async t=>{
 const f=await fixture(t);let changed=false;
 const p=await f.preview('a',['left/a.txt'],{status:'diff'},async()=>f.roots.external,{beforeStep:async({phase})=>{if(phase==='backup'&&!changed){changed=true;await f.write('b','right/b.txt','left bytes');}}});
 await assert.rejects(()=>p.service.execute(p.preview.id),/counterpart changed/);
 assert.equal(await f.read('a','left/a.txt'),'left bytes');await assert.rejects(()=>f.read('external','left/a.txt'),{code:'ENOENT'});
});
test('external filtered move supports a single selected root',async t=>{
 const f=await fixture(t);f.service.roots.b=null;const tree=new FolderTree(f.service);
 const p=await previewFilteredMove(f.service,tree,'a',['left/a.txt'],{status:'left'},async()=>f.roots.external);
 await p.service.execute(p.preview.id);assert.equal(await f.read('external','left/a.txt'),'left bytes');
});
