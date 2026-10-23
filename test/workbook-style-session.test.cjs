 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateWorkbookStyleEdits:validate}=require('../src/workbook-style-edits.cjs');
const {validateSession}=require('../desktop/sessions.cjs');
const template={side:'a',sheetName:'Data',sourceHash:'a'.repeat(64),structural:false};
const cell=()=>({row:1,column:1,sourceSide:'b',sourceHash:'b'.repeat(64),sourceSheet:'Colors',sourceRow:4,sourceColumn:2});
const overlay=()=>({version:1,side:'a',sheetName:'Data',sourceHash:template.sourceHash,cells:[cell()]});
const rows=[['=A2','same']];
function session(){return {version:1,type:'table-compare',name:'Formatting',text:{a:'',b:''},files:{a:{name:'',path:''},b:{name:'',path:''}},folders:{a:null,b:null},options:{filter:'all',ignoreWhitespace:false,direction:'a-to-b'},advanced:{inputs:{a:{name:'target.xlsx',data:'eA=='},b:{name:'source.xlsx',data:'eQ=='},base:null},options:{tableTemplate:{...template},tableResult:structuredClone(rows),tableStyleEdits:overlay()}}};}
test('formatting provenance survives session roundtrip without sharing source objects',()=>{
 const input=session(),output=validateSession(input);assert.deepEqual(validateSession(JSON.parse(JSON.stringify(output))),input);
 output.advanced.options.tableStyleEdits.cells[0].sourceRow=7;assert.equal(input.advanced.options.tableStyleEdits.cells[0].sourceRow,4);
 assert.deepEqual(output.advanced.options.tableResult,rows);
});
test('formatting overlay rejects stale destination bindings and malformed source coordinates',()=>{
 const changes=[o=>o.side='b',o=>o.sheetName='Other',o=>o.sourceHash='c'.repeat(64),o=>o.version=2,o=>o.extra=true,o=>o.cells.push(cell()),o=>o.cells=new Array(1),o=>o.cells[0].row=2,o=>o.cells[0].column=3,o=>o.cells[0].sourceRow=0,o=>o.cells[0].sourceColumn=513,o=>o.cells[0].sourceSide='base',o=>o.cells[0].sourceHash='bad',o=>o.cells[0].sourceSheet='',o=>o.cells[0].sourceSheet='bad\0',o=>o.cells[0].sourceSheet='\ud800',o=>o.cells[0].styleId=1];
 for(const change of changes){const o=overlay();change(o);assert.throws(()=>validate(o,{rows,template}));}
 assert.throws(()=>validate(overlay(),{rows,template:{...template,structural:true}}));
 for(const grid of [new Array(1),[[,]],[[1]]])assert.throws(()=>validate(overlay(),{rows:grid,template}));
});
test('sessions require both template and referenced formatting workbook inputs',()=>{
 for(const mutate of [s=>s.type='binary-compare',s=>s.advanced.inputs.a=null,s=>s.advanced.inputs.b=null,s=>s.advanced.inputs.b.name='source.csv',s=>s.advanced.options.tableTemplate=null,s=>s.advanced.options.tableTemplate.structural=true]){const s=session();mutate(s);assert.throws(()=>validateSession(s));}
});
test('older sessions and empty formatting overlays remain compatible',()=>{
 const s=session();delete s.advanced.options.tableStyleEdits;assert.deepEqual(validateSession(s),s);
 const o=overlay();o.cells=[];assert.deepEqual(validate(o,{rows:[],template:{...template,structural:true}}),o);
});
