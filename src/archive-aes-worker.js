import {openAesArchive} from './archive-aes-reader.js';
let archive=null,busy=false;
const metadata=entry=>({...Object.fromEntries(['path','name','kind','size','modified','permissions','implicit','encrypted'].filter(key=>entry[key]!==undefined).map(key=>[key,entry[key]])),encrypted:!!entry.encryption,encryptionType:entry.encryption?.type||null,authenticated:entry.encryption?.authenticated===true});
self.onmessage=async({data})=>{
 const id=data?.id;
 if(!Number.isSafeInteger(id)||id<1)return;
 if(busy){self.postMessage({id,error:{code:'ARCHIVE_BUSY',message:'Wait for archive reading to finish.'}});return;}
 busy=true;
 try{
  if(data.operation==='open'){
   if(archive)throw Error('Archive is already open.');
   archive=await openAesArchive(data.bytes);
   self.postMessage({id,result:{entries:[...archive.entries.values()].map(metadata),totalBytes:archive.totalBytes,encrypted:archive.encrypted}});
  }else if(data.operation==='read'){
   if(!archive)throw Error('Open an archive first.');
   const bytes=await archive.read(data.path,{password:data.password});
   self.postMessage({id,result:bytes},[bytes.buffer]);
  }else throw Error('Unsupported archive operation.');
 }catch(error){self.postMessage({id,error:{code:typeof error.code==='string'?error.code:'ARCHIVE_READ_FAILED',message:String(error.message||'Archive could not be read.').slice(0,512)}});}
 finally{if(data&&Object.hasOwn(data,'password'))data.password=null;busy=false;}
};
