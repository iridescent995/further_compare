import {createPdfTaggedPage,PDF_TAGGED_EXCLUSIONS} from './pdf-tagged-order.mjs';
export {PDF_TAGGED_EXCLUSIONS};
import {orderPdfPageItems,orderPdfPageColumns} from './pdf-page-order.mjs';
// Shared text-only extraction. Callers own a real terminable PDF.js worker.
export const PDF_ENGINE_VERSION='6.2.108';
export const PDF_LIMITS=Object.freeze({input:32*1024*1024,output:8*1024*1024,pages:1000,items:1000000,time:30000});
export const PDF_EXCLUSIONS=Object.freeze(['Page layout, fonts, colors and graphics','Images and scanned text without an existing text layer (no OCR)','Annotations, attachments, forms and scripts','Reading order follows extracted page text; columns may differ from visual order']);
export const PDF_PAGE_ROWS_EXCLUSIONS=Object.freeze([...PDF_EXCLUSIONS.slice(0,3),'Text ordered by geometric page rows; columns, tables, rotated text and logical reading order may differ from visual order']);
export const PDF_PAGE_COLUMNS_EXCLUSIONS=Object.freeze([...PDF_EXCLUSIONS.slice(0,3),'Text ordered by geometric columns and spanning rows; tables, rotated text and logical reading order may differ from visual order']);
export const documentError=(code,message)=>Object.assign(new Error(message),{code});
export async function extractPdfText(bytes,{pdfjs,worker,signal,cMapUrl,standardFontDataUrl,readBinaryResource,order='document'}={}){
 if(!['document','page-rows','page-columns','tagged-structure'].includes(order))throw documentError('DOCUMENT_INVALID','Invalid PDF text ordering policy.');
 if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>PDF_LIMITS.input)throw documentError('DOCUMENT_LIMIT','PDF input must be between 1 byte and 32 MiB.');
 if(pdfjs?.version!==PDF_ENGINE_VERSION||!worker)throw documentError('DOCUMENT_ENGINE_UNAVAILABLE','PDF extraction engine or worker is unavailable.');
 const check=()=>{if(signal?.aborted)throw documentError('DOCUMENT_CANCELLED','PDF extraction cancelled.');};check();
 // Route auxiliary font/CMap requests through a bounded, local-only reader.
 // XHR supports packaged file: URLs where worker fetch does not.
 let resourceFailure=null;
 class BinaryDataFactory {
  async fetch({kind,filename}){try{
   const base=kind==='cMapUrl'?cMapUrl:kind==='standardFontDataUrl'?standardFontDataUrl:null;
   if((!base&&!readBinaryResource)||!['cMapUrl','standardFontDataUrl'].includes(kind)||typeof filename!=='string'||!(/^[A-Za-z0-9_.-]+$/.test(filename))||filename.includes('..'))throw Error('Unsupported PDF auxiliary resource.');
   if(readBinaryResource){const value=await readBinaryResource({kind,filename});if(!(value instanceof Uint8Array)||value.byteLength>8*1024*1024)throw Error('PDF auxiliary resource exceeds limit.');return value;}
   return await new Promise((resolve,reject)=>{const request=new XMLHttpRequest();request.open('GET',new URL(filename,base).href,true);request.responseType='arraybuffer';request.timeout=10000;
    request.onprogress=event=>{if(event.loaded>8*1024*1024){request.abort();reject(Error('PDF auxiliary resource exceeds limit.'));}};
    const cancel=()=>request.abort();signal?.addEventListener('abort',cancel,{once:true});request.onloadend=()=>signal?.removeEventListener('abort',cancel);
    request.onerror=request.ontimeout=()=>reject(Error('PDF auxiliary resource unavailable.'));
    request.onabort=()=>reject(Error('PDF auxiliary resource cancelled.'));
    request.onload=()=>{if((request.status!==0&&request.status!==200)||!(request.response instanceof ArrayBuffer)||request.response.byteLength>8*1024*1024)return reject(Error('PDF auxiliary resource unavailable.'));resolve(new Uint8Array(request.response));};if(signal?.aborted){signal.removeEventListener('abort',cancel);return reject(documentError('DOCUMENT_CANCELLED','PDF extraction cancelled.'));}request.send();
   });
  }catch(error){resourceFailure=error;throw error;}
 }
 }
 const task=pdfjs.getDocument({data:bytes.slice(),worker,BinaryDataFactory,stopAtErrors:true,isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,useWasm:false,enableXfa:false,cMapUrl,cMapPacked:true,standardFontDataUrl,verbosity:0});
 const abort=()=>{void task.destroy().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{
  const document=await task.promise;check();if(document.numPages<1||document.numPages>PDF_LIMITS.pages)throw documentError('DOCUMENT_LIMIT','PDF exceeds the 1,000 page limit.');
  const taggedBudget={events:0,nodes:0};let size=0,items=0,emptyPages=0,taggedReadBytes=0;const pages=[],encoder=new TextEncoder();
  for(let number=1;number<=document.numPages;number++){
   check();const page=await document.getPage(number),reader=page.streamTextContent(order==='tagged-structure'?{includeMarkedContent:true}:undefined).getReader(),viewport=['page-rows','page-columns'].includes(order)?page.getViewport({scale:1}):null,tagged=order==='tagged-structure'?createPdfTaggedPage({budget:taggedBudget,maxOutputBytes:PDF_LIMITS.output-size,signal}):null;let content='',pageSize=0,taggedFailure=null;const pageItems=[];
   try{while(true){check();const chunk=await reader.read();if(chunk.done)break;if(tagged){items+=chunk.value.items.length;if(items>PDF_LIMITS.items)throw documentError('DOCUMENT_LIMIT','PDF exceeds the text item limit.');for(const item of chunk.value.items)if(typeof item.str==='string'){taggedReadBytes+=encoder.encode(item.str+(item.hasEOL?'\n':'')).length;if(taggedReadBytes>PDF_LIMITS.output)throw documentError('DOCUMENT_LIMIT','PDF extracted text exceeds 8 MiB.');}if(!taggedFailure)try{tagged.add(chunk.value.items);}catch(error){if(error.code!=='DOCUMENT_ORDER_UNSUPPORTED')throw error;taggedFailure=error;}continue;}for(const item of chunk.value.items){if(++items>PDF_LIMITS.items)throw documentError('DOCUMENT_LIMIT','PDF exceeds the text item limit.');if(typeof item.str!=='string')continue;const text=item.str+(order==='document'&&item.hasEOL?'\n':'');const textSize=encoder.encode(text).length;size+=textSize;pageSize+=textSize;if(size>PDF_LIMITS.output)throw documentError('DOCUMENT_LIMIT','PDF extracted text exceeds 8 MiB.');if(order!=='document')pageItems.push(item);else content+=text;}}if(tagged){if(taggedFailure)throw taggedFailure;content=tagged.finish(await page.getStructTree());check();size+=encoder.encode(content).length;if(size>PDF_LIMITS.output)throw documentError('DOCUMENT_LIMIT','PDF extracted text exceeds 8 MiB.');}}
   finally{await reader.cancel().catch(()=>{});page.cleanup();}
   if(order!=='document'&&!tagged){content=(order==='page-columns'?orderPdfPageColumns:orderPdfPageItems)(pageItems,{viewport,signal,maxItems:PDF_LIMITS.items,maxOutputBytes:PDF_LIMITS.output-(size-pageSize)});size+=encoder.encode(content).length-pageSize;if(size>PDF_LIMITS.output)throw documentError('DOCUMENT_LIMIT','PDF extracted text exceeds 8 MiB.');}
   if(!content.trim())emptyPages++;pages.push(content);if(number<document.numPages)size+=2;if(size>PDF_LIMITS.output)throw documentError('DOCUMENT_LIMIT','PDF extracted text exceeds 8 MiB.');
  }
  if(resourceFailure)throw documentError('DOCUMENT_RESOURCE','PDF font or character mapping resource failed: '+resourceFailure.message);
  if(emptyPages===document.numPages)throw documentError('DOCUMENT_NO_TEXT','PDF has no extractable text. Scanned images require OCR, which is not supported.');
  return {content:pages.join('\n\n'),projection:{kind:'pdf',version:order==='document'?1:order==='page-rows'?2:order==='page-columns'?3:4,engine:'pdfjs',engineVersion:PDF_ENGINE_VERSION,scope:'page-text',pages:document.numPages,emptyPages,exclusions:[...(order==='document'?PDF_EXCLUSIONS:order==='page-rows'?PDF_PAGE_ROWS_EXCLUSIONS:order==='page-columns'?PDF_PAGE_COLUMNS_EXCLUSIONS:PDF_TAGGED_EXCLUSIONS)],...(order!=='document'?{order,orderVersion:1}:{})}};
 }catch(error){if(signal?.aborted)throw documentError('DOCUMENT_CANCELLED','PDF extraction cancelled.');if(error?.name==='PasswordException')throw documentError('DOCUMENT_PASSWORD_REQUIRED','Password-protected PDFs are not supported.');if(error?.code?.startsWith('DOCUMENT_'))throw error;throw documentError('DOCUMENT_INVALID',String(error?.message||'Invalid PDF document.'));}
 finally{signal?.removeEventListener('abort',abort);await task.destroy().catch(()=>{});}
}
