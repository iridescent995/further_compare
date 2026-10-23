'use strict';
const {decodeText,validateText,detectLineEnding}=require('./text-codec.cjs');
const {extractDocxText}=require('./docx-text.cjs');
const {extractRtfText}=require('./rtf-text.cjs');
const {extractOdtText}=require('./odt-text.cjs');
const {validateDocumentProjection}=require('./document-projection.cjs');
const {DOMParser}=require('@xmldom/xmldom');
function isDocumentInput(name){return typeof name==='string'&&/\.(doc|docx|pdf|rtf|odt)$/i.test(name);}
async function decodeTextInput(bytes,name,encoding='auto',options={}){
  if(!isDocumentInput(name))return decodeText(bytes,encoding);
  if(options.docxScope!==undefined&&!['main-document','main-and-related-text'].includes(options.docxScope))throw Error('Invalid DOCX text scope.');
  if(options.odtScope!==undefined&&!['main-document','main-and-related-text'].includes(options.odtScope))throw Error('Invalid ODT text scope.');
  if(options.docScope!==undefined&&!['main-document','main-and-related-text'].includes(options.docScope))throw Error('Invalid DOC text scope.');
  const doc=/\.doc$/i.test(name);
  if(doc&&(!(bytes instanceof Uint8Array)||bytes.byteLength>32*1024*1024))throw Error('DOC file exceeds the 32 MB input limit.');
  if(doc&&typeof options.extractDocText!=='function')throw Error('DOC text extraction is unavailable in this runtime.');
  const pdf=/\.pdf$/i.test(name),rtf=/\.rtf$/i.test(name),odt=/\.odt$/i.test(name);
  if(options.pdfOrder!==undefined&&!['document','page-rows','page-columns','tagged-structure'].includes(options.pdfOrder))throw Error('Invalid PDF text ordering policy.');
  if(pdf&&typeof options.extractPdfText!=='function')throw Error('PDF text extraction is unavailable in this runtime.');
  if(pdf&&(!(bytes instanceof Uint8Array)||bytes.byteLength>32*1024*1024))throw Error('PDF file exceeds the 32 MB input limit.');
  const {content,projection}=doc?await options.extractDocText(Uint8Array.from(bytes),{signal:options.signal,scope:options.docScope??'main-document'}):pdf?await options.extractPdfText(bytes.slice(),{signal:options.signal,order:options.pdfOrder??'document'}):rtf?await extractRtfText(bytes):odt?await extractOdtText(bytes,{DOMParser:globalThis.DOMParser||DOMParser,scope:options.odtScope??'main-document'}):await extractDocxText(bytes,{DOMParser:globalThis.DOMParser||DOMParser,scope:options.docxScope??'main-document'});
  const metadata=validateDocumentProjection(projection);
  if(metadata.kind!==(doc?'doc':pdf?'pdf':rtf?'rtf':odt?'odt':'docx'))throw Error('Document extraction returned incorrect provenance.');
  if(pdf&&(metadata.order||'document')!==(options.pdfOrder??'document'))throw Error('Document extraction returned incorrect PDF ordering provenance.');
  if(metadata.kind==='docx'&&metadata.scope!==(options.docxScope??'main-document'))throw Error('Document extraction returned incorrect DOCX scope provenance.');
  if(metadata.kind==='odt'&&metadata.scope!==(options.odtScope??'main-document'))throw Error('Document extraction returned incorrect ODT scope provenance.');
  if(doc&&metadata.scope!==(options.docScope??'main-document'))throw Error('Document extraction returned incorrect DOC scope provenance.');
  validateText(content);
  if(doc&&new TextEncoder().encode(content).byteLength>8*1024*1024)throw Error('DOC extraction returned oversized text.');
  if(pdf&&(!content.trim()||new TextEncoder().encode(content).byteLength>8*1024*1024))throw Error('PDF extraction returned empty or oversized text.');
  return {content,format:{encoding:'utf8',bom:false,lineEnding:detectLineEnding(content)},documentProjection:metadata};
}
module.exports={decodeTextInput,isDocumentInput};
