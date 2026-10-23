'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSheetInventory,compareSheetCells,compareSheetPair,validateReviewBudget}=require('../src/workbook-sheet-review.cjs');
const sheet=(name,rows=[['value']],extra={})=>({name,rows,metadata:{ordinal:0,kind:'worksheet',visibility:{available:true,value:'visible'}},...extra});
test('exact names preserve missing/renamed sheets and insertion does not reorder matched sheets',()=>{
 const a=[sheet('Overview'),sheet('Hidden'),sheet('Café')],b=[sheet('Added'),sheet('Overview'),sheet('Hidden'),sheet('Cafe')];
 const result=createSheetInventory(a,b);assert.deepEqual(result.map(r=>[r.name,r.status,r.orderChanged]),[['Overview','not-compared',false],['Hidden','not-compared',false],['Café','left-only',false],['Added','right-only',false],['Cafe','right-only',false]]);
 const reversed=createSheetInventory(a,[a[2],a[1],a[0]]);assert.deepEqual(reversed.map(r=>r.orderChanged),[true,false,true]);
});
test('visibility distinguishes hidden/veryHidden and absent metadata remains unavailable',()=>{
 const a=sheet('a'),b=sheet('a');b.metadata.visibility={available:true,value:'veryHidden'};assert.equal(createSheetInventory([a],[b])[0].visibility,'different');delete b.metadata;assert.equal(createSheetInventory([a],[b])[0].visibility,'unavailable');assert.throws(()=>createSheetInventory([a,a],[]),/ambiguous/);
});
test('nonselected content and headers differ, unmatched empty row is not equal',()=>{
 const a=sheet('a',[['label'],['same']]),b=sheet('a',[['different label'],['same']]);assert.equal(compareSheetPair(a,b,{headers:true}).status,'different');assert.equal(compareSheetCells(a,b,{headers:true}).result.equal,true);
 assert.equal(compareSheetPair(sheet('a',[[]]),sheet('a',[])).status,'different');
});
test('missing formula caches remain unavailable including header-only worksheets',()=>{
 const a=sheet('a',[['']],{typedRows:[[{cacheUnavailable:true}]]});assert.equal(compareSheetPair(a,sheet('a',[['']])).status,'unavailable');assert.equal(compareSheetPair(a,sheet('a',[['']]),{headers:true}).status,'unavailable');
});
test('formula mode distinguishes expressions and dialect identity without recalculation',()=>{
 const a=sheet('a',[['2']],{formulaRows:[['1+1']]}),b=sheet('a',[['2']],{formulaRows:[['2*1']]});assert.equal(compareSheetPair(a,b).status,'same');assert.equal(compareSheetPair(a,b,{workbookMode:'formulas'}).status,'different');b.formulaRows=a.formulaRows;b.formulaIdentityRows=[[null]];assert.equal(compareSheetPair(a,b,{workbookMode:'formulas'}).status,'unavailable');
});
test('duplicate keys and invalid columns never claim equal',()=>{
 const a=sheet('a',[['k','one'],['k','two']]);assert.equal(compareSheetPair(a,a,{keys:'1'}).status,'unavailable');assert.throws(()=>compareSheetPair(a,a,{keys:'3'}),/missing/);assert.throws(()=>compareSheetPair(a,a,{keys:'1,1'}),/distinct/);
});
test('selected metadata criteria are independent and missing metadata remains unavailable',()=>{
 const a=sheet('a'),b=sheet('a');for(const key of ['compareFormatting','compareLayout','compareConditionalRules','compareNumberFormats'])assert.equal(compareSheetPair(a,b,{[key]:true}).status,'unavailable',key);
 a.numberFormats={available:true,cells:[{row:1,column:1,formatCode:'0.00'}]};b.numberFormats={available:true,cells:[]};assert.equal(compareSheetPair(a,b,{compareNumberFormats:true}).status,'different');
 a.layout={rows:[{index:1,height:30}]};b.layout={};assert.equal(compareSheetPair(a,b,{compareLayout:true}).status,'different');
 a.conditionalRules={available:true,rules:[]};b.conditionalRules={available:true,rules:[{type:'expression',formula:'A1>1'}]};assert.equal(compareSheetPair(a,b,{compareConditionalRules:true}).status,'different');
});
test('review does not mutate source matrices and budgets aggregate both workbooks',()=>{
 const a=sheet('a',[['left']]),b=sheet('a',[['right']]),before=JSON.stringify([a,b]);compareSheetPair(a,b);createSheetInventory([a],[b]);assert.equal(JSON.stringify([a,b]),before);assert.equal(validateReviewBudget([a],[b]).cells,2);
 const huge=sheet('huge',Array.from({length:1001},()=>Array(1000).fill('')));assert.throws(()=>validateReviewBudget([huge],[]),/cell budget/);
});

test('headers use formula identities rather than caches and retain unavailable results',()=>{
 const a=sheet('Data',[['2']],{formulaRows:[['1+1']],typedRows:[[{cacheUnavailable:false}]]}),b=sheet('Data',[['2']],{formulaRows:[['2*1']]});
 assert.equal(compareSheetPair(a,b,{headers:true,workbookMode:'formulas'}).status,'different');
 b.formulaRows=[['1+1']];b.rows=[['99']];assert.equal(compareSheetPair(a,b,{headers:true,workbookMode:'formulas'}).status,'same');
 a.typedRows[0][0].cacheUnavailable=true;assert.equal(compareSheetPair(a,b,{headers:true,workbookMode:'formulas'}).status,'same');assert.equal(compareSheetPair(a,b,{headers:true}).status,'unavailable');
 a.formulaIdentityRows=[[null]];const unknown=compareSheetPair(a,b,{headers:true,workbookMode:'formulas'});assert.equal(unknown.status,'unavailable');assert.equal(unknown.different,false);assert.equal(unknown.counts.unavailableFormulas,1);
});
