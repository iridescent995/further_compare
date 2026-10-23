'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs');
const {FolderTree}=require('../desktop/folder-tree.cjs');
const {classifySnapshotEntries}=require('../desktop/folder-snapshot-comparison.cjs');
const {previewFilteredCopyToFolder}=require('../desktop/folder-filtered-copy-destination.cjs');
const {prepareTextComparison}=require('../desktop/ignored-text-client.cjs');
const {resolveTextProfile}=require('../src/text-profile.cjs');
const {prepareComparisonKeys,comparisonPair}=require('../src/text-comparison-keys.cjs');
const {compare}=require('../src/diff.cjs');
const rules={mode:'text-content',textProfile:'auto'};
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-auto-folders-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const service=new FolderService(path.join(root,'backups'));
 const cases=[['A.java','// changed\nclass A {}\n','class A {}\n'],['B.xml','<!-- changed -->\n<x/>\n','<x/>\n'],['C.sql','-- changed\nselect 1;\n','select 1;\n'],['D.txt','// changed\nx\n','x\n']];
 for(const side of ['a','b']){const dir=path.join(root,side);await fs.mkdir(path.join(dir,'closed'),{recursive:true});for(const [name,a,b] of cases)await fs.writeFile(path.join(dir,'closed',name),side==='a'?a:b);await service.select(side,dir);}
 return {root,service,cases};
}
test('auto profiles resolve independently within mixed folders, match text engine, and remain byte-exact in content mode',async t=>{
 const {service,cases}=await fixture(t),pairs=cases.map(([name])=>({a:`closed/${name}`,b:`closed/${name}`}));
 for(let run=0;run<2;run++){
  const rows=(await service.compareFilePairs(pairs,rules)).rows;
  for(let i=0;i<cases.length;i++){const [name,a,b]=cases[i],profile=resolveTextProfile('auto',[name,name]),prepared=prepareComparisonKeys([a,b],[],profile),expected=compare(a,b,false,[],false,'horizontal',false,comparisonPair(prepared)).hunks.length===0;assert.equal(rows[i].status,expected?'equal':'changed');}
  assert.deepEqual((await service.compareFilePairs(pairs,{mode:'text-content'})).rows.map(r=>r.status),['changed','changed','changed','changed']);
 }
 assert.deepEqual((await service.compareFilePairs(pairs,{mode:'content',textProfile:'auto'})).rows.map(r=>r.status),['changed','changed','changed','changed']);
});
test('manual unlike-extension pairs use plain fallback in providers and independently captured snapshots',async t=>{
 const {service,root}=await fixture(t);await fs.writeFile(path.join(root,'b/closed/A.txt'),'class A {}\n');await fs.writeFile(path.join(root,'b/closed/Other.JAVA'),'class A {}\n');
 for(const [right,expected] of [['A.txt','changed'],['Other.JAVA','equal'],['A.java','equal'],['A.txt','changed']]){
  assert.equal((await service.compareFilePairs([{a:'closed/A.java',b:`closed/${right}`}],rules)).rows[0].status,expected);
  const a=(await service.snapshot('a',null,rules)).entries.get('closed/A.java'),b=(await service.snapshot('b',null,rules)).entries.get(`closed/${right}`);
  assert.equal(classifySnapshotEntries(a,b,rules,{a:'closed/A.java',b:`closed/${right}`}).status,expected);
 }
});
test('automatic snapshots reject missing or stale path/profile/version/fallback provenance',async t=>{
 const {service}=await fixture(t),a=(await service.snapshot('a',null,rules)).entries.get('closed/A.java'),b=(await service.snapshot('b',null,rules)).entries.get('closed/A.java'),paths={a:'closed/A.java',b:'closed/A.java'};
 assert.equal(classifySnapshotEntries(a,b,rules,paths).status,'equal');assert.throws(()=>classifySnapshotEntries(a,b,rules),/endpoint paths/);
 for(const patch of [{normalizationProfilePath:'other/A.java'},{normalizationResolvedProfile:'plain'},{normalizationProfileVersion:0},{plainNormalizedHash:undefined},{plainNormalizedHash:null}])assert.throws(()=>classifySnapshotEntries({...a,...patch},b,rules,paths),/provenance|Incomplete/);
 assert.throws(()=>classifySnapshotEntries(a,b,rules,{a:'closed/A.txt',b:paths.b}),/provenance/);
 assert.throws(()=>classifySnapshotEntries(a,b,{...rules,textProfile:'java'},paths),/profile changed/);
});
test('auto same-filter copies unopened mixed descendants with exact original bytes',async t=>{
 const {service,root,cases}=await fixture(t),tree=new FolderTree(service);await tree.list('root');const out=path.join(root,'out');await fs.mkdir(out);
 const preview=await previewFilteredCopyToFolder(service,tree,'a',['closed'],{status:'same',rules},async()=>out);await preview.service.execute(preview.preview.id);
 for(const [name,a] of cases.slice(0,3))assert.equal(await fs.readFile(path.join(out,'closed',name),'utf8'),a);
 await assert.rejects(fs.stat(path.join(out,'closed/D.txt')),e=>e.code==='ENOENT');
});
test('native normalization refuses unresolved auto before dispatch',async()=>{await assert.rejects(prepareTextComparison(['// comment'],[],'auto'),/Resolve the automatic/);});
test('auto profile cache cannot reuse normalization after endpoint extension changes',async t=>{
 const {service,root}=await fixture(t),client=require('../desktop/ignored-text-client.cjs'),original=client.prepareTextComparison;let calls=0;
 client.prepareTextComparison=async(...args)=>{calls++;assert.notEqual(args[2],'auto');return original(...args);};t.after(()=>{client.prepareTextComparison=original;});
 const pair=[{a:'closed/A.java',b:'closed/A.java'}];await service.compareFilePairs(pair,rules);const first=calls;assert.ok(first>=2);
 await service.compareFilePairs(pair,rules);assert.equal(calls,first);
 await fs.rename(path.join(root,'b/closed/A.java'),path.join(root,'b/closed/A.txt'));
 assert.equal((await service.compareFilePairs([{a:'closed/A.java',b:'closed/A.txt'}],rules)).rows[0].status,'changed');
 await fs.rename(path.join(root,'b/closed/A.txt'),path.join(root,'b/closed/A.java'));
 assert.equal((await service.compareFilePairs(pair,rules)).rows[0].status,'equal');
});
test('file mutation during auto normalization fails provider and snapshot reads without publishing comparison',async t=>{
 const {service,root}=await fixture(t),client=require('../desktop/ignored-text-client.cjs'),original=client.prepareTextComparison;let target=null;
 client.prepareTextComparison=async(...args)=>{const result=await original(...args);if(target){const file=target;target=null;await fs.writeFile(file,'different bytes\n');}return result;};t.after(()=>{client.prepareTextComparison=original;});
 target=path.join(root,'a/closed/A.java');await assert.rejects(service.compareFilePairs([{a:'closed/A.java',b:'closed/A.java'}],rules),/changed/);assert.equal(service.hashCache.size,0);
 await fs.writeFile(path.join(root,'a/closed/A.java'),'// first\nclass A {}\n');target=path.join(root,'a/closed/A.java');await assert.rejects(service.snapshot('a',null,rules),/changed/);
});
