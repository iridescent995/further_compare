import {extractPdfText,PDF_LIMITS,documentError} from './pdf-text-extractor.js';
// Own both the module worker and wall-clock deadline, including module startup.
export async function extractPdfTextInBrowser(bytes,{signal,order='document',assetRoot=new URL('./pdf/',document.baseURI).href}={}){
 if(!['document','page-rows','page-columns','tagged-structure'].includes(order))throw documentError('DOCUMENT_INVALID','Invalid PDF ordering policy.');
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>PDF_LIMITS.input)throw documentError('DOCUMENT_LIMIT','PDF input must be between 1 byte and 32 MiB.');
 if(signal?.aborted)throw documentError('DOCUMENT_CANCELLED','PDF extraction cancelled.');
 const root=new URL(assetRoot,document.baseURI);if(root.origin!==location.origin)throw documentError('DOCUMENT_RESOURCE','PDF assets must be local to this application.');
 let thread,pdfWorker,timer,abort;const controller=new AbortController();
 const stopped=new Promise((_,reject)=>{abort=()=>{controller.abort();thread?.terminate();reject(documentError('DOCUMENT_CANCELLED','PDF extraction cancelled.'));};signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{controller.abort();thread?.terminate();reject(documentError('DOCUMENT_TIMEOUT','PDF extraction timed out.'));},PDF_LIMITS.time);});
 try{return await Promise.race([(async()=>{
  const pdfjs=await import(/* @vite-ignore */new URL('pdf.mjs',root).href);if(controller.signal.aborted)throw documentError('DOCUMENT_CANCELLED','PDF extraction cancelled.');
  thread=new Worker(new URL('pdf.worker.mjs',root),{type:'module'});pdfWorker=new pdfjs.PDFWorker({port:thread});
  return extractPdfText(bytes,{pdfjs,order,worker:pdfWorker,signal:controller.signal,cMapUrl:new URL('cmaps/',root).href,standardFontDataUrl:new URL('standard_fonts/',root).href});
 })(),stopped]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();thread?.terminate();pdfWorker?.destroy();}
}
