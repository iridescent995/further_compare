'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compareWorkbookTables}=require('../src/workbook-compare.cjs');
const {tableComparisonRowId:id,createTableCopyOrigin,copyTableDifferences,validateTableCopyBinding}=require('../src/table-difference-copy.cjs');
function fixture(a,b,side='a',options={}) {
 const comparison=compareWorkbookTables(a,b,options),context='sources/sheets/keys/v1';
 const origin=createTableCopyOrigin({comparison,side,context});
 return {comparison,context,origin,rows:(side==='a'?a:b).map(row=>row.slice()),sourceSide:side==='a'?'b':'a'};
}
function selection(f,row,column=null){return {rowId:id(f.comparison.rows[row]),column};}
test('key-aligned cell copy addresses result origin rows despite reordering and edited key values',()=>{
 const f=fixture([['one','L1'],['two','L2']],[['two','R2'],['one','R1']],'b',{keyColumns:[0]});
 f.rows[1][0]='edited key';const before=structuredClone(f);
 const result=copyTableDifferences({...f,selections:[selection(f,0,1)]});
 assert.deepEqual(result.rows,[['two','R2'],['edited key','L1']]);assert.equal(result.copiedCells,1);assert.equal(result.structural,false);assert.deepEqual(f,before);
});
test('filtered/paged selection uses physical pair coordinate not displayed row index',()=>{
 const f=fixture([['a'],['b'],['c']],[['a'],['B'],['C']]);
 assert.deepEqual(copyTableDifferences({...f,selections:[selection(f,2,0)]}).rows,[['a'],['b'],['C']]);
});
test('header offset preserves header and copy origin applies to selected data row',()=>{
 const f=fixture([['left']],[['right']]);f.rows.unshift(['Header']);f.origin=createTableCopyOrigin({...f,side:'a',headerOffset:1});
 assert.deepEqual(copyTableDifferences({...f,selections:[selection(f,0)]}).rows,[['Header'],['right']]);
});
test('multiple cells coalesce and preserve unrelated edits, with whole row taking precedence',()=>{
 const f=fixture([['a','b','c']],[['A','B','C']]);f.rows[0][1]='pending';
 const result=copyTableDifferences({...f,selections:[selection(f,0,0),selection(f,0,2),selection(f,0,0)]});
 assert.deepEqual(result.rows,[['A','pending','C']]);assert.equal(result.copiedCells,2);
 assert.deepEqual(copyTableDifferences({...f,selections:[selection(f,0),selection(f,0,2)]}).rows,[['A','B','C']]);
});
test('missing row requires whole-row selection and insertion stays mapped on later copies',()=>{
 const f=fixture([['a','1']],[['b','2'],['a','3']],'a',{keyColumns:[0]});
 assert.throws(()=>copyTableDifferences({...f,selections:[selection(f,1,1)]}),/whole row/);
 const result=copyTableDifferences({...f,selections:[selection(f,1)]});
 assert.deepEqual(result.rows,[['a','1'],['b','2']]);assert.equal(result.structural,true);assert.equal(result.insertedRows,1);
 result.rows[1][1]='edited';assert.deepEqual(copyTableDifferences({...f,...result,selections:[selection(f,1,1)]}).rows,[['a','1'],['b','2']]);
});
test('bulk insertion deterministic in comparison order and preserves existing result order',()=>{
 const f=fixture([['a']],[['c'],['b'],['a']],'a',{keyColumns:[0]});
 const r=copyTableDifferences({...f,selections:[selection(f,2),selection(f,1)]});assert.deepEqual(r.rows,[['a'],['c'],['b']]);assert.equal(r.insertedRows,2);
});
test('absent source row rejects whole operation without deleting data',()=>{
 const f=fixture([['a'],['b']],[['A']]);const before=structuredClone(f);
 assert.throws(()=>copyTableDifferences({...f,selections:[selection(f,0),selection(f,1)]}),/source row is missing/);assert.deepEqual(f,before);
});
test('missing source cells clear literals without shifting other columns',()=>{
 const f=fixture([['a','b','c']],[['A']]);assert.deepEqual(copyTableDifferences({...f,selections:[selection(f,0,1)]}).rows,[['a','','c']]);
});
test('formula-only or formatting-only differences never masquerade as literal changes',()=>{
 const f=fixture([['3']],[['3']],'a',{mode:'formulas',formulasA:[['1+2']],formulasB:[['2+1']]});
 assert.equal(f.comparison.rows[0].status,'changed');const r=copyTableDifferences({...f,selections:[selection(f,0)]});assert.equal(r.copiedCells,0);assert.equal(r.skippedCells,1);assert.deepEqual(r.rows,[['3']]);
});
test('stale context, structural mapping mismatch, duplicate identities and invalid selections reject',()=>{
 const f=fixture([['a'],['b']],[['A'],['B']]),selections=[selection(f,0)];
 assert.throws(()=>copyTableDifferences({...f,selections,context:'changed'}),/changed/);
 assert.throws(()=>copyTableDifferences({...f,selections,rows:[['a']]}),/mapping changed/);
 assert.throws(()=>copyTableDifferences({...f,selections,origin:{...f.origin,rowIds:[f.origin.rowIds[0],f.origin.rowIds[0]]}}),/ambiguous/);
 for(const bad of [[],[{rowId:'0:99',column:0}],[selection(f,0,-1)],[selection(f,0,1)]])assert.throws(()=>copyTableDifferences({...f,selections:bad}));
});
test('duplicate source keys and result limits reject before publication',()=>{
 assert.throws(()=>fixture([['a'],['a']],[['b']],'a',{keyColumns:[0]}),/duplicate/);
 assert.throws(()=>fixture([['a']],[Array(513).fill('b')]),/limits/);
});

test('manually inserted rows remain unrelated; deleted mapped rows can be explicitly reinserted',()=>{
 const f=fixture([['a'],['b']],[['A'],['B']]);
 f.rows.splice(1,0,['manual']);f.origin.rowIds.splice(1,0,null);
 assert.deepEqual(copyTableDifferences({...f,selections:[selection(f,1)]}).rows,[['a'],['manual'],['B']]);
 f.rows.splice(2,1);f.origin.rowIds.splice(2,1);
 const r=copyTableDifferences({...f,selections:[selection(f,1)]});assert.deepEqual(r.rows,[['a'],['manual'],['B']]);assert.equal(r.insertedRows,1);
});

test('extending a ragged result row writes coordinates without structural shifts',()=>{
 const f=fixture([['a']],[['a','extra']]);
 const r=copyTableDifferences({...f,selections:[selection(f,0,1)]});assert.deepEqual(r.rows,[['a','extra']]);assert.equal(r.structural,false);
});

test('binding validation is strict, bounded, cloned, dense and header-aware',()=>{
 const f=fixture([['a']],[['b']]),binding=f.origin;
 const cloned=validateTableCopyBinding(binding,1);assert.deepEqual(cloned,binding);assert.notEqual(cloned.rowIds,binding.rowIds);
 for(const patch of [{extra:true},{context:'x'.repeat(4097)},{rowIds:Array(1)},{rowIds:['00:0']},{rowIds:['50000:0']},{rowIds:['-:-']},{rowIds:['0:0','0:0']},{headerOffset:1},{side:'left'}])assert.throws(()=>validateTableCopyBinding({...binding,...patch}));
 assert.throws(()=>validateTableCopyBinding(binding,2));assert.doesNotThrow(()=>validateTableCopyBinding({...binding,headerOffset:1,rowIds:[null,'0:0',null]}));
});
test('sparse inputs and ambiguous or inconsistent source indices reject',()=>{
 const f=fixture([['a']],[['b']]);
 for(const comparison of [{...f.comparison,rows:Array(1)},{...f.comparison,rows:[{...f.comparison.rows[0],left:null}]},{...f.comparison,rows:[f.comparison.rows[0],{...f.comparison.rows[0],rightIndex:1}]},{...f.comparison,rows:[{...f.comparison.rows[0],left:Array(1)}]}])assert.throws(()=>createTableCopyOrigin({...f,comparison,side:'a'}));
 assert.throws(()=>copyTableDifferences({...f,rows:Array(1),selections:[selection(f,0)]}));assert.throws(()=>copyTableDifferences({...f,selections:Array(1)}));
});
