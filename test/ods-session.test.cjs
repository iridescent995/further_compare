'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateSession}=require('../desktop/sessions.cjs');
const {comparisonType}=require('../desktop/shell-requests.cjs');
const {dataOpenDialog}=require('../desktop/data-dialogs.cjs');
const session=()=>({version:1,type:'table-compare',name:'ODS values',text:{a:'',b:''},files:{a:{name:'',path:''},b:{name:'',path:''}},folders:{a:null,b:null},options:{filter:'all',ignoreWhitespace:false,direction:'a-to-b'},advanced:{inputs:{a:{name:'SOURCE.ODS',data:Buffer.from('original ODS bytes').toString('base64'),diskToken:'untrusted'},b:{name:'source.xlsx',data:Buffer.from('original XLSX bytes').toString('base64')},base:null},options:{workbookMode:'values',compareFormatting:false,compareLayout:false,sheeta:1,sheetb:0,tableResult:[['edited cached value']]}}});
test('ODS sessions preserve input bytes and value edits without native path or write authority',()=>{const input=session(),out=validateSession(JSON.parse(JSON.stringify(input)));assert.equal(comparisonType('SOURCE.ODS'),'table-compare');assert(dataOpenDialog('a','table').filters[0].extensions.includes('ods'));assert.deepEqual(out.advanced.inputs.a,{name:input.advanced.inputs.a.name,data:input.advanced.inputs.a.data});assert.equal(out.advanced.options.sheeta,1);assert.deepEqual(out.advanced.options.tableResult,[['edited cached value']]);assert.equal(out.advanced.options.tableTemplate,undefined);});
test('ODS cannot masquerade as an XLSX preservation template while mixed XLSX template remains valid',()=>{const input=session();input.advanced.options.tableTemplate={side:'a',sheetName:'Sheet1',sourceHash:'a'.repeat(64),structural:false};assert.throws(()=>validateSession(input),/template requires its source/);input.advanced.options.tableTemplate.side='b';assert.equal(validateSession(input).advanced.options.tableTemplate.side,'b');});

test('ODS preservation templates retain format/hash/sheet while rejecting unsupported overlays and spoofed formats',()=>{
 const input=session();input.advanced.options.tableTemplate={format:'ods',side:'a',sheetName:'Sheet1',sourceHash:'a'.repeat(64),structural:false};
 const out=validateSession(input);assert.deepEqual(out.advanced.options.tableTemplate,input.advanced.options.tableTemplate);assert.equal(out.advanced.inputs.a.diskToken,undefined);
 for(const key of ['tableCellEdits','tableStyleEdits','tableStructure']){const bad=structuredClone(input);bad.advanced.options[key]={};assert.throws(()=>validateSession(bad),/ODS|overlay/);}
 for(const update of [{format:'xls'},{format:null},{side:'b'},{structural:true},{sourceHash:'bad'}]){const bad=structuredClone(input);Object.assign(bad.advanced.options.tableTemplate,update);assert.throws(()=>validateSession(bad));}
 const xlsx=structuredClone(input);xlsx.advanced.options.tableTemplate={...xlsx.advanced.options.tableTemplate,side:'b',format:'xlsx'};assert.equal(validateSession(xlsx).advanced.options.tableTemplate.format,undefined);assert.equal(xlsx.advanced.options.tableTemplate.format,'xlsx');
});

test('ODS typed overlays persist exact types with source binding and reject forged display',()=>{
 const input=session(),options=input.advanced.options;options.tableTemplate={format:'ods',side:'a',sheetName:'Data',sourceHash:'a'.repeat(64),structural:false};options.tableResult=[['10','false','']];options.tableCellEdits={version:1,side:'a',sheetName:'Data',sourceHash:'a'.repeat(64),cells:[{row:1,column:1,type:'number',value:10},{row:1,column:2,type:'boolean',value:false},{row:1,column:3,type:'blank',value:null}]};
 assert.deepEqual(validateSession(JSON.parse(JSON.stringify(input))).advanced.options.tableCellEdits,options.tableCellEdits);
 for(const mutate of [o=>o.tableCellEdits.sourceHash='b'.repeat(64),o=>o.tableCellEdits.cells[0].type='formula',o=>o.tableResult[0][0]='11']){const bad=structuredClone(input);mutate(bad.advanced.options);assert.throws(()=>validateSession(bad));}
});
