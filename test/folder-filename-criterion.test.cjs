'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs'),{FolderTree}=require('../desktop/folder-tree.cjs');
const {validateFolderRules}=require('../desktop/folder-rules.cjs'),{classifySnapshotEntries}=require('../desktop/folder-snapshot-comparison.cjs');
const {assertMetadataPlatform}=require('../desktop/folder-metadata-comparison.cjs');
const {buildOperationInventory}=require('../desktop/folder-operation-inventory.cjs');
const {buildPathNameMatching}=require('../desktop/folder-name-matching.cjs');
const {previewFilteredDelete}=require('../desktop/folder-filtered-delete.cjs');
const entry={kind:'file',size:0,hash:'a'.repeat(64)};
test('filename criterion is boolean, default off, and supported on Windows',()=>{
 assert.equal(validateFolderRules({compareFilename:true}).compareFilename,true);assert.equal(validateFolderRules({compareFilename:false}).compareFilename,undefined);
 for(const value of [1,'yes',null,[]])assert.throws(()=>validateFolderRules({compareFilename:value}),/boolean/);
 assert.doesNotThrow(()=>assertMetadataPlatform({compareFilename:true},'win32'));
 assert.throws(()=>assertMetadataPlatform({compareFilename:true,compareOwner:true},'win32'),/not supported/);
});
test('snapshot filename criterion requires actual paths, compares only raw basenames and retains content provenance',()=>{
 const rules={compareFilename:true};assert.throws(()=>classifySnapshotEntries(entry,entry,rules),/endpoint paths/);
 for(const [a,b]of [['FILE.txt','file.txt'],['caf\u00e9.txt','cafe\u0301.txt'],['a.txt','a.log']]){
 const result=classifySnapshotEntries(entry,entry,rules,{a,b});assert.equal(result.status,'changed');assert.equal(result.contentStatus,'equal');assert.deepEqual(result.metadataDifferences,['filename']);}
 assert.equal(classifySnapshotEntries(entry,entry,rules,{a:'left/file.txt',b:'RIGHT/file.txt'}).status,'equal');
 assert.equal(classifySnapshotEntries(entry,entry,{}).status,'equal');
 assert.equal(classifySnapshotEntries(entry,null,rules).status,'left');
 const dir={kind:'directory'};assert.equal(classifySnapshotEntries(dir,dir,rules,{a:'Left',b:'RIGHT'}).contentStatus,'unchecked');
 assert.equal(classifySnapshotEntries(entry,{...entry,hash:'b'.repeat(64)},rules,{a:'same',b:'same'}).contentStatus,'changed');
});
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-filename-criterion-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const service=new FolderService(path.join(root,'backups'));
 for(const side of ['a','b']){const dir=path.join(root,side),folder=side==='a'?'Folder':'folder';await fs.mkdir(path.join(dir,folder),{recursive:true});await fs.writeFile(path.join(dir,folder,side==='a'?'report.txt':'report.log'),'equal content');await service.select(side,dir);}
 const tree=new FolderTree(service,undefined,{ignoreCase:true,ignoreExtension:true});return {root,service,tree};
}
test('opened-node file and folder criteria preserve lazy scanning and clear when disabled',async t=>{
 const {service,tree}=await fixture(t),rules={compareFilename:true};let result=await tree.compare('root',rules),dir=result.rows[0];
 assert.equal(dir.status,'changed');assert.deepEqual(dir.metadataDifferences,['filename']);assert.equal(service.hashCache.size,0);
 result=await tree.compare(dir.id,rules);assert.equal(result.parentRow.contentStatus,'directory');const file=result.rows[0];assert.equal(file.status,'changed');assert.equal(file.contentStatus,'equal');
 let selected=await tree.compareSelected([file.id],result.revision,rules);assert.deepEqual(selected.rows[0].metadataDifferences,['filename']);
 selected=await tree.refreshSelectedEntries([dir.id],result.revision,rules);assert.deepEqual(selected.rows[0].metadataDifferences,['filename']);
 result=await tree.compare(dir.id,{});assert.equal(result.rows[0].status,'equal');assert.equal(result.rows[0].metadataDifferences,undefined);
 assert.equal(result.parentRow.status,'directory');assert.equal(result.parentRow.metadataDifferences,undefined);
 const repeat=await tree.compare('root',rules);assert.equal(repeat.rows[0].contentStatus,'directory');
 const off=await tree.refreshSelectedEntries([repeat.rows[0].id],repeat.revision,{});assert.equal(off.rows[0].status,'directory');assert.equal(off.rows[0].metadataDifferences,undefined);
});
test('snapshot inventory propagates actual unopened endpoints in either operation direction',async t=>{
 const {service}=await fixture(t),rules={compareFilename:true},pair={a:await service.snapshot('a',null,rules),b:await service.snapshot('b',null,rules)};
 const alignment=buildPathNameMatching(pair,undefined,{ignoreCase:true,ignoreExtension:true});
 for(const side of ['a','b']){const rows=buildOperationInventory(pair,alignment,side,rules);assert.equal(rows.length,2);assert.ok(rows.every(row=>row.status==='changed'&&row.metadataDifferences.includes('filename')));}
});
test('filtered unopened subtree uses filename differences without opening descendants',async t=>{
 const {service,tree}=await fixture(t);await tree.compare('root',{compareFilename:true});
 const result=await previewFilteredDelete(service,tree,'a',['Folder'],{status:'diff',rules:{compareFilename:true}});
 assert.ok(result.preview.operations.some(op=>op.path==='Folder/report.txt'));
});
test('explicit pair and manual tree alignment compare endpoint basenames',async t=>{
 const {service,tree}=await fixture(t),rules={compareFilename:true};
 const direct=await service.compareFilePairs([{a:'Folder/report.txt',b:'folder/report.log'}],rules);assert.deepEqual(direct.rows[0].metadataDifferences,['filename']);
 await tree.setAlignment([{a:'Folder/report.txt',b:'folder/report.log',kind:'file'}]);
 const root=await tree.compare('root',rules),dir=root.rows.find(row=>row.kind==='directory');const children=await tree.compare(dir.id,rules);
 assert.deepEqual(children.rows.find(row=>row.pathA==='Folder/report.txt').metadataDifferences,['filename']);
});
test('filename-across-folders retains manual aliases and ignores different parents for same names',async t=>{
 const {root,service,tree}=await fixture(t);
 await fs.writeFile(path.join(root,'a','Folder','other.txt'),'same');
 await tree.setAlignment([{a:'Folder/report.txt',b:'folder/report.log',kind:'file'}]);
 await fs.writeFile(path.join(root,'b','folder','other.txt'),'same');
 await tree.setMatchingMode('filename');const result=await tree.compare('root',{compareFilename:true});
 const row=result.rows.find(row=>row.pathA==='Folder/other.txt');assert.equal(row.pathB,'folder/other.txt');assert.equal(row.status,'equal');assert.deepEqual(row.metadataDifferences,[]);
 assert.deepEqual(result.rows.find(row=>row.pathA==='Folder/report.txt').metadataDifferences,['filename']);
});
