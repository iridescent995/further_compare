'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {projectLegacyFormatting}=require('../src/legacy-workbook-formatting.cjs');
const descriptor=name=>({style:{font:{name}}});
const census=()=>({available:true,reason:null,defaultStyle:descriptor('default'),cells:[],rowStyles:[],columnStyles:[]});
test('explicit cell, row, column and workbook defaults resolve without expanding sparse ranges',()=>{
 const data=census();data.cells=[{row:1,column:1,...descriptor('cell')}];data.rowStyles=[{row:1,...descriptor('row')}];data.columnStyles=[{firstColumn:1,lastColumn:16383,...descriptor('column')}];const before=JSON.stringify(data),result=projectLegacyFormatting(data,3,3);
 assert.deepEqual(result.styleRows.map(row=>row.map(s=>JSON.parse(s).font.name)),[['default','column','column'],['row','cell','row'],['default','column','column']]);assert.equal(result.storedFormatting.columnStyles[0].lastColumn,16383);assert.equal(JSON.stringify(data),before);
});
test('known groups and unavailable groups remain distinct and unknown metadata stays absent',()=>{
 const data=census();data.available=false;data.reason='Font unavailable';data.defaultStyle={style:{fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFFF0000'}}},unavailableGroups:{font:'Font unavailable'}};
 const result=projectLegacyFormatting(data,1,2);assert.equal(result.styleStatusRows[0][0].font,'Font unavailable');assert.equal(JSON.parse(result.styleRows[0][0]).fill.pattern,'solid');assert.equal(result.storedFormatting.available,false);assert.equal(projectLegacyFormatting(undefined,1,1).storedFormatting,null);
});
test('ambiguous defaults, malformed availability and excessive projections reject',()=>{
 const data=census();data.columnStyles=[{firstColumn:2,lastColumn:5,...descriptor('one')},{firstColumn:4,lastColumn:6,...descriptor('two')}];assert.throws(()=>projectLegacyFormatting(data,1,1),/Overlapping/);
 data.columnStyles=[];data.cells=[{row:0,column:0,...descriptor('one')},{row:0,column:0,...descriptor('two')}];assert.throws(()=>projectLegacyFormatting(data,1,1),/Duplicate/);
 data.cells=[];data.defaultStyle.unavailableGroups={bogus:'Unknown'};assert.throws(()=>projectLegacyFormatting(data,1,1),/group/);assert.throws(()=>projectLegacyFormatting(census(),50000,512),/extent/);
});
test('large expanded cell styles retain sparse metadata without publishing an incomplete grid',()=>{
 const data=census();data.defaultStyle=descriptor('x'.repeat(4096));const result=projectLegacyFormatting(data,500,100);
 assert.equal(result.styleMatrixAvailable,false);assert.deepEqual(result.styleRows,[]);assert.deepEqual(result.styleStatusRows,[]);assert.equal(JSON.parse(result.storedFormatting.defaultStyle.signature).font.name.length,4096);
});
