'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const MAX_KEY_BYTES=1024*1024;
const unavailable=()=>Error('This SSH key selection is no longer available. Choose the key again.');
// Native-only capabilities. Neither paths nor key bytes cross the preload boundary.
class SftpKeyFiles {
 constructor({ttlMs=300000}={}){if(!Number.isSafeInteger(ttlMs)||ttlMs<1)throw Error('Invalid SSH key lifetime.');this.ttlMs=ttlMs;this.owners=new Map();}
 begin(owner){this.dispose(owner);const entry={ticket:{},keys:new Map(),active:new Set()};this.owners.set(owner,entry);return entry.ticket;}
 current(owner,ticket){return this.owners.get(owner)?.ticket===ticket;}
 async select(owner,ticket,filePath){
  if(!this.current(owner,ticket))throw unavailable();
  let handle,bytes;
  try{
   if(typeof filePath!=='string'||!filePath||filePath.includes('\0'))throw Error();
   const before=await fs.promises.lstat(filePath);if(!before.isFile()||before.size<1||before.size>MAX_KEY_BYTES)throw Error();
   handle=await fs.promises.open(filePath,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)|(fs.constants.O_NONBLOCK||0));
   const initial=await handle.stat();if(!initial.isFile()||initial.dev!==before.dev||initial.ino!==before.ino||initial.size!==before.size)throw Error();
   bytes=Buffer.alloc(initial.size+1);let offset=0;
   while(offset<bytes.length){const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);if(!bytesRead)break;offset+=bytesRead;}
   const after=await handle.stat();if(offset!==initial.size||after.size!==initial.size||after.mtimeMs!==initial.mtimeMs||after.ctimeMs!==initial.ctimeMs)throw Error();
   if(!this.current(owner,ticket))throw unavailable();
   const entry=this.owners.get(owner),keyId=randomUUID(),key={bytes,timer:null,expiresAt:Date.now()+this.ttlMs};
   key.timer=setTimeout(()=>this.discard(owner,keyId),this.ttlMs);key.timer.unref?.();entry.keys.set(keyId,key);bytes=null;
   return {keyId,name:path.basename(filePath)};
  }catch(error){if(!this.current(owner,ticket))throw unavailable();throw Error('Unable to read SSH key. Choose a regular key file no larger than 1 MiB.');}
  finally{bytes?.fill(0);await handle?.close().catch(()=>{});}
 }
 take(owner,keyId){
  const entry=this.owners.get(owner),key=entry?.keys.get(keyId);if(!key)throw unavailable();
  if(Date.now()>=key.expiresAt){this.discard(owner,keyId);throw unavailable();}
  clearTimeout(key.timer);entry.keys.delete(keyId);entry.active.add(key);
  // The last byte was used to detect file growth and is not part of the key.
  return {bytes:key.bytes.subarray(0,key.bytes.length-1),release:()=>{key.bytes.fill(0);entry.active.delete(key);}};
 }
 discard(owner,keyId){const entry=this.owners.get(owner),key=entry?.keys.get(keyId);if(!key)return false;clearTimeout(key.timer);key.bytes.fill(0);entry.keys.delete(keyId);return true;}
 dispose(owner){const entry=this.owners.get(owner);if(!entry)return;this.owners.delete(owner);for(const key of [...entry.keys.values(),...entry.active]){clearTimeout(key.timer);key.bytes.fill(0);}entry.keys.clear();entry.active.clear();}
}
module.exports={SftpKeyFiles,MAX_KEY_BYTES};
