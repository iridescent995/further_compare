'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{constants}=require('node:fs'),{createHash}=require('node:crypto');
const {FolderService}=require('./folders.cjs');
const {Worker}=require('node:worker_threads');
const {decodeText,encodeText,ENCODINGS,MAX_BYTES}=require('../src/text-codec.cjs');
const MAX_TOTAL_BYTES=64*1024*1024;
const identity=s=>`${s.dev}:${s.ino}`,stamp=s=>`${identity(s)}:${s.mode}:${s.nlink}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
const fold=s=>s.normalize('NFC').toLowerCase();
function patchPath(name,strip){
 if(name==='/dev/null')return null;
 if(typeof name!=='string'||name.length>32768||!name||name.includes('\\')||path.posix.isAbsolute(name)||path.win32.isAbsolute(name)||/[\x00-\x1f\x7f-\x9f:]/.test(name))throw Error('Patch paths must be safe relative paths.');
 const parts=name.split('/');
 for(const part of parts)if(!part||part==='.'||part==='..'||part!==part.normalize('NFC')||/[ .]$/.test(part)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)||['.git','node_modules','.ds_store'].includes(part.toLowerCase()))throw Error('Patch path contains an unsafe, reserved, ignored or ambiguous component.');
 if(parts.length<=strip)throw Error('Strip count removes the entire patch path.');
 return parts.slice(strip).join('/');
}
async function capture(root,rel){
 if(await fs.realpath(root)!==root)throw Error('Patch target root changed.');
 const rootStat=await fs.lstat(root,{bigint:true});if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw Error('Patch target root changed.');
 const states=[['',stamp(rootStat)]],parts=rel.split('/');let parent=root,missing=false;
 for(let i=0;i<parts.length;i++){
  const component=parts[i],full=path.join(parent,component);
  if(!missing){const matches=(await fs.readdir(parent)).filter(name=>fold(name)===fold(component));if(matches.length>1||matches.length===1&&matches[0]!==component)throw Error('Patch path has a case or Unicode alias collision.');}
  let stat;try{stat=await fs.lstat(full,{bigint:true});}catch(error){if(error.code!=='ENOENT')throw error;missing=true;states.push([parts.slice(0,i+1).join('/'),null]);parent=full;continue;}
  if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile())||i<parts.length-1&&!stat.isDirectory()||stat.isFile()&&stat.nlink!==1n)throw Error('Patch paths cannot follow links or cross non-directory ancestors.');
  states.push([parts.slice(0,i+1).join('/'),stamp(stat)]);parent=full;
 }
 return {states,full:parent};
}
async function readSource(file){
 const handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{const before=await handle.stat({bigint:true});if(!before.isFile()||before.nlink!==1n||before.size>BigInt(MAX_BYTES))throw Error('Patch source must be an unlinked regular text file up to 10 MB.');
  const buffer=Buffer.alloc(Number(before.size)+1);let count=0;while(count<buffer.length){const {bytesRead}=await handle.read(buffer,count,buffer.length-count,null);if(!bytesRead)break;count+=bytesRead;}
  if(count!==Number(before.size)||stamp(before)!==stamp(await handle.stat({bigint:true}))||stamp(before)!==stamp(await fs.lstat(file,{bigint:true})))throw Error('Patch source changed while reading.');
  const bytes=buffer.subarray(0,count);return {bytes,mode:Number(before.mode)&0o777,stamp:stamp(before),hash:createHash('sha256').update(bytes).digest('hex')};
 }finally{await handle.close();}
}
class FolderPatch{
 #pending=null;#queue=Promise.resolve();#disposed=false;#worker=null;
 constructor({backupRoot,stagingRoot=os.tmpdir()}={}){if(typeof backupRoot!=='string'||!path.isAbsolute(backupRoot)||typeof stagingRoot!=='string'||!path.isAbsolute(stagingRoot))throw Error('Folder patch requires absolute backup and staging directories.');this.backupRoot=backupRoot;this.stagingRoot=stagingRoot;}
 #run(fn){const operation=this.#queue.catch(()=>{}).then(fn);this.#queue=operation.catch(()=>{});return operation;}
 async #compute(operation,value){
  if(this.#disposed)throw Error('Folder patch session is closed.');
  return new Promise((resolve,reject)=>{
   const worker=new Worker(path.join(__dirname,'folder-patch-worker.cjs'));this.#worker=worker;let finished=false;
   const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);if(this.#worker===worker)this.#worker=null;void worker.terminate();error?reject(error):resolve(result);};
   const timer=setTimeout(()=>finish(Error('Folder patch processing exceeded five seconds. Choose a smaller patch.')),5000);
   worker.once('message',message=>finish(message.error?Error(message.error):null,message.result));worker.once('error',error=>finish(error));worker.once('exit',()=>{if(!finished)finish(Error('Folder patch processing was cancelled.'));});worker.postMessage({operation,value});
  });
 }
 async #cleanup(pending){if(!pending)return;pending.service.plans.clear();let stat;try{stat=await fs.lstat(pending.stage,{bigint:true});}catch(e){if(e.code==='ENOENT')return;throw e;}if(!stat.isDirectory()||stat.isSymbolicLink()||identity(stat)!==pending.stageIdentity)throw Error('Patch staging directory changed; replacement was not removed.');await fs.rm(pending.stage,{recursive:true,force:true});}
 async #verify(pending){
  for(const [relative,before]of pending.guards){const current=await capture(pending.root,relative);if(JSON.stringify(current.states)!==JSON.stringify(before.states))throw Error('Patch target changed since its source was read. Preview again.');}
  for(const [relative,source]of pending.sources){const current=await readSource(path.join(pending.root,...relative.split('/')));if(current.stamp!==source.stamp||current.hash!==source.hash)throw Error('Patch source changed. Preview again.');}
 }
 preview(root,patch,options={}){return this.#run(async()=>{
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['strip','reverse','encoding','normalizeLegacy'].includes(key)))throw Error('Invalid folder patch options.');
  const {strip=1,reverse=false,encoding='auto',normalizeLegacy=false}=options;
  if(this.#disposed)throw Error('Folder patch session is closed.');await this.#cleanup(this.#pending);this.#pending=null;
  if(typeof root!=='string'||!path.isAbsolute(root)||!Number.isInteger(strip)||strip<0||strip>20||typeof reverse!=='boolean'||typeof normalizeLegacy!=='boolean'||!['auto',...ENCODINGS].includes(encoding))throw Error('Invalid folder patch options.');
  const records=await this.#compute('inspect',{patch}),entries=records.map(record=>{let oldPath=patchPath(record.oldName,strip),newPath=patchPath(record.newName,strip);if(reverse)[oldPath,newPath]=[newPath,oldPath];return {index:record.index,oldPath,newPath,action:oldPath===null?'create':newPath===null?'delete':oldPath===newPath?'modify':'rename'};});
  const owned=new Map();for(const entry of entries)for(const relative of new Set([entry.oldPath,entry.newPath].filter(Boolean))){const key=fold(relative);if(owned.has(key))throw Error('Patch records target duplicate or ambiguous paths.');for(const previous of owned.keys())if(key.startsWith(previous+'/')||previous.startsWith(key+'/'))throw Error('Patch paths overlap an ancestor.');owned.set(key,relative);}
  const service=new FolderService(this.backupRoot);const selected=await service.select('b',root);const stage=await fs.mkdtemp(path.join(this.stagingRoot,'further-patch-'));const pending={root:selected.path,stage,stageIdentity:identity(await fs.lstat(stage,{bigint:true})),service,guards:new Map(),sources:new Map()};
  try{
   await service.select('a',stage);
   for(const relative of owned.values()){if(service.isIgnoredPath(relative))throw Error('Patch targets an ignored path.');pending.guards.set(relative,await capture(pending.root,relative));}
   // Revalidate original directory identities on every service path access,
   // including during backup and execution, not merely at the preview boundary.
   const directoryIdentities=new Map();for(const guard of pending.guards.values())for(const [relative,state]of guard.states.slice(0,-1))if(state)directoryIdentities.set(relative,state.split(':').slice(0,2).join(':'));
   service.onDirectoryCreated=async(side,relative,destination)=>{if(side!=='b')return;for(const [ancestor,expected]of directoryIdentities)if(!ancestor||relative.startsWith(ancestor+'/')){const before=await fs.lstat(ancestor?path.join(pending.root,...ancestor.split('/')):pending.root,{bigint:true});if(!before.isDirectory()||before.isSymbolicLink()||identity(before)!==expected)throw Error('Patch target directory changed.');}const stat=await fs.lstat(destination,{bigint:true});if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('New patch directory changed.');directoryIdentities.set(relative,identity(stat));};
   const originalSafe=service.safe.bind(service);service.safe=async(side,relative,allowMissing=false)=>{
    if(side==='b')for(const [ancestor,expected]of directoryIdentities)if(!ancestor||relative===ancestor||relative.startsWith(ancestor+'/')){const stat=await fs.lstat(ancestor?path.join(pending.root,...ancestor.split('/')):pending.root,{bigint:true});if(!stat.isDirectory()||stat.isSymbolicLink()||identity(stat)!==expected)throw Error('Patch target directory changed.');}
    return originalSafe(side,relative,allowMissing);
   };
   let totalBytes=0;const review=[];
   for(const entry of entries){
    let content='',format={encoding:'utf8',bom:false,lineEnding:'none'},mode=0o644,bytesBefore=0;
    if(entry.oldPath){const source=await readSource(pending.guards.get(entry.oldPath).full);const state=pending.guards.get(entry.oldPath).states.at(-1)[1];if(source.stamp!==state)throw Error('Patch source changed before reading.');pending.sources.set(entry.oldPath,{stamp:source.stamp,hash:source.hash});const decoded=decodeText(source.bytes,encoding);content=decoded.content;format={...decoded.format,lineEnding:'mixed',...(decoded.format.legacyBytes?{normalizeLegacy}:{})};mode=source.mode;bytesBefore=source.bytes.length;totalBytes+=bytesBefore;}
    if(entry.newPath&&entry.newPath!==entry.oldPath&&pending.guards.get(entry.newPath).states.at(-1)[1]!==null)throw Error('Patch creation or rename destination already exists.');
    const result=await this.#compute('apply',{text:content,patch,index:entry.index,reverse});const bytes=entry.newPath?Buffer.from(encodeText(result,format)):Buffer.alloc(0);totalBytes+=bytes.length;if(totalBytes>MAX_TOTAL_BYTES)throw Error('Folder patch exceeds the 64 MB total input/output limit.');
    if(entry.newPath){const output=path.join(stage,...entry.newPath.split('/'));await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,bytes,{flag:'wx',mode});await fs.chmod(output,mode);}
    review.push({...entry,encoding:format.encoding,bom:format.bom,bytesBefore,bytesAfter:bytes.length,...(format.legacyBytes?{legacyByteHandling:!entry.newPath?'deleted':result===content?'preserved':'normalized'}:{})});
   }
   await this.#verify(pending);const preview=await service.preview('sync','a-to-b',[...owned.values()],'patch');await this.#verify(pending);
   pending.id=preview.id;this.#pending=pending;
   return {id:preview.id,root:pending.root,operations:preview.operations.map(op=>({...op})),entries:review,skipped:preview.skipped,strip,reverse,normalizeLegacy,totalBytes};
  }catch(error){try{await this.#cleanup(pending);}catch(cleanupError){error.message+=' '+cleanupError.message;}throw error;}
 });}
 execute(id){return this.#run(async()=>{
  if(this.#disposed||!this.#pending||typeof id!=='string'||id!==this.#pending.id)throw Error('Preview this folder patch again.');const pending=this.#pending;this.#pending=null;
  let result;try{await this.#verify(pending);result=await pending.service.execute(id);}catch(error){try{await this.#cleanup(pending);}catch(cleanupError){error.message+=' '+cleanupError.message;}throw error;}
  try{await this.#cleanup(pending);}catch(error){result.cleanupWarning=error.message;}return result;
 });}

 dispose(){this.#disposed=true;if(this.#worker)void this.#worker.terminate();return this.#run(async()=>{const pending=this.#pending;this.#pending=null;await this.#cleanup(pending);});}
}
module.exports={FolderPatch,MAX_TOTAL_BYTES};
