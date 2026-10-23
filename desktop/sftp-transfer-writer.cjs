'use strict';
const path=require('node:path').posix;
const {randomUUID}=require('node:crypto');
const {snapshotProviderFile}=require('./provider-file-snapshot.cjs');
const {checkSignal}=require('./local-folder-reader.cjs');
const fail=(code,message)=>Object.assign(Error(message),{code});
const stale=()=>fail('STALE_SOURCE','A transfer source, destination or parent changed. Preview the copy again.');
const relative=value=>typeof value==='string'&&value.length>0&&value.length<=32768&&!/[\\\0]/.test(value)&&!value.split('/').some(part=>!part||part==='.'||part==='..');
const authority=(a,b)=>!!a&&!!b&&a.path===b.path&&a.identity===b.identity;
const sameFile=(a,b)=>authority(a,b)&&a.kind===b.kind&&a.stamp===b.stamp&&a.size===b.size;
function rootInfo(value){if(!value||typeof value.path!=='string'||!value.path||typeof value.identity!=='string'||!value.identity)throw stale();return {...value};}
function observation(value,file){if(!value||!value.metadata||value.metadata.path!==file||value.metadata.kind!=='file'||typeof value.metadata.identity!=='string'||!value.metadata.identity||typeof value.metadata.stamp!=='string'||!value.metadata.stamp||!Number.isSafeInteger(value.byteLength)||value.byteLength<0||value.metadata.size!==value.byteLength||!/^[a-f0-9]{64}$/.test(value.sha256||''))throw Error('Choose an approved regular-file transfer observation.');return {root:rootInfo(value.root),metadata:{...value.metadata},sha256:value.sha256,byteLength:value.byteLength};}
const matches=(a,b)=>authority(a.root,b.root)&&sameFile(a.metadata,b.metadata)&&a.sha256===b.sha256&&a.byteLength===b.byteLength;
// Native destination primitive. The caller must complete any required recovery
// backups and user review first; this helper never removes a source file.
async function transferFileToSftp(source,sourceRelative,sourceObservation,destination,targetRelative,targetObservationOrNull,{signal}={}){
 checkSignal(signal);
 if(!relative(sourceRelative)||!relative(targetRelative)||!source||!['inspectRoot','inspectEntry','openFileReader'].every(key=>typeof source[key]==='function')||!destination||!['inspectRoot','inspectEntry','openFileReader','request','metadata','closeHandle'].every(key=>typeof destination[key]==='function')||typeof destination.root!=='string'||!destination.root.startsWith('/')||path.normalize(destination.root)!==destination.root||/[\\\0]/.test(destination.root)||!destination.connection)throw Error('Choose connected source and destination folders.');
 const baseline=observation(sourceObservation,sourceRelative),target=targetObservationOrNull===null?null:observation(targetObservationOrNull,targetRelative),root=destination.root;
 if(target&&destination.connection.capabilities?.atomicRename!==true)throw fail('ATOMIC_RENAME_UNAVAILABLE','This server cannot atomically replace existing files.');
 if(destination.connection.closed||destination.revoked)throw fail('CONNECTION_CLOSED','The destination connection closed.');
 const destinationRoot=rootInfo(await destination.inspectRoot({signal}));if(target&&!authority(destinationRoot,target.root))throw stale();
 const directAlias=source===destination&&sourceRelative===targetRelative||authority(baseline.root,destinationRoot)&&sourceRelative===targetRelative||source.connection&&source.connection===destination.connection&&typeof source.root==='string'&&path.join(source.root,sourceRelative)===path.join(root,targetRelative)||target&&baseline.metadata.strongRevision===true&&target.metadata.strongRevision===true&&baseline.metadata.identity===target.metadata.identity;
 if(directAlias)throw Error('A copy destination cannot alias its source.');
 const parents=[];let parent=path.dirname(targetRelative);
 while(parent!=='.'){checkSignal(signal);const info=await destination.inspectEntry(parent,{signal});if(!info||info.path!==parent||info.kind!=='directory'||typeof info.identity!=='string'||!info.identity)throw Error('Destination parent folders must already exist.');parents.push({...info});parent=path.dirname(parent);}
 const checkDestination=async(cleanup=false)=>{
  const readSignal=cleanup?undefined:signal;checkSignal(readSignal);if(destination.root!==root||!authority(rootInfo(await destination.inspectRoot({signal:readSignal})),destinationRoot))throw stale();
  for(const expected of parents){const actual=await destination.inspectEntry(expected.path,{signal:readSignal});checkSignal(readSignal);if(!actual||actual.kind!=='directory'||!authority(actual,expected))throw stale();}
 };
 const checkTarget=async()=>{await checkDestination();if(target){if(!matches(await snapshotProviderFile(destination,targetRelative,{signal}),target))throw stale();}else if(await destination.inspectEntry(targetRelative,{signal})!==null)throw stale();checkSignal(signal);};
 const checkSource=async()=>{const current=await snapshotProviderFile(source,sourceRelative,{signal});if(!matches(current,baseline))throw stale();};
 const stageRelative=(path.dirname(targetRelative)==='.'?'':path.dirname(targetRelative)+'/')+'.further-transfer-'+randomUUID()+'.tmp',stagePath=path.join(root,stageRelative),targetPath=path.join(root,targetRelative);
 let handle=null,owned=false,stageMetadata=null,submitted=false,published=false;
 try{
  await checkSource();await checkTarget();
  [handle]=await destination.request('open',[stagePath,'wx',0o600],{signal});owned=true;
  if(!Buffer.isBuffer(handle)||!handle.length)throw Error('Invalid remote write handle.');
  await checkDestination();
  const streamed=await snapshotProviderFile(source,sourceRelative,{signal,onChunk:async(chunk,offset)=>{checkSignal(signal);const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk.buffer,chunk.byteOffset,chunk.byteLength);await destination.request('write',[handle,buffer,0,buffer.byteLength,offset],{signal});}});
  if(!matches(streamed,baseline))throw stale();
  const staged=await snapshotProviderFile(destination,stageRelative,{signal});stageMetadata=staged.metadata;
  if(staged.sha256!==baseline.sha256||staged.byteLength!==baseline.byteLength||!authority(staged.root,destinationRoot))throw Error('The staged transfer did not verify.');
  const attributes={},mode=baseline.metadata.mode,mtime=baseline.metadata.mtime;
  if(Number.isSafeInteger(mode)&&mode>=0&&mode<=0xffffffff)attributes.mode=mode&0o777;
  // SFTP v3 encodes access and modification times together. Access time is not
  // preserved: set it to the source modification time when preserving mtime.
  if(Number.isFinite(mtime)&&mtime>=0&&Math.floor(mtime/1000)<=0xffffffff)attributes.atime=attributes.mtime=Math.floor(mtime/1000);
  if(Object.keys(attributes).length)await destination.request('fsetstat',[handle,attributes],{signal});
  if(destination.connection.capabilities?.fsync===true)await destination.request('ext_openssh_fsync',[handle],{signal});
  await destination.closeHandle(handle);handle=null;
  const verified=await snapshotProviderFile(destination,stageRelative,{signal});stageMetadata=verified.metadata;
  if(verified.sha256!==baseline.sha256||verified.byteLength!==baseline.byteLength||!authority(verified.root,destinationRoot))throw Error('The staged transfer did not verify.');
  await checkSource();
  const finalStage=await snapshotProviderFile(destination,stageRelative,{signal});
  if(!sameFile(finalStage.metadata,stageMetadata)||finalStage.sha256!==baseline.sha256||finalStage.byteLength!==baseline.byteLength||!authority(finalStage.root,destinationRoot))throw stale();
  await checkTarget();
  // These checks are observations, not conditional CAS: SFTP has a final
  // external-edit race. New-target rename relies on the compliant SFTP v3
  // no-overwrite contract; malicious/noncompliant servers are not protected.
  // Never use overwrite rename for an approved new target.
  checkSignal(signal);submitted=true;
  await destination.request(target?'ext_openssh_rename':'rename',[stagePath,targetPath],{signal});published=true;owned=false;
  const result=await snapshotProviderFile(destination,targetRelative,{signal});await checkDestination();
  if(result.sha256!==baseline.sha256||result.byteLength!==baseline.byteLength||!authority(result.root,destinationRoot))throw Error('The published transfer did not verify.');
  return {observation:result,sha256:result.sha256,byteLength:result.byteLength};
 }catch(error){
  if(published)throw fail('TRANSFER_VERIFICATION_FAILED','The server acknowledged the copy, but verification failed. Compare the destination before retrying.');
  if(submitted&&(!Number.isInteger(error.code)||error.code===6||error.code===7))throw fail('TRANSFER_OUTCOME_UNKNOWN','The copy outcome is unknown. Compare the destination; do not retry automatically.');
  throw error;
 }finally{
  if(handle){try{const [attrs]=await destination.request('fstat',[handle]);stageMetadata=destination.metadata(stageRelative,attrs);}catch{}try{await destination.closeHandle(handle);}catch{}handle=null;}
  if(owned&&!destination.connection.closed&&!destination.revoked){try{await checkDestination(true);const current=await destination.inspectEntry(stageRelative);if(stageMetadata&&sameFile(current,stageMetadata))await destination.request('unlink',[stagePath]);}catch{}}
 }
}
module.exports={transferFileToSftp};
