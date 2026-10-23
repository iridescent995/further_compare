'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs');
const {classifySnapshotEntries}=require('../desktop/folder-snapshot-comparison.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-snapshot-rules-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const a=path.join(root,'a'),b=path.join(root,'b');await fs.mkdir(a);await fs.mkdir(b);const service=new FolderService(path.join(root,'backups'));await service.select('a',a);await service.select('b',b);return {service,a,b};}
test('captured comparison metadata agrees with native node comparison across every rule',async t=>{
 const {service,a,b}=await fixture(t);
 for(const [name,left,right]of [['text.txt','Hello World\r\n','hello\tworld\n'],['same.txt','same','same'],['bytes.bin',Buffer.from([0,1,2]),Buffer.from([0,1,3])]]){await fs.writeFile(path.join(a,name),left);await fs.writeFile(path.join(b,name),right);await fs.utimes(path.join(a,name),1700000000,1700000000);await fs.utimes(path.join(b,name),1700000001,1700000001);}
 for(const mode of ['content','text-content','text-whitespace','text-case','text-whitespace-case','size','modified','size-modified'])for(const timeToleranceMs of [0,1000]){
  const rules={mode,timeToleranceMs},left=await service.snapshot('a',null,rules),right=await service.snapshot('b',null,rules),live=await service.compareNode('',rules);
  assert.deepEqual(left.comparisonRules,rules);
  for(const row of live.rows){const result=classifySnapshotEntries(left.entries.get(row.path),right.entries.get(row.path),rules);assert.deepEqual(result,{status:row.status,comparison:row.comparison},mode+' '+row.path);}
 }
 const normalized={mode:'text-whitespace-case'},left=await service.snapshot('a',null,normalized),right=await service.snapshot('b',null,normalized);
 assert.notEqual(left.entries.get('text.txt').hash,right.entries.get('text.txt').hash,'Eligibility must not replace raw integrity hashes');
 assert.equal(classifySnapshotEntries(left.entries.get('text.txt'),right.entries.get('text.txt'),normalized).status,'equal');
 assert.equal(left.entries.get('bytes.bin').normalizedHash,null,'Binary remains byte-based');
 const before=service.signature({a:left,b:right});await fs.writeFile(path.join(b,'text.txt'),'other');const after=await service.snapshot('b',null,normalized);assert.notEqual(service.signature({a:left,b:after}),before,'Counterpart changes remain visible to transaction signature checks');
});
test('snapshot classification rejects missing data and mismatched normalization rules',async t=>{
 const {service,a,b}=await fixture(t);await fs.writeFile(path.join(a,'x'),'One\n');await fs.writeFile(path.join(b,'x'),'one\n');
 const left=(await service.snapshot('a',['x'],{mode:'text-case'})).entries.get('x'),right=(await service.snapshot('b',['x'],{mode:'text-case'})).entries.get('x');
 assert.throws(()=>classifySnapshotEntries(left,right,{mode:'text-whitespace'}),/rules changed/);
 assert.throws(()=>classifySnapshotEntries({...left,mtimeNs:undefined},right,{mode:'modified'}),/modification time/);
 assert.throws(()=>classifySnapshotEntries({...left,hash:null},right),/Incomplete/);
 assert.throws(()=>classifySnapshotEntries(null,null),/at least one/);
 assert.deepEqual(classifySnapshotEntries(left,null),{status:'left',comparison:null});
 assert.deepEqual(classifySnapshotEntries(null,right),{status:'right',comparison:null});
 assert.deepEqual(classifySnapshotEntries(left,{kind:'directory'}),{status:'conflict',comparison:null});
 assert.deepEqual(classifySnapshotEntries({kind:'directory'},{kind:'directory'}),{status:'unchecked',comparison:null});
 const original=await service.snapshot('a',['x']);assert.equal(original.comparisonRules,undefined);assert.equal(original.entries.get('x').mtimeNs,undefined,'Legacy snapshot callers retain their existing shape');
 await assert.rejects(service.snapshot('a',null,{mode:'invalid'}),/Invalid folder comparison rules/);
});
test('captured normalized differences select only eligible files and retain mixed directories',async t=>{
 const {selectOperationEntries}=require('../desktop/folder-operation-scope.cjs');const {service,a,b}=await fixture(t);
 for(const root of [a,b])await fs.mkdir(path.join(root,'folder'));
 for(const [name,left,right]of [['same.txt','SAME\r\n','same\n'],['changed.txt','old','new'],['hidden.bak','old backup','new backup']]){await fs.writeFile(path.join(a,'folder',name),left);await fs.writeFile(path.join(b,'folder',name),right);}
 const rules={mode:'text-case'},left=await service.snapshot('a',['folder'],rules),right=await service.snapshot('b',['folder'],rules);
 const rows=[...new Set([...left.entries.keys(),...right.entries.keys()])].map(relative=>{const x=left.entries.get(relative),y=right.entries.get(relative);return {id:relative,parentId:relative.includes('/')?relative.slice(0,relative.lastIndexOf('/')):'root',pathA:x?relative:null,pathB:y?relative:null,kindA:x?.kind??null,kindB:y?.kind??null,sizeA:x?.size,sizeB:y?.size,mtimeA:x?.mtimeMs,mtimeB:y?.mtimeMs,...classifySnapshotEntries(x,y,rules)};});
 const scope=selectOperationEntries(rows,{include:'*.txt',exclude:'*.bak',status:'diff',rules},'a');
 assert.deepEqual([...scope.fileIds],['folder/changed.txt']);assert.deepEqual([...scope.directoryIds],['folder']);assert.equal(scope.removableDirectoryIds.size,0);
 assert.equal(left.entries.size,4,'Coverage used for revalidation must retain filtered children');
 assert.notEqual(left.entries.get('folder/same.txt').hash,right.entries.get('folder/same.txt').hash,'Normalized eligibility keeps original byte hashes');
});
