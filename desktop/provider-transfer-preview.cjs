'use strict';
const {randomUUID}=require('node:crypto');
const path=require('node:path').posix;
const {checkSignal}=require('./local-folder-reader.cjs');
const {snapshotProviderFile}=require('./provider-file-snapshot.cjs');
const plans=new WeakMap();
const invalid=message=>Object.assign(Error(message),{code:'INVALID_COPY_PLAN'});
const stale=()=>Object.assign(Error('The selected files or folders changed. Preview the copy again.'),{code:'STALE_SOURCE'});
const validRelative=value=>typeof value==='string'&&value.length>0&&value.length<=32768&&!/[\\\0]/.test(value)&&!value.split('/').some(part=>!part||part==='.'||part==='..');
const sameAuthority=(a,b)=>!!a&&!!b&&a.path===b.path&&a.identity===b.identity;
const sameFile=(a,b)=>sameAuthority(a,b)&&a.kind===b.kind&&a.stamp===b.stamp&&a.size===b.size;
function rootMetadata(value){if(!value||typeof value.path!=='string'||!value.path||typeof value.identity!=='string'||!value.identity)throw stale();return {...value};}
function directoryMetadata(value,relative){if(!value||value.path!==relative||value.kind!=='directory'||typeof value.identity!=='string'||!value.identity)throw invalid('Destination parent folders must already exist.');return {...value};}
function fileMetadata(value,relative){if(!value||value.path!==relative||value.kind!=='file'||typeof value.identity!=='string'||!value.identity||typeof value.stamp!=='string'||!value.stamp||!Number.isSafeInteger(value.size)||value.size<0)throw invalid('Select regular files and regular file destinations only.');return {...value};}
function endpoint(provider){if(!provider||!['inspectRoot','inspectEntry','openFileReader'].every(key=>typeof provider[key]==='function'))throw invalid('Choose source and destination folders.');}
function alias(a,b){
 if(a.provider===b.provider&&a.relative===b.relative)return true;
 if(a.metadata&&b.metadata&&a.metadata.identity===b.metadata.identity&&(sameAuthority(a.root,b.root)||a.metadata.strongRevision===true&&b.metadata.strongRevision===true))return true;
 if(sameAuthority(a.root,b.root)&&a.relative===b.relative)return true;
 // Independent wrappers may have separate namespace IDs for one connection.
 return !!a.provider.connection&&a.provider.connection===b.provider.connection&&typeof a.provider.root==='string'&&typeof b.provider.root==='string'&&path.join(a.provider.root,a.relative)===path.join(b.provider.root,b.relative);
}
async function captureParents(provider,relative,signal){
 const result=[];let parent=path.dirname(relative);
 while(parent!=='.'){
  checkSignal(signal);result.push(directoryMetadata(await provider.inspectEntry(parent,{signal}),parent));parent=path.dirname(parent);
 }
 return result;
}
async function checkRoots(state,signal){
 for(const [provider,expected] of [[state.source,state.sourceRoot],[state.destination,state.destinationRoot]]){checkSignal(signal);if(!sameAuthority(rootMetadata(await provider.inspectRoot({signal})),expected))throw stale();}
 checkSignal(signal);
}
async function checkParents(state,item,signal){
 for(const expected of item.parents){checkSignal(signal);const actual=await state.destination.inspectEntry(expected.path,{signal});if(!actual||actual.kind!=='directory'||!sameAuthority(actual,expected))throw stale();}
}
function matches(snapshot,expected){return sameAuthority(snapshot.root,expected.root)&&sameFile(snapshot.metadata,expected.metadata)&&snapshot.sha256===expected.sha256;}
async function validate(state,signal,assertLive=()=>{}){
 assertLive();await checkRoots(state,signal);
 for(const item of state.items){
  assertLive();await checkParents(state,item,signal);
  const source=await snapshotProviderFile(state.source,item.source,{signal});if(!matches(source,item.sourceSnapshot))throw stale();
  if(item.targetSnapshot){const target=await snapshotProviderFile(state.destination,item.target,{signal});if(!matches(target,item.targetSnapshot))throw stale();}
  else {checkSignal(signal);if(await state.destination.inspectEntry(item.target,{signal})!==null)throw stale();}
 }
 // Metadata checks after all content reads catch earlier observed entries being
 // replaced while later entries were read. This is not an atomic snapshot:
 // same-attribute remote changes after an earlier digest read can evade these
 // final metadata checks. Execution must reread and verify before publication.
 for(const item of state.items){
  assertLive();checkSignal(signal);const source=await state.source.inspectEntry(item.source,{signal});if(!sameFile(source,item.sourceSnapshot.metadata))throw stale();
  const target=await state.destination.inspectEntry(item.target,{signal});if(item.targetSnapshot?!sameFile(target,item.targetSnapshot.metadata):target!==null)throw stale();
  await checkParents(state,item,signal);
 }
 await checkRoots(state,signal);assertLive();
}
async function prepareProviderCopy(source,destination,mappings,{signal}={}){
 checkSignal(signal);endpoint(source);endpoint(destination);
 if(!Array.isArray(mappings)||!mappings.length||mappings.length>1000)throw invalid('Select between 1 and 1000 regular files.');
 const requested=mappings.map(mapping=>{if(!mapping||typeof mapping!=='object'||Array.isArray(mapping)||!validRelative(mapping.source)||!validRelative(mapping.target))throw invalid('Invalid relative copy path.');return {source:mapping.source,target:mapping.target};});
 if(new Set(requested.map(item=>item.target)).size!==requested.length)throw invalid('Multiple files cannot share a copy destination.');
 const state={source,destination,sourceRoot:rootMetadata(await source.inspectRoot({signal})),destinationRoot:rootMetadata(await destination.inspectRoot({signal})),items:[]};
 const operations=[];let totalBytes=0;
 for(const mapping of requested){
  checkSignal(signal);const parents=await captureParents(destination,mapping.target,signal);
  const initialSource=fileMetadata(await source.inspectEntry(mapping.source,{signal}),mapping.source);
  const targetInfo=await destination.inspectEntry(mapping.target,{signal}),initialTarget=targetInfo===null?null:fileMetadata(targetInfo,mapping.target);
  const sourceRef={provider:source,relative:mapping.source,root:state.sourceRoot,metadata:initialSource},targetRef={provider:destination,relative:mapping.target,root:state.destinationRoot,metadata:initialTarget};
  if(alias(sourceRef,targetRef))throw invalid('A copy destination aliases a selected source.');
  for(const prior of state.items){
   if(alias(sourceRef,prior.sourceRef))throw invalid('Select each source file only once.');
   if(alias(targetRef,prior.sourceRef)||alias(sourceRef,prior.targetRef))throw invalid('A copy destination aliases a selected source.');
   if(alias(targetRef,prior.targetRef))throw invalid('Multiple files cannot share a copy destination.');
  }
  const sourceSnapshot=await snapshotProviderFile(source,mapping.source,{signal});if(!sameAuthority(sourceSnapshot.root,state.sourceRoot)||!sameFile(sourceSnapshot.metadata,initialSource))throw stale();
  const targetSnapshot=initialTarget===null?null:await snapshotProviderFile(destination,mapping.target,{signal});
  if(targetSnapshot&&(!sameAuthority(targetSnapshot.root,state.destinationRoot)||!sameFile(targetSnapshot.metadata,initialTarget)))throw stale();
  const action=targetSnapshot?(targetSnapshot.sha256===sourceSnapshot.sha256?'skip':'replace'):'create',bytes=sourceSnapshot.byteLength;
  if(action!=='skip'){if(bytes>Number.MAX_SAFE_INTEGER-totalBytes)throw invalid('Selected copy size exceeds the supported total.');totalBytes+=bytes;}
  state.items.push({...mapping,parents,sourceSnapshot,targetSnapshot,sourceRef,targetRef});operations.push(Object.freeze({...mapping,action,bytes}));
 }
 await validate(state,signal);
 const plan=Object.freeze({id:randomUUID(),operations:Object.freeze(operations),totalBytes});plans.set(plan,state);return plan;
}
async function revalidateProviderCopy(plan,{signal}={}){checkSignal(signal);const state=plans.get(plan);if(!state)throw invalid('Preview the copy again.');await validate(state,signal,()=>{if(plans.get(plan)!==state)throw invalid('This copy preview was revoked.');});}
function revokeProviderCopy(plan){const state=plans.get(plan);plans.delete(plan);state?.executionController?.abort();}
// Only the native retained observations select recovery inputs. This does not
// authorize destination writes; the executor must still validate before publish.
async function backupProviderCopy(plan,backupRoot,{signal}={}){
 await revalidateProviderCopy(plan,{signal});
 const state=plans.get(plan);if(!state)throw invalid('This copy preview was revoked.');
 const entries=state.items.filter((item,index)=>plan.operations[index].action==='replace').map(item=>({path:item.target,observation:item.targetSnapshot}));
 if(!entries.length)return null;
 const {backupProviderFiles}=require('./provider-transfer-backup.cjs');
 const backup=await backupProviderFiles(state.destination,entries,backupRoot,{signal});
 try{await revalidateProviderCopy(plan,{signal});}
 catch(error){
  const failure=Object.assign(Error('The copy could not be revalidated after backup. Preview it again. Recovery files: '+backup.backupPath,{cause:error}),{code:error?.code||'STALE_SOURCE',backupPath:backup.backupPath,recoveryDurability:backup.durability,recoveryWarning:backup.durabilityWarning});
  throw failure;
 }
 return backup;
}
// writeFile is a trusted native adapter, never a renderer callback. A batch is
// deliberately single-use and non-atomic: preserve each outcome after failures.
async function executeProviderCopy(plan,{backupRoot,writeFile,signal,onProgress}={}){
 checkSignal(signal);
 const state=plans.get(plan);if(!state||state.executing)throw invalid('Preview the copy again.');
 if(typeof writeFile!=='function'||onProgress!==undefined&&typeof onProgress!=='function')throw invalid('Choose a native transfer writer.');
 state.executing=true;const controller=new AbortController();state.executionController=controller;
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const result={completed:0,skipped:0,backupPath:null,items:plan.operations.map(op=>({source:op.source,target:op.target,status:'unattempted'}))};let current=-1;
 const assertLive=()=>{checkSignal(controller.signal);if(plans.get(plan)!==state)throw invalid('This copy preview was revoked.');};
 const progress=()=>{try{const pending=onProgress?.({completed:result.completed,skipped:result.skipped,total:result.items.length});if(pending&&typeof pending.catch==='function')pending.catch(()=>{});}catch{}};
 try{
  assertLive();const backup=await backupProviderCopy(plan,backupRoot,{signal:controller.signal});result.backupPath=backup?.backupPath??null;result.manifestPath=backup?.manifestPath;result.recoveryDurability=backup?.durability;result.recoveryWarning=backup?.durabilityWarning;
  for(let index=0;index<state.items.length;index++){
   assertLive();current=index;const item=state.items[index];await checkRoots(state,controller.signal);await checkParents(state,item,controller.signal);assertLive();
   if(plan.operations[index].action==='skip'){
    const source=await snapshotProviderFile(state.source,item.source,{signal:controller.signal}),target=await snapshotProviderFile(state.destination,item.target,{signal:controller.signal});
    if(!matches(source,item.sourceSnapshot)||!matches(target,item.targetSnapshot))throw stale();
    assertLive();result.items[index].status='skipped';result.skipped++;progress();continue;
   }
   const written=await writeFile({source:state.source,sourcePath:item.source,sourceObservation:item.sourceSnapshot,destination:state.destination,targetPath:item.target,targetObservation:item.targetSnapshot,signal:controller.signal});
   if(written?.sha256!==item.sourceSnapshot.sha256||written?.byteLength!==item.sourceSnapshot.byteLength)throw Object.assign(Error('The native writer did not return a verified copy result. The outcome is unknown; compare the destination before retrying.'),{code:'TRANSFER_OUTCOME_UNKNOWN'});
   // A writer returning successfully has published and verified this item even
   // if Stop arrived at that instant. Keep that success before the next guard.
   result.items[index].status='completed';result.items[index].published=true;result.completed++;
   if(written?.cleanupWarning)result.items[index].cleanupWarning=String(written.cleanupWarning);
   progress();
  }
  return result;
 }catch(error){
  if(current>=0&&result.items[current].status==='unattempted'){
   const entry=result.items[current];entry.status=error?.code==='TRANSFER_OUTCOME_UNKNOWN'?'unknown':error?.code==='TRANSFER_VERIFICATION_FAILED'?'verification-failed':'failed';
   if(entry.status==='verification-failed')entry.published=true;entry.error=String(error?.message||error);
  }
  result.backupPath=result.backupPath||error?.backupPath||null;
  const failure=Object.assign(Error(String(error?.message||error),{cause:error}),{code:error?.code||'TRANSFER_FAILED',outcome:result,completed:result.completed,backupPath:result.backupPath});throw failure;
 }finally{signal?.removeEventListener('abort',abort);state.executionController=null;plans.delete(plan);}
}
module.exports={prepareProviderCopy,revalidateProviderCopy,revokeProviderCopy,backupProviderCopy,executeProviderCopy};
