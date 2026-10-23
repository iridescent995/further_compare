'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeWorkbookCellEdit:normalize,validateWorkbookCellEdits:validate,translateWorkbookFormula:translate}=require('../src/workbook-cell-edits.cjs');
const cell=(type,value,row=1,column=1)=>({row,column,type,value});
const template={side:'a',sheetName:'Sheet 1',sourceHash:'a'.repeat(64),structural:false};
const overlay=cells=>({version:1,side:template.side,sheetName:template.sheetName,sourceHash:template.sourceHash,cells});
test('typed cells normalize without coercing literal values or source objects',()=>{
 for(const edit of [cell('text','=SUM(A1)'),cell('text','😀\r\n_x0001_'),cell('number',1.25),cell('boolean',false),cell('blank',null)]){assert.deepEqual(normalize(edit),edit);assert.notEqual(normalize(edit),edit);}
 const formula=cell('formula','=SUM(A1:A2)');assert.deepEqual(normalize(formula),cell('formula','SUM(A1:A2)'));assert.equal(formula.value,'=SUM(A1:A2)');
});
test('typed cell schema rejects coercion, XML-invalid text, oversized values and poisoned coordinates',()=>{
 for(const edit of [cell('number','1'),cell('number',NaN),cell('number',Infinity),cell('boolean',1),cell('blank',''),cell('text',null),cell('text','a\0b'),cell('text','\ud800'),cell('text','x'.repeat(32768)),cell('formula','='),cell('formula','==A1'),cell('formula',' '.repeat(3)),cell('formula','x'.repeat(8193)),cell('formula','A1\0'),cell('text','x',0),cell('text','x',1,16385),cell('text','x',1048577),cell('text','x',1.5),{...cell('text','x'),extra:true},Object.assign(Object.create({row:1}),{column:1,type:'text',value:'x'}),{...cell('text','x'),[Symbol('extra')]:1}])assert.throws(()=>normalize(edit));
});
test('overlay binds exact workbook source and returns independent normalized copies',()=>{
 const input=overlay([cell('formula','=A1+1',1,2),cell('number',42,2,1)]),rows=[['a','b'],['c']];
 const result=validate(input,{rows,template});assert.equal(result.cells[0].value,'A1+1');result.cells[1].value=9;assert.equal(input.cells[1].value,42);assert.equal(rows[1][0],'c');
 for(const modified of [{...input,extra:1},{...input,version:2},{...input,side:'b'},{...input,sheetName:'Another'},{...input,sourceHash:'b'.repeat(64)},{...input,cells:[cell('text','x'),cell('text','y')]},{...input,cells:[cell('text','x',2,2)]}])assert.throws(()=>validate(modified,{rows,template}));
 assert.throws(()=>validate(input,{rows,template:{...template,structural:true}}),/unchanged/);
 assert.throws(()=>validate(input,{rows,template:{...template,unknown:1}}));
});
test('overlay rejects sparse/malformed/oversized result grids and sparse edit arrays',()=>{
 for(const rows of [new Array(1),[[,]],[[1]],Array.from({length:50001},()=>[]),[Array(513).fill('')],Array.from({length:1000},()=>Array(501).fill(''))])assert.throws(()=>validate(overlay([]),{rows,template}));
 assert.throws(()=>validate(overlay(new Array(1)),{rows:[['']],template}));
 assert.throws(()=>validate(overlay(Array(100001).fill(cell('text','x'))),{rows:[['']],template}));
 assert.deepEqual(validate(overlay([]),{rows:[],template:{...template,structural:true}}).cells,[]);
});
test('A1 references translate mixed and absolute anchors, ranges, unions, intersection and spill',()=>{
 assert.equal(translate('SUM(A1,$B2,C$3,$D$4,A1:B2)',2,3),'SUM(D3,$B4,F$3,$D$4,D3:E4)');
 assert.equal(translate('A1 B2+C3,D4+@A1+A1#',1,1),'B2 C3+D4,E5+@B2+B2#');
 assert.equal(translate('a1+$b2+c$3',1,1),'b2+$b3+d$3');
 assert.equal(translate('SUM(A:C,$D:$F,1:3,$4:$6,A : $B,$7 : 9)',2,1),'SUM(B:D,$D:$F,3:5,$4:$6,B : $B,$7 : 11)');
});
test('quoted strings, escaped quotes and quoted or 3D sheet names stay literal',()=>{
 assert.equal(translate('IF(A1="A1",B1,C1)',1,1),'IF(B2="A1",C2,D2)');
 assert.equal(translate('IF(A1="said ""B2""",B1,0)',1,1),'IF(B2="said ""B2""",C2,0)');
 assert.equal(translate("'Sheet A1'!A1+'Bob''s B2'!$B2+A1!C3+A1:B2!D4",1,1),"'Sheet A1'!B2+'Bob''s B2'!$B3+A1!D4+A1:B2!E5");
 assert.equal(translate("'One':'Two'!A1",1,1),"'One':'Two'!B2");
});
test('structured references, external workbooks and function or defined names are not corrupted',()=>{
 assert.equal(translate('SUM(Table1[A1],Table1[[#Headers],[B2]],A1)',1,1),'SUM(Table1[A1],Table1[[#Headers],[B2]],B2)');
 assert.equal(translate("'[Book A1.xlsx]Sheet B2'!A1+[Book1.xlsx]Sheet1!B2",1,1),"'[Book A1.xlsx]Sheet B2'!B2+[Book1.xlsx]Sheet1!C3");
 assert.equal(translate('LOG10(A1)+A1_name+Name.A1+名A1+1E10+XFE1',1,1),'LOG10(B2)+A1_name+Name.A1+名A1+1E10+XFE1');
 assert.equal(translate('#REF!+#N/A+A1',1,1),'#REF!+#N/A+B2');
});
test('formula translator rejects malformed lexical tokens and shifted Excel bounds',()=>{
 for(const formula of ['"unclosed',"'unclosed!A1",'Table1[[A1]','A1]'])assert.throws(()=>translate(formula,1,1));
 for(const [formula,r,c]of [['A1',-1,0],['A1',0,-1],['XFD1',0,1],['A1048576',1,0],['A:XFD',0,1],['1:1048576',1,0]])assert.throws(()=>translate(formula,r,c),/bounds/);
 assert.equal(translate('$A$1',-100,-100),'$A$1');assert.throws(()=>translate('A1',0.5,0));
});

test('mixed quoted sheet ranges, nested current-row references and Unicode names remain intact',()=>{
 assert.equal(translate("A1:'Sheet B2'!C3+'Sheet A1':B2!D4",1,1),"A1:'Sheet B2'!D4+'Sheet A1':B2!E5");
 assert.equal(translate('SUM([@[A1]],R1C1,𐐀A1,A1)',1,1),'SUM([@[A1]],R1C1,𐐀A1,B2)');
});
