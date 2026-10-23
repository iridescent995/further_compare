'use strict';
const {spawn}=require('node:child_process'),path=require('node:path');
const {validateDocumentProjection}=require('./document-projection.cjs');
const MAX_INPUT=32*1024*1024,MAX_OUTPUT=8*1024*1024,MAX_META=8192;
const CODES=new Set(['DOCUMENT_ORDER_UNSUPPORTED','DOCUMENT_ENGINE_UNAVAILABLE','DOCUMENT_PASSWORD_REQUIRED','DOCUMENT_NO_TEXT','DOCUMENT_INVALID','DOCUMENT_LIMIT','DOCUMENT_RESOURCE','DOCUMENT_TIMEOUT','DOCUMENT_CANCELLED']);
const failure=(code,message)=>Object.assign(Error(message),{code});
let active=0;
function extractPdfTextInNode(bytes,{signal,order='document'}={}){
 if(!['document','page-rows','page-columns','tagged-structure'].includes(order))return Promise.reject(failure('DOCUMENT_INVALID','Invalid PDF ordering policy.'));
 if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>MAX_INPUT)return Promise.reject(failure('DOCUMENT_LIMIT','PDF input must be between 1 byte and 32 MiB.'));
 if(signal?.aborted)return Promise.reject(failure('DOCUMENT_CANCELLED','PDF extraction cancelled.'));
 if(active>=1)return Promise.reject(failure('DOCUMENT_LIMIT','A Node PDF extraction is already running.'));
 if(process.versions.electron)return Promise.reject(failure('DOCUMENT_ENGINE_UNAVAILABLE','Use the desktop PDF extraction adapter in Electron.'));
 const input=Buffer.from(bytes);active++;
 return new Promise((resolve,reject)=>{
  const env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_PATH;
  let child;try{child=spawn(process.execPath,[path.join(__dirname,'pdf-text-node-child.cjs')],{stdio:['pipe','pipe','pipe'],windowsHide:true,env});}catch(error){active--;reject(failure('DOCUMENT_ENGINE_UNAVAILABLE',error.message));return;}
  const chunks=[];let size=0,diagnostics=0,reason=null;
  const kill=(code,message)=>{reason||=failure(code,message);child.kill('SIGKILL');};
  const abort=()=>kill('DOCUMENT_CANCELLED','PDF extraction cancelled.');signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>kill('DOCUMENT_TIMEOUT','PDF extraction timed out.'),30000);
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>MAX_OUTPUT+MAX_META+8)return kill('DOCUMENT_LIMIT','PDF response exceeds its limit.');chunks.push(chunk);});
  child.stderr.on('data',chunk=>{diagnostics+=chunk.length;if(diagnostics>16384)kill('DOCUMENT_LIMIT','PDF engine diagnostics exceeded their limit.');});
  child.stdin.on('error',()=>{});child.on('error',()=>{reason||=failure('DOCUMENT_ENGINE_UNAVAILABLE','The Node PDF child process could not start.');});
  child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);active--;try{
   if(reason)throw reason;if(code!==0)throw failure('DOCUMENT_INVALID','The PDF extraction process failed.');const frame=Buffer.concat(chunks);if(frame.length<8)throw failure('DOCUMENT_INVALID','Invalid PDF response frame.');
   const metadataSize=frame.readUInt32BE(),textSize=frame.readUInt32BE(4);if(metadataSize>MAX_META||textSize>MAX_OUTPUT||frame.length!==8+metadataSize+textSize)throw failure('DOCUMENT_INVALID','Invalid PDF response frame.');
   const decoder=new TextDecoder('utf-8',{fatal:true}),metadata=JSON.parse(decoder.decode(frame.subarray(8,8+metadataSize))),content=decoder.decode(frame.subarray(8+metadataSize));
   if(metadata.ok!==true){const error=metadata.error;throw failure(CODES.has(error?.code)?error.code:'DOCUMENT_INVALID',String(error?.message||'PDF extraction failed.').slice(0,1024));}
   if(!content.trim())throw failure('DOCUMENT_NO_TEXT','PDF has no extractable text.');const projection=validateDocumentProjection(metadata.projection);if(projection.kind!=='pdf'||(projection.order||'document')!==order)throw Error('Invalid PDF projection.');resolve({content,projection});
  }catch(error){reject(CODES.has(error.code)?error:failure('DOCUMENT_INVALID',String(error.message||'Invalid PDF response.')));}});
  if(signal?.aborted)abort();const header=Buffer.alloc(5);header.writeUInt32BE(input.length);header[4]=order==='tagged-structure'?3:order==='page-columns'?2:order==='page-rows'?1:0;child.stdin.write(header);child.stdin.end(input);
 });
}
module.exports={extractPdfTextInNode};
