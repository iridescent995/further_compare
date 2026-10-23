'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const fixture=path.join(__dirname,'fixtures/pdf-external-cmap/japanese-cid.pdf'),expected='日本語の比較',hash='6ec499468b0f8f6900940e09a851903a20f2e0c16d5dc676bf2e520211792215';
test('independent CID PDF uses real external CMaps; either missing required map refuses degraded output',async()=>{
 const original=await fs.readFile(fixture);assert.equal(crypto.createHash('sha256').update(original).digest('hex'),hash);assert(!original.includes(Buffer.from('/ToUnicode')));assert(original.includes(Buffer.from('/UniJIS-UCS2-H')));
 const {extractPdfTextInNode}=require('../src/pdf-text-node.cjs');assert.equal((await extractPdfTextInNode(original)).content,expected);
 require('@napi-rs/canvas');const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),{extractPdfText}=await import('../src/pdf-text-core.mjs'),root=path.dirname(require.resolve('pdfjs-dist/package.json'));
 for(const missing of [null,'UniJIS-UCS2-H.bcmap','Adobe-Japan1-UCS2.bcmap',null]){
  const requested=[],bytes=new Uint8Array(original),worker=new pdfjs.PDFWorker();
  try{const pending=extractPdfText(bytes,{pdfjs,worker,readBinaryResource:async({kind,filename})=>{requested.push(filename);if(filename===missing)throw Error('Deliberately missing required map');return new Uint8Array(await fs.readFile(path.join(root,kind==='cMapUrl'?'cmaps':'standard_fonts',filename)));}});
   if(missing)await assert.rejects(pending,{code:'DOCUMENT_RESOURCE'});else{assert.equal((await pending).content,expected);for(const file of ['UniJIS-UCS2-H.bcmap','Adobe-Japan1-UCS2.bcmap'])assert(requested.includes(file),'Expected actual request: '+file);}
   if(missing)assert(requested.includes(missing));assert.deepEqual(Buffer.from(bytes),original);
  }finally{worker.destroy();}
 }
 assert.deepEqual(await fs.readFile(fixture),original);
});
