'use strict';
const assert=require('node:assert/strict'),{createHash}=require('node:crypto'),Excel=require('exceljs'),Zip=require('jszip'),{build}=require('esbuild'),{chromium}=require('@playwright/test');
(async()=>{
 const book=new Excel.Workbook(),sheet=book.addWorksheet('Data'),other=book.addWorksheet('Summary');
 sheet.addTable({name:'Sales',ref:'A1',headerRow:true,columns:[{name:'id'},{name:'amount'}],rows:[[1,10],[2,20]]});
 sheet.getCell('D2').value={formula:'B2*2',result:20};sheet.getCell('D3').value={formula:'B3*2',result:40};sheet.getCell('A2').note='Keep note';
 other.getCell('A1').value={formula:'SUM(Sales[amount])',result:30};
 const zip=await Zip.loadAsync(await book.xlsx.writeBuffer());let xml=await zip.file('xl/worksheets/sheet1.xml').async('string');xml=xml.replace('<f>B2*2</f>','<f t="shared" si="7" ref="D2:D3">B2*2</f>').replace('<f>B3*2</f>','<f t="shared" si="7"/>');zip.file('xl/worksheets/sheet1.xml',xml);const original=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
 const structure={version:1,side:'a',sheetName:'Data',sourceHash:createHash('sha256').update(original).digest('hex'),sourceRows:3,sourceColumns:4,operations:[{axis:'row',operation:'insert',index:3,count:1},{axis:'column',operation:'insert',index:2,count:1}]};
 const bundle=await build({stdin:{contents:"import {exportWorkbookCopy} from './src/workbook-preserve.js';window.run=exportWorkbookCopy;",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'}),browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();await page.addScriptTag({content:bundle.outputFiles[0].text});
  const bytes=Buffer.from(await page.evaluate(async({original,structure})=>Array.from(await run(original,'Data',[],{structure})),{original:original.toString('base64'),structure}));
  const result=new Excel.Workbook();await result.xlsx.load(bytes);const data=result.getWorksheet('Data');assert.equal(data.getCell('E2').formula,'C2*2');assert.equal(data.getCell('E4').formula,'C4*2');assert.equal(data.getCell('E2').result,undefined);assert.equal(data.getCell('E4').result,undefined);assert.equal(data.getCell('A2').note,'Keep note');assert.equal(data.getCell('C1').value,'amount');assert.ok(data.getCell('B1').value);assert.notEqual(data.getCell('B1').value,'id');assert.notEqual(data.getCell('B1').value,'amount');assert.equal(result.getWorksheet('Summary').getCell('A1').formula,'SUM(Sales[amount])');assert.equal(data.getCell('C4').value,20);
  const out=await Zip.loadAsync(bytes);assert.match(await out.file('xl/tables/table1.xml').async('string'),/ref="A1:C4"/);assert.match(await out.file('xl/tables/table1.xml').async('string'),/tableColumns count="3"/);assert.doesNotMatch(await out.file('xl/worksheets/sheet1.xml').async('string'),/t="shared"/);
  for(const name of Object.keys(zip.files).filter(name=>!zip.files[name].dir&&!['xl/workbook.xml','xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml','xl/tables/table1.xml','xl/comments1.xml','xl/drawings/vmlDrawing1.vml'].includes(name)))assert.deepEqual(await out.file(name).async('nodebuffer'),await zip.file(name).async('nodebuffer'),name);
  console.log('Structural feature integration passed: table rows/columns and unique headers, shared-formula expansion/relocation, cross-sheet structured references, legacy notes and untouched package parts.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
