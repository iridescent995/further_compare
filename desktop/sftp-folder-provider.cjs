'use strict';
const path=require('node:path').posix;
const {randomUUID}=require('node:crypto');
const {checkSignal}=require('./local-folder-reader.cjs');
const fail=message=>Error(message);
const validRelative=value=>typeof value==='string'&&!/[\\\0]/.test(value)&&(value===''||!value.split('/').some(part=>!part||part==='.'||part==='..'));
function kind(attrs){const type=attrs?.mode&0o170000;return type===0o100000?'file':type===0o040000?'directory':type===0o120000?'symlink':'other';}
function validateAttrs(attrs){
 if(!attrs||!['mode','uid','gid','size','mtime'].every(key=>Number.isSafeInteger(attrs[key])&&attrs[key]>=0)||attrs.mode>0xffffffff||attrs.uid>0xffffffff||attrs.gid>0xffffffff)throw fail('Incomplete or invalid SFTP metadata.');
 return attrs;
}
// SFTP v3 supplies second-resolution metadata, not inode/replacement evidence.
// Path/handle observations detect available changes but cannot distinguish a
// replacement with identical attributes, or atomically prevent server-side races.
class SftpFolderProvider {
 static async create(connection,root,options={}){
  if(!connection||typeof connection.request!=='function'||typeof connection.close!=='function')throw fail('Choose a connected SFTP endpoint.');
  if(typeof root!=='string'||!root||/[\\\0]/.test(root)||root.split('/').includes('..'))throw fail('Invalid remote root.');
  const [canonical]=await connection.request('realpath',[root],options);
  if(typeof canonical!=='string'||!canonical.startsWith('/')||path.normalize(canonical)!==canonical||/[\\\0]/.test(canonical))throw fail('Invalid canonical SFTP root.');
  const provider=new SftpFolderProvider(connection,canonical,options);
  await provider.inspectRoot(options);return provider;
 }
 constructor(connection,root,{generation=randomUUID(),maxEntries=50000,maxBatches=10000}={}){
  if(!connection||typeof connection.request!=='function'||typeof connection.close!=='function'||typeof root!=='string'||!root.startsWith('/')||path.normalize(root)!==root||/[\\\0]/.test(root))throw fail('Invalid canonical SFTP endpoint.');
  if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>50000||!Number.isSafeInteger(maxBatches)||maxBatches<1||maxBatches>50000)throw fail('Invalid SFTP enumeration limits.');
  this.connection=connection;this.root=root;this.maxEntries=maxEntries;this.maxBatches=maxBatches;
  this.rootId='sftp:'+randomUUID();this.namespace=JSON.stringify([this.rootId,generation,root]);
  this.capabilities=Object.freeze({read:true,write:false,strongRevision:false});
 }
 revoke(){this.revoked=true;}
 async request(method,args,options={}){checkSignal(options.signal);if(this.revoked||this.connection.closed)throw fail('SFTP connection closed. Reconnect to continue.');try{return await this.connection.request(method,args,options);}catch(error){checkSignal(options.signal);throw error;}}
 metadata(relative,attrs){
  validateAttrs(attrs);const entryKind=kind(attrs);
  if(!['file','directory'].includes(entryKind))throw fail('Symbolic links and special files are not followed.');
  const identity=JSON.stringify([this.namespace,relative]);
  return {path:relative,kind:entryKind,size:entryKind==='file'?attrs.size:null,mode:attrs.mode,uid:attrs.uid,gid:attrs.gid,mtime:attrs.mtime*1000,mtimeNs:String(BigInt(attrs.mtime)*1000000000n),identity,stamp:JSON.stringify([identity,attrs.mode,attrs.uid,attrs.gid,attrs.size,attrs.mtime]),strongRevision:false};
 }
 async closeHandle(handle){
  if(this.connection.closed)return;
  try{await this.connection.request('close',[handle]);}catch(error){await this.connection.close();throw error;}
 }
 async inspectRoot(options={}){
  const [attrs]=await this.request('lstat',[this.root],options),[canonical]=await this.request('realpath',[this.root],options);
  if(kind(attrs)!=='directory'||canonical!==this.root)throw fail('A selected remote root changed.');
  const info=this.metadata('',attrs);return {...info,path:this.rootId};
 }
 async observe(relative,options={}){
  if(!validRelative(relative))throw fail('Invalid relative path.');
  await this.inspectRoot(options);let full=this.root,attrs;
  if(!relative){[attrs]=await this.request('lstat',[full],options);return {full,info:this.metadata(relative,attrs)};}
  const components=relative.split('/');
  for(let index=0;index<components.length;index++){
   full=path.join(full,components[index]);[attrs]=await this.request('lstat',[full],options);
   if(!['file','directory'].includes(kind(attrs)))throw fail('Symbolic links and special files are not followed.');
   if(index<components.length-1&&kind(attrs)!=='directory')throw fail('A remote path component is not a directory.');
   const [canonical]=await this.request('realpath',[full],options);if(canonical!==full)throw fail('A remote path changed or traverses a symbolic link.');
  }
  return {full,info:this.metadata(relative,attrs)};
 }
 async inspectEntry(relative,options={}){
  if(relative===null)return null;
  try{const first=await this.observe(relative,options),second=await this.observe(relative,options);if(first.info.stamp!==second.info.stamp)throw fail('A remote entry changed while reading metadata.');return second.info;}catch(error){if(error.code===2)return null;throw error;}
 }
 async *enumerateDirectory(relative='',options={}){
  const before=await this.observe(relative,options);if(before.info.kind!=='directory')throw fail('Choose a regular remote directory.');
  const [handle]=await this.request('opendir',[before.full],options);let count=0,batches=0;
  const abort=()=>{void this.connection.close();};options.signal?.addEventListener('abort',abort,{once:true});
  try{
   while(true){
    if(++batches>this.maxBatches)throw fail('SFTP directory exceeds the batch limit.');
    let entries;try{[entries]=await this.request('readdir',[handle],options);}catch(error){if(error.code===1)break;throw error;}
    if(entries===false)break;
    if(!Array.isArray(entries)||!entries.length||entries.length>this.maxEntries)throw fail('Invalid or excessive SFTP directory batch.');
    for(const entry of entries){
     checkSignal(options.signal);
     if(++count>this.maxEntries)throw fail('Folder exceeds the SFTP entry limit.');
     const name=entry?.filename;if(typeof name!=='string'||!name||/[\\/\0]/.test(name))throw fail('Invalid SFTP directory entry.');
     if(name==='.'||name==='..')continue;
     validateAttrs(entry.attrs);yield {name,kind:kind(entry.attrs)};
    }
   }
   const after=await this.observe(relative,options);if(after.info.stamp!==before.info.stamp)throw fail('A remote directory changed during listing.');
  }finally{options.signal?.removeEventListener('abort',abort);await this.closeHandle(handle);}
 }
 async openFileReader(relative,options={}){
  const before=await this.observe(relative,options);if(before.info.kind!=='file')throw fail('Choose a regular remote file.');
  const [handle]=await this.request('open',[before.full,'r'],options);let closed=false,position=0;
  const abort=()=>{void this.connection.close();};options.signal?.addEventListener('abort',abort,{once:true});
  const close=async()=>{if(closed)return;closed=true;options.signal?.removeEventListener('abort',abort);await this.closeHandle(handle);};
  try{
   const [attrs]=await this.request('fstat',[handle],options),metadata=this.metadata(relative,attrs);
   if(metadata.kind!=='file'||metadata.stamp!==before.info.stamp)throw fail('A remote file changed before reading.');
   const validate=async()=>{
    if(closed)throw fail('File reader is closed.');
    const [currentAttrs]=await this.request('fstat',[handle],options),current=await this.observe(relative,options);
    if(this.metadata(relative,currentAttrs).stamp!==metadata.stamp||current.info.stamp!==metadata.stamp)throw fail('A remote file changed while being read.');return current.info;
   };
   await validate();
   return {metadata,validate,close,read:async(maxBytes=65536)=>{
    checkSignal(options.signal);if(closed)throw fail('File reader is closed.');
    if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>1048576)throw fail('Invalid file read size.');
    const length=Math.min(maxBytes,metadata.size-position+1),buffer=Buffer.alloc(length);let bytes;
    try{[bytes]=await this.request('read',[handle,buffer,0,length,position],options);}catch(error){if(error.code!==1)throw error;bytes=0;}
    if(!Number.isSafeInteger(bytes)||bytes<0||bytes>length)throw fail('Invalid SFTP read result.');
    if(bytes>metadata.size-position)throw fail('A remote file grew while being read.');
    position+=bytes;return bytes?buffer.subarray(0,bytes):null;
   }};
  }catch(error){await close();throw error;}
 }
}
module.exports={SftpFolderProvider};
