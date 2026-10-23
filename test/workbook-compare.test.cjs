'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compareWorkbookTables:compare}=require('../src/workbook-compare.cjs');

test('value mode retains cached-value equality and original cells while exposing formulas',()=>{
  const left=[['2']],right=[['3']],formulasA=[['1+1']],formulasB=[['1+1']];
  const result=compare(left,right,{formulasA,formulasB});
  assert.equal(result.equal,false);assert.equal(result.rows[0].status,'changed');
  assert.equal(result.rows[0].left,left[0]);assert.equal(result.rows[0].right,right[0]);
  assert.deepEqual(result.rows[0].cells[0],{column:0,left:'2',right:'3',equal:false,formulaLeft:'1+1',formulaRight:'1+1',styleLeft:'{}',styleRight:'{}',styleChanges:[]});
  assert.deepEqual(left,[['2']]);assert.deepEqual(formulasA,[['1+1']]);
});
test('formula mode ignores cached results for identical formulas and detects changed formulas with identical results',()=>{
  const same=compare([['2']],[['3']],{mode:'formulas',formulasA:[['A1+1']],formulasB:[['A1+1']]});
  assert.equal(same.equal,true);assert.equal(same.rows[0].status,'equal');assert.equal(same.rows[0].cells[0].left,'2');
  const changed=compare([['2']],[['2']],{mode:'formulas',formulasA:[['A1+1']],formulasB:[['1+A1']]});
  assert.equal(changed.equal,false);assert.equal(changed.rows[0].status,'changed');
  assert.equal(compare([['2']],[['2']],{mode:'values',formulasA:[['A1+1']],formulasB:[['1+A1']]}).equal,true);
});
test('formula-vs-literal collisions differ and literal cells retain ordinary value comparison',()=>{
  for(const [formulasA,formulasB]of [[["SUM(A1:A2)"]],[[null]]].map((matrix,i,all)=>[matrix,all[1-i]])){
    const result=compare([['SUM(A1:A2)']],[['SUM(A1:A2)']],{mode:'formulas',formulasA,formulasB});
    assert.equal(result.equal,false);assert.equal(result.rows[0].cells[0].equal,false);
  }
  assert.equal(compare([['same','x']],[['same','y']],{mode:'formulas'}).equal,false);
  assert.equal(compare([['same']],[['same']],{mode:'formulas'}).equal,true);
});
test('keyed row order uses values and formula lookup includes headers and original row indices',()=>{
  const left=[['one','10'],['two','20']],right=[['two','999'],['one','888']];
  const options={mode:'formulas',keyColumns:[0],headerOffset:1,formulasA:[[null,null],[null,'A1+1'],[null,'A2+1']],formulasB:[[null,null],[null,'A2+1'],[null,'A1+1']]};
  const result=compare(left,right,options);assert.equal(result.equal,true);
  assert.deepEqual(result.rows.map(row=>[row.leftIndex,row.rightIndex]),[[0,1],[1,0]]);
  assert.equal(result.rows[0].cells[1].formulaRight,'A1+1');assert.equal(result.rows[1].cells[1].right,'999');
  // Formulas in key cells do not alter the value-based join.
  options.formulasA[1][0]='KEY()';options.formulasB[2][0]='OTHER()';
  const changed=compare(left,right,options);assert.equal(changed.rows[0].status,'changed');assert.equal(changed.rows[1].status,'equal');
});
test('one-sided rows and missing cells cannot become equal through stray formula metadata',()=>{
  const result=compare([['a','1'],['b']],[['a'],['c','2']],{mode:'formulas',keyColumns:[0],formulasA:[[null,'1'],[null,'ghost']],formulasB:[[null,'1'],[null,'2']]});
  assert.deepEqual(result.rows.map(row=>row.status),['changed','left','right']);assert.equal(result.equal,false);
  assert.equal(result.rows[0].cells[1].formulaRight,null);assert.equal(result.rows[0].cells[1].equal,false);
  assert.equal(result.rows[1].cells[0].formulaRight,null);assert.equal(result.rows[2].cells[1].formulaLeft,null);
  assert.equal(compare([],[],{mode:'formulas'}).equal,true);
  assert.equal(compare([[]],[],{mode:'formulas'}).rows[0].status,'left');
});
test('duplicate value keys remain ambiguous regardless of formulas',()=>{
  const result=compare([['a','1'],['a','2']],[['a','3']],{mode:'formulas',keyColumns:[0],formulasA:[[null,'X()'],[null,'Y()']],formulasB:[[null,'X()']]});
  assert.equal(result.equal,false);assert.deepEqual(result.rows,[]);assert.deepEqual(result.duplicates,[{side:'left',key:'["a"]',rows:[0,1]}]);
});
test('workbook comparison rejects invalid modes, header offsets, matrices and formula cells',()=>{
  for(const options of [{mode:'both'},{headerOffset:-1},{headerOffset:0.5},{headerOffset:Number.MAX_SAFE_INTEGER+1},{headerOffset:'1'},
    {formulasA:null},{formulasA:[null]},{formulasA:[[undefined]]},{formulasA:[[1]]},{formulasA:[['=A1']]},{formulasB:[['']]},{formulasA:[new Array(1)]}])assert.throws(()=>compare([['x']],[['x']],options));
  assert.throws(()=>compare([[1]],[['x']]));assert.throws(()=>compare([['x']],[['x']],{keyColumns:[-1]}));
});

const {workbookStyleSignature:signature}=require('../src/workbook-compare.cjs');
test('style signatures sort recursively without mutation and normalize only explicit defaults',()=>{
  const style={font:{size:12,color:{theme:1},bold:true,unused:undefined},alignment:{horizontal:'left'},other:'ignored'},before=structuredClone(style);
  assert.equal(signature(style),signature({alignment:{horizontal:'left'},font:{bold:true,color:{theme:1},size:12}}));
  assert.deepEqual(style,before);assert.equal(signature({numFmt:'General',fill:{pattern:'none',type:'pattern'},font:{color:{}},border:undefined}),'{}');
  assert.equal(signature(undefined),'{}');assert.equal(signature(null),'{}');
  assert.notEqual(signature({font:{bold:false}}),'{}');assert.notEqual(signature({numFmt:'general'}),'{}');
  assert.notEqual(signature({fill:{type:'pattern',pattern:'none',fgColor:{argb:'FF000000'}}}),'{}');
  assert.notEqual(signature({richText:[{text:'a'},{text:'b'}]}),signature({richText:[{text:'b'},{text:'a'}]}));
});
test('format-only differences are optional and identify every supported style group',()=>{
  const style={numFmt:'0.00',font:{bold:true},fill:{type:'pattern',pattern:'solid'},border:{top:{style:'thin'}},alignment:{horizontal:'center'},protection:{locked:false},richText:[{text:'same',font:{italic:true}}]};
  const left=[['same']],right=[['same']],options={stylesA:[[signature(style)]],stylesB:[['{}']]};
  assert.equal(compare(left,right,options).equal,true);
  const result=compare(left,right,{...options,compareFormatting:true});assert.equal(result.equal,false);assert.equal(result.rows[0].status,'changed');
  assert.deepEqual(result.rows[0].cells[0].styleChanges,['Number format','Font','Fill','Border','Alignment','Protection','Rich text']);
  assert.equal(result.rows[0].cells[0].left,'same');assert.deepEqual(left,[['same']]);
});
test('formula and formatting comparisons must both match when enabled',()=>{
  const font=signature({font:{bold:true}}),options={mode:'formulas',compareFormatting:true,formulasA:[['A1']],formulasB:[['A1']],stylesA:[[font]]};
  assert.equal(compare([['1']],[['2']],options).equal,false);
  assert.equal(compare([['1']],[['2']],{...options,stylesB:[[font]]}).equal,true);
  assert.equal(compare([['1']],[['1']],{...options,stylesB:[[font]],formulasB:[['B1']]}).equal,false);
});
test('style matrices follow original keyed indices and header offset with absent styles defaulting empty',()=>{
  const font=signature({font:{name:'Example'}}),left=[['a','1'],['b','2']],right=[['b','2'],['a','1']];
  const options={keyColumns:[0],headerOffset:1,compareFormatting:true,stylesA:[[],['{}',font]],stylesB:[[],[],['{}',font]]};
  assert.equal(compare(left,right,options).equal,true);
  const changed=compare(left,right,{...options,stylesB:[]});assert.equal(changed.rows[0].status,'changed');assert.equal(changed.rows[1].status,'equal');
  assert.equal(changed.rows[0].cells[1].styleRight,'{}');
  const missing=compare([['a','1']],[],{stylesA:[['{}',font]],compareFormatting:true});assert.equal(missing.rows[0].status,'left');assert.equal(missing.rows[0].cells[1].styleRight,'{}');
});
test('style signatures and matrices reject malformed, cyclic, nonfinite and excessive inputs',()=>{
  const cycle={};cycle.nested=cycle;let deep={};for(let i=0;i<25;i++)deep={nested:deep};
  for(const style of [[],1,'x',{font:cycle},{font:deep},{font:{size:NaN}},{font:{size:Infinity}},{font:new Date()},{font:{bad:()=>{}}},{font:{bad:1n}},{font:null},{numFmt:1},{richText:{}},{font:{name:'x'.repeat(65537)}}])assert.throws(()=>signature(style));
  for(const options of [{compareFormatting:1},{stylesA:null},{stylesA:[null]},{stylesA:[[null]]},{stylesA:[['bad']]},{stylesA:[['null']]},{stylesA:[['{"font": {"bold":true}}']]},{stylesA:[['{"unknown":true}']]},{stylesA:[new Array(1)]}])assert.throws(()=>compare([['x']],[['x']],options));
});

test('repeated style signatures count once toward metadata size limits across both sheets',()=>{
  const font=signature({font:{name:'Example font '+ 'x'.repeat(200)}});
  const styleRow=Array(500).fill(font),styles=Array(1000).fill(styleRow);
  // A normal large workbook can repeat one style in 500k cells per sheet.
  assert.ok(font.length*500000>33554432);
  const result=compare([['same']],[['same']],{compareFormatting:true,stylesA:styles,stylesB:styles});
  assert.equal(result.equal,true);assert.equal(result.rows[0].cells[0].styleLeft,font);
});

test('formula identities compare dialect and expression without replacing display or cached keys',()=>{
 const identity=(dialect,expression)=>JSON.stringify({dialect,expression});
 const left=[['key','12']],right=[['key','22']],formulasA=[[null,'SUM([.B2];2)']],formulasB=[[null,'SUM([.B2];2)']];
 const formulaIdentitiesA=[[null,identity('openformula','SUM([.B2];2)')]],formulaIdentitiesB=[[null,identity('openformula','SUM([.B2];2)')]];
 const result=compare(left,right,{keyColumns:[0],mode:'formulas',formulasA,formulasB,formulaIdentitiesA,formulaIdentitiesB});
 assert.equal(result.equal,true);assert.equal(result.rows[0].cells[1].left,'12');assert.equal(result.rows[0].cells[1].right,'22');
 assert.equal(result.rows[0].cells[1].formulaLeft,'SUM([.B2];2)');
 assert.equal(compare(left,right,{mode:'values',formulasA,formulasB,formulaIdentitiesA,formulaIdentitiesB}).equal,false);
 assert.equal(compare(left,right,{mode:'formulas',formulasA,formulasB,formulaIdentitiesA}).equal,false,'ODS expression cannot equal an XLSX expression just because display text matches');
 formulaIdentitiesB[0][1]=identity('other-dialect','SUM([.B2];2)');
 assert.equal(compare(left,right,{mode:'formulas',formulasA,formulasB,formulaIdentitiesA,formulaIdentitiesB}).equal,false);
});

test('formula identity matrices cannot omit or invent identity cells',()=>{
 const options={mode:'formulas',formulasA:[['1+1']],formulasB:[['1+1']]};
 for(const formulaIdentitiesA of [[],[[]],new Array(1),[new Array(1)],[['']],[[42]],[['x'.repeat(65537)]]])assert.throws(()=>compare([['2']],[['2']],{...options,formulaIdentitiesA}),/identit/i);
 assert.throws(()=>compare([['2']],[['2']],{formulasA:[[null]],formulaIdentitiesA:[['invented']]}),/identity/i);
});

test('unqualified formula expressions never become equal even to themselves',()=>{const r=compare([['2']],[['2']],{mode:'formulas',formulasA:[['1+1']],formulasB:[['1+1']],formulaIdentitiesA:[[null]],formulaIdentitiesB:[[null]]});assert.equal(r.equal,false);assert.equal(r.rows[0].cells[0].formulaUnavailable,true);});

 test('binary expression identities do not claim a cross-dialect difference or match',()=>{
 const binary=JSON.stringify({dialect:'urn:furthercompare:binary-formula:v1',expression:['add',1,1]});
 const options={mode:'formulas',formulasA:[['1+1']],formulasB:[['1+1']],formulaIdentitiesA:[[binary]]};
 const r=compare([['2']],[['2']],options);assert.equal(r.equal,false);assert.equal(r.rows[0].cells[0].formulaUnavailable,true);assert.match(r.rows[0].cells[0].formulaUnavailableReason,/dialects/);
 const same=compare([['2']],[['9']],{...options,formulaIdentitiesB:[[binary]]});assert.equal(same.equal,true);
 });
