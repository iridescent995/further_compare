'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs');
const {FolderTree}=require('../desktop/folder-tree.cjs');
const {MappedFolderOperations}=require('../desktop/folder-mapped-operations.cjs');
async function fixture(t,names){
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-tree-spelling-')));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const service=new FolderService(path.join(base,'backup')),roots={},actual={};
 for(const [side,name] of Object.entries(names)){
  roots[side]=path.join(base,side);await fs.mkdir(roots[side]);await fs.writeFile(path.join(roots[side],name),side==='a'?'source bytes':'target bytes');
  actual[side]=(await fs.readdir(roots[side]))[0];await service.select(side,roots[side]);
 }
 return {service,roots,actual,tree:new FolderTree(service)};
}
for(const [label,names] of [['case',{a:'Readme.txt',b:'README.txt'}],['Unicode normalization',{a:'caf\u00e9.txt',b:'cafe\u0301.txt'}]])test(`exact tree preserves actual ${label} names; manual alignment copies to the real endpoint`,async t=>{
 const f=await fixture(t,names);
 if(f.actual.a===f.actual.b){t.skip('Filesystem normalizes both stored names to the same spelling.');return;}
 const initial=await f.tree.compare();
 assert.deepEqual(initial.rows.map(r=>[r.pathA,r.pathB]).sort(),[[null,f.actual.b],[f.actual.a,null]].sort());
 assert.deepEqual(new Set(initial.rows.map(r=>r.status)),new Set(['left','right']));assert.equal(f.service.hashCache.size,0);
 for(const row of initial.rows)for(const side of ['a','b']){const p=row[side==='a'?'pathA':'pathB'];if(p!==null)assert.equal((await f.tree.resolve(row.id,side,initial.revision)).path,p);}
 await assert.rejects(()=>f.tree.setAlignment([{a:f.actual.a,b:f.actual.a,kind:'file'}]),/endpoints must exist/);
 await f.tree.setAlignment([{a:f.actual.a,b:f.actual.b,kind:'file'}]);
 const paired=await f.tree.compare();assert.equal(paired.rows.length,1);assert.equal(paired.rows[0].pathB,f.actual.b);assert.equal(paired.rows[0].nameB,f.actual.b);assert.equal(paired.rows[0].status,'changed');
 const op=new MappedFolderOperations(f.service,f.tree),preview=await op.previewCopy('a',[f.actual.a]);
 assert.deepEqual(preview.operations.map(o=>[o.sourcePath,o.targetPath]),[[f.actual.a,f.actual.b]]);
 const result=await op.execute(preview.id);
 assert.equal(await fs.readFile(path.join(f.roots.b,f.actual.b),'utf8'),'source bytes');
 assert.equal(await fs.readFile(path.join(result.backupPath,'files',f.actual.b),'utf8'),'target bytes');
 assert.deepEqual(await fs.readdir(f.roots.b),[f.actual.b]);
});
test('exact matching rejects an alias returned by a filesystem even on case-sensitive hosts',async t=>{
 const f=await fixture(t,{a:'Readme.txt',b:'README.txt'}),safe=f.service.safe.bind(f.service),realpath=fs.realpath;
 // Emulate the filesystem resolving the missing left spelling to the existing
 // right file while safe retains the requested spelling, as case-insensitive OSes do.
 const alias=path.join(f.roots.b,'Readme.txt'),actual=path.join(f.roots.b,'README.txt');
 f.service.safe=async(side,relative,...args)=>side==='b'&&relative==='Readme.txt'?alias:safe(side,relative,...args);
 fs.realpath=async function(full,...args){return full===alias?actual:realpath.call(this,full,...args);};
 try{const rows=(await f.tree.list()).rows;assert.deepEqual(rows.map(r=>[r.pathA,r.pathB]).sort(),[[null,'README.txt'],['Readme.txt',null]].sort());}
 finally{fs.realpath=realpath;}
});
test('spelling change between metadata reads rejects the staged node',async t=>{
 const f=await fixture(t,{a:'same.txt',b:'same.txt'}),realpath=fs.realpath,target=path.join(f.roots.a,'same.txt');let reads=0;
 fs.realpath=async function(full,...args){if(full===target&&++reads===2)return path.join(f.roots.a,'SAME.txt');return realpath.call(this,full,...args);};
 try{await assert.rejects(()=>f.tree.list(),/changed while reading metadata/);assert.equal(reads,2);}finally{fs.realpath=realpath;}
});
test('differently cased directories expand only their actual side until explicitly aligned',async t=>{
 const f=await fixture(t,{a:'keep.txt',b:'keep.txt'});
 await fs.mkdir(path.join(f.roots.a,'Source'));await fs.mkdir(path.join(f.roots.b,'SOURCE'));
 for(const side of ['a','b'])await fs.writeFile(path.join(f.roots[side],side==='a'?'Source':'SOURCE','child.txt'),side);
 const root=await f.tree.list(),left=root.rows.find(r=>r.pathA==='Source'),right=root.rows.find(r=>r.pathB==='SOURCE');
 assert.equal(left.pathB,null);assert.equal(right.pathA,null);
 assert.deepEqual((await f.tree.compare(left.id)).rows.map(r=>[r.pathA,r.pathB]),[['Source/child.txt',null]]);
 assert.deepEqual((await f.tree.compare(right.id)).rows.map(r=>[r.pathA,r.pathB]),[[null,'SOURCE/child.txt']]);
 await f.tree.setAlignment([{a:'Source',b:'SOURCE',kind:'directory'}]);
 const directory=(await f.tree.list()).rows.find(r=>r.pathA==='Source');
 const child=(await f.tree.compare(directory.id)).rows[0];assert.equal(child.pathB,'SOURCE/child.txt');assert.equal(child.status,'changed');
});
