'use strict';
const {randomBytes}=require('node:crypto');
const {planWindowsExplorerLifecycle:plan,snapshotDigest}=require('./windows-explorer-lifecycle.cjs');
const {createWindowsExplorerLifecycleRunner}=require('./windows-explorer-lifecycle-runner.cjs');
const ACTIONS=new Set(['install','repair','uninstall']);
const LABELS=Object.freeze({'write-owned-config-values':'Update this installation’s menu settings','remove-owned-config-values':'Remove this installation’s menu settings','register-sparse-package':'Register the verified Explorer menu package','remove-package':'Remove the currently owned Explorer menu package','verify-registration':'Verify package registration','verify-config':'Verify installation settings','verify-absent':'Verify removal'});
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const copy=value=>freeze(structuredClone(value));
/** Application orchestration only. Instantiate solely behind a trusted release
 * eligibility gate. inspect must supply authoritative private snapshots; the
 * existing inspection-only evidence adapter is deliberately not compatible.
 * Renderer callers provide only an action or an opaque one-use review token.
 */
function createWindowsExplorerLifecycleService({inspect,execute,journal,now=Date.now,reviewTtlMs=60000}={}){
 if(typeof inspect!=='function'||typeof execute!=='function'||typeof journal?.persist!=='function'||typeof journal?.discover!=='function'||typeof now!=='function'||!Number.isInteger(reviewTtlMs)||reviewTtlMs<1||reviewTtlMs>300000)throw Error('Invalid Explorer lifecycle service dependencies.');
 let closed=false,tail=Promise.resolve(),reviewed=null,lastTime=-Infinity;
 const unavailable=()=>Error('Explorer lifecycle service is unavailable.');
 const check=()=>{if(closed)throw unavailable();};
 const time=()=>{const value=now();if(!Number.isSafeInteger(value)||value<lastTime){reviewed=null;throw Error('Explorer review clock is unavailable.');}lastTime=value;return value;};
 const queue=work=>{if(closed)return Promise.reject(unavailable());const next=tail.then(()=>{check();return work();});tail=next.catch(()=>{});return next;};
 async function observe(){check();const value=copy(await inspect());check();if(value?.inspectionOnly===true||value?.verified===false||value?.mutationAuthority===false||!value?.expected||!value?.observed)throw Error('Authoritative Explorer inspection is unavailable.');plan('status',value);return value;}
 async function history(){check();const value=await journal.discover();check();if(!Array.isArray(value?.operations)||value.operations.length>256||!Number.isInteger(value.unresolvedOperations)||value.unresolvedOperations<0||value.unresolvedOperations>value.operations.length)throw Error('Invalid Explorer recovery history.');return {status:'inspected',operationCount:value.operations.length,unresolvedOperations:value.unresolvedOperations};}
 const summary=p=>({state:p.state,allowed:p.allowed===true,registered:p.registered===true,activation:'unknown',steps:p.steps.map(s=>({kind:s.kind,label:LABELS[s.kind]||'Verify Explorer integration'})),requiresRecoveryReview:!!p.recovery?.nonAtomic||p.recovery?.atomic===false});
 const runner=createWindowsExplorerLifecycleRunner({inspect:async()=>observe(),execute:async(step,context)=>{check();return execute(step,context);},persistJournal:async record=>{check();return journal.persist(record);},discoverJournals:()=>history()});
 function status(){return queue(async()=>{try{const snapshot=await observe(),recovery=await history(),p=plan('status',snapshot);const capabilities={status:true,...Object.fromEntries([...ACTIONS].map(action=>[action,plan(action,snapshot).allowed===true]))};return copy({...summary(p),status:p.state,verified:true,inspectionOnly:false,mutationAuthority:[...ACTIONS].some(action=>capabilities[action]),capabilities,recovery});}catch{reviewed=null;return copy({state:'unavailable',status:'unavailable',verified:false,inspectionOnly:true,mutationAuthority:false,allowed:false,registered:false,activation:'unknown',steps:[],capabilities:{status:false,install:false,repair:false,uninstall:false},recovery:{status:'unavailable',operationCount:null,unresolvedOperations:null}});}});}
 function review(action){if(!ACTIONS.has(action))return Promise.reject(Error('Invalid Explorer review action.'));return queue(async()=>{
  reviewed=null;
  try{const snapshot=await observe(),recovery=await history(),p=plan(action,snapshot);if(!p.allowed)return copy({available:false,operation:action,summary:'This Explorer change is unavailable until its conflicts are resolved.',steps:[],reason:'policy-conflict'});
   const created=time(),token=randomBytes(32).toString('hex'),expiresAt=created+reviewTtlMs;if(!Number.isSafeInteger(expiresAt))throw Error('Invalid expiry');
   reviewed={token,action,expected:copy(snapshot.expected),digest:snapshotDigest(snapshot),expiresAt};
   return copy({available:true,operation:action,summary:action==='uninstall'?'Remove this installation’s Explorer menu registration.':action==='repair'?'Repair this installation’s Explorer menu registration.':'Enable this installation’s Explorer menu registration.',steps:summary(p).steps,token,expiresAt,reason:'review-required'});
  }catch{reviewed=null;throw Error('Could not prepare a verified Explorer review. Refresh status and try again.');}
 });}
 function executeReview(token){
  if(closed)return Promise.reject(unavailable());
  // Consume synchronously, before enqueueing: simultaneous clicks cannot replay
  // one review, and renderer-supplied objects never become execution context.
  if(typeof token!=='string'||token.length!==64||!reviewed||reviewed.token!==token)return Promise.reject(Error('Explorer review is missing or already used.'));
  const request=reviewed;reviewed=null;
  return queue(async()=>{
   try{if(time()>=request.expiresAt)return copy({completed:false,outcome:'blocked',reason:'review-expired',activation:'unknown',attemptedMutations:0});
    const result=await runner.run({action:request.action,expected:request.expected,reviewedSnapshotDigest:request.digest});
    let recovery;try{recovery=await history();}catch{recovery={status:'failed',operationCount:null,unresolvedOperations:null};}
    return copy({completed:result.completed===true,outcome:result.outcome,reason:result.reason,activation:'unknown',attemptedMutations:result.attemptedMutations,...(result.plan?{assessment:summary(result.plan)}:{}),recovery});
   }catch{reviewed=null;return copy({completed:false,outcome:'blocked',reason:'inspection-or-validation-failed',activation:'unknown',attemptedMutations:0});}
  });
 }
 return Object.freeze({status,review,executeReview,dispose(){closed=true;reviewed=null;}});
}
module.exports={createWindowsExplorerLifecycleService};
