'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {constants}=require('node:fs');
const {checkSignal}=require('./local-folder-reader.cjs');
const same=(a,b)=>!!a&&!!b&&a.dev===b.dev&&a.ino===b.ino;
const changed=()=>Object.assign(Error('The recovery directory changed before its entries could be synced.'),{code:'STALE_SOURCE'});
// File contents are synced by the caller. This reports directory-entry syncing
// separately: Node does not expose a supported Windows directory flush here.
// fsync is a filesystem request, not a guarantee against all hardware failures.
async function syncRecoveryDirectories(operation,root,{signal,platform=process.platform,filesystem=fs}={}){
 checkSignal(signal);
 if(platform==='win32')return {durability:{filesSynced:true,directoryEntriesSynced:false},durabilityWarning:'Directory-entry syncing is unavailable on Windows; recovery file contents were synced, but recovery paths may not survive a system crash.'};
 const chain=[];
 for(let current=operation.path;;current=path.dirname(current)){
  checkSignal(signal);const stat=await filesystem.lstat(current);
  if(!stat.isDirectory()||await filesystem.realpath(current)!==current)throw changed();
  if(current===operation.path&&!same(stat,operation.stat)||current===root.path&&!same(stat,root.stat))throw changed();
  chain.push({path:current,stat});if(path.dirname(current)===current)break;
 }
 if(!chain.some(entry=>entry.path===root.path))throw changed();
 const verify=async(entry)=>{checkSignal(signal);const stat=await filesystem.lstat(entry.path);if(!stat.isDirectory()||!same(stat,entry.stat)||await filesystem.realpath(entry.path)!==entry.path)throw changed();};
 // Child first: persist blob/manifest entries, then the operation folder entry,
 // then any newly-created recovery ancestors all the way to the volume root.
 for(const entry of chain){
  await verify(entry);let handle,failed=false;
  try{
   handle=await filesystem.open(entry.path,constants.O_RDONLY|(constants.O_DIRECTORY||0)|(constants.O_NOFOLLOW||0));
   const before=await handle.stat();if(!before.isDirectory()||!same(before,entry.stat))throw changed();
   await handle.sync();const after=await handle.stat();if(!after.isDirectory()||!same(after,entry.stat))throw changed();await verify(entry);
  }catch(error){failed=true;throw error;}finally{if(handle)try{await handle.close();}catch(error){if(!failed)throw error;}}
 }
 for(const entry of chain)await verify(entry);
 checkSignal(signal);return {durability:{filesSynced:true,directoryEntriesSynced:true}};
}
module.exports={syncRecoveryDirectories};
