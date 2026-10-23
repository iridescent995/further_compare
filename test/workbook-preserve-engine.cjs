'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const {build}=require('esbuild');
const Excel=require('exceljs');
const Zip=require('jszip');
(async()=>{
 const workbook=new Excel.Workbook(),sheet=workbook.addWorksheet('Data');
 sheet.addRows([['Label','Value'],['old',10],['formula',{formula:'B2*2',result:20}]]);sheet.getCell('A2').font={bold:true,color:{argb:'FF123456'}};sheet.getCell('A2').numFmt='@';sheet.mergeCells('D2:E2');sheet.getCell('D2').value='merged';
 workbook.addWorksheet('Keep').getCell('B3').value={formula:'Data!B2',result:10};workbook.creator='Preservation fixture';
 const original=Buffer.from(await workbook.xlsx.writeBuffer()),zip=await Zip.loadAsync(original);
 zip.file('customXml/opaque.bin',Buffer.from([0,1,255,128,17]));
 const source=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
 const bundled=await build({stdin:{contents:"import {exportWorkbookCopy} from './src/workbook-preserve.js'; window.exportWorkbookCopy=exportWorkbookCopy;",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',target:'es2022'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage();await page.addScriptTag({content:bundled.outputFiles[0].text});
 const run=async(bytes,changes,name='Data')=>Buffer.from(await page.evaluate(async({base64,changes,name})=>Array.from(await window.exportWorkbookCopy(base64,name,changes)),{base64:Buffer.from(bytes).toString('base64'),changes,name}));
 const reject=async(bytes,changes,pattern,name)=>assert.rejects(()=>run(bytes,changes,name),pattern);
 const changed=await run(source,[{row:2,column:1,value:'  literal _x0041_ & < >  '},{row:2,column:2,value:42},{row:4,column:2,value:true},{row:5,column:3,value:null}]);
 assert.deepEqual(await run(source,[]),source);
 const out=await Zip.loadAsync(changed);
 for(const name of Object.keys(zip.files).filter(name=>!zip.files[name].dir&&!['xl/worksheets/sheet1.xml','xl/workbook.xml'].includes(name)))assert.deepEqual(await out.file(name).async('nodebuffer'),await zip.file(name).async('nodebuffer'),name);
 const parsed=new Excel.Workbook();await parsed.xlsx.load(changed);assert.equal(parsed.getWorksheet('Data').getCell('B2').value,42);assert.equal(parsed.getWorksheet('Data').getCell('B4').value,true);assert.equal(parsed.getWorksheet('Data').getCell('A2').font.bold,true);assert.equal(parsed.getWorksheet('Data').getCell('A2').numFmt,'@');assert.equal(parsed.getWorksheet('Data').getCell('B3').formula,'B2*2');assert.equal(parsed.getWorksheet('Keep').getCell('B3').formula,'Data!B2');
 const sheetXml=await out.file('xl/worksheets/sheet1.xml').async('string');assert.match(sheetXml,/_x005F_x0041_/);assert.match(sheetXml,/xml:space="preserve"/);assert.match(await out.file('xl/workbook.xml').async('string'),/fullCalcOnLoad="1"/);
 await reject(source,[{row:2,column:5,value:'x'}],/subordinate merged/);
 await reject(source,[{row:0,column:1,value:'x'}],/1-based/);
 await reject(source,[{row:2,column:1,value:'\0'}],/valid literal/);
 await reject(source,[{row:2,column:1,value:'x'},{row:2,column:1,value:'y'}],/Duplicate/);
 await reject(source,[{row:2,column:1,value:'x'}],/uniquely named/,'Absent');
 const modified=async(fn)=>{const item=await Zip.loadAsync(source);await fn(item);return item.generateAsync({type:'nodebuffer',compression:'DEFLATE'});};
 const formula=await modified(async z=>z.file('xl/worksheets/sheet1.xml',(await z.file('xl/worksheets/sheet1.xml').async('string')).replace('<f>B2*2</f>','<f t="array" ref="B3:C4">B2*2</f>')));
 await reject(formula,[{row:4,column:3,value:'x'}],/array/);
 const shared=await modified(async z=>z.file('xl/worksheets/sheet1.xml',(await z.file('xl/worksheets/sheet1.xml').async('string')).replace('<f>B2*2</f>','<f t="shared" ref="B3:B5" si="0">B2*2</f>')));
 await reject(shared,[{row:4,column:2,value:'x'}],/shared/);
 const signed=await modified(z=>z.file('_xmlsignatures/sig1.xml','<opaque/>'));await reject(signed,[{row:2,column:1,value:'x'}],/signed/);assert.deepEqual(await run(signed,[]),signed);
 const chain=await modified(async z=>{z.file('xl/calcChain.xml','<calcChain xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><c r="B3" i="1"/></calcChain>');z.file('xl/_rels/workbook.xml.rels',(await z.file('xl/_rels/workbook.xml.rels').async('string')).replace('</Relationships>','<Relationship Id="rCalc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain" Target="calcChain.xml"/></Relationships>'));z.file('[Content_Types].xml',(await z.file('[Content_Types].xml').async('string')).replace('</Types>','<Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/></Types>'));});
 const chainOut=await Zip.loadAsync(await run(chain,[{row:2,column:2,value:9}]));assert.equal(chainOut.file('xl/calcChain.xml'),null);assert.doesNotMatch(await chainOut.file('xl/_rels/workbook.xml.rels').async('string'),/calcChain/);assert.doesNotMatch(await chainOut.file('[Content_Types].xml').async('string'),/calcChain/);
 // Explicit types must survive serialization without turning literal '=' text into formulas.
 const typedBytes=await run(chain,[{row:2,column:1,type:'formula',value:'=SUM(B2,3)'},{row:3,column:2,type:'formula',value:'B2<20'},{row:2,column:2,type:'number',value:12.5},{row:4,column:2,type:'boolean',value:false},{row:2,column:4,type:'blank',value:null},{row:5,column:1,type:'text',value:'=B2+1'}]);
 const typedZip=await Zip.loadAsync(typedBytes),typedXml=await typedZip.file('xl/worksheets/sheet1.xml').async('string');
 const typedCells=await page.evaluate(xml=>{const doc=new DOMParser().parseFromString(xml,'application/xml');return Object.fromEntries(Array.from(doc.getElementsByTagName('c')).map(c=>[c.getAttribute('r'),{type:c.getAttribute('t'),formula:c.getElementsByTagName('f')[0]?.textContent,values:c.getElementsByTagName('v').length,inline:c.getElementsByTagName('is').length,style:c.getAttribute('s')}]));},typedXml);
 assert.equal(typedCells.A2.formula,'SUM(B2,3)');assert.equal(typedCells.B3.formula,'B2<20');
 for(const ref of ['A2','B3']){assert.equal(typedCells[ref].values,0,'No stale formula cache '+ref);assert.equal(typedCells[ref].inline,0);assert.equal(typedCells[ref].type,null);}
 assert.equal(typedCells.D2.values,0);assert.equal(typedCells.D2.inline,0);assert.equal(typedCells.D2.formula,undefined);assert.equal(typedCells.B4.type,'b');
 const typedBook=new Excel.Workbook();await typedBook.xlsx.load(typedBytes);const typedSheet=typedBook.getWorksheet('Data');
 assert.equal(typedSheet.getCell('A2').font.bold,true);assert.equal(typedSheet.getCell('A2').numFmt,'@');assert.equal(typedSheet.getCell('B2').value,12.5);assert.equal(typedSheet.getCell('B4').value,false);assert.equal(typedSheet.getCell('D2').value,null);assert.equal(typedSheet.getCell('A5').value,'=B2+1');assert.equal(typedSheet.getCell('A5').formula,undefined);
 assert.equal(typedZip.file('xl/calcChain.xml'),null);assert.match(await typedZip.file('xl/workbook.xml').async('string'),/forceFullCalc="1"/);
 for(const name of Object.keys(zip.files).filter(name=>!zip.files[name].dir&&!['xl/worksheets/sheet1.xml','xl/workbook.xml','xl/_rels/workbook.xml.rels','[Content_Types].xml'].includes(name)))assert.deepEqual(await typedZip.file(name).async('nodebuffer'),await zip.file(name).async('nodebuffer'),'Typed export untouched '+name);
 await reject(shared,[{row:4,column:2,type:'formula',value:'1+1'}],/shared/);
 await reject(formula,[{row:4,column:3,type:'formula',value:'1+1'}],/array/);
 for(const change of [{type:'date',value:'2024-01-01'},{type:'number',value:'12'},{type:'boolean',value:'false'},{type:'formula',value:''}])await reject(source,[{row:2,column:2,...change}],/type|number|boolean|formula|supported|finite|Invalid workbook cell edit/i);
 const moved=await modified(async z=>{z.file('xl/worksheets/data.xml',await z.file('xl/worksheets/sheet1.xml').async('nodebuffer'));z.remove('xl/worksheets/sheet1.xml');z.file('xl/_rels/workbook.xml.rels',(await z.file('xl/_rels/workbook.xml.rels').async('string')).replace('worksheets/sheet1.xml','worksheets/data.xml'));});
 const movedOut=await Zip.loadAsync(await run(moved,[{row:2,column:2,value:7}]));assert.match(await movedOut.file('xl/worksheets/data.xml').async('string'),/<v>7<\/v>/);
 const utf16=await modified(async z=>{const xml=await z.file('xl/worksheets/sheet1.xml').async('string');z.file('xl/worksheets/sheet1.xml',Buffer.concat([Buffer.from([255,254]),Buffer.from(xml.replace('encoding="UTF-8"','encoding="UTF-16"'),'utf16le')]));});
 const utf16Out=new Excel.Workbook();await utf16Out.xlsx.load(await run(utf16,[{row:2,column:2,value:31}]));assert.equal(utf16Out.getWorksheet('Data').getCell('B2').value,31);
 const formulaOut=new Excel.Workbook();await formulaOut.xlsx.load(await run(source,[{row:3,column:2,value:'=literal()'}]));assert.equal(formulaOut.getWorksheet('Data').getCell('B3').value,'=literal()');
 const literals=['carriage\rreturn','line\nfeed','both\r\nlines','tab\tvalue','_x005F_','_x000D_','_x0041_','_x005F_x000D_','_x000D__x0041_','literal _X000D_',' leading and trailing ','=SUM(A1:A2)'];
 const literalOutput=await run(source,literals.map((value,index)=>({row:10+index,column:1,value})));
 const literalBook=new Excel.Workbook();await literalBook.xlsx.load(literalOutput);
 for(let index=0;index<literals.length;index++){const cell=literalBook.getWorksheet('Data').getCell(10+index,1);assert.equal(cell.text,literals[index],'Literal '+JSON.stringify(literals[index]));assert.equal(cell.formula,undefined);}
 const escape=await modified(async z=>z.file('xl/_rels/workbook.xml.rels',(await z.file('xl/_rels/workbook.xml.rels').async('string')).replace('worksheets/sheet1.xml','../../outside.xml')));
 await reject(escape,[{row:2,column:2,value:7}],/escapes/);
 const metadata=await modified(async z=>z.file('xl/worksheets/sheet1.xml',(await z.file('xl/worksheets/sheet1.xml').async('string')).replace('<c r="B2"','<c cm="1" r="B2"')));
 await reject(metadata,[{row:2,column:2,value:7}],/metadata/);
 const corrupt=Buffer.from(source);for(let i=0;i<corrupt.length-46;i++)if(corrupt.readUInt32LE(i)===0x02014b50&&corrupt.readUInt32LE(i+24)>0){corrupt.writeUInt32LE(123456,i+16);const offset=corrupt.readUInt32LE(i+42);corrupt.writeUInt32LE(123456,offset+14);break;}
 await reject(corrupt,[],/CRC/);
 const dataTable=await modified(async z=>z.file('xl/worksheets/sheet1.xml',(await z.file('xl/worksheets/sheet1.xml').async('string')).replace('<f>B2*2</f>','<f t="dataTable" ref="B3:C4">B2*2</f>')));
 await reject(dataTable,[{row:4,column:3,type:'formula',value:'1+1'}],/data-table/);
 await reject(metadata,[{row:2,column:2,type:'formula',value:'1+1'}],/metadata/);
 console.log('Workbook preservation engine passed: exact no-op bytes; untouched parts; typed literal edits/styles/formulas; relationships; calculation chain invalidation; merged/shared/array/signed/integrity rejection.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
