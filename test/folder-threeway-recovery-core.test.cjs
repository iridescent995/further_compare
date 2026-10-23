'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {validateRecoveryManifest,planThreeWayRecovery}=require('../desktop/folder-threeway-recovery-core.cjs');
const file=(char='a',revision='1:2:1:3:4')=>({kind:'file',hash:char.repeat(64),size:1,revision,mode:33188});
const dir=()=>({kind:'directory',identity:'1:3',mode:16877});
function fixture(){
 const old=file(),op={type:'copy-file',path:'a',sourceSide:'left',sourcePath:'a',hash:'b'.repeat(64),size:1,oldHash:old.hash,oldSize:1};
 const manifest={version:2,id:'id',status:'completed',roots:Object.fromEntries(['base','left','right','output'].map(side=>[side,path.resolve('recovery-fixture',side)])),rootIdentities:{base:'1:1',left:'1:2',right:'1:3',output:'1:4'},operations:[op],originalTarget:[['a',old]],backups:[{path:'a',file:'backup-0',...old,backupRevision:'1:8:1:3:4'}],staged:[{index:0,file:'staged-0',...file('b')}],completed:1,activeOperation:null,temporaryFiles:[],error:null};
 return {manifest,current:{entries:new Map([['a',file('b')]]),skipped:0,identity:'1:4'},backups:new Map([['a',old]])};
}
test('completed overwrite restores exact original bytes using verified backup',()=>{
 const {manifest,current,backups}=fixture(),plan=planThreeWayRecovery(manifest,current,backups);
 assert.equal(plan.operations.length,1);assert.equal(plan.operations[0].sourceKind,'backup');assert.equal(plan.operations[0].sourceFile,'backup-0');assert.equal(plan.operations[0].hash,'a'.repeat(64));
 const validated=validateRecoveryManifest(manifest);validated.originalTarget[0][1].hash='c';assert.equal(manifest.originalTarget[0][1].hash,'a'.repeat(64));
});
test('later edits and unrelated additions are preserved by refusal',()=>{
 for(const change of [s=>s.entries.set('a',file('c')),s=>s.entries.set('extra',file()),s=>s.identity='1:99']) {
 const {manifest,current,backups}=fixture();change(current);assert.throws(()=>planThreeWayRecovery(manifest,current,backups),/changed/);
 }
});
test('verified backup content must match original snapshot',()=>{
 const {manifest,current,backups}=fixture();backups.set('a',file('c'));assert.throws(()=>planThreeWayRecovery(manifest,current,backups),/backup missing or changed/);
});
test('preparing and prepared do not authorize removal of later entries',()=>{
 for(const status of ['preparing','prepared']) {
 const {manifest,current,backups}=fixture();manifest.status=status;manifest.completed=0;current.entries.set('a',file());
 assert.deepEqual(planThreeWayRecovery(manifest,current,backups).operations,[]);
 current.entries.set('extra',file());assert.throws(()=>planThreeWayRecovery(manifest,current,backups),/unrelated entry changed/);
 }
});
test('active overwrite interrupted after unlink can restore missing original',()=>{
 const {manifest,current,backups}=fixture();manifest.status='failed';manifest.completed=0;manifest.activeOperation=0;current.entries.delete('a');
 assert.equal(planThreeWayRecovery(manifest,current,backups).operations[0].sourceFile,'backup-0');
 manifest.activeOperation=null;assert.throws(()=>planThreeWayRecovery(manifest,current,backups),/unrelated/);
});
test('untouched same-content inode or revision replacement is rejected',()=>{
 const {manifest,current,backups}=fixture();manifest.originalTarget.push(['untouched',file()]);current.entries.set('untouched',file('a','1:99:1:3:4'));
 assert.throws(()=>planThreeWayRecovery(manifest,current,backups),/unrelated/);
});
test('directory to file recovery restores parent before backed up child',()=>{
 const {manifest,current,backups}=fixture();manifest.originalTarget=[['a',dir()],['a/child',file()]];
 manifest.operations=[{type:'delete-file',path:'a/child',hash:'a'.repeat(64),size:1},{type:'delete-directory',path:'a'},{...manifest.operations[0],oldHash:null,oldSize:null}];manifest.completed=3;manifest.staged[0].index=2;manifest.staged[0].file='staged-2';manifest.backups[0].path='a/child';backups.set('a/child',file());
 assert.deepEqual(planThreeWayRecovery(manifest,current,backups).operations.map(o=>o.type),['delete-file','create-directory','copy-file']);
 // Failure after removal of only the child must retain the original directory.
 manifest.status='failed';manifest.completed=1;current.entries=new Map([['a',dir()]]);
 assert.deepEqual(planThreeWayRecovery(manifest,current,backups).operations.map(o=>o.type),['copy-file']);
});
test('only a recorded matching temporary publication may be removed',()=>{
 const {manifest,current,backups}=fixture();manifest.status='failed';manifest.completed=0;manifest.activeOperation=0;const name='.fc-threeway-12345678-1234-1234-1234-123456789abc';manifest.temporaryFiles=[path.join(manifest.roots.output,name)];current.entries.set(name,file('b'));
 assert.equal(planThreeWayRecovery(manifest,current,backups).operations[0].type,'delete-file');
 current.entries.set(name,file('c'));assert.throws(()=>planThreeWayRecovery(manifest,current,backups),/temporary output changed/);
 manifest.temporaryFiles=[path.join(manifest.roots.output,'arbitrary')];assert.throws(()=>validateRecoveryManifest(manifest),/temporary/);
});
test('malformed journals cannot grant paths, duplicate operations, or invalid prefix authority',()=>{
 for(const mutate of [m=>m.operations.push(m.operations[0]),m=>m.completed=2,m=>m.activeOperation=0,m=>m.originalTarget.push(['../escape',file()]),m=>m.backups[0].file='../backup',m=>m.staged[0].file='backup-0',m=>m.roots.output='relative',m=>m.version=1,m=>m.originalTarget.push(['A',file()])]) {
 const {manifest}=fixture();mutate(manifest);assert.throws(()=>validateRecoveryManifest(manifest));
 }
});
test('binary original normalizedHash null is accepted; nested accessors never run',()=>{
 const {manifest}=fixture();manifest.originalTarget[0][1].normalizedHash=null;manifest.backups[0].normalizedHash=null;
 assert.equal(validateRecoveryManifest(manifest).backups[0].normalizedHash,null);
 let invoked=false;Object.defineProperty(manifest.originalTarget[0],'1',{get(){invoked=true;return file();}});
 assert.throws(()=>validateRecoveryManifest(manifest),/plain enumerable data/);assert.equal(invoked,false);
});
test('file to directory recovery removes reviewed children before restoring former file',()=>{
 const {manifest,current,backups}=fixture();manifest.operations=[{type:'delete-file',path:'a',hash:'a'.repeat(64),size:1},{type:'create-directory',path:'a'},{...manifest.operations[0],path:'a/child',sourcePath:'a/child',oldHash:null,oldSize:null}];
 manifest.completed=3;manifest.staged[0].index=2;manifest.staged[0].file='staged-2';current.entries=new Map([['a',dir()],['a/child',file('b')]]);
 assert.deepEqual(planThreeWayRecovery(manifest,current,backups).operations.map(o=>o.type),['delete-file','delete-directory','copy-file']);
 current.entries.set('a/later',file());assert.throws(()=>planThreeWayRecovery(manifest,current,backups),/unrelated/);
});
test('an operation not yet reached never grants authority over its path',()=>{
 const {manifest,current,backups}=fixture();manifest.operations.push({type:'copy-file',path:'future',sourceSide:'right',sourcePath:'future',hash:'c'.repeat(64),size:1,oldHash:null,oldSize:null});manifest.status='failed';current.entries.set('future',file('c'));
 assert.throws(()=>planThreeWayRecovery(manifest,current,backups),/unrelated/);
});
test('large flat recovery journal validates directory removals and backups in bounded passes',()=>{
 const {manifest}=fixture();manifest.originalTarget=[];manifest.operations=[];manifest.backups=[];manifest.staged=[];
 for(let i=0;i<5000;i++) {
  const name=`file-${i}`;manifest.originalTarget.push([name,file()]);manifest.operations.push({type:'delete-file',path:name,hash:'a'.repeat(64),size:1});manifest.backups.push({path:name,file:`backup-${i}`,...file(),backupRevision:'1:8:1:3:4'});
 }
 for(let i=0;i<5000;i++) {const name=`directory-${i}`;manifest.originalTarget.push([name,dir()]);manifest.operations.push({type:'delete-directory',path:name});}
 manifest.completed=manifest.operations.length;
 const validated=validateRecoveryManifest(manifest);assert.equal(validated.operations.length,10000);assert.equal(validated.backups.length,5000);
});

test('pre-1970 file timestamps remain valid recovery descriptors',()=>{
 const {manifest,current,backups}=fixture();
 manifest.originalTarget[0][1].revision='1:2:1:-3000000000:-2000000000';
 manifest.backups[0].revision=manifest.originalTarget[0][1].revision;
 manifest.backups[0].backupRevision='1:8:1:-3000000000:-2000000000';
 manifest.staged[0].revision='1:9:1:-3000000000:-2000000000';
 assert.equal(validateRecoveryManifest(manifest).backups[0].backupRevision,'1:8:1:-3000000000:-2000000000');
 assert.equal(planThreeWayRecovery(manifest,current,backups).operations[0].sourceKind,'backup');
});
test('temporary inode authority is bounded to the active copy and requires native verification',()=>{
 const {manifest,current,backups}=fixture(),name='.fc-threeway-11111111-1111-1111-1111-111111111111';manifest.status='applying';manifest.completed=0;manifest.activeOperation=0;manifest.temporaryFiles=[path.join(manifest.roots.output,name)];manifest.temporaryIdentities=[{path:manifest.temporaryFiles[0],identity:'1:90'}];
 const partial={...file('c','1:90:0:3:4'),size:0};current.entries.set(name,partial);
 assert.throws(()=>planThreeWayRecovery(manifest,current,backups),/temporary output changed/);
 const verified=new Map([[name,partial]]);assert.equal(planThreeWayRecovery(manifest,current,backups,verified).operations[0].path,name);
 verified.set(name,{...partial,revision:'1:91:0:3:4'});assert.throws(()=>planThreeWayRecovery(manifest,current,backups,verified),/temporary output changed/);
 manifest.temporaryIdentities[0].path=path.join(manifest.roots.output,'other');assert.throws(()=>validateRecoveryManifest(manifest),/temporary identity/);
 manifest.temporaryIdentities[0].path=manifest.temporaryFiles[0];manifest.temporaryIdentities.push({...manifest.temporaryIdentities[0]});assert.throws(()=>validateRecoveryManifest(manifest),/temporary identities/);
 manifest.temporaryIdentities.pop();manifest.operations=[{type:'delete-file',path:'a',hash:'a'.repeat(64),size:1}];manifest.staged=[];assert.throws(()=>validateRecoveryManifest(manifest),/temporary output path/);
});
