'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {validateIgnoredTextPatterns}=require('../src/ignored-text-rules.cjs');
const {prepareIgnoredText,createIgnoredTextPool}=require('../desktop/ignored-text-client.cjs');
const {compare,merge}=require('../src/diff.cjs');
const {FolderService}=require('../desktop/folders.cjs');
const {FolderTree}=require('../desktop/folder-tree.cjs');
const {classifySnapshotEntries}=require('../desktop/folder-snapshot-comparison.cjs');
const {previewFilteredCopyToFolder}=require('../desktop/folder-filtered-copy-destination.cjs');
const patterns=[{pattern:'#[0-9]+'}];
test('pattern validation canonicalizes and freezes structural rules without compiling',()=>{
 const rules=validateIgnoredTextPatterns(patterns);assert.deepEqual(rules,[{pattern:'#[0-9]+',matchCase:true}]);assert.ok(Object.isFrozen(rules[0]));assert.doesNotThrow(()=>validateIgnoredTextPatterns([{pattern:'['}]));
 for(const value of [null,Array(17).fill(patterns[0]),[{pattern:''}],[{pattern:'x'.repeat(257)}],[{pattern:'x',matchCase:1}],[{pattern:'x',flags:'g'}]])assert.throws(()=>validateIgnoredTextPatterns(value));
});
test('prepared keys retain raw positions and source bytes through compare and merge',async()=>{
 const a='a #123\nleft\n',b='a #456\nright\n',keys=await prepareIgnoredText([a,b],patterns),r=compare(a,b,false,[],false,'horizontal',false,{a:keys[0],b:keys[1]});
 assert.equal(r.rows[0].minor,true);assert.equal(r.rows[0].a,'a #123');assert.equal(r.hunks.length,1);assert.equal(merge(a,b,r.hunks[0],'a'),'a #456\nleft\n');
 assert.throws(()=>compare(a,b,false,[],false,'horizontal',false,{a:[],b:keys[1]}),/positions/);
});
test('pattern-empty significant lines stay distinct from absent lines and original blank suppression',async()=>{
 const a='#123\n\n',b='',keys=await prepareIgnoredText([a,b],[{pattern:'.+'}]);
 assert.ok(compare(a,b,false,[],false,'all',true,{a:keys[0],b:keys[1]}).hunks.length);
 await assert.rejects(()=>prepareIgnoredText(['x\ry'],patterns),/limits/);
});
async function fixture(t,left='a #123\n\nb\n',right='a #456\nb\n'){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-ignored-text-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const service=new FolderService(path.join(root,'backups'));
 for(const side of ['a','b']){const dir=path.join(root,side);await fs.mkdir(path.join(dir,'closed'),{recursive:true});await fs.writeFile(path.join(dir,'closed/x'),side==='a'?left:right);await service.select(side,dir);}return {root,service};
}
test('folder rules preserve original blank masking, isolate cache and reject stale provenance',async t=>{
 const {service}=await fixture(t),pairs=[{a:'closed/x',b:'closed/x'}],rules={mode:'text-content',ignoreBlankLines:true,ignoredTextPatterns:patterns};
 assert.equal((await service.compareFilePairs(pairs,rules)).rows[0].status,'equal');assert.equal((await service.compareFilePairs(pairs,{...rules,ignoredTextPatterns:[]})).rows[0].status,'changed');
 const a=(await service.snapshot('a',null,rules)).entries.get('closed/x'),b=(await service.snapshot('b',null,rules)).entries.get('closed/x');assert.equal(classifySnapshotEntries(a,b,rules).status,'equal');assert.throws(()=>classifySnapshotEntries(a,b,{...rules,ignoredTextPatterns:[{pattern:'a'}]}),/ignored-text rules changed/);
});
test('folder pattern-stripped line never collides with empty file',async t=>{
 const {service}=await fixture(t,'#123','');for(const ignoreBlankLines of [false,true])assert.equal((await service.compareFilePairs([{a:'closed/x',b:'closed/x'}],{mode:'text-content',ignoreBlankLines,ignoredTextPatterns:patterns})).rows[0].status,'changed');
});
test('unopened filtered copy applies patterns but preserves exact source bytes',async t=>{
 const {root,service}=await fixture(t),tree=new FolderTree(service);await tree.list('root');const out=path.join(root,'out');await fs.mkdir(out);
 const result=await previewFilteredCopyToFolder(service,tree,'a',['closed'],{status:'same',rules:{mode:'text-content',ignoreBlankLines:true,ignoredTextPatterns:patterns}},async()=>out);await result.service.execute(result.preview.id);assert.equal(await fs.readFile(path.join(out,'closed/x'),'utf8'),'a #123\n\nb\n');
});
test('invalid worker pattern errors do not silently fall back to raw comparison',async t=>{
 const {service}=await fixture(t);await assert.rejects(()=>service.compareFilePairs([{a:'closed/x',b:'closed/x'}],{mode:'text-content',ignoredTextPatterns:[{pattern:'['}]}),/Invalid ignored-text/);
});
test('pool queue rejects overload and closes active plus pending jobs',async()=>{
 const pool=createIgnoredTextPool({maxQueue:1}),jobs=[];for(let i=0;i<3;i++)jobs.push(pool.prepare(['a'.repeat(50000)+'!'],[{pattern:'(a+)+$'}]).catch(error=>error));
 await assert.rejects(()=>pool.prepare(['normal'],patterns),/Too many pending/);await pool.close();assert.ok((await Promise.all(jobs)).every(result=>result instanceof Error));
});
