'use strict';
// Fixed Node-only extraction child. One bounded request; no command/path input.
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const MAX_INPUT=32*1024*1024,MAX_OUTPUT=8*1024*1024;let chunks=[],size=0,responded=false;
// PDF.js diagnostics must never enter the framed response stream.
console.log=console.info=console.warn=()=>{};
function respond(value){if(responded)return;responded=true;const {content='',...metadata}=value,json=Buffer.from(JSON.stringify(metadata)),text=Buffer.from(content);if(json.length>8192||text.length>MAX_OUTPUT){process.exitCode=2;return;}const header=Buffer.alloc(8);header.writeUInt32BE(json.length);header.writeUInt32BE(text.length,4);process.stdout.write(header);process.stdout.write(json);process.stdout.write(text);}
process.stdin.on('error',()=>{process.exitCode=2;});
process.stdin.on('data',chunk=>{size+=chunk.length;if(size>MAX_INPUT+5){process.exitCode=2;process.stdin.destroy();return;}chunks.push(chunk);});
process.stdin.on('end',async()=>{let worker;try{
 const framed=Buffer.concat(chunks);chunks=[];if(framed.length<6||framed.readUInt32BE()>MAX_INPUT||framed.length!==framed.readUInt32BE()+5||framed[4]>3)throw Object.assign(Error('Invalid PDF input frame.'),{code:'DOCUMENT_INVALID'});
 const order=framed[4]===3?'tagged-structure':framed[4]===2?'page-columns':framed[4]===1?'page-rows':'document';
 let pdfjs,root;try{root=path.dirname(require.resolve('pdfjs-dist/package.json'));require('@napi-rs/canvas');pdfjs=await import(pathToFileURL(path.join(root,'legacy/build/pdf.mjs')).href);}catch{throw Object.assign(Error('The Node PDF engine is unavailable. Install the supported PDF.js and canvas dependencies.'),{code:'DOCUMENT_ENGINE_UNAVAILABLE'});}
 const {extractPdfText}=await import('./pdf-text-core.mjs');
 const {validateDocumentProjection}=require('./document-projection.cjs');
 let roots;try{roots={cMapUrl:await fs.realpath(path.join(root,'cmaps')),standardFontDataUrl:await fs.realpath(path.join(root,'standard_fonts'))};}catch{throw Object.assign(Error('PDF packaged resources are unavailable.'),{code:'DOCUMENT_RESOURCE'});}
 async function readBinaryResource({kind,filename}){
  const base=roots[kind];if(!base||typeof filename!=='string'||!/^[A-Za-z0-9_.-]+$/.test(filename)||filename.includes('..'))throw Error('Invalid PDF resource.');
  const file=await fs.realpath(path.join(base,filename));if(!file.startsWith(base+path.sep))throw Error('PDF resource escaped its package.');
  const handle=await fs.open(file,'r');try{const stat=await handle.stat();if(!stat.isFile()||stat.size>8*1024*1024)throw Error('PDF resource exceeds limit.');const bytes=Buffer.alloc(stat.size+1);const {bytesRead}=await handle.read(bytes,0,bytes.length,0);if(bytesRead!==stat.size)throw Error('PDF resource changed while reading.');return new Uint8Array(bytes.subarray(0,bytesRead));}finally{await handle.close();}
 }
 worker=new pdfjs.PDFWorker();const value=await extractPdfText(new Uint8Array(framed.subarray(5)),{pdfjs,order,worker,readBinaryResource});respond({ok:true,content:value.content,projection:validateDocumentProjection(value.projection)});
 }catch(error){respond({ok:false,error:{code:typeof error.code==='string'&&error.code.startsWith('DOCUMENT_')?error.code:'DOCUMENT_INVALID',message:String(error.message||'PDF extraction failed.').slice(0,1024)}});}finally{worker?.destroy();}});
