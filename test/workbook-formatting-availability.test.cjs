'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {build}=require('esbuild');
const {compareSheetPair,compareSheetCells}=require('../src/workbook-sheet-review.cjs');
const {compareWorkbookTables}=require('../src/workbook-compare.cjs');
const sheet=rows=>({name:'Data',rows,styleRows:[],capabilities:{formattingComparison:false}});
test('unavailable formatting never claims equality, including headers and empty sheets',()=>{
 for(const rows of [[],[['same']],[['header'],['same']]])for(const headers of [true,false]){
  const a=sheet(rows),before=JSON.stringify(a),result=compareSheetPair(a,a,{compareFormatting:true,headers});
  assert.equal(result.status,'unavailable');assert.equal(result.different,false);assert.match(result.reasons.join(' '),/Formatting/);
  assert.equal(compareSheetPair(a,a,{headers}).status,'same');assert.equal(JSON.stringify(a),before);
  const cells=compareSheetCells(a,a,{compareFormatting:true,headers});for(const row of cells.result.rows)for(const cell of row.cells){assert.equal(cell.equal,false);assert.equal(cell.formattingUnavailable,true);}
 }
});
test('known value differences survive unavailable formatting in header, body and keyed paths',()=>{
 for(const options of [{},{headers:true},{keys:'1'}]){
  const a=sheet([['key','left']]),b=sheet([['key','right']]),result=compareSheetPair(a,b,{...options,compareFormatting:true});
  assert.equal(result.status,'unavailable');assert.equal(result.different,true);
 }
 const cells=compareWorkbookTables([['same']],[['same']],{compareFormatting:true,formattingAvailableA:false,stylesB:[['{"font":{"bold":true}}']]});
 assert.equal(cells.equal,false);assert.equal(cells.rows[0].status,'unknown');assert.deepEqual(cells.rows[0].cells[0].styleChanges,[]);
});
test('qualified formatting differences survive an unavailable group in body and headers',()=>{
 const a={name:'Data',rows:[['same']],styleRows:[['{"fill":{"pattern":"solid","type":"pattern"}}']],styleStatusRows:[[{font:'Unknown font'}]]};
 const b={name:'Data',rows:[['same']],styleRows:[['{}']],styleStatusRows:[[{}]]};
 for(const headers of [false,true]){const result=compareSheetPair(a,b,{headers,compareFormatting:true});assert.equal(result.status,'unavailable');assert.equal(result.different,true);const cells=compareSheetCells(a,b,{headers,compareFormatting:true});const cell=(headers?cells.headerResult:cells.result).rows[0].cells[0];assert.deepEqual(cell.styleChanges,['Fill']);assert.equal(cell.formattingUnavailableGroups.font,'Unknown font');}
 b.styleRows=a.styleRows;const unknown=compareSheetPair(a,b,{compareFormatting:true});assert.equal(unknown.status,'unavailable');assert.equal(unknown.different,false);
 assert.throws(()=>compareWorkbookTables([['same']],[['same']],{styleStatusA:[[{bogus:'Unknown'}]]}),/formatting group/);
});
test('genuine XLS and the actual whole-workbook worker preserve unavailable formatting',async()=>{
 const {readLegacyWorkbook}=require('../src/legacy-workbook-reader.cjs'),{preflightXls}=require('../src/xls-preflight.cjs');
 const sheets=await readLegacyWorkbook(fs.readFileSync('test/xls-formula-fixtures/formulas.xls'),{format:'xls',parser:require('xlsx'),preflight:preflightXls});
 // Model an explicitly unqualified legacy sheet even as more native properties become supported.
 for(const sheet of sheets)sheet.capabilities.formattingComparison=false;
 const bundle=await build({entryPoints:['src/workbook-review-worker.js'],bundle:true,write:false,format:'iife',platform:'browser'}),messages=[];
 const context=vm.createContext({setTimeout,postMessage:message=>messages.push(message)});vm.runInContext(bundle.outputFiles[0].text,context);
 context.request=JSON.stringify({data:{id:1,action:'start',sheetsA:sheets,sheetsB:sheets,options:{compareFormatting:true}}});
 await vm.runInContext('onmessage(JSON.parse(request))',context);
 const progress=messages.filter(m=>m.type==='progress');assert.equal(progress.length,sheets.length);
 for(const {result}of progress){assert.equal(result.status,'unavailable');assert.equal(result.different,false);}
 assert.equal(messages.at(-1).type,'done');
});
