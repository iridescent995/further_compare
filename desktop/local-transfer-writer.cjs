'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {snapshotProviderFile}=require('./provider-file-snapshot.cjs');
const {localFolderEndpoint}=require('./provider-folder-service.cjs');
const {checkSignal}=require('./local-folder-reader.cjs');
const fail=(code,message)=>Object.assign(Error(message),{code});
const stale=()=>fail('STALE_SOURCE','A transfer source, destination or parent changed. Preview the copy again.');
const validRelative=value=>typeof value==='string'&&value.length>0&&value.length<=32768&&!/[\\\0]/.test(value)&&!value.split('/').some(part=>!part||part==='.'||part==='..');
const authority=(a,b)=>!!a&&!!b&&a.path===b.path&&a.identity===b.identity;
const sameFile=(a,b)=>authority(a,b)&&a.kind===b.kind&&a.stamp===b.stamp&&a.size===b.size;
const inode=(a,b)=>!!a&&!!b&&a.dev===b.dev&&a.ino===b.ino;
function validateLocalTransferPath(relative,platform=process.platform){
 if(!validRelative(relative))throw Error('Invalid relative destination path.');
 if(platform==='win32'&&relative.split('/').some(part=>/[\x00-\x1f<>:"|?*]/.test(part)||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)))throw Error('The destination filename is not supported on Windows.');
 return relative;
}
function rootInfo(value){if(!value||typeof value.path!=='string'||!value.path||typeof value.identity!=='string'||!value.identity)throw stale();return {...value};}
function observation(value,file){if(!value||!value.metadata||value.metadata.path!==file||value.metadata.kind!=='file'||typeof value.metadata.identity!=='string'||!value.metadata.identity||typeof value.metadata.stamp!=='string'||!value.metadata.stamp||!Number.isSafeInteger(value.byteLength)||value.byteLength<0||value.metadata.size!==value.byteLength||!/^[a-f0-9]{64}$/.test(value.sha256||''))throw Error('Choose an approved regular-file transfer observation.');return {root:rootInfo(value.root),metadata:{...value.metadata},sha256:value.sha256,byteLength:value.byteLength};}
const matches=(a,b)=>authority(a.root,b.root)&&sameFile(a.metadata,b.metadata)&&a.sha256===b.sha256&&a.byteLength===b.byteLength;
// Caller must complete approved recovery backups before invoking this primitive.
// This helper copies bytes only and never deletes the source or creates parents.
async function transferFileToLocal(source,sourceRelative,sourceObservation,service,side,targetRelative,targetObservationOrNull,{signal}={}){
 checkSignal(signal);validateLocalTransferPath(targetRelative);
 if(!validRelative(sourceRelative)||!['a','b'].includes(side)||!source||!['inspectRoot','inspectEntry','openFileReader'].every(key=>typeof source[key]==='function')||!service||!['safe','inspectRoot','inspectEntry','openFileReader'].every(key=>typeof service[key]==='function'))throw Error('Choose connected source and local destination folders.');
 const baseline=observation(sourceObservation,sourceRelative),target=targetObservationOrNull===null?null:observation(targetObservationOrNull,targetRelative),destination=localFolderEndpoint(service,side),root=service.roots[side];
 const destinationRoot=rootInfo(await destination.inspectRoot({signal}));if(target&&!authority(destinationRoot,target.root))throw stale();
 if(authority(baseline.root,destinationRoot)&&sourceRelative===targetRelative||target&&baseline.metadata.strongRevision===true&&target.metadata.strongRevision===true&&baseline.metadata.identity===target.metadata.identity)throw Error('A copy destination cannot alias its source.');
 const parents=[];let parent=path.posix.dirname(targetRelative);
 while(parent!=='.'){checkSignal(signal);const info=await destination.inspectEntry(parent,{signal});if(!info||info.path!==parent||info.kind!=='directory'||typeof info.identity!=='string'||!info.identity)throw Error('Destination parent folders must already exist.');parents.push({...info});parent=path.posix.dirname(parent);}
 const checkDestination=async(cleanup=false)=>{
  const readSignal=cleanup?undefined:signal;checkSignal(readSignal);if(service.roots[side]!==root||!authority(rootInfo(await destination.inspectRoot({signal:readSignal})),destinationRoot))throw stale();
  for(const expected of parents){const actual=await destination.inspectEntry(expected.path,{signal:readSignal});checkSignal(readSignal);if(!actual||actual.kind!=='directory'||!authority(actual,expected))throw stale();}
 };
 const checkSpelling=async()=>{
  let directory=root;
  for(const part of targetRelative.split('/')){checkSignal(signal);const folded=part.normalize('NFC').toLowerCase(),names=await fs.readdir(directory);if(names.some(name=>name!==part&&name.normalize('NFC').toLowerCase()===folded))throw Error('Conflicting case or Unicode filename spelling at '+part+'.');directory=path.join(directory,part);}
 };
 const checkTarget=async()=>{await checkDestination();await checkSpelling();if(target){if(!matches(await snapshotProviderFile(destination,targetRelative,{signal}),target))throw stale();}else if(await destination.inspectEntry(targetRelative,{signal})!==null)throw stale();checkSignal(signal);};
 const checkSource=async()=>{if(!matches(await snapshotProviderFile(source,sourceRelative,{signal}),baseline))throw stale();};
 const stageRelative=(path.posix.dirname(targetRelative)==='.'?'':path.posix.dirname(targetRelative)+'/')+'.further-transfer-'+randomUUID()+'.tmp';
 let stagePath,targetPath,handle=null,stageStat=null,stageMetadata=null,owned=false,published=false,result,cleanupWarning;
 const ownedPath=async()=>{await checkDestination(true);const file=await service.safe(side,stageRelative),stat=await fs.lstat(file);if(file!==stagePath||!stat.isFile()||!inode(stat,stageStat))throw stale();return file;};
 try{
  await checkSource();await checkTarget();targetPath=await service.safe(side,targetRelative,true);stagePath=await service.safe(side,stageRelative,true);
  handle=await fs.open(stagePath,'wx+',0o600);owned=true;stageStat=await handle.stat();await ownedPath();
  const streamed=await snapshotProviderFile(source,sourceRelative,{signal,onChunk:async(chunk,position)=>{let offset=0;while(offset<chunk.byteLength){checkSignal(signal);const {bytesWritten}=await handle.write(chunk,offset,chunk.byteLength-offset,position+offset);if(!Number.isSafeInteger(bytesWritten)||bytesWritten<=0||bytesWritten>chunk.byteLength-offset)throw Error('Invalid local transfer write.');offset+=bytesWritten;}}});
  if(!matches(streamed,baseline))throw stale();
  const staged=await snapshotProviderFile(destination,stageRelative,{signal});if(staged.sha256!==baseline.sha256||staged.byteLength!==baseline.byteLength||!authority(staged.root,destinationRoot))throw Error('The staged transfer did not verify.');
  const mode=baseline.metadata.mode,mtime=baseline.metadata.mtime;
  if(process.platform!=='win32'&&Number.isSafeInteger(mode)&&mode>=0&&mode<=0xffffffff)await handle.chmod(mode&0o777);
  // Access time is not preserved; source modification time is used for both.
  if(Number.isFinite(mtime)&&Math.abs(mtime)<=8640000000000000)await handle.utimes(new Date(mtime),new Date(mtime));
  await handle.sync();await handle.close();handle=null;
  const verified=await snapshotProviderFile(destination,stageRelative,{signal});stageMetadata=verified.metadata;
  if(verified.sha256!==baseline.sha256||verified.byteLength!==baseline.byteLength||!authority(verified.root,destinationRoot))throw Error('The staged transfer did not verify.');
  await checkSource();const finalStage=await snapshotProviderFile(destination,stageRelative,{signal});
  if(!sameFile(finalStage.metadata,stageMetadata)||finalStage.sha256!==baseline.sha256||finalStage.byteLength!==baseline.byteLength||!authority(finalStage.root,destinationRoot))throw stale();
  await checkTarget();checkSignal(signal);await ownedPath();if(await service.safe(side,targetRelative,true)!==targetPath)throw stale();
  // New files publish without replacement; existing files were reviewed and
  // revalidated. Native pathname operations still have a final external race.
  if(target){await fs.rename(stagePath,targetPath);published=true;owned=false;}
  else {
   await fs.link(stagePath,targetPath);published=true;
   // Removing the sibling link changes target ctime: finish before capturing
   // the returned baseline, so a subsequent reviewed operation stays valid.
   try{await fs.unlink(await ownedPath());}catch{cleanupWarning='The copy was published, but its temporary link could not be removed: '+stagePath;}
   owned=false;
  }
  const saved=await snapshotProviderFile(destination,targetRelative,{signal});await checkDestination();
  if(saved.sha256!==baseline.sha256||saved.byteLength!==baseline.byteLength||!authority(saved.root,destinationRoot))throw Error('The published transfer did not verify.');
  result={observation:saved,sha256:saved.sha256,byteLength:saved.byteLength,...(cleanupWarning?{cleanupWarning}:{})};return result;
 }catch(error){if(published)throw fail('TRANSFER_VERIFICATION_FAILED','The local copy was published, but verification failed. Compare the destination before retrying.');throw error;}
 finally{
  if(handle)try{await handle.close();}catch{}
  if(owned&&stageStat){try{await fs.unlink(await ownedPath());owned=false;}catch{if(result)result.cleanupWarning='The copy is verified, but its temporary link could not be removed: '+stagePath;}}
 }
}
module.exports={transferFileToLocal,validateLocalTransferPath};
