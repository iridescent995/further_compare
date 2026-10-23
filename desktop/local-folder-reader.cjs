'use strict';
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const {metadataFromStat}=require('./local-folder-metadata.cjs');
function checkSignal(signal){if(signal?.aborted){const error=Error('Folder comparison cancelled.');error.code='ABORT_ERR';throw error;}}
async function openLocalFileReader(service,side,relative,{signal}={}){
 checkSignal(signal);
 const root=await service.inspectRoot(side);if(!root)throw Error('Choose a folder first.');const full=await service.safe(side,relative);
 const handle=await fs.open(full,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 let closed=false,position=0;
 try{
  const before=await handle.stat({bigint:true});if(!before.isFile())throw Error('An entry changed type. Refresh the folder.');
  const metadata=metadataFromStat(relative,before);
  const validate=async()=>{
   checkSignal(signal);
   const after=metadataFromStat(relative,await handle.stat({bigint:true})),current=await service.inspectEntry(side,relative),currentRoot=await service.inspectRoot(side);
   if(!current||!currentRoot||currentRoot.path!==root.path||currentRoot.identity!==root.identity||await service.safe(side,relative)!==full||after.stamp!==metadata.stamp||current.stamp!==metadata.stamp||current.identity!==metadata.identity)throw Error('A file changed while being read. Refresh the folder.');
   checkSignal(signal);return {...current};
  };
  await validate();
  return {metadata,async read(maxBytes=65536){checkSignal(signal);if(closed)throw Error('File reader is closed.');if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>1048576)throw Error('Invalid file read size.');const buffer=Buffer.allocUnsafe(maxBytes),{bytesRead}=await handle.read(buffer,0,maxBytes,position);checkSignal(signal);position+=bytesRead;return bytesRead?buffer.subarray(0,bytesRead):null;},validate,async close(){if(!closed){closed=true;await handle.close();}}};
 }catch(error){await handle.close();throw error;}
}
module.exports={openLocalFileReader,checkSignal};
