'use strict';
const {createHash}=require('node:crypto');
const {checkSignal}=require('./local-folder-reader.cjs');
const validRelative=value=>typeof value==='string'&&value.length>0&&value.length<=32768&&!/[\\\0]/.test(value)&&!value.split('/').some(part=>!part||part==='.'||part==='..');
const sameAuthority=(a,b)=>a.path===b.path&&a.identity===b.identity;
const sameFile=(a,b)=>sameAuthority(a,b)&&a.kind===b.kind&&a.stamp===b.stamp&&a.size===b.size;
const stale=()=>Object.assign(Error('A file or selected root changed while reading. Refresh the folder.'),{code:'STALE_SOURCE'});
function rootMetadata(value){
 if(!value||typeof value.path!=='string'||!value.path||typeof value.identity!=='string'||!value.identity)throw stale();
 return {...value};
}
function fileMetadata(value,relative){
 if(!value||value.path!==relative||value.kind!=='file'||typeof value.identity!=='string'||!value.identity||typeof value.stamp!=='string'||!value.stamp||!Number.isSafeInteger(value.size)||value.size<0)throw stale();
 return {...value};
}
// Native-only streaming observation. A consumer may stage chunks, but must not
// publish them until this promise resolves and destination authority is checked.
// onChunk receives a borrowed read-only buffer; copy it if retaining it beyond
// the callback. Consumers compare the digest to their approved source baseline.
// Weak remote metadata cannot prove that concurrent same-attribute writes did
// not occur; the digest records the bytes actually observed by this read.
async function snapshotProviderFile(provider,relative,{signal,onChunk,maxBytes=Number.MAX_SAFE_INTEGER}={}){
 checkSignal(signal);
 if(!provider||!['inspectRoot','inspectEntry','openFileReader'].every(key=>typeof provider[key]==='function')||!validRelative(relative))throw Error('Choose a regular file inside the selected root.');
 if(!Number.isSafeInteger(maxBytes)||maxBytes<0||onChunk!==undefined&&typeof onChunk!=='function')throw Error('Invalid file snapshot options.');
 const root=rootMetadata(await provider.inspectRoot({signal}));checkSignal(signal);
 const metadata=fileMetadata(await provider.inspectEntry(relative,{signal}),relative);checkSignal(signal);
 if(metadata.size>maxBytes)throw Error('File exceeds the allowed byte limit.');
 let reader,failed=false;
 try{
  reader=await provider.openFileReader(relative,{signal});checkSignal(signal);
  if(!reader||!['read','validate','close'].every(key=>typeof reader[key]==='function')||!sameFile(fileMetadata(reader.metadata,relative),metadata))throw stale();
  const hash=createHash('sha256');let byteLength=0;
  while(true){
   checkSignal(signal);
   // Probe EOF with one extra byte without overflowing MAX_SAFE_INTEGER.
   const requested=Math.min(65535,metadata.size-byteLength)+1;
   const chunk=await reader.read(requested);checkSignal(signal);
   if(chunk===null)break;
   if(!(chunk instanceof Uint8Array)||!chunk.byteLength||chunk.byteLength>requested)throw Error('Invalid provider file chunk.');
   if(chunk.byteLength>metadata.size-byteLength)throw stale();
   hash.update(chunk);
   if(onChunk)await onChunk(chunk,byteLength);
   checkSignal(signal);byteLength+=chunk.byteLength;
  }
  if(byteLength!==metadata.size)throw stale();
  if(!sameFile(fileMetadata(await reader.validate(),relative),metadata))throw stale();checkSignal(signal);
  if(!sameFile(fileMetadata(await provider.inspectEntry(relative,{signal}),relative),metadata))throw stale();checkSignal(signal);
  if(!sameAuthority(rootMetadata(await provider.inspectRoot({signal})),root))throw stale();checkSignal(signal);
  return {root,metadata,sha256:hash.digest('hex'),byteLength};
 }catch(error){failed=true;throw error;}
 finally{
  if(reader&&typeof reader.close==='function')try{await reader.close();}catch(error){if(!failed)throw error;}
  if(!failed)checkSignal(signal);
 }
}
module.exports={snapshotProviderFile};
