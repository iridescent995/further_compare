'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs');
const {validateFolderRules}=require('../desktop/folder-rules.cjs');
const {classifySnapshotEntries}=require('../desktop/folder-snapshot-comparison.cjs');
const {FolderTree}=require('../desktop/folder-tree.cjs');
const {previewFilteredCopyToFolder}=require('../desktop/folder-filtered-copy-destination.cjs');
const mappings=[{pattern:'*.ddl',profile:'sql'},{pattern:'*.generated.java',profile:'plain'}];
const rules={mode:'text-content',textProfile:'auto',textProfileMappings:mappings};
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-mapped-folders-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const service=new FolderService(path.join(root,'backups'));
 for(const side of ['a','b']){const dir=path.join(root,side);await fs.mkdir(path.join(dir,'closed'),{recursive:true});await fs.writeFile(path.join(dir,'closed/A.ddl'),side==='a'?'-- comment\nselect 1;\n':'select 1;\n');await fs.writeFile(path.join(dir,'closed/A.generated.java'),side==='a'?'// comment\nclass A {}\n':'class A {}\n');await service.select(side,dir);}
 return {service,root};
}
test('folder mappings are cloned and retained in dormant modes, and invalid mappings reject',()=>{
 for(const mode of ['content','size','text-content']){const normalized=validateFolderRules({...rules,mode});assert.deepEqual(normalized.textProfileMappings,mappings);assert.notEqual(normalized.textProfileMappings,mappings);assert.notEqual(normalized.textProfileMappings[0],mappings[0]);}
 assert.equal(validateFolderRules({textProfileMappings:[]}).textProfileMappings,undefined);
 for(const value of [null,{},[{pattern:'*.ddl',profile:'auto'}],[{pattern:'dir/*.ddl',profile:'sql'}]])assert.throws(()=>validateFolderRules({textProfileMappings:value}));
});
test('mapped folders apply first-match profiles and plain opt-outs consistently with snapshots',async t=>{
 const {service}=await fixture(t),pairs=[{a:'closed/A.ddl',b:'closed/A.ddl'},{a:'closed/A.generated.java',b:'closed/A.generated.java'}];
 assert.deepEqual((await service.compareFilePairs(pairs,rules)).rows.map(r=>r.status),['equal','changed']);
 const left=await service.snapshot('a',null,rules),right=await service.snapshot('b',null,rules);
 for(const [i,pair] of pairs.entries())assert.equal(classifySnapshotEntries(left.entries.get(pair.a),right.entries.get(pair.b),rules,pair).status,['equal','changed'][i]);
 assert.deepEqual((await service.compareFilePairs(pairs,{...rules,mode:'content'})).rows.map(r=>r.status),['changed','changed']);
 const override={...rules,textProfileMappings:[{pattern:'*',profile:'plain'},...mappings]};assert.equal((await service.compareFilePairs([pairs[0]],override)).rows[0].status,'changed');
});
test('snapshot mapping identity rejects reorder and same-effective-profile changes; empty legacy works',async t=>{
 const {service}=await fixture(t),pair={a:'closed/A.ddl',b:'closed/A.ddl'},a=(await service.snapshot('a',null,rules)).entries.get(pair.a),b=(await service.snapshot('b',null,rules)).entries.get(pair.b);
 assert.equal(a.normalizationProfileMappings,JSON.stringify(mappings));
 for(const changed of [[...mappings].reverse(),[...mappings,{pattern:'*.other',profile:'xml'}],[]])assert.throws(()=>classifySnapshotEntries(a,b,{...rules,textProfileMappings:changed},pair),/mappings changed/);
 for(const bad of [null,undefined,'[]',JSON.stringify([...mappings].reverse())])assert.throws(()=>classifySnapshotEntries({...a,normalizationProfileMappings:bad},b,rules,pair),/mappings changed/);
 const plainRules={mode:'text-content',textProfile:'auto'},oldA=(await service.snapshot('a',null,plainRules)).entries.get(pair.a),oldB=(await service.snapshot('b',null,plainRules)).entries.get(pair.b);delete oldA.normalizationProfileMappings;delete oldB.normalizationProfileMappings;
 assert.equal(classifySnapshotEntries(oldA,oldB,plainRules,pair).status,'changed');
});
test('mapping edits cannot reuse hashes even when effective profile is unchanged',async t=>{
 const {service}=await fixture(t),pairs=[{a:'closed/A.ddl',b:'closed/A.ddl'}];let opened=0;const original=service.openFileReader.bind(service);service.openFileReader=(...args)=>{opened++;return original(...args);};
 await service.compareFilePairs(pairs,rules);const first=opened;assert.equal(first,2);await service.compareFilePairs(pairs,rules);assert.equal(opened,first);
 await service.compareFilePairs(pairs,{...rules,textProfileMappings:[...mappings].reverse()});assert.equal(opened,first+2);
 assert.equal((await service.compareFilePairs(pairs,{...rules,textProfileMappings:[]})).rows[0].status,'changed');assert.equal(opened,first+4);
});
test('manually paired unlike mapped profiles use captured plain fallback',async t=>{
 const {service,root}=await fixture(t);await fs.writeFile(path.join(root,'b/closed/A.java'),'select 1;\n');const pair={a:'closed/A.ddl',b:'closed/A.java'};
 assert.equal((await service.compareFilePairs([pair],rules)).rows[0].status,'changed');const a=(await service.snapshot('a',null,rules)).entries.get(pair.a),b=(await service.snapshot('b',null,rules)).entries.get(pair.b);assert.equal(classifySnapshotEntries(a,b,rules,pair).status,'changed');
});
test('mapped filtered copy of unopened descendants retains original source bytes',async t=>{
 const {service,root}=await fixture(t),tree=new FolderTree(service);await tree.list('root');const out=path.join(root,'out');await fs.mkdir(out);const preview=await previewFilteredCopyToFolder(service,tree,'a',['closed'],{status:'same',rules},async()=>out);await preview.service.execute(preview.preview.id);
 assert.equal(await fs.readFile(path.join(out,'closed/A.ddl'),'utf8'),'-- comment\nselect 1;\n');await assert.rejects(fs.stat(path.join(out,'closed/A.generated.java')),e=>e.code==='ENOENT');
});
