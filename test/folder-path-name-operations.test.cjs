'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs');
const {FolderTree}=require('../desktop/folder-tree.cjs');
const {buildPathNameMatching}=require('../desktop/folder-name-matching.cjs');
const {MappedFolderOperations}=require('../desktop/folder-mapped-operations.cjs');
const {UpdateBothOperations}=require('../desktop/folder-update-both.cjs');
const {previewFilteredDelete}=require('../desktop/folder-filtered-delete.cjs');
const {previewFilteredMove}=require('../desktop/folder-filtered-move.cjs');
const {previewFilteredCopyToFolder}=require('../desktop/folder-filtered-copy-destination.cjs');
async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'fc-path-ops-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const roots={a:path.join(base,'a'),b:path.join(base,'b')};for(const root of Object.values(roots))await fs.mkdir(root);
 const write=async(side,relative,text)=>{const full=path.join(roots[side],relative);await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,text);};
 await write('a','Folder/Child/FILE.txt','left');await write('b','folder/child/file.txt','right');
 const service=new FolderService(path.join(base,'backups'));for(const side of ['a','b'])await service.select(side,roots[side]);
 // Intentionally no descendants in the display model: operation discovery must
 // produce identical destinations regardless of which nodes have been opened.
 const model=buildPathNameMatching({a:{entries:new Map([['Folder',{kind:'directory'}]])},b:{entries:new Map([['folder',{kind:'directory'}]])}},undefined,{ignoreCase:true});
 class Tree extends FolderTree{get alignment(){return model;}}
 const tree=new Tree(service);await tree.list('root');return {base,roots,service,tree,write};
}
for(const side of ['a','b'])test('selected automatic copy discovers closed descendants and retains backup spelling '+side,async t=>{
 const {roots,service,tree}=await fixture(t),ops=new MappedFolderOperations(service,tree),source=side==='a'?'Folder':'folder',target=side==='a'?'folder/child/file.txt':'Folder/Child/FILE.txt',other=side==='a'?'b':'a';
 const plan=await ops.previewCopy(side,[source]);assert.deepEqual(plan.operations.filter(o=>o.action==='copy').map(o=>[o.sourcePath,o.targetPath]),[[side==='a'?'Folder/Child/FILE.txt':'folder/child/file.txt',target]]);
 const result=await ops.execute(plan.id);assert.equal(await fs.readFile(path.join(roots[other],target),'utf8'),side==='a'?'left':'right');assert.equal(await fs.readFile(path.join(result.backupPath,'files',target),'utf8'),side==='a'?'right':'left');
});
test('new namespace after preview invalidates selected copy before mutation',async t=>{
 const {roots,service,tree,write}=await fixture(t),ops=new MappedFolderOperations(service,tree),plan=await ops.previewCopy('a',['Folder']);
 await write('b','extra.txt','new namespace');await assert.rejects(()=>ops.execute(plan.id),/changed after preview|namespace changed/);assert.equal(await fs.readFile(path.join(roots.b,'folder/child/file.txt'),'utf8'),'right');
});
test('filtered deletion classifies actual closed-node counterparts',async t=>{
 const {roots,service,tree,write}=await fixture(t);await write('b','folder/child/file.txt','left');
 const result=await previewFilteredDelete(service,tree,'a',['Folder'],{status:'same'});assert.ok(result.preview.operations.some(o=>o.path==='Folder/Child/FILE.txt'));await result.service.execute(result.preview.id);await assert.rejects(()=>fs.stat(path.join(roots.a,'Folder/Child/FILE.txt')),{code:'ENOENT'});
});
test('filtered copy to third folder classifies actual counterparts',async t=>{
 const {base,service,tree,write}=await fixture(t);await write('b','folder/child/file.txt','left');const out=path.join(base,'out');await fs.mkdir(out);
 const result=await previewFilteredCopyToFolder(service,tree,'a',['Folder'],{status:'same'},async()=>out);await result.service.execute(result.preview.id);assert.equal(await fs.readFile(path.join(out,'Folder/Child/FILE.txt'),'utf8'),'left');
});
for(const filtered of [false,true])test('move discovers real nested target names '+filtered,async t=>{
 const {roots,service,tree}=await fixture(t);let preview,execute;
 if(filtered){const result=await previewFilteredMove(service,tree,'a',['Folder'],{});preview=result.preview;execute=id=>result.service.execute(id);}else{const ops=new MappedFolderOperations(service,tree);preview=await ops.previewMove('a',['Folder']);execute=id=>ops.execute(id);}
 assert.ok(preview.operations.some(o=>o.sourcePath==='Folder/Child/FILE.txt'&&o.targetPath==='folder/child/file.txt'));await execute(preview.id);assert.equal(await fs.readFile(path.join(roots.b,'folder/child/file.txt'),'utf8'),'left');await assert.rejects(()=>fs.stat(path.join(roots.a,'Folder/Child/FILE.txt')),{code:'ENOENT'});
});
test('update both derives closed-node mappings from full snapshots',async t=>{
 const {roots,service,tree}=await fixture(t);await fs.utimes(path.join(roots.a,'Folder/Child/FILE.txt'),2000000000,2000000000);await fs.utimes(path.join(roots.b,'folder/child/file.txt'),1000000000,1000000000);
 const ops=new UpdateBothOperations(service,tree),plan=await ops.preview();assert.ok(plan.operations.some(o=>o.sourcePath==='Folder/Child/FILE.txt'&&o.targetPath==='folder/child/file.txt'));await ops.execute(plan.id);assert.equal(await fs.readFile(path.join(roots.b,'folder/child/file.txt'),'utf8'),'left');
});
for(const side of ['a','b'])test('whole-folder sync projects closed descendants '+side,async t=>{
 const {roots,service,tree}=await fixture(t),ops=new MappedFolderOperations(service,tree),other=side==='a'?'b':'a';
 const plan=await ops.preview('sync',side==='a'?'a-to-b':'b-to-a');assert.equal(plan.operations.filter(o=>o.action==='copy').length,1);assert.equal(plan.operations.filter(o=>o.action.startsWith('delete')).length,0);
 await ops.execute(plan.id);assert.equal(await fs.readFile(path.join(roots[other],side==='a'?'folder/child/file.txt':'Folder/Child/FILE.txt'),'utf8'),side==='a'?'left':'right');
});
for(const kind of ['delete','move','copyTo'])test('namespace additions invalidate filtered '+kind,async t=>{
 const {base,roots,service,tree,write}=await fixture(t);let result;
 if(kind==='delete')result=await previewFilteredDelete(service,tree,'a',['Folder'],{});
 if(kind==='move')result=await previewFilteredMove(service,tree,'a',['Folder'],{});
 if(kind==='copyTo'){const out=path.join(base,'out');await fs.mkdir(out);result=await previewFilteredCopyToFolder(service,tree,'a',['Folder'],{},async()=>out);}
 await write('b','extra.txt','external namespace');await assert.rejects(()=>result.service.execute(result.preview.id),/changed after preview|namespace changed/);assert.equal(await fs.readFile(path.join(roots.a,'Folder/Child/FILE.txt'),'utf8'),'left');
});
test('selected automatic copy reads content only within selected counterpart scope',async t=>{
 const {service,tree,write}=await fixture(t);await write('a','Unrelated/huge.bin','do not hash');await write('b','Unrelated/huge.bin','do not hash either');
 const snapshot=service.snapshot.bind(service),calls=[];service.snapshot=async(side,paths,...rest)=>{calls.push({side,paths});assert.ok(paths!==null);assert.ok(paths.every(p=>!p.startsWith('Unrelated')));return snapshot(side,paths,...rest);};
 const ops=new MappedFolderOperations(service,tree);await ops.previewCopy('a',['Folder']);assert.ok(calls.some(c=>c.side==='b'&&c.paths.includes('folder/child/file.txt')));
});
test('normalization-only automatic copy preserves actual decomposed target spellings',async t=>{
 const {service,roots}=await fixture(t);await fs.rm(path.join(roots.a,'Folder'),{recursive:true});await fs.rm(path.join(roots.b,'folder'),{recursive:true});
 const left='caf\u00e9.txt',right='cafe\u0301.txt';await fs.writeFile(path.join(roots.a,left),'left unicode');await fs.writeFile(path.join(roots.b,right),'right unicode');
 const actualA=(await fs.readdir(roots.a))[0],actualB=(await fs.readdir(roots.b))[0];
 const model=buildPathNameMatching({a:{entries:new Map()},b:{entries:new Map()}},undefined,{normalizeUnicode:true});class Tree extends FolderTree{get alignment(){return model;}}const tree=new Tree(service);await tree.list('root');
 const ops=new MappedFolderOperations(service,tree),preview=await ops.previewCopy('a',[actualA]);assert.deepEqual(preview.operations.map(o=>[o.sourcePath,o.targetPath]),[[actualA,actualB]]);await ops.execute(preview.id);assert.equal(await fs.readFile(path.join(roots.b,actualB),'utf8'),'left unicode');
});
test('explicit manual mapping reserves endpoint ahead of automatic case pairing',async t=>{
 const {service,roots,write}=await fixture(t);await write('b','manual-target.txt','reserved target');
 const {FolderAlignment}=require('../desktop/folder-alignment.cjs');const model=buildPathNameMatching({a:{entries:new Map()},b:{entries:new Map()}},new FolderAlignment([{a:'Folder/Child/FILE.txt',b:'manual-target.txt',kind:'file'}]),{ignoreCase:true});
 class Tree extends FolderTree{get alignment(){return model;}}const tree=new Tree(service);await tree.list('root');const ops=new MappedFolderOperations(service,tree),plan=await ops.previewCopy('a',['Folder/Child/FILE.txt']);assert.deepEqual(plan.operations.map(o=>o.targetPath),['manual-target.txt']);await ops.execute(plan.id);assert.equal(await fs.readFile(path.join(roots.b,'manual-target.txt'),'utf8'),'left');assert.equal(await fs.readFile(path.join(roots.b,'folder/child/file.txt'),'utf8'),'right');
});
test('automatic type conflict stays a conflict rather than becoming an implicit overwrite',async t=>{
 const {service,roots}=await fixture(t);await fs.rm(path.join(roots.b,'folder/child/file.txt'));await fs.mkdir(path.join(roots.b,'folder/child/file.txt'));
 // Use the original roots and matching tree, with matching actual child names.
 const model=buildPathNameMatching({a:{entries:new Map()},b:{entries:new Map()}},undefined,{ignoreCase:true});class Tree extends FolderTree{get alignment(){return model;}}const tree=new Tree(service);await tree.list('root');
 await assert.rejects(()=>new MappedFolderOperations(service,tree).previewCopy('a',['Folder']),/conflict/);assert.ok((await fs.stat(path.join(roots.b,'folder/child/file.txt'))).isDirectory());
});
test('published automatic policy cannot mutate matching or snapshot rebuilds without a revision',async t=>{
 const pair={a:{entries:new Map([['UPPER.txt',{kind:'file'}]])},b:{entries:new Map([['upper.txt',{kind:'file'}]])}},model=buildPathNameMatching(pair,undefined,{ignoreCase:true});
 const revision=model.revision;assert.throws(()=>{model.nameRules.ignoreCase=false;},TypeError);assert.throws(()=>{model.options.normalizeUnicode=true;},TypeError);
 assert.equal(model.revision,revision);assert.equal(model.counterpart('a','UPPER.txt'),'upper.txt');assert.equal(model.forSnapshots(pair).counterpart('a','UPPER.txt'),'upper.txt');assert.equal(model.swap().counterpart('a','upper.txt'),'UPPER.txt');
 const {service}=await fixture(t),tree=new FolderTree(service,undefined,{ignoreCase:true}),token=tree.revision;assert.throws(()=>{tree.nameRules.ignoreCase=false;},TypeError);assert.equal(tree.revision,token);assert.equal(tree.nameRules.ignoreCase,true);
});
