'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeWorkbookStructuralOperation,transformWorkbookStructuralFormula:transform}=require('../src/workbook-structural-formulas.cjs');
const edit=(formula,patch={})=>transform(formula,{operation:'insert',axis:'row',index:3,count:2,formulaSheet:'Data',targetSheet:'Data',...patch});
test('absolute and relative cell references relocate, dollar anchors retained',()=>assert.equal(edit('=A2+$B$3+c$4+$d5'),'=A2+$B$5+c$6+$d7'));
test('ranges grow inside, shift at start and remain unchanged beyond end',()=>{assert.equal(edit('SUM(A1:B5)'),'SUM(A1:B7)');assert.equal(edit('SUM(A3:B5)'),'SUM(A5:B7)');assert.equal(edit('SUM(A1:B2)'),'SUM(A1:B2)');assert.equal(edit('B5:A1'),'B7:A1');});
test('deletion produces REF for individual deleted cells and wholly deleted ranges',()=>{assert.equal(edit('A2+A3+$A$4+A5',{operation:'delete'}),'A2+#REF!+#REF!+A3');assert.equal(edit('SUM(A3:B4)',{operation:'delete'}),'SUM(#REF!)');});
test('deletion shrinks partially intersected ranges at either edge and interior',()=>{assert.equal(edit('A1:B5+A3:B6+A2:B3+A6:B3',{operation:'delete'}),'A1:B3+A3:B4+A2:B2+A4:B3');});
test('column edits preserve absolute anchors and whole-axis ranges',()=>{assert.equal(edit('SUM($B:$D)+C3+1:5',{axis:'column'}),'SUM($B:$F)+E3+1:5');assert.equal(edit('SUM($B:$D)+C3',{axis:'column',operation:'delete'}),'SUM($B:$B)+#REF!');assert.equal(edit('SUM($2:$5)+A:C'),'SUM($2:$7)+A:C');});
test('only target sheet references change across formula sheets and escaped qualifiers',()=>{assert.equal(edit("A3+Data!A3+Other!A3",{formulaSheet:'Other'}),'A3+Data!A5+Other!A3');assert.equal(edit("'Bob''s Data'!$A$3+DATA!A3",{targetSheet:"Bob's Data"}),"'Bob''s Data'!$A$5+DATA!A3");assert.equal(edit('data!A3'),'data!A5');});
test('external workbook references are untouched including quoted paths',()=>assert.equal(edit("[Book.xlsx]Data!A3+'C:\\Dir\\[Book.xlsx]Data'!A3+A3"),"[Book.xlsx]Data!A3+'C:\\Dir\\[Book.xlsx]Data'!A3+A5"));
test('strings, named tokens, function names and structured references stay literal',()=>assert.equal(edit('IF(A3="A3""x",LOG10(A3)+Table1[[#All],[A3]],named_A3)+INDIRECT("A3")+OFFSET(A3,1,0)'), 'IF(A5="A3""x",LOG10(A5)+Table1[[#All],[A3]],named_A3)+INDIRECT("A3")+OFFSET(A5,1,0)'));
test('implicit intersection, spill postfix and error tokens preserve syntax',()=>assert.equal(edit('@A3+A3#+#REF!+#N/A'),'@A5+A5#+#REF!+#N/A'));
test('whole-column ranges unaffected by row deletion and vice versa',()=>{assert.equal(edit('A:C',{operation:'delete'}),'A:C');assert.equal(edit('1:7',{operation:'delete',axis:'column'}),'1:7');});
test('cross-sheet independently qualified endpoints reject',()=>assert.throws(()=>edit('Data!A1:Other!B4'),/endpoints/));
test('operation and formula limits reject invalid inputs atomically',()=>{for(const patch of [{index:0},{count:0},{count:1.5},{index:1048576,count:2},{axis:'cell'},{operation:'move'}])assert.throws(()=>edit('A1',patch));assert.throws(()=>edit('A1048576'),/bounds/);assert.throws(()=>edit('XFD1',{axis:'column'}),/bounds/);assert.throws(()=>edit('"unterminated'),/unterminated/);assert.throws(()=>edit('Table[[A3]'),/unterminated/);assert.throws(()=>edit('a'.repeat(8193)));assert.throws(()=>normalizeWorkbookStructuralOperation({operation:'insert',axis:'row',index:1,count:1,extra:true}));});
test('sequential operations compose against preceding coordinates',()=>{const first=edit('$A$5+A1:B8');assert.equal(edit(first,{operation:'delete',index:2,count:4}),'$A$3+A1:B6');});
test('Unicode, astral and escaped sheet names retain exact spelling',()=>{
 assert.equal(edit("'日本 語'!A3+日本語!A3+𐐀Data!A3",{targetSheet:'日本 語'}),"'日本 語'!A5+日本語!A3+𐐀Data!A3");
 assert.equal(edit('𐐀Data!A3+𐐨data!$A$3',{targetSheet:'𐐀Data'}),'𐐀Data!A5+𐐨data!$A$5');
 assert.equal(edit("'O''Brien'!A3+Data!A3",{targetSheet:"O'Brien"}),"'O''Brien'!A5+Data!A3");
});
test('names, cell-shaped function names and structured escapes cannot become cell refs',()=>{
 const formula='LOG10(A3)+A3_name+Named.A3+𐐀A3+Data!LocalName+Table1[[A3],[Column\'\]Name]]+A3[A3]+XFE3+A1048577';
 assert.equal(edit(formula),'LOG10(A5)+A3_name+Named.A3+𐐀A3+Data!LocalName+Table1[[A3],[Column\'\]Name]]+A3[A3]+XFE3+A1048577');
});
test('external ranges, sheet-local references and intersections retain their scope',()=>{
 assert.equal(edit("[1]Data!$A$3:$B$8+'[book.xlsx]Data'!3:8+Other!A3:B8+Data!A3:B8",{formulaSheet:'Other'}),"[1]Data!$A$3:$B$8+'[book.xlsx]Data'!3:8+Other!A3:B8+Data!A5:B10");
 assert.equal(edit('SUM(A1 B3, A3:B5)'),'SUM(A1 B5, A5:B7)');
});
test('range relocation equals the envelope of surviving coordinates across many edits',()=>{
 for(const operation of ['insert','delete'])for(let low=1;low<=8;low++)for(let high=low;high<=8;high++)for(let index=1;index<=10;index++)for(let count=1;count<=3;count++){
  const survivors=Array.from({length:high-low+1},(_,i)=>i+low).filter(n=>operation!=='delete'||n<index||n>=index+count).map(n=>n<index?n:operation==='insert'?n+count:n-count);
  const expected=survivors.length?`$A$${Math.min(...survivors)}:B${Math.max(...survivors)}`:'#REF!';
  assert.equal(edit(`$A$${low}:B${high}`,{operation,index,count}),expected,JSON.stringify({operation,low,high,index,count}));
  const reverse=survivors.length?`$A$${Math.max(...survivors)}:B${Math.min(...survivors)}`:'#REF!';
  assert.equal(edit(`$A$${high}:B${low}`,{operation,index,count}),reverse);
 }
});
test('dynamic function literals preserve semantics while normal arguments relocate',()=>{
 assert.equal(edit('INDIRECT("A3")+OFFSET($A$3,2,1)+HYPERLINK("#Data!A3",A3)+ADDRESS(3,1)'), 'INDIRECT("A3")+OFFSET($A$5,2,1)+HYPERLINK("#Data!A3",A5)+ADDRESS(3,1)');
});
test('operation validation is strict and does not mutate frozen arguments',()=>{
 const operation=Object.freeze({operation:'delete',axis:'row',index:3,count:2});assert.deepEqual(normalizeWorkbookStructuralOperation(operation),operation);
 const context=Object.freeze({...operation,formulaSheet:'Data',targetSheet:'Data'});assert.equal(transform('A3+A5',context),'#REF!+A3');
 for(const bad of [{...context,extra:true},{...context,formulaSheet:''},{...context,targetSheet:'A:B'},{...context,targetSheet:'x'.repeat(32)},{...context,index:NaN}])assert.throws(()=>transform('A1',bad));
 for(const bad of ['A1+"bad','Table[[A1]','A1+\ud800',"'Bad!A1",'A1]'])assert.throws(()=>edit(bad));
});
test('all-deleted whole-axis ranges and boundary edits produce stable errors or refs',()=>{
 assert.equal(edit('$3:$4',{operation:'delete'}),'#REF!');assert.equal(edit('$C:$D',{operation:'delete',axis:'column'}),'#REF!');
 assert.equal(edit('A1',{operation:'delete',index:1,count:1048576}),'#REF!');
 assert.equal(edit('XFD1048576',{operation:'delete',index:1,count:1}),'XFD1048575');
 assert.equal(edit('XFD1048576',{operation:'delete',axis:'column',index:1,count:1}),'XFC1048576');
});

test('same-sheet independently qualified ranges preserve both endpoints and spelling',()=>{
 assert.equal(edit('SUM(Data!$A$1 : data!B5)'), 'SUM(Data!$A$1 : data!B7)');
 assert.equal(edit("SUM('Data'!A5:Data!B1)"), "SUM('Data'!A7:Data!B1)");
 assert.equal(edit('Data!A3:Data!B4',{operation:'delete'}), 'Data!#REF!:Data!#REF!');
 assert.equal(edit('Data!A1:Data!B5',{operation:'delete'}), 'Data!A1:Data!B3');
 assert.equal(edit('Other!A3:Other!B4'), 'Other!A3:Other!B4');
 assert.equal(edit("'O''Brien'!A3:'O''Brien'!B5",{formulaSheet:"O'Brien",targetSheet:"O'Brien"}), "'O''Brien'!A5:'O''Brien'!B7");
 assert.equal(edit("'[Book.xlsx]Data'!A3:'[Book.xlsx]Data'!B4"), "'[Book.xlsx]Data'!A3:'[Book.xlsx]Data'!B4");
 assert.equal(edit('"Data!A3:Data!B4"+Data!A3:Data!B4'), '"Data!A3:Data!B4"+Data!A5:Data!B6');
 for(const input of ['Data!A1:Other!B4',"'[Book.xlsx]Data'!A1:Data!B4",'Data!A1:Data!B4:C5'])assert.throws(()=>edit(input),/endpoints/);
});
test('repeated qualifiers preserve independently relocated range operands',()=>{
 for(const operation of ['insert','delete'])for(let index=1;index<=6;index++)for(let count=1;count<=3;count++)for(let first=1;first<=7;first++)for(let last=1;last<=7;last++){
  const patch={operation,index,count},expected=edit(`Data!A${first}`,patch)+':'+edit(`Data!B${last}`,patch),qualified=edit(`Data!A${first}:Data!B${last}`,patch);
  assert.equal(qualified,expected);
 }
});

test('deleted separately qualified endpoint remains an error operand',()=>{assert.equal(edit('SUM(Data!A3:Data!A4)',{operation:'delete',index:2,count:2}),'SUM(Data!#REF!:Data!A2)');});

test('genuine 3D spans retain shared coordinates during single-sheet structural operations',()=>{
 const refs=['Start:End!A2',"'Start:End'!$A$2:$B$3","'Sheet 1':'Sheet 3'!A2:A3",'Start:End!A:B','Start:End!2:3'];
 for(const operation of ['insert','delete'])for(const axis of ['row','column'])for(const targetSheet of ['Start','Middle','End','Other'])for(const ref of refs)assert.equal(edit('SUM('+ref+')',{operation,axis,index:1,count:4,targetSheet}),'SUM('+ref+')');
 assert.equal(edit('SUM(Start:Start!A2)',{targetSheet:'Start',index:2,count:1}),'SUM(Start:Start!A3)');
 assert.equal(edit('SUM(Start:End!A2:A3)+Data!A3',{operation:'delete'}),'SUM(Start:End!A2:A3)+Data!#REF!');
 assert.equal(edit('A1:Data!B4'),'A1:Data!B4','this is a 3D qualifier, not an unqualified first cell endpoint');
 assert.throws(()=>edit('Start:End!A1:Start:End!B3'),/3-D/);
});

test('later structural edits retain independently qualified deleted endpoints',()=>{
 const deleted=edit('SUM(Data!A3:Data!A4)',{operation:'delete',index:2,count:2});
 assert.equal(edit(deleted,{index:1,count:1}),'SUM(Data!#REF!:Data!A3)');
 assert.equal(edit('SUM(Data!A2:Data!#REF!)',{axis:'column',index:1,count:1}),'SUM(Data!B2:Data!#REF!)');
 assert.equal(edit('Data!#REF!:Data!#REF!'),'Data!#REF!:Data!#REF!');
 assert.equal(edit(deleted,{targetSheet:'Other'}),deleted);
 assert.equal(edit(deleted,{operation:'delete',index:2,count:1}),'SUM(Data!#REF!:Data!#REF!)');
 assert.throws(()=>edit('Data!#REF!:Other!A2'),/endpoints/);
});
