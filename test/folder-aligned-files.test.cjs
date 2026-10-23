'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-aligned-files-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const a=path.join(root,'a'),b=path.join(root,'b');await fs.mkdir(a);await fs.mkdir(b);await fs.mkdir(path.join(a,'old'));await fs.mkdir(path.join(b,'new'));
 const service=new FolderService(path.join(root,'backups'));await service.select('a',a);await service.select('b',b);
 await fs.writeFile(path.join(a,'old','left.txt'),'same');await fs.writeFile(path.join(b,'new','right.txt'),'same');
 // Same-name decoys must never be read in place of the explicit endpoint.
 await fs.mkdir(path.join(b,'old'));await fs.writeFile(path.join(b,'old','left.txt'),'wrong');
 return {a,b,service};
}
test('explicit file endpoints compare different names and parents without changing sources',async t=>{
 const {a,b,service}=await fixture(t),pairs=[{a:'old/left.txt',b:'new/right.txt'}];
 const result=await service.compareFilePairs(pairs);assert.equal(result.rows[0].status,'equal');assert.equal(result.rows[0].comparison,'content');
 assert.equal(result.rows[0].pathA,pairs[0].a);assert.equal(result.rows[0].pathB,pairs[0].b);assert.equal(result.rows[0].nameA,'left.txt');assert.equal(result.rows[0].nameB,'right.txt');
 await fs.writeFile(path.join(b,'new','right.txt'),'edit');const changed=await service.compareFilePairs(pairs);assert.equal(changed.rows[0].status,'changed');assert.equal(changed.rows[0].id,result.rows[0].id);
 assert.equal(await fs.readFile(path.join(a,'old','left.txt'),'utf8'),'same');assert.equal(await fs.readFile(path.join(b,'old','left.txt'),'utf8'),'wrong');
});
test('explicit endpoints preserve comparison rule provenance and one-sided absence',async t=>{
 const {b,service}=await fixture(t),pair={a:'old/left.txt',b:'new/right.txt'};
 await fs.writeFile(path.join(b,'new','right.txt'),'SAME');
 assert.equal((await service.compareFilePairs([pair])).rows[0].status,'changed');
 const text=(await service.compareFilePairs([pair],{mode:'text-case'})).rows[0];assert.equal(text.status,'equal');assert.equal(text.comparison,'text-normalized');
 const metadata=(await service.compareFilePairs([pair],{mode:'size'})).rows[0];assert.equal(metadata.status,'equal');assert.equal(metadata.comparison,'metadata');
 const missing=await service.compareFilePairs([{a:'old/left.txt',b:null},{a:null,b:'new/right.txt'}]);assert.deepEqual(missing.rows.map(row=>row.status),['left','right']);assert.equal(missing.rows[0].pathB,null);assert.equal(missing.rows[1].pathA,null);
});
test('explicit endpoint input refuses ambiguity, traversal, directories and symlinks',async t=>{
 const {b,service}=await fixture(t),pair={a:'old/left.txt',b:'new/right.txt'};
 for(const pairs of [null,[{}],[{a:null,b:null}],[{...pair,extra:'ignored'}],[pair,pair],[{a:'../outside',b:pair.b}],[{a:'old',b:pair.b}],[{a:'old/left.txt',b:'/outside'}]])await assert.rejects(()=>service.compareFilePairs(pairs));
 await fs.symlink(path.join(b,'new','right.txt'),path.join(b,'alias.txt'));await assert.rejects(()=>service.compareFilePairs([{a:pair.a,b:'alias.txt'}]),/symbolic|symlink/i);
 await assert.rejects(()=>service.compareFilePairs([pair],{mode:'invalid'}));
 assert.equal((await service.compareNode('old')).rows[0].status,'changed');
});
test('paired directories list immediate children with actual side paths and no hashes',async t=>{
 const {a,b,service}=await fixture(t);
 await fs.writeFile(path.join(a,'old','shared.txt'),'same');await fs.writeFile(path.join(b,'new','shared.txt'),'same');
 await fs.mkdir(path.join(a,'old','nested'));await fs.writeFile(path.join(a,'old','nested','unopened.txt'),'untouched');
 const listed=await service.listDirectoryPair({a:'old',b:'new'}),shared=listed.rows.find(row=>row.name==='shared.txt');
 assert.equal(shared.pathA,'old/shared.txt');assert.equal(shared.pathB,'new/shared.txt');assert.equal(shared.path,undefined);
 assert.equal(listed.rows.find(row=>row.name==='left.txt').pathB,null);assert.equal(listed.rows.find(row=>row.name==='right.txt').pathA,null);
 assert.equal(service.hashCache.size,0);assert.ok(!listed.rows.some(row=>row.name==='unopened.txt'));
 const compared=await service.compareFilePairs([{a:shared.pathA,b:shared.pathB}]);assert.equal(compared.rows[0].status,'equal');
 const nested=await service.listDirectoryPair({a:'old/nested',b:null});assert.equal(nested.rows[0].pathA,'old/nested/unopened.txt');assert.equal(nested.rows[0].status,'left');
 for(const nodes of [{a:null,b:null},{a:'../escape',b:''},{a:'old/left.txt',b:'new'},{a:'old'},{a:'old',b:'new',extra:true}])await assert.rejects(()=>service.listDirectoryPair(nodes));
});
test('paired directory listing rejects replacement during the listing',async t=>{
 const {b,service}=await fixture(t),enumerate=service.enumerateDirectory.bind(service),folder=await fs.realpath(path.join(b,'new'));let replaced=false;
 service.enumerateDirectory=async function*(side,relative){for await(const entry of enumerate(side,relative)){yield entry;}if(side==='b'&&relative==='new'&&!replaced){replaced=true;await fs.rename(folder,path.join(b,'previous'));await fs.mkdir(folder);await fs.writeFile(path.join(folder,'right.txt'),'fake');}};
 await assert.rejects(()=>service.listDirectoryPair({a:'old',b:'new'}),/directory changed|entry changed/);
 assert.equal(replaced,true);
});
