'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs');
const {localFolderEndpoint}=require('../desktop/provider-folder-service.cjs');
const {prepareProviderCopy,executeProviderCopy,revokeProviderCopy}=require('../desktop/provider-transfer-preview.cjs');
async function fixture(t){
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-copy-execute-')));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const left=path.join(base,'left'),right=path.join(base,'right'),backups=path.join(base,'backups');await fs.mkdir(left);await fs.mkdir(right);
 const service=new FolderService(backups);await service.select('a',left);await service.select('b',right);
 for(const name of ['a','b','c','same']){await fs.writeFile(path.join(left,name),name==='same'?'equal':'new '+name);if(name!=='c')await fs.writeFile(path.join(right,name),name==='same'?'equal':'old '+name);}
 const source=localFolderEndpoint(service,'a'),destination=localFolderEndpoint(service,'b');
 const plan=await prepareProviderCopy(source,destination,['a','b','c','same'].map(name=>({source:name,target:name})));
 return {left,right,backups,service,source,destination,plan};
}
test('batch backs up all replacements before first writer and reports exact completed/skipped outcomes',async t=>{
 const f=await fixture(t);let calls=0;
 const result=await executeProviderCopy(f.plan,{backupRoot:f.backups,writeFile:async item=>{
  if(!calls++){const dirs=await fs.readdir(f.backups);assert.equal(dirs.length,1);const manifest=JSON.parse(await fs.readFile(path.join(f.backups,dirs[0],'manifest.json'),'utf8'));assert.deepEqual(manifest.files.map(x=>x.path),['a','b']);for(const file of manifest.files)assert.equal(await fs.readFile(path.join(f.backups,dirs[0],file.backupName),'utf8'),'old '+file.path);}
  await fs.copyFile(path.join(f.left,item.sourcePath),path.join(f.right,item.targetPath));return {sha256:item.sourceObservation.sha256,byteLength:item.sourceObservation.byteLength};
 }});
 assert.equal(calls,3);assert.equal(result.completed,3);assert.equal(result.skipped,1);assert.deepEqual(result.items.map(x=>x.status),['completed','completed','completed','skipped']);
 await assert.rejects(executeProviderCopy(f.plan,{backupRoot:f.backups,writeFile:async()=>{throw Error('must not run');}}));
});
test('second-file failure preserves first success and reports remaining files unattempted',async t=>{
 const f=await fixture(t);let calls=0,failure;
 try{await executeProviderCopy(f.plan,{backupRoot:f.backups,writeFile:async item=>{if(++calls===2)throw Error('disk failure');await fs.copyFile(path.join(f.left,item.sourcePath),path.join(f.right,item.targetPath));return {sha256:item.sourceObservation.sha256,byteLength:item.sourceObservation.byteLength};}});}catch(error){failure=error;}
 assert.ok(failure.backupPath);assert.equal(failure.completed,1);assert.deepEqual(failure.outcome.items.map(x=>x.status),['completed','failed','unattempted','unattempted']);assert.equal(calls,2);
 assert.equal(await fs.readFile(path.join(f.right,'a'),'utf8'),'new a');assert.equal(await fs.readFile(path.join(f.right,'b'),'utf8'),'old b');
});
for(const [code,status] of [['TRANSFER_OUTCOME_UNKNOWN','unknown'],['TRANSFER_VERIFICATION_FAILED','verification-failed']])test('batch preserves '+status+' without retry',async t=>{
 const f=await fixture(t);let calls=0,failure;try{await executeProviderCopy(f.plan,{backupRoot:f.backups,writeFile:async()=>{calls++;throw Object.assign(Error('publication problem'),{code});}});}catch(error){failure=error;}
 assert.equal(calls,1);assert.equal(failure.outcome.items[0].status,status);assert.equal(failure.outcome.items[0].published,status==='verification-failed'?true:undefined);assert.equal(failure.outcome.items[1].status,'unattempted');
});
test('revoke aborts active writer and rejects concurrent or replayed execution',async t=>{
 const f=await fixture(t);let entered;const started=new Promise(resolve=>entered=resolve);
 const running=executeProviderCopy(f.plan,{backupRoot:f.backups,writeFile:({signal})=>new Promise((resolve,reject)=>{entered();signal.addEventListener('abort',()=>reject(Object.assign(Error('cancelled'),{code:'ABORT_ERR'})),{once:true});})});
 const rejected=assert.rejects(running,error=>error.code==='ABORT_ERR'&&error.outcome.completed===0);
 await started;await assert.rejects(executeProviderCopy(f.plan,{backupRoot:f.backups,writeFile:async()=>{}}));revokeProviderCopy(f.plan);await rejected;
 await assert.rejects(executeProviderCopy(f.plan,{backupRoot:f.backups,writeFile:async()=>{}}));assert.equal(await fs.readFile(path.join(f.right,'a'),'utf8'),'old a');
});

test('Stop after a completed item leaves later files unattempted',async t=>{
 const f=await fixture(t);let failure,calls=0;
 try{await executeProviderCopy(f.plan,{backupRoot:f.backups,onProgress:({completed})=>{if(completed===1)revokeProviderCopy(f.plan);},writeFile:async item=>{calls++;await fs.copyFile(path.join(f.left,item.sourcePath),path.join(f.right,item.targetPath));return {sha256:item.sourceObservation.sha256,byteLength:item.sourceObservation.byteLength};}});}catch(error){failure=error;}
 assert.equal(calls,1);assert.equal(failure.code,'ABORT_ERR');assert.deepEqual(failure.outcome.items.map(x=>x.status),['completed','unattempted','unattempted','unattempted']);
});
test('missing native verification result is an unknown outcome',async t=>{
 const f=await fixture(t);let failure;try{await executeProviderCopy(f.plan,{backupRoot:f.backups,writeFile:async()=>undefined});}catch(error){failure=error;}
 assert.equal(failure.code,'TRANSFER_OUTCOME_UNKNOWN');assert.equal(failure.outcome.items[0].status,'unknown');assert.equal(failure.outcome.items[0].published,undefined);assert.equal(failure.outcome.items[1].status,'unattempted');
});
