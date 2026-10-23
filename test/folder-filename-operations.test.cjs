'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs');
const {FolderTree}=require('../desktop/folder-tree.cjs');
const {MappedFolderOperations}=require('../desktop/folder-mapped-operations.cjs');
const {UpdateBothOperations}=require('../desktop/folder-update-both.cjs');
async function fixture(t){
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-filename-ops-')));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const service=new FolderService(path.join(base,'backup')),roots={a:path.join(base,'a'),b:path.join(base,'b')};
 for(const side of ['a','b']){await fs.mkdir(roots[side]);await service.select(side,roots[side]);}
 const write=async(side,p,content,time=1700000000)=>{const file=path.join(roots[side],p);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,content);await fs.utimes(file,time,time);};
 const read=(side,p)=>fs.readFile(path.join(roots[side],p),'utf8');
 const tree=new FolderTree(service);
 return {service,tree,roots,write,read,matching:()=>tree.setMatchingMode('filename'),operations:()=>new MappedFolderOperations(service,tree)};
}
test('filename copy replaces the actual matched endpoint and backs it up',async t=>{
 const f=await fixture(t);await f.write('a','src/x.txt','left');await f.write('b','other/x.txt','right');await f.matching();
 const op=f.operations(),p=await op.previewCopy('a',['src/x.txt']);assert.deepEqual(p.operations.map(o=>[o.sourcePath,o.targetPath]),[['src/x.txt','other/x.txt']]);
 const result=await op.execute(p.id);assert.equal(await f.read('b','other/x.txt'),'left');assert.equal(await fs.readFile(path.join(result.backupPath,'files/other/x.txt'),'utf8'),'right');await assert.rejects(()=>f.read('b','src/x.txt'),{code:'ENOENT'});
});
test('filename orphan copy keeps its source-relative path and creates ancestors',async t=>{
 const f=await fixture(t);await f.write('a','nested/only.txt','orphan');await f.write('b','untouched.txt','keep');await f.matching();
 const op=f.operations(),p=await op.previewCopy('a',['nested/only.txt']);assert.ok(p.operations.some(o=>o.path==='nested'&&o.action==='create-folder'));await op.execute(p.id);assert.equal(await f.read('b','nested/only.txt'),'orphan');assert.equal(await f.read('b','untouched.txt'),'keep');
});
test('duplicate names copy to their stable distinct matched paths',async t=>{
 const f=await fixture(t);for(const [s,p,c]of [['a','a/x','A'],['a','z/x','Z'],['b','b/x','B'],['b','y/x','Y']])await f.write(s,p,c);await f.matching();
 const op=f.operations(),p=await op.previewCopy('a',['a/x','z/x']);assert.deepEqual(p.operations.filter(o=>o.action==='copy').map(o=>[o.sourcePath,o.targetPath]),[['a/x','b/x'],['z/x','y/x']]);await op.execute(p.id);assert.equal(await f.read('b','b/x'),'A');assert.equal(await f.read('b','y/x'),'Z');
});
test('filename move uses the actual counterpart and removes only its source',async t=>{
 const f=await fixture(t);await f.write('a','src/x','source');await f.write('a','keep','keep');await f.write('b','target/x','old');await f.matching();
 const op=f.operations(),p=await op.previewMove('a',['src/x']);await op.execute(p.id);assert.equal(await f.read('b','target/x'),'source');assert.equal(await f.read('a','keep'),'keep');await assert.rejects(()=>f.read('a','src/x'),{code:'ENOENT'});
});
test('filename update copies newer content into the paired actual path',async t=>{
 const f=await fixture(t);await f.write('a','src/x','new',1700000100);await f.write('b','target/x','old');await f.matching();const op=new UpdateBothOperations(f.service,f.tree),p=await op.preview();assert.deepEqual(p.operations.map(o=>[o.sourcePath,o.targetPath]),[['src/x','target/x']]);await op.execute(p.id);assert.equal(await f.read('b','target/x'),'new');
});
test('filename selected sync updates pair and removes only selected target orphan',async t=>{
 const f=await fixture(t);await f.write('a','src/x','new');await f.write('b','target/x','old');await f.write('b','delete.txt','remove');await f.write('b','keep.txt','keep');await f.matching();const op=f.operations(),p=await op.preview('sync','a-to-b',['target/x','delete.txt'],{});assert.deepEqual(p.operations.map(o=>[o.action,o.targetPath]),[['copy','target/x'],['delete','delete.txt']]);await op.execute(p.id);assert.equal(await f.read('b','target/x'),'new');assert.equal(await f.read('b','keep.txt'),'keep');await assert.rejects(()=>f.read('b','delete.txt'),{code:'ENOENT'});
});
test('filename copy filters inspect both actual endpoint ancestries',async t=>{
 const f=await fixture(t);await f.write('a','src/x','left');await f.write('b','hidden/x','right');await f.matching();for(const exclude of ['src','hidden']){const p=await f.operations().previewCopy('a',['src/x'],{exclude});assert.equal(p.operations.length,0);}assert.equal(await f.read('b','hidden/x'),'right');
});
test('filename operation refuses plans after tree refresh',async t=>{
 const f=await fixture(t);await f.write('a','src/x','left');await f.write('b','target/x','right');await f.matching();const op=f.operations(),p=await op.previewCopy('a',['src/x']);await f.tree.refresh();await assert.rejects(()=>op.execute(p.id),/changed|Preview/i);assert.equal(await f.read('b','target/x'),'right');
});
test('matched child remains copyable when its source directory conflicts on target',async t=>{
 const f=await fixture(t);await f.write('a','dir/x','left');await f.write('b','dir','unrelated file');await f.write('b','other/x','right');await f.matching();const op=f.operations(),p=await op.preview('merge','a-to-b',['other/x'],{});assert.deepEqual(p.operations.map(o=>o.targetPath),['other/x']);await op.execute(p.id);assert.equal(await f.read('b','other/x'),'left');assert.equal(await f.read('b','dir'),'unrelated file');
});
test('filename orphan cannot overwrite a conflicting target directory',async t=>{
 const f=await fixture(t);await f.write('a','node','file');await f.write('b','node/child','keep');await f.matching();await assert.rejects(()=>f.operations().previewCopy('a',['node']),/displaced|conflict|reserved/i);assert.equal(await f.read('b','node/child'),'keep');
});
for(const mode of ['merge','sync'])test(`filename whole ${mode} treats unrelated directories as structure only`,async t=>{
 const f=await fixture(t);await f.write('a','src/x','new');await f.write('b','target/x','old');await fs.mkdir(path.join(f.roots.a,'empty-left'));await fs.mkdir(path.join(f.roots.b,'empty-right'));await f.matching();
 const op=f.operations(),p=await op.preview(mode,'a-to-b',null,{});assert.deepEqual(p.operations.map(o=>[o.action,o.targetPath]),[['copy','target/x']]);await op.execute(p.id);assert.equal(await f.read('b','target/x'),'new');assert.ok((await fs.stat(path.join(f.roots.b,'empty-right'))).isDirectory());await assert.rejects(()=>fs.stat(path.join(f.roots.b,'src')),{code:'ENOENT'});
});
test('filename whole update adds only parents required by orphan copies',async t=>{
 const f=await fixture(t);await f.write('a','nested/only','left');await fs.mkdir(path.join(f.roots.a,'empty'));await f.matching();const op=new UpdateBothOperations(f.service,f.tree),p=await op.preview();assert.deepEqual(p.operations.map(o=>[o.action,o.targetPath]),[['create-folder','nested'],['copy','nested/only']]);await op.execute(p.id);assert.equal(await f.read('b','nested/only'),'left');await assert.rejects(()=>fs.stat(path.join(f.roots.b,'empty')),{code:'ENOENT'});
});
for(const scope of [null,{}])test(`filename whole merge ignores displaced source-only directory scaffolding (${scope===null?'unfiltered':'filtered'})`,async t=>{
 const f=await fixture(t);await f.write('a','dir/x','left');await f.write('b','dir','keep');await f.write('b','other/x','right');await f.matching();const op=f.operations(),p=await op.preview('merge','a-to-b',null,scope);assert.deepEqual(p.operations.map(o=>o.targetPath),['other/x']);await op.execute(p.id);assert.equal(await f.read('b','other/x'),'left');assert.equal(await f.read('b','dir'),'keep');
});
