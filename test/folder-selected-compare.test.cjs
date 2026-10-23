'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs'),{FolderTree}=require('../desktop/folder-tree.cjs');
async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'fc-selected-compare-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));const roots={a:path.join(base,'a'),b:path.join(base,'b')};for(const root of Object.values(roots))await fs.mkdir(root);
 const write=async(s,p,data)=>{await fs.mkdir(path.dirname(path.join(roots[s],p)),{recursive:true});await fs.writeFile(path.join(roots[s],p),data);};
 for(const s of ['a','b']){await write(s,'one.txt','same');await write(s,'sibling.txt',s);await write(s,'nested/two.txt',s);}
 await write('a','only.txt','alone');const service=new FolderService(path.join(base,'backup'));for(const s of ['a','b'])await service.select(s,roots[s]);const tree=new FolderTree(service),listed=await tree.list();
 return {roots,write,service,tree,listed,id:p=>listed.rows.find(r=>r.pathA===p||r.pathB===p).id};
}
test('selected comparison hashes only requested paired files, retains siblings and supports one-sided rows',async t=>{
 const f=await fixture(t),calls=[],original=f.service.compareFilePairs.bind(f.service);f.service.compareFilePairs=async(pairs,rules)=>{calls.push(pairs);return original(pairs,rules);};
 const result=await f.tree.compareSelected([f.id('one.txt'),f.id('only.txt')],f.tree.revision);assert.deepEqual(calls,[[{a:'one.txt',b:'one.txt'}]]);assert.deepEqual(result.rows.map(r=>r.status),['equal','left']);assert.deepEqual(result.rows.map(r=>r.id),[f.id('one.txt'),f.id('only.txt')]);assert.deepEqual(result.removedIds,[]);assert.equal((await f.tree.resolveRow(f.id('sibling.txt'),f.tree.revision)).status,'unchecked');
 calls.length=0;await f.tree.compareSelected([f.id('only.txt')],f.tree.revision);assert.equal(calls.length,0);
});
test('ordinary edits refresh selected metadata and obey normalized text and timestamp rules',async t=>{
 const f=await fixture(t),before=f.listed.rows.find(r=>r.id===f.id('one.txt'));await f.write('a','one.txt','A B\n');await f.write('b','one.txt','ab\n');
 const text=await f.tree.compareSelected([f.id('one.txt')],f.tree.revision,{mode:'text-whitespace-case'});assert.equal(text.rows[0].status,'equal');assert.equal(text.rows[0].comparison,'text-normalized');assert.equal(text.rows[0].sizeA,4);assert.notEqual(text.rows[0].versionA,before.versionA);assert.equal(text.rules.mode,'text-whitespace-case');
 await fs.utimes(path.join(f.roots.a,'one.txt'),100,100);await fs.utimes(path.join(f.roots.b,'one.txt'),101,101);const modified=await f.tree.compareSelected([f.id('one.txt')],f.tree.revision,{mode:'modified',timeToleranceMs:1500});assert.equal(modified.rows[0].status,'equal');assert.equal(modified.rows[0].mtimeA,100000);
});
test('multiple parent nodes and actual aligned filenames retain opaque row identities',async t=>{
 const f=await fixture(t);await f.write('b','renamed.txt','same');await f.tree.setAlignment([{a:'one.txt',b:'renamed.txt',kind:'file'}]);const root=await f.tree.list(),one=root.rows.find(r=>r.pathA==='one.txt'),nested=root.rows.find(r=>r.pathA==='nested'),children=await f.tree.list(nested.id),two=children.rows.find(r=>r.pathA==='nested/two.txt');
 const calls=[],original=f.service.compareFilePairs.bind(f.service);f.service.compareFilePairs=async(pairs,rules)=>{calls.push(pairs);return original(pairs,rules);};const result=await f.tree.compareSelected([one.id,two.id],f.tree.revision);assert.deepEqual(calls[0],[{a:'one.txt',b:'renamed.txt'},{a:'nested/two.txt',b:'nested/two.txt'}]);assert.deepEqual(result.rows.map(r=>r.id),[one.id,two.id]);assert.equal(result.rows[0].status,'equal');assert.equal(result.rows[1].status,'changed');await f.tree.resolveRow(nested.id,f.tree.revision);
});
test('invalid selections, stale revision, directories and file/folder conflicts reject without comparison',async t=>{
 const f=await fixture(t);let calls=0;f.service.compareFilePairs=async()=>{calls++;throw Error('unexpected comparison');};
 for(const ids of [[],[f.id('one.txt'),f.id('one.txt')],['bad'],['f'.repeat(64)],[f.id('nested')]])await assert.rejects(()=>f.tree.compareSelected(ids,f.tree.revision));await assert.rejects(()=>f.tree.compareSelected([f.id('one.txt')],'stale'));
 await fs.mkdir(path.join(f.roots.b,'only.txt'));const listed=await f.tree.list();await assert.rejects(()=>f.tree.compareSelected([listed.rows.find(r=>r.pathA==='only.txt').id],f.tree.revision));assert.equal(calls,0);
});
test('replacement, new counterpart and content mutation during compare cannot publish stale rows',async t=>{
 for(const kind of ['replacement','counterpart','during']){const f=await fixture(t);
 if(kind==='replacement'){await fs.rename(path.join(f.roots.a,'one.txt'),path.join(f.roots.a,'old.txt'));await f.write('a','one.txt','same');await assert.rejects(()=>f.tree.compareSelected([f.id('one.txt')],f.tree.revision),/changed/);}
 if(kind==='counterpart'){await f.write('b','only.txt','new');await assert.rejects(()=>f.tree.compareSelected([f.id('only.txt')],f.tree.revision),/changed/);}
 if(kind==='during'){const original=f.service.compareFilePairs.bind(f.service);f.service.compareFilePairs=async(pairs,rules)=>{const result=await original(pairs,rules);await f.write('a','one.txt','edited later');return result;};await assert.rejects(()=>f.tree.compareSelected([f.id('one.txt')],f.tree.revision),/changed/);}
 }
});
test('newer node request and refresh invalidate in-flight selected results',async t=>{
 for(const action of ['list','refresh']){const f=await fixture(t);let release,started;const gate=new Promise(r=>release=r),began=new Promise(r=>started=r),original=f.service.compareFilePairs.bind(f.service);f.service.compareFilePairs=async(pairs,rules)=>{const result=await original(pairs,rules);started();await gate;return result;};const pending=f.tree.compareSelected([f.id('one.txt')],f.tree.revision);await began;await f.tree[action]();release();await assert.rejects(()=>pending,/changed|replaced/);}
});
test('alignment changes, root replacement and active write locks reject selected comparison',async t=>{
 const f=await fixture(t);let release,started;const gate=new Promise(r=>release=r),began=new Promise(r=>started=r),original=f.service.compareFilePairs.bind(f.service);f.service.compareFilePairs=async(pairs,rules)=>{const result=await original(pairs,rules);started();await gate;return result;};const pending=f.tree.compareSelected([f.id('one.txt')],f.tree.revision);await began;await f.tree.setAlignment([]);release();await assert.rejects(()=>pending,/changed/);
 const g=await fixture(t);await fs.rename(g.roots.a,g.roots.a+'-old');await fs.mkdir(g.roots.a);await assert.rejects(()=>g.tree.compareSelected([g.id('one.txt')],g.tree.revision),/root changed/);
 const h=await fixture(t);await h.tree.withOperation(h.tree.revision,async()=>{await assert.rejects(()=>h.tree.compareSelected([h.id('one.txt')],h.tree.revision),/current folder operation/);});
});
