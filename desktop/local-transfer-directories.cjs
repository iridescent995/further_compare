'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{constants}=require('node:fs');
const {validateLocalTransferPath}=require('./local-transfer-writer.cjs');
const {checkSignal}=require('./local-folder-reader.cjs');
const preparedStates=new WeakMap(),createdStates=new WeakMap();
const fail=(code,message,extra={})=>Object.assign(Error(message),{code,...extra});
const stale=()=>fail('STALE_SOURCE','The destination directory or its authority changed. Review again.');
const same=(a,b)=>!!a&&!!b&&a.path===b.path&&a.identity===b.identity;
const attributes=(a,b)=>['mode','uid','gid'].every(key=>b[key]===undefined||a[key]===b[key]);
const inode=(a,b)=>!!a&&!!b&&a.dev===b.dev&&a.ino===b.ino;
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const copy=value=>{if(!value||typeof value.path!=='string'||!value.path||typeof value.identity!=='string'||!value.identity)throw stale();return Object.fromEntries(Object.entries(value).filter(([key,v])=>['path','identity','stamp','kind','size','mode','uid','gid','mtime','mtimeNs','strongRevision'].includes(key)&&(v===null||['string','number','boolean'].includes(typeof v))));};
async function authority(state,signal){
 checkSignal(signal);if(state.service.roots[state.side]!==state.rootPath||!same(await state.service.inspectRoot(state.side),state.root))throw stale();
 const rootStat=await fs.lstat(state.rootPath);if(!rootStat.isDirectory()||!inode(rootStat,state.rootStat)||!attributes(rootStat,state.rootStat))throw stale();
 for(const prior of state.parents){const actual=await state.service.inspectEntry(state.side,prior.path);checkSignal(signal);if(!same(actual,prior)||actual.kind!=='directory'||!attributes(actual,prior))throw stale();}
 checkSignal(signal);
}
async function spelling(state,signal){
 let directory=state.rootPath;
 for(const name of state.relative.split('/')){checkSignal(signal);const names=await fs.readdir(directory),key=name.normalize('NFC').toLowerCase();if(names.some(other=>other!==name&&other.normalize('NFC').toLowerCase()===key))throw Error('Conflicting case or Unicode filename spelling at '+name+'.');directory=path.join(directory,name);}
}
async function owned(state,signal){
 await authority(state,signal);const full=await state.service.safe(state.side,state.relative),stat=await fs.lstat(full);checkSignal(signal);
 if(full!==state.full||!stat.isDirectory()||!inode(stat,state.stat))throw stale();
 const metadata=await state.service.inspectEntry(state.side,state.relative);if(!metadata||metadata.kind!=='directory'||!same(metadata,state.metadata))throw stale();return metadata;
}
function children(value){
 if(!Array.isArray(value)||value.length>50000)throw Error('Choose the complete approved child namespace.');const seen=new Set();
 return value.map(child=>{if(!child||typeof child!=='object'||Object.keys(child).some(key=>!['name','kind','identity','stamp'].includes(key))||typeof child.name!=='string'||!child.name||child.name==='.'||child.name==='..'||/[\\/\0]/.test(child.name)||!['file','directory'].includes(child.kind)||typeof child.identity!=='string'||!child.identity||typeof child.stamp!=='string'||!child.stamp||seen.has(child.name))throw Error('Invalid approved directory child.');seen.add(child.name);return {...child};}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
}
async function namespace(state,expected,signal){
 const before=await owned(state,signal);const actual=await fs.readdir(state.full,{withFileTypes:true});if(actual.length!==expected.length)throw stale();
 const names=new Map(actual.map(entry=>[entry.name,entry]));
 for(const entry of expected){checkSignal(signal);const item=names.get(entry.name);if(!item||!(entry.kind==='file'?item.isFile():item.isDirectory()))throw stale();const info=await state.service.inspectEntry(state.side,state.relative+'/'+entry.name);if(!info||info.kind!==entry.kind||info.identity!==entry.identity||info.stamp!==entry.stamp)throw stale();}
 const after=await owned(state,signal);if(before.stamp!==after.stamp)throw stale();
}
async function prepareLocalDirectory(service,side,relative,{signal}={}){
 checkSignal(signal);validateLocalTransferPath(relative);if(!['a','b'].includes(side)||!service||!['safe','inspectRoot','inspectEntry'].every(key=>typeof service[key]==='function'))throw Error('Choose a local destination folder.');
 const root=copy(await service.inspectRoot(side)),rootPath=service.roots[side],parents=[];let ancestor=path.posix.dirname(relative);
 while(ancestor!=='.'){checkSignal(signal);const info=copy(await service.inspectEntry(side,ancestor));if(info.kind!=='directory')throw stale();parents.push(info);ancestor=path.posix.dirname(ancestor);}
 const rootStat=await fs.lstat(rootPath),state={service,side,relative,root,rootPath,rootStat,parents,used:false};await authority(state,signal);await spelling(state,signal);
 if(await service.inspectEntry(side,relative)!==null)throw Error('Directory creation requires a missing destination.');await service.safe(side,relative,true);await authority(state,signal);
 const token=freeze({relative,observation:{root:{...root},parents:parents.map(info=>({...info})),target:null}});preparedStates.set(token,state);return token;
}
async function createLocalDirectory(prepared,{signal}={}){
 const state=preparedStates.get(prepared);if(!state||state.used)throw Error('Unknown or consumed directory creation.');checkSignal(signal);state.used=true;
 let created=false,handle;
 try{
  await authority(state,signal);await spelling(state,signal);if(await state.service.inspectEntry(state.side,state.relative)!==null)throw stale();
  const full=await state.service.safe(state.side,state.relative,true);checkSignal(signal);await fs.mkdir(full,{mode:0o700});created=true;
  const stat=await fs.lstat(full);if(!stat.isDirectory())throw stale();
  handle=await fs.open(full,constants.O_RDONLY|(constants.O_DIRECTORY||0)|(constants.O_NOFOLLOW||0));if(!inode(await handle.stat(),stat))throw stale();
  // A restrictive umask can remove owner bits: set the private staging mode
  // through the verified handle. Windows does not support Unix directory modes.
  if(process.platform!=='win32')await handle.chmod(0o700);
  const metadata=copy(await state.service.inspectEntry(state.side,state.relative));if(metadata.kind!=='directory')throw stale();
  const ownedState={...state,full,stat,metadata,finalized:false};await owned(ownedState,signal);if((await fs.readdir(full)).length)throw stale();
  const finalStat=await handle.stat();if(process.platform!=='win32'&&(finalStat.mode&0o777)!==0o700)throw stale();await owned(ownedState,signal);await handle.close();handle=null;
  const token=freeze({relative:state.relative,observation:{root:{...state.root},metadata:{...metadata}},...(process.platform==='win32'?{metadataWarning:'Windows does not preserve Unix directory permissions.'}:{})});createdStates.set(token,ownedState);return token;
 }catch(error){if(created)throw fail('DIRECTORY_VERIFICATION_FAILED','The directory was created, but verification failed. Inspect it before retrying.',{operation:'create',created:true,metadataSubmitted:false,acknowledged:true,metadataApplied:false,cause:error});throw error;}
 finally{if(handle)try{await handle.close();}catch{}}
}
async function finalizeLocalDirectory(created,sourceMetadata,expectedChildren,{signal}={}){
 const state=createdStates.get(created);if(!state||state.finalized)throw Error('Unknown or consumed owned directory.');try{checkSignal(signal);}catch(error){throw Object.assign(error,{operation:'finalize',created:true,metadataSubmitted:false,acknowledged:false,metadataApplied:false});}
 if(!sourceMetadata||typeof sourceMetadata!=='object'||sourceMetadata.kind!=='directory')throw Error('Choose source directory metadata.');
 const mode=sourceMetadata.mode,mtime=sourceMetadata.mtime;
 if(mode!==undefined&&(!Number.isSafeInteger(mode)||mode<0||mode>0xffffffff)||mtime!==undefined&&(!Number.isFinite(mtime)||Math.abs(mtime)>8640000000000000))throw Error('Invalid source directory metadata.');
 const expected=children(expectedChildren);state.finalized=true;let handle,metadataApplied=false,metadataSubmitted=false;
 try{
  const current=await owned(state,signal);for(const key of ['mode','uid','gid'])if(state.metadata[key]!==undefined&&current[key]!==state.metadata[key])throw stale();
  await namespace(state,expected,signal);handle=await fs.open(state.full,constants.O_RDONLY|(constants.O_DIRECTORY||0)|(constants.O_NOFOLLOW||0));if(!inode(await handle.stat(),state.stat))throw stale();await owned(state,signal);checkSignal(signal);
  if(mode!==undefined&&process.platform!=='win32'){metadataSubmitted=true;await handle.chmod(mode&0o777);metadataApplied=true;}
  if(mtime!==undefined){checkSignal(signal);metadataSubmitted=true;
   // Date truncates fractional milliseconds, which can exceed the 1 ms verification
   // allowance after filesystem rounding. Numeric strings preserve fractions and
   // pre-epoch values (Node treats negative numeric arguments as the current time).
   const seconds=String(mtime/1000);await handle.utimes(seconds,seconds);metadataApplied=true;}
  const stat=await handle.stat();if(!inode(stat,state.stat)||mode!==undefined&&process.platform!=='win32'&&(stat.mode&0o777)!==(mode&0o777)||mtime!==undefined&&Math.abs(stat.mtimeMs-mtime)>1)throw stale();
  // Applying a restrictive mode may make children unreadable. The complete child
  // namespace was checked before mutation; afterward verify the held directory
  // and pathname authorities. Native pathname operations retain an external race.
  const metadata=copy(await owned(state,signal));await handle.close();handle=null;
  return freeze({observation:{root:{...state.root},metadata},...(process.platform==='win32'&&mode!==undefined?{metadataWarning:'Windows does not preserve Unix directory permissions.'}:{})});
 }catch(error){throw fail(metadataApplied?'DIRECTORY_VERIFICATION_FAILED':error.code||'STALE_SOURCE',metadataApplied?'Directory metadata was applied, but verification failed. Inspect it before retrying.':error.message,{operation:'finalize',created:true,metadataSubmitted,acknowledged:metadataApplied,metadataApplied,cause:error});}
 finally{if(handle)try{await handle.close();}catch{}}
}
module.exports={prepareLocalDirectory,createLocalDirectory,finalizeLocalDirectory};
