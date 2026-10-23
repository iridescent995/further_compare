'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateOdsCellEdits}=require('../src/ods-cell-edits.cjs');
const template={format:'ods',side:'a',sheetName:'Data',sourceHash:'a'.repeat(64),structural:false};
const overlay=cells=>({version:1,side:'a',sheetName:'Data',sourceHash:template.sourceHash,cells});
const cell=(type,value,column=1)=>({row:1,column,type,value});
test('ODS overlays preserve explicit types and same-display changes without mutating inputs',()=>{
 for(const [type,value,display] of [['number',10,'10'],['text','10','10'],['boolean',false,'false'],['blank',null,'']]){
 const input=overlay([cell(type,value)]),before=structuredClone(input);assert.deepEqual(validateOdsCellEdits(input,{rows:[[display]],template}),input);assert.deepEqual(input,before);
 }
});
test('ODS overlays reject formulas, invalid types, stale binding and misleading display',()=>{
 for(const c of [cell('formula','1+1'),cell('number',Infinity),cell('number','1'),cell('boolean','false'),cell('blank',''),cell('text','\0')])assert.throws(()=>validateOdsCellEdits(overlay([c]),{rows:[['']],template}));
 assert.throws(()=>validateOdsCellEdits(overlay([cell('number',10)]),{rows:[['11']],template}),/displayed/);
 for(const t of [{...template,sourceHash:'b'.repeat(64)},{...template,format:'xlsx'},{...template,structural:true},{...template,extra:true}])assert.throws(()=>validateOdsCellEdits(overlay([]),{rows:[['']],template:t}));
 assert.throws(()=>validateOdsCellEdits(overlay([cell('text','x'),cell('text','x')]),{rows:[['x']],template}),/duplicated/);
});
