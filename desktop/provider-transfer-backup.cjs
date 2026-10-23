'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {snapshotProviderFile}=require('./provider-file-snapshot.cjs');
const {checkSignal}=require('./local-folder-reader.cjs');
const {syncRecoveryDirectories}=require('./recovery-directory-sync.cjs');
const validRelative=value=>typeof value==='string'&&value.length>0&&value.length<=32768&&!/[\\\0]/.test(value)&&!value.split('/').some(part=>!part||part==='.'||part==='..');
const identity=(a,b)=>!!a&&!!b&&a.dev===b.dev&&a.ino===b.ino;
const authority=(a,b)=>!!a&&!!b&&a.path===b.path&&a.identity===b.identity;
const changed=()=>Object.assign(Error('The recovery folder or approved source changed. Preview the transfer again.'),{code:'STALE_SOURCE'});
function observation(value,relative){
 if(!value||!value.root||typeof value.root.path!=='string'||!value.root.path||typeof value.root.identity!=='string'||!value.root.identity||!value.metadata||value.metadata.path!==relative||value.metadata.kind!=='file'||typeof value.metadata.identity!=='string'||!value.metadata.identity||typeof value.metadata.stamp!=='string'||!value.metadata.stamp||!Number.isSafeInteger(value.byteLength)||value.byteLength<0||value.metadata.size!==value.byteLength||!/^[a-f0-9]{64}$/.test(value.sha256||''))throw Error('Choose an approved regular-file backup observation.');
 return {root:{...value.root},metadata:{...value.metadata},sha256:value.sha256,byteLength:value.byteLength};
}
function matches(a,b){return authority(a.root,b.root)&&authority(a.metadata,b.metadata)&&a.metadata.kind===b.metadata.kind&&a.metadata.stamp===b.metadata.stamp&&a.metadata.size===b.metadata.size&&a.byteLength===b.byteLength&&a.sha256===b.sha256;}
async function directory(file,expected){const stat=await fs.lstat(file);if(!stat.isDirectory()||await fs.realpath(file)!==file||expected&&!identity(stat,expected))throw changed();return stat;}
async function writeAll(handle,bytes,position,signal){let offset=0;while(offset<bytes.length){checkSignal(signal);const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset,position+offset);if(!Number.isSafeInteger(bytesWritten)||bytesWritten<=0||bytesWritten>bytes.length-offset)throw Error('Invalid recovery file write.');offset+=bytesWritten;}}
async function hashHandle(handle,expectedBytes,signal){const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let offset=0;while(true){checkSignal(signal);const {bytesRead}=await handle.read(buffer,0,buffer.length,offset);if(!Number.isSafeInteger(bytesRead)||bytesRead<0||bytesRead>buffer.length)throw Error('Invalid recovery file read.');if(!bytesRead)break;offset+=bytesRead;if(offset>expectedBytes)throw changed();hash.update(buffer.subarray(0,bytesRead));}if(offset!==expectedBytes)throw changed();return hash.digest('hex');}
async function backupProviderFiles(provider,entries,backupRoot,{signal,maxFiles=1000}={}){
 checkSignal(signal);
 if(!provider||!['inspectRoot','inspectEntry','openFileReader'].every(key=>typeof provider[key]==='function'))throw Error('Choose a source provider.');
 if(!Number.isSafeInteger(maxFiles)||maxFiles<1||maxFiles>50000)throw Error('Invalid recovery file limit.');
 if(!Array.isArray(entries)||!entries.length||entries.length>maxFiles||new Set(entries.map(entry=>entry?.path)).size!==entries.length)throw Error('Select between 1 and '+maxFiles+' unique backup files.');
 const requested=entries.map(entry=>{if(!validRelative(entry?.path))throw Error('Invalid relative backup path.');return {path:entry.path,observation:observation(entry.observation,entry.path)};});
 if(typeof backupRoot!=='string'||!path.isAbsolute(backupRoot)||path.normalize(backupRoot)!==backupRoot||backupRoot.includes('\0'))throw Error('Choose a canonical recovery directory.');
 const rootStat=await directory(backupRoot);checkSignal(signal);
 const backupPath=path.join(backupRoot,'transfer-'+randomUUID()),manifestPath=path.join(backupPath,'manifest.json'),created=[],createdByPath=new Map();let operationStat=null,complete=false;
 const checkDirectory=async()=>{checkSignal(signal);await directory(backupRoot,rootStat);if(operationStat)await directory(backupPath,operationStat);checkSignal(signal);};
 const checkFile=async(file,stat)=>{await checkDirectory();const current=await fs.lstat(file);if(!current.isFile()||!identity(current,stat))throw changed();};
 try{
  await checkDirectory();await fs.mkdir(backupPath,{mode:0o700});operationStat=await directory(backupPath);await checkDirectory();
  const files=[],manifestFiles=[];
  for(const entry of requested){
   await checkDirectory();const backupName=randomUUID()+'.bin',file=path.join(backupPath,backupName);let handle,failed=false;
   try{
    handle=await fs.open(file,'wx+',0o600);const stat=await handle.stat();created.push({file,stat});createdByPath.set(file,stat);await checkFile(file,stat);
    const snapshot=await snapshotProviderFile(provider,entry.path,{signal,onChunk:async(chunk,offset)=>{await checkFile(file,stat);await writeAll(handle,chunk,offset,signal);}});
    if(!matches(snapshot,entry.observation))throw changed();
    await handle.sync();await checkFile(file,stat);
    if(await hashHandle(handle,snapshot.byteLength,signal)!==snapshot.sha256)throw changed();
    const after=await handle.stat();if(!identity(after,stat)||after.size!==snapshot.byteLength)throw changed();
    await handle.close();handle=null;await checkFile(file,stat);
    const record={path:entry.path,backupName,sha256:snapshot.sha256,byteLength:snapshot.byteLength};files.push(record);
    const approved=entry.observation,root={},metadata={};
    for(const key of ['path','identity','stamp'])if(typeof approved.root[key]==='string')root[key]=approved.root[key];
    for(const key of ['path','kind','size','mtime','mtimeNs','mode','uid','gid','identity','stamp','strongRevision'])if(['string','number','boolean'].includes(typeof approved.metadata[key])||approved.metadata[key]===null)metadata[key]=approved.metadata[key];
    manifestFiles.push({...record,observation:{root,metadata,sha256:approved.sha256,byteLength:approved.byteLength}});
   }catch(error){failed=true;throw error;}finally{if(handle)try{await handle.close();}catch(error){if(!failed)throw error;}}
  }
  // Reverify earlier backups after later sources have finished streaming.
  for(const record of files){
   const file=path.join(backupPath,record.backupName),ownedStat=createdByPath.get(file);let reader,failed=false;
   try{
    await checkFile(file,ownedStat);reader=await fs.open(file,'r');const before=await reader.stat();if(!before.isFile()||!identity(before,ownedStat))throw changed();
    if(await hashHandle(reader,record.byteLength,signal)!==record.sha256)throw changed();
    const after=await reader.stat();if(!identity(after,before)||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw changed();
    await checkFile(file,ownedStat);
   }catch(error){failed=true;throw error;}finally{if(reader)try{await reader.close();}catch(error){if(!failed)throw error;}}
  }
  // The manifest is the completion marker, never a partial list of backups.
  await checkDirectory();const temporary=path.join(backupPath,'.manifest-'+randomUUID()+'.tmp');let manifest,manifestFailed=false;
  try{
   manifest=await fs.open(temporary,'wx',0o600);const stat=await manifest.stat();created.push({file:temporary,stat});await checkFile(temporary,stat);
   const bytes=Buffer.from(JSON.stringify({version:1,kind:'provider-transfer-backup',files:manifestFiles},null,2)+'\n');await writeAll(manifest,bytes,0,signal);await manifest.sync();await manifest.close();manifest=null;
   await checkFile(temporary,stat);
   // Hard-link publication is atomic and fails if another manifest appeared.
   // Rename would overwrite that entry between an existence check and publish.
   await fs.link(temporary,manifestPath);created.push({file:manifestPath,stat});await checkFile(manifestPath,stat);await checkFile(temporary,stat);await fs.unlink(temporary);
  }catch(error){manifestFailed=true;throw error;}finally{if(manifest)try{await manifest.close();}catch(error){if(!manifestFailed)throw error;}}
  await checkDirectory();
  const durability=await syncRecoveryDirectories({path:backupPath,stat:operationStat},{path:backupRoot,stat:rootStat},{signal});
  await checkDirectory();checkSignal(signal);complete=true;return {backupPath,manifestPath,files,...durability};
 }finally{
  if(!complete&&operationStat){
   // Never recursively remove a namespace that another actor may have changed.
   // Keep unexpected/replaced entries for diagnosis instead of touching them.
   try{await directory(backupRoot,rootStat);await directory(backupPath,operationStat);
    for(const entry of created){await directory(backupRoot,rootStat);await directory(backupPath,operationStat);const current=await fs.lstat(entry.file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(current?.isFile()&&identity(current,entry.stat))await fs.unlink(entry.file);}
    await directory(backupRoot,rootStat);await directory(backupPath,operationStat);await fs.rmdir(backupPath);
   }catch{}
  }
 }
}
module.exports={backupProviderFiles};
