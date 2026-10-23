'use strict';
// Isolated experiment: supply downloaded official package + encrypted fixture.
// Does not install dependencies, write app sources, or modify input documents.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('@playwright/test');
const root=process.env.FC_PDF_SPIKE_ROOT||'/private/tmp/fc-pdf-engine-spike';
function fixture(empty=false){
 const cmap='/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Unicode def /CMapType 2 def 1 begincodespacerange <00> <FF> endcodespacerange 3 beginbfchar <41> <03A9> <42> <4E2D> <43> <D83DDE80> endbfchar endcmap CMapName currentdict /CMap defineresource pop end end';
 const stream=s=>`<< /Length ${Buffer.byteLength(s)} >>\nstream\n${s}\nendstream`;
 const content=empty?'': 'BT /F1 16 Tf 72 700 Td <414243> Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',...Array(2).fill('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>'),'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /ToUnicode 7 0 R >>',stream(content),stream(cmap)];
 let output='%PDF-1.7\n',offsets=[0];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(output));output+=`${index+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(output);output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return [...Buffer.from(output)];
}
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage(),unexpected=[];await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='pdf.test'){unexpected.push(url.href);return route.abort();}if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>PDF engine spike</title>'});const file=path.join(root,'package',url.pathname);if(!file.startsWith(path.join(root,'package')+path.sep))return route.abort();try{return route.fulfill({contentType:'text/javascript',body:await fs.readFile(file)});}catch{return route.abort();}});await page.goto('https://pdf.test/');
 const results=await page.evaluate(async fixtures=>{
  const pdf=await import('/build/pdf.mjs');pdf.GlobalWorkerOptions.workerSrc='/build/pdf.worker.mjs';
  const output={version:pdf.version,results:[]};
  for(const [name,bytes] of Object.entries(fixtures)){
   const task=pdf.getDocument({data:new Uint8Array(bytes),stopAtErrors:true,isEvalSupported:false,useWorkerFetch:false,useSystemFonts:false,disableFontFace:true,enableXfa:false,useWasm:false,verbosity:0});
   try{const doc=await task.promise,pages=[];for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i),reader=p.streamTextContent().getReader();let text='';while(true){const {value,done}=await reader.read();if(done)break;for(const item of value.items)if('str'in item)text+=item.str+(item.hasEOL?'\n':'');}pages.push(text);p.cleanup();}output.results.push({name,pages});}catch(error){output.results.push({name,error:error.name,message:error.message});}finally{await task.destroy();}
  }return output;
 },{unicode:fixture(),empty:fixture(true),malformed:[...Buffer.from('not a PDF')],encrypted:[...await fs.readFile(path.join(root,'encrypted.pdf'))]});
 assert.equal(results.version,'6.2.108');assert.deepEqual(results.results[0].pages,['Ω中🚀','Ω中🚀']);assert.deepEqual(results.results[1].pages,['','']);assert.equal(results.results[2].error,'InvalidPDFException');assert.equal(results.results[3].error,'PasswordException');assert.deepEqual(unexpected,[]);console.log(JSON.stringify(results,null,2));console.log('PDF extraction spike passed; no external resource requests.');
 }finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
