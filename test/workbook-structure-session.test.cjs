'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateSession}=require('../desktop/sessions.cjs');
const {validateWorkbookCellEdits}=require('../src/workbook-cell-edits.cjs');
const {validateWorkbookStyleEdits}=require('../src/workbook-style-edits.cjs');
function session(){
 const sourceHash='a'.repeat(64),template={side:'a',sheetName:'Data',sourceHash,structural:true};
 const structure={version:1,side:'a',sheetName:'Data',sourceHash,sourceRows:1,sourceColumns:2,operations:[{axis:'row',operation:'insert',index:1,count:1}]};
 const binding={version:1,side:'a',sheetName:'Data',sourceHash};
 return {version:1,type:'table-compare',name:'Structure',text:{a:'',b:''},files:{a:{name:'',path:''},b:{name:'',path:''}},folders:{a:null,b:null},options:{filter:'all',ignoreWhitespace:false,direction:'a-to-b'},advanced:{inputs:{a:{name:'book.xlsx',data:'eA=='},b:{name:'style.xlsx',data:'eQ=='},base:null},options:{tableTemplate:template,tableStructure:structure,tableResult:[['',''],['=A2','old']],tableCellEdits:{...binding,cells:[{row:2,column:1,type:'formula',value:'A2'}]},tableStyleEdits:{...binding,cells:[{row:2,column:2,sourceSide:'b',sourceHash:'b'.repeat(64),sourceSheet:'Colors',sourceRow:1,sourceColumn:2}]}}}};
}
test('structural sessions preserve operation order and final overlay coordinates',()=>{
 const value=session(),result=validateSession(value);assert.deepEqual(validateSession(JSON.parse(JSON.stringify(result))),value);
 result.advanced.options.tableStructure.operations[0].index=9;assert.equal(value.advanced.options.tableStructure.operations[0].index,1);
 assert.equal(result.advanced.options.tableStyleEdits.cells[0].sourceRow,1);
});
test('structural session schema rejects inconsistent journals, dimensions and missing sources',()=>{
 for(const mutate of [s=>delete s.advanced.options.tableTemplate,s=>s.advanced.options.tableTemplate.structural=false,s=>s.advanced.inputs.a=null,s=>s.advanced.inputs.a.name='book.csv',s=>s.advanced.options.tableStructure.sourceHash='c'.repeat(64),s=>s.advanced.options.tableStructure.sourceRows=2,s=>s.advanced.options.tableStructure.operations[0].index=9,s=>s.advanced.options.tableResult.pop(),s=>s.advanced.options.tableResult[0].pop(),s=>s.advanced.options.tableResult[0][0]=123,s=>s.type='binary-compare']){const value=session();mutate(value);assert.throws(()=>validateSession(value),String(mutate));}
});
test('legacy structural edits cannot bypass overlay safeguards without a journal',()=>{
 const {tableTemplate:template,tableResult:rows,tableCellEdits:cells,tableStyleEdits:styles,tableStructure:structure}=session().advanced.options;
 assert.throws(()=>validateWorkbookCellEdits(cells,{rows,template}),/unchanged/);
 assert.throws(()=>validateWorkbookStyleEdits(styles,{rows,template}),/unchanged/);
 assert.deepEqual(validateWorkbookCellEdits(cells,{rows,template,structure}),cells);
 assert.deepEqual(validateWorkbookStyleEdits(styles,{rows,template,structure}),styles);
});
test('empty rows can retain explicit column extents but require a bound template',()=>{
 const value=session(),options=value.advanced.options;options.tableStructure.operations=[{axis:'row',operation:'delete',index:1,count:1}];options.tableResult=[];options.tableCellEdits.cells=[];options.tableStyleEdits.cells=[];
 assert.deepEqual(validateSession(value),value);
 delete options.tableTemplate;assert.throws(()=>validateSession(value));
});
