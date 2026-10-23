'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {timestampsEqualNs}=require('../src/folder-time.cjs');
const {validateFolderRules}=require('../desktop/folder-rules.cjs');
const {validateSession}=require('../desktop/sessions.cjs');
const {validateDefaultProfile}=require('../desktop/session-defaults.cjs');
const {FolderService}=require('../desktop/folders.cjs');
const {FolderTree}=require('../desktop/folder-tree.cjs');
const {classifySnapshotEntries}=require('../desktop/folder-snapshot-comparison.cjs');
const HOUR=3600000000000n,MS=1000000n;
test('Timestamp exceptions retain nanosecond precision and symmetric inclusive tolerance',()=>{
 for(const sign of [1n,-1n])for(const key of ['ignoreDaylightSaving','ignoreTimezone']){
  const rules={[key]:true,timeToleranceMs:2},base=1700000000000000000n;
  for(const shift of [-2n*MS,0n,2n*MS])assert.equal(timestampsEqualNs(base,base+sign*(HOUR+shift),rules),true);
  for(const shift of [-2n*MS-1n,2n*MS+1n])assert.equal(timestampsEqualNs(base,base+sign*(HOUR+shift),rules),false);
  assert.equal(timestampsEqualNs(base,base+sign*2n*MS,rules),true);
  assert.equal(timestampsEqualNs(base,base+sign*(2n*MS+1n),rules),false);
 }
 assert.equal(timestampsEqualNs('0','0'),true);
 assert.equal(timestampsEqualNs(0n,HOUR),false);
});
test('Daylight exception is one hour; timezone exception accepts only whole-hour offsets',()=>{
 for(const sign of [1n,-1n]){
  for(const hours of [1n,2n,5n,24n,48n]){
   assert.equal(timestampsEqualNs(0n,sign*hours*HOUR,{ignoreDaylightSaving:true}),hours===1n);
   assert.equal(timestampsEqualNs(0n,sign*hours*HOUR,{ignoreTimezone:true}),true);
  }
  for(const offset of [HOUR/2n,HOUR*3n/2n,HOUR*23n/4n]){
   for(const rules of [{ignoreDaylightSaving:true},{ignoreTimezone:true},{ignoreTimezone:true,ignoreDaylightSaving:true}])assert.equal(timestampsEqualNs(0n,sign*offset,rules),false);
  }
  for(const offset of [5n*HOUR-3n*MS,5n*HOUR+3n*MS])assert.equal(timestampsEqualNs(0n,sign*offset,{ignoreTimezone:true,timeToleranceMs:3}),true);
 }
});
test('Timestamp flags are strict, optional, and persist through sessions and defaults',()=>{
 const base={version:1,type:'folder-compare',name:'Times',text:{a:'',b:''},files:{a:{name:'',path:''},b:{name:'',path:''}},folders:{a:null,b:null},options:{ignoreWhitespace:false,filter:'all',direction:'a-to-b'}};
 for(const key of ['ignoreDaylightSaving','ignoreTimezone']){
  assert.deepEqual(validateFolderRules({[key]:false}),{mode:'content',timeToleranceMs:0});
  for(const value of [null,1,'true',[],{}]){
   assert.throws(()=>validateFolderRules({[key]:value}),/boolean/);
   assert.throws(()=>validateDefaultProfile({type:'folder-compare',options:{folderRules:{[key]:value}}}),/boolean/);
  }
  const folderRules={mode:'size-modified',timeToleranceMs:10,[key]:true};
  assert.deepEqual(validateSession({...base,options:{...base.options,folderRules}}).options.folderRules,folderRules);
  assert.deepEqual(validateDefaultProfile({type:'folder-compare',options:{folderRules}}).options.folderRules,folderRules);
 }
});
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-time-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const service=new FolderService(path.join(root,'backups'));
 for(const side of ['a','b']){
  const dir=path.join(root,side);await fs.mkdir(path.join(dir,'closed'),{recursive:true});
  await fs.writeFile(path.join(dir,'x'),side==='a'?'aaa':'bbb');
  await fs.writeFile(path.join(dir,'closed','hidden'),'hidden');
  await fs.utimes(path.join(dir,'x'),1700000000,1700000000+(side==='b'?3600:0));await service.select(side,dir);
 }
 return{service,tree:new FolderTree(service)};
}
test('Node, selected refresh, filename and snapshot comparison use identical timestamp rules without content reads',async t=>{
 const {service,tree}=await fixture(t),rules={mode:'size-modified',ignoreDaylightSaving:true};
 const originalOpen=fs.open;fs.open=async()=>{throw Error('Timestamp compare must not read file contents');};
 try{
  let result=await tree.compare('root',rules),row=result.rows.find(r=>r.kind==='file');
  assert.equal(row.status,'equal');assert.equal(row.mtimeB-row.mtimeA,3600000);
  assert.equal((await tree.compareSelected([row.id],result.revision,rules)).rows[0].status,'equal');
  assert.equal((await tree.refreshSelectedFiles([row.id],result.revision,rules)).rows[0].status,'equal');
  assert.equal(service.hashCache.size,0);
  await tree.setMatchingMode('filename');result=await tree.compare('root',rules);
  assert.equal(result.rows.find(r=>r.pathA==='x').status,'equal');
 }finally{fs.open=originalOpen;}
 const a=(await service.snapshot('a',null,rules)).entries.get('x'),b=(await service.snapshot('b',null,rules)).entries.get('x');
 assert.equal(classifySnapshotEntries(a,b,rules).status,'equal');
 assert.equal(classifySnapshotEntries(a,b,{mode:'size-modified'}).status,'changed');
 for(const mode of ['content','text-content'])assert.equal((await service.compareNode('',{...rules,mode})).rows.find(r=>r.name==='x').status,'changed');
 assert.equal(classifySnapshotEntries(a,b,{ignoreTimezone:true}).status,'changed');
 assert.equal(classifySnapshotEntries({...a,size:a.size+1},b,rules).status,'changed');
 assert.equal(classifySnapshotEntries({...a,size:a.size+1},b,{...rules,mode:'modified'}).status,'equal');
});
