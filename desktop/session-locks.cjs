'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {readLimited,validateSession,MAX_SESSION_BYTES}=require('./sessions.cjs');
const queues=new Map();
const identity=stat=>`${stat.dev}:${stat.ino}`;
const stamp=stat=>`${identity(stat)}:${stat.mode}:${stat.nlink}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;

async function location(file){
 if(typeof file!=='string'||!path.isAbsolute(file)||file.includes('\0'))throw Error('Choose a saved session file.');
 const parent=await fs.realpath(path.dirname(file)),stat=await fs.lstat(parent,{bigint:true});
 if(!stat.isDirectory())throw Error('Session parent is not a directory.');
 return {path:path.join(parent,path.basename(file)),parent,parentIdentity:identity(stat)};
}
async function checkParent(target){
 const stat=await fs.lstat(target.parent,{bigint:true});
 if(!stat.isDirectory()||await fs.realpath(target.parent)!==target.parent||identity(stat)!==target.parentIdentity)throw Error('Session directory changed. Try again.');
}
function checkedData(value){
 validateSession(value);
 if(value.locked!==undefined&&typeof value.locked!=='boolean')throw Error('Invalid saved session lock.');
 return value;
}
async function snapshot(target,allowMissing=false){
 await checkParent(target);
 let before;
 try{before=await fs.lstat(target.path,{bigint:true});}catch(error){if(allowMissing&&error.code==='ENOENT'){await checkParent(target);return null;}throw error;}
 if(before.isSymbolicLink())throw Error('Session symbolic links cannot be modified. Choose the original session file.');
 if(!before.isFile())throw Error('Choose a regular saved session file.');
 const content=await readLimited(target.path,MAX_SESSION_BYTES),after=await fs.lstat(target.path,{bigint:true});
 await checkParent(target);
 if(!after.isFile()||stamp(before)!==stamp(after))throw Error('Session changed while reading. Try again.');
 const data=checkedData(JSON.parse(content));
 return {data,stamp:stamp(after),links:after.nlink,revision:stamp(after)+':'+createHash('sha256').update(content).digest('hex')};
}
const state=(target,saved)=>({path:target.path,locked:saved.data.locked===true,revision:saved.revision});
async function readSessionLock(file){const target=await location(file);return state(target,await snapshot(target));}
async function serialized(target,operation){
 const key=target.path.normalize('NFC').toLowerCase();
 const previous=queues.get(key)||Promise.resolve();
 const running=previous.catch(()=>{}).then(operation);queues.set(key,running);
 try{return await running;}finally{if(queues.get(key)===running)queues.delete(key);}
}
function assertWritableLinks(saved){if(saved&&saved.links!==1n)throw Error('Hard-linked session files cannot be modified. Save a separate session copy.');}
async function install(target,data,expected){
 const content=JSON.stringify(data,null,2);
 if(Buffer.byteLength(content)>MAX_SESSION_BYTES)throw Error('Session exceeds 25 MB.');
 const temporary=path.join(target.parent,`.${path.basename(target.path)}.${randomUUID()}.tmp`);
 try{
  await checkParent(target);
  await fs.writeFile(temporary,content,{encoding:'utf8',flag:'wx',mode:0o600});
  const current=await snapshot(target,true);
  if(current?.revision!==expected?.revision)throw Error('Session changed after reading. Try again.');
  assertWritableLinks(current);
  await checkParent(target);
  // New saves must never overwrite a file which appears after the recheck.
  if(expected)await fs.rename(temporary,target.path);else await fs.link(temporary,target.path);
  await fs.rm(temporary,{force:true});
  return state(target,await snapshot(target));
 }finally{await fs.rm(temporary,{force:true});}
}
async function setSessionLocked(file,locked,expectedRevision){
 if(typeof locked!=='boolean'||(expectedRevision!==undefined&&typeof expectedRevision!=='string'))throw Error('Choose a valid session lock state.');
 const target=await location(file);
 return serialized(target,async()=>{
  const saved=await snapshot(target);
  if(expectedRevision!==undefined&&saved.revision!==expectedRevision)throw Error('Session changed after reading. Try again.');
  assertWritableLinks(saved);
  if((saved.data.locked===true)===locked)return state(target,saved);
  // Preserve every on-disk field; toggling a lock never serializes renderer edits.
  return install(target,{...saved.data,locked},saved);
 });
}
async function writeSession(file,value){
 const data=validateSession(value);delete data.locked;
 const target=await location(file);
 return serialized(target,async()=>{
  const saved=await snapshot(target,true);
  if(saved?.data.locked===true)throw Error('This saved session is locked. Unlock it or save a separate copy.');
  assertWritableLinks(saved);
  return install(target,data,saved);
 });
}
module.exports={readSessionLock,setSessionLocked,writeSession};
