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
test('review sync filters copies and target-only deletions without hiding source presence',async t=>{
 const f=await fixture(t);await f.write('b','right/remove.txt','remove');await f.write('b','right/only.bin','retain');
 const op=f.operations(),p=await op.preview('sync','a-to-b',null,{include:'*.txt'});
 assert.deepEqual(p.operations.map(x=>[x.path,x.action]),[['right/renamed.txt','copy'],['right/remove.txt','delete']]);
 await op.execute(p.id);assert.equal(await f.read('b','right/renamed.txt'),'alpha');assert.equal(await f.read('b','right/skip.bin'),'right retained');assert.equal(await f.read('b','right/only.bin'),'retain');await assert.rejects(()=>f.read('b','right/remove.txt'),{code:'ENOENT'});
});
test('filtered descendant prevents ancestor deletion while eligible siblings are deleted',async t=>{
 const f=await fixture(t);await f.write('b','orphan/deep/retain.bin','retained');await f.write('b','orphan/deep/remove.txt','removed');
 const op=f.operations(),p=await op.preview('sync','a-to-b',null,{exclude:'*.bin'});
 assert.ok(!p.operations.some(x=>x.action==='delete-folder'));assert.ok(p.operations.some(x=>x.path==='orphan/deep/remove.txt'&&x.action==='delete'));
 await op.execute(p.id);assert.equal(await f.read('b','orphan/deep/retain.bin'),'retained');await assert.rejects(()=>f.read('b','orphan/deep/remove.txt'),{code:'ENOENT'});
});
test('review rules and original aligned paths control status, query and exclusions',async t=>{
 const f=await fixture(t);await f.write('a','left/a.txt','A B\n');await f.write('b','right/renamed.txt','ab\n');
 const rules={mode:'text-whitespace-case'};
 assert.equal((await f.operations().preview('merge','a-to-b',null,{status:'diff',include:'*.txt',rules})).operations.length,0);
 for(const exclude of ['left/a.txt','right/renamed.txt'])assert.equal((await f.operations().preview('sync','a-to-b',null,{include:'*.txt',exclude})).operations.length,0);
 const op=f.operations(),p=await op.preview('merge','a-to-b',null,{status:'same',query:'a.txt',rules});assert.deepEqual(p.operations.map(x=>x.path),['right/renamed.txt']);await op.execute(p.id);assert.equal(await f.read('b','right/renamed.txt'),'A B\n');
});
test('reverse scoped sync honors one-sided status and actual mapped names',async t=>{
 const f=await fixture(t);await f.write('a','left/orphan.txt','delete me');
 const op=f.operations(),p=await op.preview('sync','b-to-a',null,{status:'left',include:'*.txt'});assert.deepEqual(p.operations.map(x=>[x.path,x.action]),[['left/orphan.txt','delete']]);await op.execute(p.id);assert.equal(await f.read('a','left/a.txt'),'alpha');await assert.rejects(()=>f.read('a','left/orphan.txt'),{code:'ENOENT'});
});
test('selected review paths retain exact scope and filtered selections are valid no-ops',async t=>{
 const f=await fixture(t);await f.write('b','right/orphan.txt','preserved');
 const op=f.operations(),p=await op.preview('sync','a-to-b',['right/renamed.txt'],{include:'*.txt'});assert.deepEqual(p.operations.map(x=>x.path),['right/renamed.txt']);await op.execute(p.id);assert.equal(await f.read('b','right/orphan.txt'),'preserved');
 assert.equal((await f.operations().preview('sync','a-to-b',['right/skip.bin'],{include:'*.txt'})).operations.length,0);
 await assert.rejects(()=>f.operations().preview('sync','a-to-b',['missing'],{include:'*.txt'}),/Selection changed/);
});
test('hidden source or target changes invalidate review before any writes',async t=>{
 for(const side of ['a','b']){const f=await fixture(t),op=f.operations(),p=await op.preview('sync','a-to-b',null,{include:'*.txt'});await f.write(side,side==='a'?'left/skip.bin':'right/skip.bin','external change');await assert.rejects(()=>op.execute(p.id),/changed after preview/);assert.equal(await f.read('b','right/renamed.txt'),'beta');}
});
test('filtered conflicts do not block eligible transfers; visible conflicts still fail',async t=>{
 const f=await fixture(t);await f.write('a','conflict.bin','file');await fs.mkdir(path.join(f.roots.b,'conflict.bin'));
 const op=f.operations(),p=await op.preview('sync','a-to-b',null,{exclude:'conflict.bin'});await op.execute(p.id);assert.equal(await f.read('b','right/renamed.txt'),'alpha');assert.ok((await fs.stat(path.join(f.roots.b,'conflict.bin'))).isDirectory());await assert.rejects(()=>f.operations().preview('sync','a-to-b',null,{}),/conflict/);
});
test('excluded reserved alignment counterparts remain untouched without blocking scoped sync',async t=>{
 const f=await fixture(t);await f.write('b','left/a.txt','reserved');
 const op=f.operations(),p=await op.preview('sync','a-to-b',null,{exclude:'left/a.txt'});await op.execute(p.id);assert.equal(await f.read('b','left/a.txt'),'reserved');
 await assert.rejects(()=>f.operations().preview('sync','a-to-b',null,{}),/reserved alignment counterpart/);
});
