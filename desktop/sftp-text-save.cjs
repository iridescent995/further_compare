'use strict';
const {createHash,randomUUID}=require('node:crypto');
const path=require('node:path').posix;
const {MAX_TEXT_BYTES}=require('./sessions.cjs');
const {checkSignal}=require('./local-folder-reader.cjs');
const {snapshotProviderFile}=require('./provider-file-snapshot.cjs');
const preparedSaves=new WeakMap();
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code,message)=>Object.assign(Error(message),{code});
const sameAuthority=(a,b)=>!!a&&!!b&&a.path===b.path&&a.identity===b.identity;
const sameFile=(a,b)=>sameAuthority(a,b)&&a.stamp===b.stamp&&a.kind===b.kind&&a.size===b.size;
const validRelative=value=>typeof value==='string'&&value.length>0&&value.length<=32768&&!/[\\\0]/.test(value)&&!value.split('/').some(part=>!part||part==='.'||part==='..');
function fileMetadata(info,relative){
 if(!info||info.path!==relative||info.kind!=='file'||typeof info.identity!=='string'||!info.identity||typeof info.stamp!=='string'||!info.stamp||!Number.isSafeInteger(info.size)||info.size<0||info.size>MAX_TEXT_BYTES||!Number.isSafeInteger(info.mode)||info.mode<0||info.mode>0xffffffff)throw fail('STALE_SOURCE','Choose an unchanged regular remote text file.');
 return {...info};
}
function rootMetadata(info){if(!info||typeof info.path!=='string'||!info.path||typeof info.identity!=='string'||!info.identity)throw fail('STALE_SOURCE','The selected remote root changed.');return {...info};}
async function readSnapshot(provider,relative,{signal}={}){
 const snapshot=await snapshotProviderFile(provider,relative,{signal,maxBytes:MAX_TEXT_BYTES});
 return {root:rootMetadata(snapshot.root),metadata:fileMetadata(snapshot.metadata,relative),sha256:snapshot.sha256};
}
function compareBaseline(current,baseline){if(!sameAuthority(current.root,baseline.root)||!sameFile(current.metadata,baseline.metadata)||current.sha256!==baseline.sha256)throw fail('STALE_SOURCE','The server file changed. Reopen and compare it before saving.');}
function checkCapability(provider){if(provider?.connection?.capabilities?.atomicRename!==true)throw fail('ATOMIC_RENAME_UNAVAILABLE','This server does not support atomic replacement. Save a local copy instead.');if(provider.connection.closed||provider.revoked)throw fail('CONNECTION_CLOSED','SFTP connection closed. Reconnect and reopen the file.');}
async function prepareSftpTextSave(origin,bytes,{signal}={}){
 checkSignal(signal);
 if(!origin?.provider||!validRelative(origin.relative)||!origin.observation||!/^[a-f0-9]{64}$/.test(origin.observation.sha256||'')||!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_TEXT_BYTES)throw Error('Choose a remote text input and output smaller than 10 MB.');
 const provider=origin.provider;checkCapability(provider);
 if(!['inspectRoot','inspectEntry','openFileReader','request','metadata','closeHandle'].every(key=>typeof provider[key]==='function')||typeof provider.root!=='string'||!provider.root.startsWith('/')||path.normalize(provider.root)!==provider.root)throw Error('Choose a connected remote folder.');
 const relative=origin.relative,baseline={root:rootMetadata(origin.observation.root),metadata:fileMetadata(origin.observation.metadata,relative),sha256:origin.observation.sha256},output=Buffer.from(bytes);
 compareBaseline(await readSnapshot(provider,relative,{signal}),baseline);checkSignal(signal);
 const prepared=Object.freeze({byteLength:output.length,sha256:digest(output)});
 preparedSaves.set(prepared,{provider,relative,baseline,output,root:provider.root});return prepared;
}
async function commitSftpTextSave(prepared,{signal}={}){
 const plan=preparedSaves.get(prepared);if(!plan)throw fail('INVALID_SAVE_PLAN','Review the remote save again.');preparedSaves.delete(prepared);
 const {provider,relative,baseline,output,root}=plan;let handle=null,owned=false,published=false,renameSubmitted=false,stageObservation=null;
 const parent=path.dirname(relative),stageRelative=(parent==='.'?'':parent+'/')+'.further-compare-'+randomUUID()+'.tmp',stagePath=path.join(root,stageRelative),targetPath=path.join(root,relative);
 try{
  checkSignal(signal);checkCapability(provider);if(provider.root!==root)throw fail('STALE_SOURCE','The selected remote root changed.');
  compareBaseline(await readSnapshot(provider,relative,{signal}),baseline);
  [handle]=await provider.request('open',[stagePath,'wx',0o600],{signal});owned=true;
  if(!Buffer.isBuffer(handle)||!handle.length)throw Error('Invalid remote write handle.');
  for(let offset=0;offset<output.length;offset+=65536){checkSignal(signal);const length=Math.min(65536,output.length-offset);await provider.request('write',[handle,output,offset,length,offset],{signal});}
  const staged=await readSnapshot(provider,stageRelative,{signal});stageObservation=staged.metadata;
  if(staged.sha256!==prepared.sha256||staged.metadata.size!==output.length)throw Error('Staged remote text did not verify.');
  await provider.request('fsetstat',[handle,{mode:baseline.metadata.mode&0o777}],{signal});
  if(provider.connection.capabilities.fsync===true)await provider.request('ext_openssh_fsync',[handle],{signal});
  await provider.closeHandle(handle);handle=null;
  stageObservation=fileMetadata(await provider.inspectEntry(stageRelative,{signal}),stageRelative);
  compareBaseline(await readSnapshot(provider,relative,{signal}),baseline);
  // Detect a changed stage before publishing as well as a changed original.
  const verified=await readSnapshot(provider,stageRelative,{signal});
  if(!sameFile(verified.metadata,stageObservation)||verified.sha256!==prepared.sha256||!sameAuthority(verified.root,baseline.root))throw fail('STALE_SOURCE','The staged remote file changed.');
  // No conditional rename exists in SFTP: this remains an observed stale check,
  // not a guarantee against another writer in the final check/rename interval.
  compareBaseline(await readSnapshot(provider,relative,{signal}),baseline);
  checkSignal(signal);if(provider.root!==root)throw fail('STALE_SOURCE','The selected remote root changed.');renameSubmitted=true;
  await provider.request('ext_openssh_rename',[stagePath,targetPath],{signal});published=true;owned=false;
  const observation=await readSnapshot(provider,relative,{signal});
  if(observation.sha256!==prepared.sha256||observation.metadata.size!==output.length||!sameAuthority(observation.root,baseline.root))throw Error('The saved remote file did not verify.');
  return {observation,sha256:observation.sha256};
 }catch(error){
  if(published)throw fail('SAVE_VERIFICATION_FAILED','The server acknowledged the save, but verification failed. Reopen the server file before saving again.');
  if(renameSubmitted&&(!Number.isInteger(error.code)||error.code===6||error.code===7))throw fail('SAVE_OUTCOME_UNKNOWN','The server save outcome is unknown. Reopen and compare the server file; do not retry automatically.');
  throw error;
 }finally{
  // Capture current owned-handle metadata before closing to avoid removing a
  // visibly replaced stage. Never unlink the original and never retry publish.
  if(handle){try{const [attrs]=await provider.request('fstat',[handle]);stageObservation=provider.metadata(stageRelative,attrs);}catch{}try{await provider.closeHandle(handle);}catch{}handle=null;}
  if(owned&&!provider.connection.closed&&!provider.revoked){try{const current=await provider.inspectEntry(stageRelative);if(stageObservation&&sameFile(current,stageObservation))await provider.request('unlink',[stagePath]);}catch{}}
 }
}
module.exports={prepareSftpTextSave,commitSftpTextSave};
