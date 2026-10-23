'use strict';
const {randomUUID}=require('node:crypto'),path=require('node:path');
const {planWindowsExplorerLifecycle:plan,snapshotDigest:digest}=require('./windows-explorer-lifecycle.cjs');
const MUTATIONS=new Set(['write-owned-config-values','register-sparse-package','remove-package','remove-owned-config-values']);
const OWNED=['LeftHint','PackageFullName','PackageFamilyName','Executable','OwnerVersion'];
function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
const capture=value=>freeze(structuredClone(value));
const equal=(a,b)=>digest({value:a})===digest({value:b});
const samePath=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
function noOwnedConfig(snapshot){const config=snapshot.observed.config;return !config.exists||Object.keys(config.values||{}).every(name=>!OWNED.some(owned=>owned.toLowerCase()===name.toLowerCase()));}
function installed(snapshot){const e=snapshot.expected,o=snapshot.observed,id=e.identity,pkgs=o.packages.filter(p=>p.familyName===id.familyName),values=o.config.values||{};return o.config.exists&&pkgs.length===1&&pkgs[0].verified===true&&pkgs[0].fullName===id.fullName&&pkgs[0].publisher===id.publisher&&pkgs[0].architecture===id.architecture&&samePath(pkgs[0].externalLocation,path.win32.dirname(e.executable))&&equal(values.OwnerVersion,{type:'DWORD',value:1})&&equal(values.Executable,{type:'REG_SZ',value:e.executable})&&equal(values.PackageFamilyName,{type:'REG_SZ',value:id.familyName})&&equal(values.PackageFullName,{type:'REG_SZ',value:id.fullName});}
function absent(snapshot){return snapshot.observed.conflicts.length===0&&noOwnedConfig(snapshot)&&!snapshot.observed.packages.some(p=>p.familyName===snapshot.expected.identity.familyName);}
function unknownPreserved(before,after,names){const a=before.observed.config.values||{},b=after.observed.config.values||{};return Object.keys(a).filter(k=>!names.includes(k)).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));}
function postcondition(step,before,after){const o=after.observed,values=o.config.values||{};
 switch(step.kind){
 case 'write-owned-config-values':return o.config.exists&&Object.entries(step.values).every(([k,v])=>equal(values[k],v))&&(!step.clearHint||!Object.hasOwn(values,'LeftHint'))&&unknownPreserved(before,after,[...Object.keys(step.values),...(step.clearHint?['LeftHint']:[])]);
 case 'register-sparse-package':return installed(after);
 case 'remove-package':return !o.packages.some(p=>p.fullName===step.fullName);
 case 'remove-owned-config-values':return Object.keys(values).every(k=>!step.names.some(n=>n.toLowerCase()===k.toLowerCase()))&&unknownPreserved(before,after,step.names);
 default:return false;
 }
}
/** Injected orchestration only: callbacks own real inspection, guarded mutation and durable storage. */
function createWindowsExplorerLifecycleRunner({inspect,execute,persistJournal,discoverJournals,maxSteps=16}){
 if(discoverJournals!==undefined&&typeof discoverJournals!=='function')throw Error('Invalid Explorer recovery discovery dependency.');
 if([inspect,execute,persistJournal].some(fn=>typeof fn!=='function')||!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>64)throw Error('Invalid Explorer lifecycle runner dependencies.');
 let tail=Promise.resolve();
 async function perform(request){
  const {action,expected,reviewedSnapshotDigest}=request,bindingDigest=digest(expected),operationId=randomUUID();let current=null,currentPlan=null,initialRecovery=null,attempted=0,journal=null;
  const result=(outcome,reason,extra={})=>({completed:outcome==='completed',outcome,reason,activation:'unknown',attemptedMutations:attempted,snapshot:current,plan:currentPlan,recovery:initialRecovery,...extra});
  const observe=async()=>{const value=capture(await inspect(expected));if(!value||!equal(value.expected,expected))throw Error('Expected installation evidence changed.');const config=value.observed?.config;if(config?.values!==undefined&&(!config.values||typeof config.values!=='object'||Array.isArray(config.values))||config?.exists===false&&Object.keys(config.values||{}).length)throw Error('Inconsistent observed configuration.');plan('status',value);return value;};
  const persist=async event=>{journal.events.push(event);await persistJournal(capture(journal));};
  try{
   current=await observe();currentPlan=plan(action,current);initialRecovery=currentPlan.recovery||null;
   if(action==='status'){if(discoverJournals){try{return result('completed','status-only',{recoveryHistory:capture(await discoverJournals())});}catch(error){return result('blocked','recovery-discovery-failed',{error:error.message,recoveryHistory:null});}}return result('completed','status-only');}
   if(typeof reviewedSnapshotDigest!=='string'||reviewedSnapshotDigest!==digest(current))return result('blocked','stale-review');
   journal={version:1,operationId,action,bindingDigest,reviewedSnapshotDigest,expected,initialSnapshot:current,recovery:initialRecovery,events:[]};
   const seen=new Set();
   for(let iteration=0;iteration<=maxSteps;iteration++){
    currentPlan=plan(action,current);
    // Unknown values may legitimately remain after removing our ownership fields.
    const finalAbsent=action==='uninstall'&&absent(current);
    if(!currentPlan.allowed&&!finalAbsent)return result(attempted?'partial':'blocked','policy-conflict');
    const step=finalAbsent?null:currentPlan.steps.find(s=>MUTATIONS.has(s.kind));
    if(!step){
     current=await observe();currentPlan=plan(action,current);
     const verified=action==='uninstall'?absent(current):currentPlan.allowed&&installed(current)&&!currentPlan.steps.some(s=>MUTATIONS.has(s.kind));
     if(!verified)return result(attempted?'partial':'blocked','verification-mismatch');
     if(attempted)await persist({phase:'verified',snapshotDigest:digest(current)});
     return result('completed','verified-postconditions');
    }
    if(iteration===maxSteps)return result('partial','step-limit');
    const before=current,signature=digest(before);
    if(seen.has(signature))return result(attempted?'partial':'blocked','no-progress');seen.add(signature);
    try{await persist({phase:'before-mutation',step:capture(step),snapshotDigest:signature});}catch(error){return result(attempted?'partial':'blocked','journal-failed',{error:error.message});}
    // Journaling may take time. Recheck immediately before handing off the guarded step.
    current=await observe();if(digest(current)!==signature)return result(attempted?'partial':'blocked','state-changed-before-mutation');
    let failure=null;attempted++;
    try{const response=await execute(capture(step),capture({operationId,bindingDigest,snapshotDigest:signature,expected}));if(response===false||response?.ok===false)throw Error('Mutation adapter reported failure.');}catch(error){failure=error;}
    try{current=await observe();}catch(error){try{await persist({phase:'inspection-failed',step:step.kind,error:error.message});}catch{}return result('partial','post-mutation-inspection-failed',{error:error.message});}
    try{await persist({phase:'after-mutation',step:step.kind,snapshotDigest:digest(current),reportedFailure:!!failure});}catch(error){return result('partial','journal-failed',{error:error.message});}
    currentPlan=plan(action,current);
    if(failure)return result('partial','mutation-reported-failure',{error:failure.message});
    if(!postcondition(step,before,current))return result('partial','postcondition-mismatch');
    if(digest(current)===signature)return result('partial','no-progress');
   }
  }catch(error){return result(attempted?'partial':'blocked','inspection-or-validation-failed',{error:error.message});}
 }
 return {run(options){const request=capture(options);if(!['status','install','repair','uninstall'].includes(request.action)||!request.expected)throw Error('Invalid lifecycle request.');const next=tail.then(()=>perform(request));tail=next.catch(()=>{});return next;}};
}
module.exports={createWindowsExplorerLifecycleRunner};
