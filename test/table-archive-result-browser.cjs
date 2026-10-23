'use strict';
const {chromium}=require('@playwright/test'),{build}=require('esbuild'),assert=require('node:assert/strict'),Excel=require('exceljs');
(async()=>{
 const bundle=await build({entryPoints:['src/advanced.js'],bundle:true,write:false,format:'iife',globalName:'AdvancedHarness',platform:'browser'});
 const workbook=new Excel.Workbook();workbook.addWorksheet('Original').addRows([['old','text'],['keep','value']]);const xlsx=Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
 const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage();await page.route('https://workbook.test/**',route=>route.fulfill({contentType:'text/html',body:'<main id="host"></main>'}));await page.goto('https://workbook.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});await page.evaluate(()=>{window.editor=AdvancedHarness.createAdvanced({host:document.querySelector('#host'),notify:()=>{}});});
 const rows=[['comma, quote"','tab\there','line\nbreak','नमस्ते 🎉'],['=SUM(A1:A2)','', 'last\rline',null,42,true]];
 const state=(name='file.csv',result=rows)=>({inputs:{a:{name,data:name.endsWith('.xlsx')?xlsx:Buffer.from('old').toString('base64')},b:null},options:{tableResult:name.endsWith('.xlsx')?[['updated','=SUM(A1:A2)'],['keep','value']]:result,...(name.endsWith('.xlsx')?{tableTemplate:{side:'a',sheetName:'Original',sourceHash:require('node:crypto').createHash('sha256').update(Buffer.from(xlsx,'base64')).digest('hex'),structural:false}}:{})}});
 for(const extension of ['csv','tsv']){
  await page.evaluate(s=>editor.setType('table-compare',s),state('entry.'+extension));
  const result=await page.evaluate(async()=>{const before=JSON.stringify(editor.getState()),out=await editor.getArchiveResult('a');return {out,unchanged:before===JSON.stringify(editor.getState())};});
  assert.equal(result.unchanged,true);assert.equal(result.out.name,'entry.'+extension);
  const delimiter=extension==='tsv'?'\t':',';assert.equal(Buffer.from(result.out.data,'base64').toString(),rows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(delimiter)).join('\r\n'));
 }
 await page.evaluate(s=>editor.setType('table-compare',s),state('entry.xlsx'));await page.getByRole('heading',{name:/Result table/}).waitFor();
 const exported=await page.evaluate(()=>editor.getArchiveResult('a'));const parsed=new Excel.Workbook();await parsed.xlsx.load(Buffer.from(exported.data,'base64'));assert.equal(parsed.worksheets.length,1);assert.equal(parsed.worksheets[0].name,'Original');assert.deepEqual(parsed.worksheets[0].getRow(1).values.slice(1),['updated','=SUM(A1:A2)']);assert.equal(parsed.worksheets[0].getCell('B1').type,3);
 for(const [setup,side] of [[state('file.txt'),'a'],[state('file.csv',null),'a'],[state(),'b'],[state(),'base']]){
  await page.evaluate(s=>editor.setType('table-compare',s),setup);assert.equal(await page.evaluate(async side=>{try{await editor.getArchiveResult(side);return false;}catch{return true;}},side),true);
 }
 for(const value of [NaN,Infinity,-Infinity]){
  await page.evaluate(s=>editor.setType('table-compare',s),state('entry.csv',[[value]]));assert.equal(await page.evaluate(async()=>{try{await editor.getArchiveResult('a');return false;}catch(error){return /literal cell values/.test(error.message);}}),true);
 }
 for(const mode of ['reset','result','replacement']){
  await page.evaluate(s=>editor.setType('table-compare',s),state('entry.xlsx'));await page.getByRole('heading',{name:/Result table/}).waitFor();
  const rejected=await page.evaluate(async mode=>{const pending=editor.getArchiveResult('a');if(mode==='reset')editor.reset();else if(mode==='replacement')editor.setType('table-compare',editor.getState());else {const field=document.querySelector('[aria-label="Result row 1 column 1"]');field.value='changed during export';field.dispatchEvent(new Event('input'));}try{await pending;return false;}catch(error){return /changed/.test(error.message);}},mode);assert.equal(rejected,true,mode);
 }
 await page.evaluate(s=>editor.setType('table-compare',s),state('entry.csv',[['x'.repeat(32*1024*1024)]]));assert.equal(await page.evaluate(async()=>{try{await editor.getArchiveResult('a');return false;}catch(error){return /32 MiB/.test(error.message);}}),true);
 console.log('Table archive result passed: exact CSV/TSV quoting, Unicode, preserved XLSX, state preservation, target validation, size bound, and stale async export rejection.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
