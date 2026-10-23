'use strict';
const path=require('node:path').posix;
const {randomUUID}=require('node:crypto');
const {snapshotProviderFile}=require('./provider-file-snapshot.cjs');
const {backupProviderFiles}=require('./provider-transfer-backup.cjs');
const {checkSignal}=require('./local-folder-reader.cjs');
const states=new WeakMap();
const failure=(code,message)=>Object.assign(Error(message),{code});
const stale=()=>failure('STALE_SOURCE','The reviewed file or enclosing folder changed. Review the rename again.');
const valid=p=>typeof p==='string'&&p.length>0&&p.length<=32768&&!/[\\\0]/.test(p)&&!p.split('/').some(part=>!part||part==='.'||part==='..');
const scalar=value=>Object.freeze(Object.fromEntries(Object.entries(value).filter(([,v])=>v===null||['string','number','boolean'].includes(typeof v))));
const same=(a,b,keys)=>!!a&&!!b&&keys.every(key=>a[key]===b[key]);
const authorityKeys=['path','identity','kind','mode','uid','gid'];
function directory(value,relative){if(!value||typeof value.path!=='string'||!value.path||typeof value.identity!=='string'||!value.identity||typeof value.stamp!=='string'||!value.stamp||relative!==undefined&&(value.path!==relative||value.kind!=='directory')||relative===undefined&&value.kind!==undefined&&value.kind!=='directory')throw stale();return scalar(value);}
function live(state,signal){checkSignal(signal);if(state.revoked)throw failure('ABORT_ERR','The rename review was cancelled.');if(state.provider.revoked||state.connection.closed||state.provider.connection!==state.connection||state.provider.root!==state.canonicalRoot)throw stale();}
async function authority(state,signal,after=false){
 live(state,signal);const root=directory(await state.provider.inspectRoot({signal}));if(!same(root,state.root,after?authorityKeys:[...authorityKeys,'stamp']))throw stale();
 for(const parent of state.parents){const current=directory(await state.provider.inspectEntry(parent.path,{signal}),parent.path);if(!same(current,parent,after?authorityKeys:[...authorityKeys,'stamp']))throw stale();}live(state,signal);
}
function matches(current,prior){return same(current.root,prior.root,['path','identity'])&&same(current.metadata,prior.metadata,['path','identity','kind','stamp','size','mode','uid','gid','mtime','mtimeNs'])&&current.sha256===prior.sha256&&current.byteLength===prior.byteLength;}
async function baseline(state,signal){await authority(state,signal);if(!matches(await snapshotProviderFile(state.provider,state.source,{signal}),state.observation))throw stale();if(await state.provider.inspectEntry(state.target,{signal})!==null)throw failure('DESTINATION_EXISTS','The new filename already exists. Choose another name.');await authority(state,signal);}
// Native retained review only. SFTP v3 cannot condition rename on an inode/hash:
// final path races and indistinguishable same-attribute replacements remain.
async function prepareSftpRename(provider,source,target,{signal}={}){
 checkSignal(signal);
 if(!provider||!['inspectRoot','inspectEntry','openFileReader','request'].every(key=>typeof provider[key]==='function')||!provider.connection||typeof provider.root!=='string'||!provider.root.startsWith('/')||path.normalize(provider.root)!==provider.root||/[\\\0]/.test(provider.root)||!valid(source)||!valid(target)||source===target||path.dirname(source)!==path.dirname(target))throw Error('Choose one regular file and a different filename in the same SFTP folder.');
 const state={provider,connection:provider.connection,canonicalRoot:provider.root,source,target,revoked:false,used:false,controller:null,parents:[]};live(state,signal);
 state.root=directory(await provider.inspectRoot({signal}));let parent=path.dirname(source);
 while(parent!=='.'){state.parents.push(directory(await provider.inspectEntry(parent,{signal}),parent));parent=path.dirname(parent);}
 const observation=await snapshotProviderFile(provider,source,{signal});state.observation=Object.freeze({...observation,root:scalar(observation.root),metadata:scalar(observation.metadata)});
 await baseline(state,signal);
 const plan=Object.freeze({id:randomUUID(),source,target,bytes:observation.byteLength,sha256:observation.sha256});states.set(plan,state);return plan;
}
function revokeSftpRename(plan){const state=states.get(plan);if(state){state.revoked=true;state.controller?.abort();}}
async function executeSftpRename(plan,{backupRoot,signal}={}){
 const state=states.get(plan);if(!state||state.used||state.revoked)throw failure('INVALID_RENAME_PLAN','The rename review is expired or already used.');state.used=true;
 const controller=new AbortController();state.controller=controller;const abort=()=>controller.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});const operationSignal=controller.signal;
 let backup=null,submitted=false,acknowledged=false;
 try{
  await baseline(state,operationSignal);
  backup=await backupProviderFiles(state.provider,[{path:state.source,observation:state.observation}],backupRoot,{signal:operationSignal});
  await baseline(state,operationSignal);live(state,operationSignal);
  // Standard SFTP v3 RENAME is no-replace on compliant servers. Never use the
  // OpenSSH replacement extension, unlink, retry or cleanup after submission.
  submitted=true;await state.provider.request('rename',[path.join(state.canonicalRoot,state.source),path.join(state.canonicalRoot,state.target)],{signal:operationSignal});acknowledged=true;
  await authority(state,operationSignal,true);if(await state.provider.inspectEntry(state.source,{signal:operationSignal})!==null)throw stale();
  const observation=await snapshotProviderFile(state.provider,state.target,{signal:operationSignal});
  if(!same(observation.root,state.root,['path','identity'])||observation.sha256!==state.observation.sha256||observation.byteLength!==state.observation.byteLength||!same(observation.metadata,state.observation.metadata,['kind','size','mode','uid','gid','mtime','mtimeNs']))throw stale();
  if(await state.provider.inspectEntry(state.source,{signal:operationSignal})!==null)throw stale();await authority(state,operationSignal,true);
  return {source:state.source,target:state.target,observation,sha256:observation.sha256,byteLength:observation.byteLength,backupPath:backup.backupPath,manifestPath:backup.manifestPath,recoveryDurability:backup.durability,recoveryWarning:backup.durabilityWarning,submitted:true,acknowledged:true,renamed:true};
 }catch(cause){
  const unknown=submitted&&!acknowledged&&(!Number.isInteger(cause.code)||cause.code===6||cause.code===7);
  const error=acknowledged?failure('RENAME_VERIFICATION_FAILED','The server acknowledged the rename, but verification failed. Inspect both paths before retrying.'):unknown?failure('RENAME_OUTCOME_UNKNOWN','The rename outcome is unknown. Inspect both paths; do not retry automatically.'):cause;
  throw Object.assign(error,{source:state.source,target:state.target,submitted,acknowledged,renamed:acknowledged?true:unknown?null:false,backupPath:backup?.backupPath||cause.backupPath||null,manifestPath:backup?.manifestPath||cause.manifestPath||null,recoveryDurability:backup?.durability||cause.recoveryDurability,recoveryWarning:backup?.durabilityWarning||cause.recoveryWarning});
 }finally{signal?.removeEventListener('abort',abort);state.controller=null;}
}
module.exports={prepareSftpRename,executeSftpRename,revokeSftpRename};
