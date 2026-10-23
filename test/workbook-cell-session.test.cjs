'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateSession}=require('../desktop/sessions.cjs');
function session(){
 const template={side:'a',sheetName:'Data',sourceHash:'a'.repeat(64),structural:false};
 return {version:1,type:'table-compare',name:'Typed cells',text:{a:'',b:''},files:{a:{name:'',path:''},b:{name:'',path:''}},folders:{a:null,b:null},options:{filter:'all',ignoreWhitespace:false,direction:'a-to-b'},advanced:{inputs:{a:{name:'book.xlsx',data:'eA=='},b:null,base:null},options:{tableTemplate:template,tableResult:[['=SUM(A2:A3)','42','false','','=literal']],tableCellEdits:{version:1,side:'a',sheetName:'Data',sourceHash:template.sourceHash,cells:[{row:1,column:1,type:'formula',value:'SUM(A2:A3)'},{row:1,column:2,type:'number',value:42},{row:1,column:3,type:'boolean',value:false},{row:1,column:4,type:'blank',value:null},{row:1,column:5,type:'text',value:'=literal'}]}}}};
}
test('typed workbook edits retain types and independent provenance through session serialization',()=>{
 const source=session(),validated=validateSession(source),restored=validateSession(JSON.parse(JSON.stringify(validated)));
 assert.deepEqual(restored,source);
 validated.advanced.options.tableCellEdits.cells[0].value='changed';
 assert.equal(source.advanced.options.tableCellEdits.cells[0].value,'SUM(A2:A3)');
});
test('typed workbook sessions reject stale bindings, impossible positions and type confusion',()=>{
 const mutations=[
  v=>v.type='binary-compare',
  v=>v.advanced.options.tableTemplate=null,
  v=>v.advanced.options.tableTemplate.structural=true,
  v=>v.advanced.inputs.a=null,
  v=>v.advanced.options.tableCellEdits.sourceHash='b'.repeat(64),
  v=>v.advanced.options.tableCellEdits.sheetName='Other',
  v=>v.advanced.options.tableCellEdits.side='b',
  v=>v.advanced.options.tableCellEdits.cells[0].row=2,
  v=>v.advanced.options.tableCellEdits.cells[0].column=6,
  v=>v.advanced.options.tableCellEdits.cells[1].value='42',
  v=>v.advanced.options.tableCellEdits.cells[2].value='false',
  v=>v.advanced.options.tableCellEdits.cells[3].value='',
  v=>v.advanced.options.tableCellEdits.cells.push({...v.advanced.options.tableCellEdits.cells[0]}),
  v=>v.advanced.options.tableResult[0][0]=123,
  v=>v.advanced.options.tableCellEdits.extra=true,
 ];
 for(const mutate of mutations){const value=session();mutate(value);assert.throws(()=>validateSession(value));}
});
test('older workbook sessions remain valid without typed-cell overlays',()=>{
 const value=session();delete value.advanced.options.tableCellEdits;assert.deepEqual(validateSession(value),value);
});
