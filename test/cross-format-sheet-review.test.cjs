'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compareSheetCells,compareSheetPair}=require('../src/workbook-sheet-review.cjs');
const {projectLegacyFormatting}=require('../src/legacy-workbook-formatting.cjs');
const census=(style={},unavailableGroups={})=>({available:!Object.keys(unavailableGroups).length,defaultStyle:{style,unavailableGroups},cells:[],rowStyles:[],columnStyles:[]});
const sheet=(format,raw)=>({name:'Data',format,rows:[['same']],styleRows:[['deliberately unrelated source signature']],...(format==='xlsx'?{baseFormatting:raw}:projectLegacyFormatting(raw,1,1))});
test('mixed formatting uses normalized metadata for value rows and sparse sheet review',()=>{
 const raw=census(),a=sheet('xls',raw),b=sheet('xlsx',raw),before=JSON.stringify([a,b]);
 const cell=compareSheetCells(a,b,{compareFormatting:true});assert.equal(cell.result.equal,true);assert.equal(cell.formattingReview.equal,true);assert.equal(compareSheetPair(a,b,{compareFormatting:true}).status,'same');assert.equal(JSON.stringify([a,b]),before);
 assert.equal(cell.formattingReview.domain.restricted,true);
});
test('mixed explicit styled blank outside the populated grid affects workbook status',()=>{
 const a=sheet('xls',census()),raw=census();raw.cells.push({row:99,column:2,style:{fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFFF0000'}}},unavailableGroups:{}});const b=sheet('xlsx',raw);
 const result=compareSheetPair(a,b,{compareFormatting:true});assert.equal(result.status,'different');assert(result.counts.formattingChanges>0);
});
test('unknown groups cannot be reported equal and remain disclosed in header mode',()=>{
 const a=sheet('xls',census()),b=sheet('xlsx',census({}, {font:'Unqualified source font extension'}));
 for(const headers of [false,true]){const result=compareSheetPair(a,b,{compareFormatting:true,headers});assert.equal(result.status,'unavailable');assert(result.reasons.some(reason=>/font|formatting/i.test(reason)));}
});
test('missing cross-format census cannot reuse unrelated display-grid signatures',()=>{
 const a=sheet('xls',census()),b=sheet('xlsx',census());delete b.baseFormatting;b.styleRows=a.styleRows;
 const result=compareSheetPair(a,b,{compareFormatting:true});assert.equal(result.status,'unavailable');assert.equal(result.different,false);
});
test('known effective formatting beyond XLS grid changes review status and carries domain evidence',()=>{
 const a=sheet('xls',census()),raw=census();raw.cells.push({row:70000,column:300,style:{fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFFF0000'}}},unavailableGroups:{}});const b=sheet('xlsx',raw);
 const cell=compareSheetCells(a,b,{compareFormatting:true});assert(cell.formattingReview.beyondDomain.some(region=>region.nonrepresentable));assert.equal(cell.formattingReview.equal,false);const review=compareSheetPair(a,b,{compareFormatting:true});assert.equal(review.status,'different');assert.equal(review.counts.formattingDomain.restricted,true);
});
