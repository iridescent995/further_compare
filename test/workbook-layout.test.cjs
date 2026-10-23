'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalizeWorkbookLayout: normalize, compareWorkbookLayouts: compare} = require('../src/workbook-layout.cjs');

test('layout normalization is detached, idempotent, sorted and ignores default metadata', () => {
  const raw = {merges:['C8:D9','A1:B2'], rows:[{index:8,hidden:true},{index:3,height:15,hidden:false,outlineLevel:0},{index:2,height:22}], columns:[{index:2,width:12},{index:1,width:8}],defaults:{defaultColWidth:8,defaultRowHeight:15}};
  const result = normalize(raw);
  assert.deepEqual(result,{merges:['A1:B2','C8:D9'],rows:[{index:2,height:22},{index:8,hidden:true}],columns:[{index:2,width:12}],defaults:{defaultRowHeight:15,defaultColWidth:8}});
  assert.deepEqual(normalize(result),result);
  result.rows[0].height = 99; result.merges.pop();
  assert.equal(raw.rows[2].height,22);assert.equal(raw.merges.length,2);
  assert.equal(compare(raw,{...raw,merges:[...raw.merges].reverse(),rows:[...raw.rows].reverse(),columns:[...raw.columns].reverse()}).equal,true);
  assert.equal(compare({}, {rows:[{index:1,hidden:false,outlineLevel:0}],columns:[{index:1}],defaults:{}}).equal,true);
});
test('layout differences preserve physical coordinates, empty hidden rows, merges and defaults', () => {
  const result = compare({merges:['A1:B2'],rows:[{index:50000,hidden:true}],columns:[{index:512,width:12}],defaults:{defaultRowHeight:15}}, {merges:['A1:C2'],rows:[{index:50000,hidden:true,outlineLevel:2}],columns:[{index:512,width:13}],defaults:{defaultRowHeight:18}});
  assert.equal(result.equal,false);
  assert.deepEqual(result.changes,[
    {kind:'default',location:'defaultRowHeight',left:15,right:18},
    {kind:'merge',location:'A1:B2',left:'A1:B2',right:null},
    {kind:'merge',location:'A1:C2',left:null,right:'A1:C2'},
    {kind:'row',location:'Row 50000',left:{index:50000,hidden:true},right:{index:50000,hidden:true,outlineLevel:2}},
    {kind:'column',location:'Column SR',left:{index:512,width:12},right:{index:512,width:13}}
  ]);
  assert.deepEqual(compare({}, {rows:[{index:20,hidden:true}]}).changes,[{kind:'row',location:'Row 20',left:null,right:{index:20,hidden:true}}]);
});
test('merges reject overlap, duplicates, reversed coordinates and bounds while allowing adjacent ranges', () => {
  for (const merges of [['A1:B2','B2:C3'],['A1:B2','A1:B2'],['A1:A50000','A200:B200'],['B2:A3'],['A3:B2'],['A1:A1'],['A0:B2'],['a1:B2'],['A1:SS2'],['A1:B50001'],['XFD1:XFE2'],['$A$1:$B$2']]) assert.throws(()=>normalize({merges}),TypeError);
  assert.deepEqual(normalize({merges:['A1:B2','C1:D2','A3:B4']}).merges,['A1:B2','C1:D2','A3:B4']);
});
test('layout rejects invalid dimensions, duplicate coordinates and unsupported records', () => {
  for (const rows of [[{index:0}],[{index:50001}],[{index:1.5}],[{index:1},{index:1}],[{index:1,height:-1}],[{index:1,height:410}],[{index:1,height:NaN}],[{index:1,height:Infinity}],[{index:1,hidden:1}],[{index:1,outlineLevel:8}],[{index:1,outlineLevel:0.5}],[{index:1,style:{}}]]) assert.throws(()=>normalize({rows}),TypeError);
  assert.throws(()=>normalize({columns:[{index:513}]}),TypeError);
  assert.throws(()=>normalize({columns:[{index:1,width:256}]}),TypeError);
  assert.throws(()=>normalize({defaults:{defaultRowHeight:'15'}}),TypeError);
  assert.throws(()=>normalize({defaults:{defaultColWidth:-1}}),TypeError);
  assert.deepEqual(normalize({rows:[{index:1,height:0}],columns:[{index:1,width:0}]}).rows,[{index:1,height:0}]);
});
test('untrusted layout refuses accessors, cycles, exotic objects, sparse or oversized arrays without invoking getters', () => {
  let invoked = false;
  const accessor = {}; Object.defineProperty(accessor,'rows',{enumerable:true,get(){invoked=true;return [];}});
  assert.throws(()=>normalize(accessor),TypeError);
  const row = {index:1};Object.defineProperty(row,'height',{enumerable:true,get(){invoked=true;return 12;}});
  assert.throws(()=>normalize({rows:[row]}),TypeError);
  const rows = [null];Object.defineProperty(rows,'0',{enumerable:true,get(){invoked=true;return {index:1};}});
  assert.throws(()=>normalize({rows}),TypeError);assert.equal(invoked,false);
  const cycle = {};cycle.rows=cycle;assert.throws(()=>normalize(cycle),TypeError);
  const arrayCycle=[];arrayCycle.push(arrayCycle);assert.throws(()=>normalize({rows:arrayCycle}),TypeError);
  for(const value of [null,[],new Date(),{bogus:1},{[Symbol('x')]:1},{rows:new Array(2)},{rows:new Array(50001)},{merges:new Array(50001)},{columns:new Array(513)}]) assert.throws(()=>normalize(value),TypeError);
  const extra = [];extra.hello=1;assert.throws(()=>normalize({rows:extra}),TypeError);
  assert.deepEqual(normalize(Object.create(null)),{merges:[],rows:[],columns:[],defaults:{}});
});
test('bounded large layouts compare without expanding merged cells', () => {
  const rows = Array.from({length:50000},(_,i)=>({index:i+1,hidden:true}));
  const merges = Array.from({length:25000},(_,i)=>`A${i*2+1}:SR${i*2+2}`);
  assert.equal(compare({rows,merges},{rows:[...rows].reverse(),merges:[...merges].reverse()}).equal,true);
});

test('worksheet views normalize defaults and compare frozen/split panes by view ID',()=>{
 assert.equal(compare({}, {views:[{id:0,showGridLines:true,rightToLeft:false,zoomScale:100,view:'normal'}]}).equal,true);
 const frozen={id:1,state:'frozen',xSplit:1,ySplit:2,paneTopLeftCell:'B3',showGridLines:false,rightToLeft:true,zoomScale:125,view:'pageLayout'};
 const normalized=normalize({views:[frozen]});assert.deepEqual(normalize(normalized),normalized);frozen.xSplit=3;assert.equal(normalized.views[0].xSplit,1);
 const split={...normalized.views[0],state:'split',xSplit:2310.5,ySplit:2070};
 assert.deepEqual(compare(normalized,{views:[split]}).changes,[{kind:'view',location:'View 1',left:normalized.views[0],right:split}]);
 assert.equal(compare({views:[{id:2,zoomScale:80},{id:0,showGridLines:false}]},{views:[{id:0,showGridLines:false},{id:2,zoomScale:80}]}).equal,true);
 assert.equal(compare({}, {views:[{id:0,state:'frozenSplit',ySplit:2}]}).equal,false);
});
test('worksheet views reject invalid records, extreme panes and malformed cells',()=>{
 for(const view of [{id:-1},{id:0,zoomScale:9},{id:0,showGridLines:'false'},{id:0,view:'invalid'},{id:0,state:'bad'},{id:0,state:'frozen',xSplit:1.5},{id:0,state:'frozen',ySplit:1048577},{id:0,xSplit:Infinity},{id:0,paneTopLeftCell:'XFE1'},{id:0,paneTopLeftCell:'A0'},{id:0,paneTopLeftCell:'A1048577'},{id:0,paneTopLeftCell:'<img>'}])assert.throws(()=>normalize({views:[view]}),TypeError);
 assert.equal(compare({}, {views:[{id:0,state:'frozen',ySplit:2},{id:0}]}).equal,true);
 assert.equal(compare({views:[{id:0,zoomScale:125}]}, {views:[{id:0,zoomScale:80},{id:0,zoomScale:125}]}).equal,true);
 assert.throws(()=>normalize({views:Array.from({length:65},(_,id)=>({id}))}),TypeError);
 let read=false;const accessor={id:0,get xSplit(){read=true;return 1;}};assert.throws(()=>normalize({views:[accessor]}),TypeError);assert.equal(read,false);
});

test('worksheet display flags compare independently while explicit defaults remain equal',()=>{
 const {WORKBOOK_VIEW_FLAGS}=require('../src/workbook-layout.cjs');
 assert.equal(compare({}, {views:[{id:0,...WORKBOOK_VIEW_FLAGS}]}).equal,true);
 for(const [key,fallback] of Object.entries(WORKBOOK_VIEW_FLAGS)){
  const result=compare({views:[{id:0,[key]:fallback}]},{views:[{id:0,[key]:!fallback}]});
  assert.deepEqual(result.changes,[{kind:'view',location:'View 0',left:null,right:{id:0,[key]:!fallback}}]);
  for(const value of ['false',0,1,null])assert.throws(()=>normalize({views:[{id:0,[key]:value}]}),TypeError);
 }
});
