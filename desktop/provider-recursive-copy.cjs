'use strict';
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const {prepareProviderCopyInventory,revalidateProviderCopyInventory,revokeProviderCopyInventory,getProviderCopyInventoryObservations}=require('./provider-copy-inventory.cjs');
const {snapshotProviderFile}=require('./provider-file-snapshot.cjs');
const {backupProviderFiles}=require('./provider-transfer-backup.cjs');
const {checkSignal}=require('./local-folder-reader.cjs');
const plans=new WeakMap(),sides=['a','b'];
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const stale=()=>Object.assign(Error('Recursive copy source, destination or namespace changed. Review again.'),{code:'STALE_SOURCE'});
const parent=p=>path.posix.dirname(p)==='.'?'':path.posix.dirname(p);
const authority=(a,b)=>a&&b&&a.path===b.path&&a.identity===b.identity;
const same=(a,b)=>authority(a,b)&&a.kind===b.kind&&a.stamp===b.stamp&&(a.kind!=='file'||a.size===b.size);
const stable=(a,b)=>authority(a,b)&&a.kind===b.kind&&['mode','uid','gid'].every(key=>a[key]===b[key]);
const matches=(a,b)=>authority(a.root,b.root)&&same(a.metadata,b.metadata)&&a.sha256===b.sha256&&a.byteLength===b.byteLength;
const overlap=(a,b)=>a===b||a.startsWith(b.endsWith('/')?b:b+'/')||b.startsWith(a.endsWith('/')?a:a+'/');
function live(state,signal){checkSignal(signal);if(state.revoked)throw Error('Recursive copy preview revoked.');for(const side of sides)if(state.service.endpoint(side)!==state.endpoints[side])throw stale();}
// A shared trusted host key is conservatively treated as one server even via
// aliases/port forwarding. Servers reusing a key may therefore be refused.
function sameStorage(state){const a=state.endpoints.a,b=state.endpoints.b;return a===b||a.connection&&(a.connection===b.connection||a.connection.fingerprint&&a.connection.fingerprint===b.connection?.fingerprint)||authority(state.roots.a,state.roots.b);}
function rootPath(endpoint,root){return typeof endpoint.root==='string'?endpoint.root:root.path;}
function localRootsOverlap(a,b,platform=process.platform){const paths=platform==='win32'?path.win32:path.posix;if(!paths.isAbsolute(a)||!paths.isAbsolute(b))throw Error('Choose absolute local root paths.');const contains=(root,child)=>{const relative=paths.relative(root,child);return relative===''||relative!=='..'&&!relative.startsWith('..'+paths.sep)&&!paths.isAbsolute(relative);};return contains(a,b)||contains(b,a);}
function prohibitOverlap(state,files,directories){
 const source=state.endpoints[state.side],destination=state.endpoints[state.other],a=rootPath(source,state.roots[state.side]),b=rootPath(destination,state.roots[state.other]);
 const local=state.kinds.a==='local'&&state.kinds.b==='local';
 if(local?localRootsOverlap(a,b):sameStorage(state)&&overlap(a,b))throw Error('Recursive copy roots overlap. Choose separate source and destination trees.');
 const strongSourceEntries=files.filter(item=>item.sourceObservation.metadata.strongRevision===true);if(new Set(strongSourceEntries.map(item=>item.sourceObservation.metadata.identity)).size!==strongSourceEntries.length)throw Error('Selected source files alias one another.');
 const strongSources=new Set(files.filter(item=>item.sourceObservation.metadata.strongRevision===true).map(item=>item.sourceObservation.metadata.identity));
 for(const entry of state.observations.inventories[state.other].entries)if(entry.metadata.strongRevision===true&&strongSources.has(entry.metadata.identity))throw Error('A destination aliases a selected source file.');
 const targets=new Set();for(const item of [...files,...directories]){if(targets.has(item.target))throw Error('Duplicate recursive copy target.');targets.add(item.target);}
}
async function prepareRecursiveProviderCopy(service,side,selections,options={}){
 const inventory=await prepareProviderCopyInventory(service,side,selections,options),observations=getProviderCopyInventoryObservations(inventory),other=side==='a'?'b':'a';
 const state={service,side,other,inventory,observations,kinds:options.endpointKinds||{a:'local',b:'local'},endpoints:{a:service.endpoint('a'),b:service.endpoint('b')},roots:Object.fromEntries(sides.map(s=>[s,observations.inventories[s].root])),files:[],directories:[],revoked:false,executing:false};
 const metadata=Object.fromEntries(sides.map(s=>[s,new Map(observations.inventories[s].entries.map(entry=>[entry.path,entry.metadata]))]));
 let totalBytes=0;
 for(const mapping of inventory.selectedMappings){live(state,options.signal);const sourceObservation=await snapshotProviderFile(state.endpoints[side],mapping.source,{signal:options.signal});if(!same(sourceObservation.metadata,metadata[side].get(mapping.source)))throw stale();const targetInfo=metadata[other].get(mapping.target),targetObservation=targetInfo?await snapshotProviderFile(state.endpoints[other],mapping.target,{signal:options.signal}):null;if(targetObservation&&!same(targetObservation.metadata,targetInfo))throw stale();const action=targetObservation?.sha256===sourceObservation.sha256?'skip':'copy';if(action==='copy'){if(totalBytes>Number.MAX_SAFE_INTEGER-sourceObservation.byteLength)throw Error('Copy byte total exceeds safe range.');totalBytes+=sourceObservation.byteLength;}state.files.push({...mapping,action,sourceObservation,targetObservation});}
 for(const directory of inventory.requiredDirectories)if(!directory.exists)state.directories.push({...directory,sourceMetadata:directory.source?metadata[side].get(directory.source):{kind:'directory',mode:0o700}});
 state.filesByTarget=new Map(state.files.map(item=>[item.target,item]));state.directoriesByTarget=new Map(state.directories.map(item=>[item.target,item]));
 prohibitOverlap(state,state.files,state.directories);await revalidateProviderCopyInventory(inventory,{signal:options.signal});live(state,options.signal);
 const operations=[...state.directories.map(item=>({action:'create-directory',source:item.source,target:item.target})),...state.files.map(item=>({action:item.action,source:item.source,target:item.target,bytes:item.sourceObservation.byteLength,overwrite:!!item.targetObservation})),...[...state.directories].reverse().map(item=>({action:'finalize-directory',source:item.source,target:item.target}))];
 const plan=freeze({id:randomUUID(),operations,totalBytes,coverage:inventory.coverage});plans.set(plan,state);return plan;
}
async function revalidateRecursiveProviderCopy(plan,{signal}={}){const state=plans.get(plan);if(!state||state.executing)throw Error('Recursive copy preview is unavailable.');live(state,signal);await revalidateProviderCopyInventory(state.inventory,{signal});for(const item of state.files){if(!matches(await snapshotProviderFile(state.endpoints[state.side],item.source,{signal}),item.sourceObservation))throw stale();if(item.targetObservation&&!matches(await snapshotProviderFile(state.endpoints[state.other],item.target,{signal}),item.targetObservation))throw stale();}live(state,signal);}
function revokeRecursiveProviderCopy(plan){const state=plans.get(plan);if(state){state.revoked=true;state.controller?.abort();revokeProviderCopyInventory(state.inventory);plans.delete(plan);}}
function mutableAuthority(inventory){return {excluded:new Set(inventory.exclusions.map(entry=>entry.path)),root:{...inventory.root},metadata:new Map(inventory.entries.filter(e=>e.path).map(e=>[e.path,{...e.metadata}])),namespaces:new Map(inventory.directories.map(dir=>[dir.path,new Map(dir.children.map(child=>[child.name,child.kind]))]))};}
async function inspectDirectory(state,side,relative,signal){const endpoint=state.endpoints[side];return relative?await endpoint.inspectEntry(relative,{signal}):await endpoint.inspectRoot({signal});}
async function checkDirectory(state,side,relative,expected,signal){
 live(state,signal);const prior=relative?expected.metadata.get(relative):expected.root,current=await inspectDirectory(state,side,relative,signal);if(!same(current,prior))throw stale();
 const names=expected.namespaces.get(relative);if(!names)throw stale();const seen=new Set();for await(const child of state.endpoints[side].enumerateDirectory(relative,{signal})){live(state,signal);if(names.get(child.name)!==child.kind||seen.has(child.name))throw stale();seen.add(child.name);}if(seen.size!==names.size)throw stale();
 for(const [name,kind] of names){if(!['file','directory'].includes(kind))continue;const child=relative?relative+'/'+name:name;if(expected.excluded.has(child))continue;const observed=await state.endpoints[side].inspectEntry(child,{signal});if(!same(observed,expected.metadata.get(child)))throw stale();}
 const after=await inspectDirectory(state,side,relative,signal);if(!same(after,prior))throw stale();live(state,signal);
}
async function checkBefore(state,target,sourceAuthority,destinationAuthority,signal,{finalizing=false,source=null,directory=false}={}){
 live(state,signal);
 // Full inventory and exact eligibility evidence were revalidated after backup.
 // Before each mutation check the current source and destination ancestry; do
 // not rehash the entire batch for every file. Leaf writers rehash their file.
 let current=source?(directory?source:parent(source)):'';while(true){await checkDirectory(state,state.side,current,sourceAuthority,signal);if(!current)break;current=parent(current);}
 current=finalizing?target:parent(target);while(true){await checkDirectory(state,state.other,current,destinationAuthority,signal);if(!current)break;current=parent(current);}
 live(state,signal);
}
async function adoptPublication(state,target,metadata,expected,signal,{directory=false}={}){
 if(!metadata||metadata.path!==target||metadata.kind!==(directory?'directory':'file'))throw stale();
 expected.metadata.set(target,{...metadata});const enclosing=parent(target),names=expected.namespaces.get(enclosing);if(!names)throw stale();names.set(path.posix.basename(target),metadata.kind);if(directory&&!expected.namespaces.has(target))expected.namespaces.set(target,new Map());
 // Only this operation's parent timestamp change is adopted. Other metadata
 // and the entire observed child namespace must still match the review.
 const prior=enclosing?expected.metadata.get(enclosing):expected.root,current=await inspectDirectory(state,state.other,enclosing,signal);if(!stable(current,prior))throw stale();if(enclosing)expected.metadata.set(enclosing,{...current});else expected.root={...current};
 await checkDirectory(state,state.other,enclosing,expected,signal);
}
async function executeRecursiveProviderCopy(plan,{backupRoot,writeFile,prepareDirectory,createDirectory,finalizeDirectory,signal,onProgress}={}){
 const state=plans.get(plan);if(!state||state.executing)throw Error('Recursive copy preview is unavailable.');if(![writeFile,prepareDirectory,createDirectory,finalizeDirectory].every(callback=>typeof callback==='function')||onProgress!==undefined&&typeof onProgress!=='function')throw Error('Choose trusted native recursive copy adapters.');
 state.executing=true;const controller=new AbortController();state.controller=controller;const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const workSignal=controller.signal;
 const result={completed:0,skipped:0,backupPath:null,items:plan.operations.map(op=>({...op,status:'unattempted'}))};let index=-1,acknowledged=false,attempted=false;
 const sourceAuthority=mutableAuthority(state.observations.inventories[state.side]),destinationAuthority=mutableAuthority(state.observations.inventories[state.other]),owned=new Map();state.updatedEvidence=new Map();let leavesVerified=false,verificationCheckpoint=false;
 const verifyLeaves=async()=>{if(leavesVerified)return;verificationCheckpoint=true;for(const item of state.files){live(state,workSignal);const expected=state.updatedEvidence.get(item.target)||item.targetObservation;if(!expected)throw stale();if(!matches(await snapshotProviderFile(state.endpoints[state.other],item.target,{signal:workSignal}),expected))throw stale();}leavesVerified=true;verificationCheckpoint=false;};
 const progress=()=>{try{const p=onProgress?.({completed:result.completed,skipped:result.skipped,total:result.items.length});p?.catch?.(()=>{});}catch{}};
 try{
  live(state,workSignal);await revalidateProviderCopyInventory(state.inventory,{signal:workSignal});
  const replacements=state.files.filter(item=>item.action==='copy'&&item.targetObservation).map(item=>({path:item.target,observation:item.targetObservation}));
  if(replacements.length){const backup=await backupProviderFiles(state.endpoints[state.other],replacements,backupRoot,{signal:workSignal,maxFiles:50000});result.backupPath=backup.backupPath;result.manifestPath=backup.manifestPath;result.recoveryDurability=backup.durability;result.recoveryWarning=backup.durabilityWarning;}
  await revalidateProviderCopyInventory(state.inventory,{signal:workSignal});live(state,workSignal);
  for(index=0;index<plan.operations.length;index++){
   acknowledged=false;attempted=false;const operation=plan.operations[index],entry=result.items[index];live(state,workSignal);
   await checkBefore(state,operation.target,sourceAuthority,destinationAuthority,workSignal,{finalizing:operation.action==='finalize-directory',source:operation.source,directory:operation.action.endsWith('directory')});live(state,workSignal);
   if(operation.action==='finalize-directory')await verifyLeaves();
   if(operation.action==='create-directory'){
    const prepared=await prepareDirectory({destination:state.endpoints[state.other],targetPath:operation.target,signal:workSignal});
    // Preparing a primitive cannot refresh away reviewed ancestry changes.
    await checkBefore(state,operation.target,sourceAuthority,destinationAuthority,workSignal,{source:operation.source,directory:true});live(state,workSignal);
    attempted=true;const created=await createDirectory({prepared,signal:workSignal});acknowledged=true;if(!created?.observation?.metadata||created.observation.metadata.path!==operation.target||created.observation.metadata.kind!=='directory'||typeof created.observation.metadata.identity!=='string'||!created.observation.metadata.identity||typeof created.observation.metadata.stamp!=='string'||!created.observation.metadata.stamp||!authority(created.observation.root,state.roots[state.other]))throw Object.assign(Error('Native directory creation did not return verified authority.'),{code:'DIRECTORY_OUTCOME_UNKNOWN'});owned.set(operation.target,created);entry.created=true;entry.status='completed';result.completed++;progress();
    if(workSignal.aborted||state.revoked)continue;
    await adoptPublication(state,operation.target,created?.observation?.metadata,destinationAuthority,workSignal,{directory:true});entry.created=true;
   }else if(operation.action==='finalize-directory'){
    const directory=state.directoriesByTarget.get(operation.target),expectedChildren=[...destinationAuthority.namespaces.get(operation.target)].map(([name,kind])=>{const metadata=destinationAuthority.metadata.get(operation.target+'/'+name);return {name,kind,identity:metadata?.identity,stamp:metadata?.stamp};});
    attempted=true;const finished=await finalizeDirectory({created:owned.get(operation.target),sourceMetadata:directory.sourceMetadata,expectedChildren,signal:workSignal});acknowledged=true;
    const metadata=finished?.observation?.metadata;if(!metadata||metadata.path!==operation.target||metadata.kind!=='directory'||!metadata.identity||metadata.identity!==destinationAuthority.metadata.get(operation.target)?.identity||typeof metadata.stamp!=='string'||!metadata.stamp||!authority(finished.observation.root,state.roots[state.other]))throw stale();destinationAuthority.metadata.set(operation.target,{...metadata});entry.created=true;entry.metadataApplied=true;if(finished.metadataWarning)entry.metadataWarning=String(finished.metadataWarning);
   }else{
    const item=state.filesByTarget.get(operation.target);const source=await snapshotProviderFile(state.endpoints[state.side],item.source,{signal:workSignal});if(!matches(source,item.sourceObservation))throw stale();
    if(operation.action==='skip'){const target=await snapshotProviderFile(state.endpoints[state.other],item.target,{signal:workSignal});if(!matches(target,item.targetObservation))throw stale();entry.status='skipped';result.skipped++;progress();continue;}
    attempted=true;const written=await writeFile({source:state.endpoints[state.side],sourcePath:item.source,sourceObservation:item.sourceObservation,destination:state.endpoints[state.other],targetPath:item.target,targetObservation:item.targetObservation,signal:workSignal});acknowledged=true;
    if(written?.sha256!==item.sourceObservation.sha256||written?.byteLength!==item.sourceObservation.byteLength||!written.observation?.metadata||written.observation.metadata.path!==item.target||written.observation.metadata.kind!=='file'||written.observation.sha256!==item.sourceObservation.sha256||written.observation.byteLength!==item.sourceObservation.byteLength||written.observation.metadata.size!==written.byteLength||typeof written.observation.metadata.identity!=='string'||!written.observation.metadata.identity||typeof written.observation.metadata.stamp!=='string'||!written.observation.metadata.stamp||!authority(written.observation.root,state.roots[state.other]))throw Object.assign(Error('Native file publication did not return verified evidence.'),{code:'TRANSFER_OUTCOME_UNKNOWN'});
    state.updatedEvidence.set(item.target,written.observation);entry.published=true;entry.status='completed';result.completed++;progress();if(written.cleanupWarning)entry.cleanupWarning=String(written.cleanupWarning);
    if(workSignal.aborted||state.revoked)continue;
    await adoptPublication(state,item.target,written.observation.metadata,destinationAuthority,workSignal);entry.published=true;if(written.cleanupWarning)entry.cleanupWarning=String(written.cleanupWarning);
   }
   if(entry.status==='unattempted'){entry.status='completed';result.completed++;progress();}
  }
  await verifyLeaves();return result;
 }catch(cause){
  if(verificationCheckpoint)result.finalVerificationError=String(cause.message||cause);
  result.failed=true;if(workSignal.aborted)result.cancelled=true;
  if(!verificationCheckpoint&&index>=0&&index<result.items.length&&result.items[index].status==='unattempted'&&(attempted||!workSignal.aborted)){const entry=result.items[index];entry.status=/OUTCOME_UNKNOWN$/.test(cause.code)?'unknown':acknowledged||/VERIFICATION_FAILED$/.test(cause.code)?'verification-failed':'failed';entry.error=String(cause.message||cause);for(const key of ['created','metadataSubmitted','metadataMayHaveChanged','acknowledged','metadataApplied'])if(cause[key]!==undefined)entry[key]=cause[key];if(entry.status==='unknown'&&entry.action==='copy')entry.published=null;
   if(entry.status!=='unknown'&&(acknowledged||entry.status==='verification-failed')){if(entry.action==='copy')entry.published=true;else entry.created=true;}if(entry.status==='unknown'&&entry.action==='create-directory')entry.created=null;}
  result.backupPath??=cause.backupPath||null;throw Object.assign(Error(String(cause.message||cause),{cause}),{code:cause.code||'RECURSIVE_COPY_FAILED',outcome:result,backupPath:result.backupPath,completed:result.completed});
 }finally{signal?.removeEventListener('abort',abort);plans.delete(plan);revokeProviderCopyInventory(state.inventory);state.controller=null;}
}
module.exports={localRootsOverlap,prepareRecursiveProviderCopy,revalidateRecursiveProviderCopy,revokeRecursiveProviderCopy,executeRecursiveProviderCopy};
