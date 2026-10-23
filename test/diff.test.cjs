const {test}=require('node:test');const assert=require('node:assert/strict');const {compare,merge}=require('../src/diff.cjs');
test('preserves whitespace, blank lines, markup and trailing newline',()=>{const a='\n  <div>&hello</div>\n\n';const r=compare(a,a);assert.equal(r.hunks.length,0);assert.equal(r.rows.map(r=>r.a).join('\n'),a);});
test('empty and trailing additions merge in both directions',()=>{for(const [a,b] of [['','a\nb\n'],['one','one\ntwo'],['a\na\nb','a\nb\na'],['x\ny',''],['a\n','a'],[' a','a'],['x\r\ny','x\ny']]){const r=compare(a,b);let modified=b;for(const h of [...r.hunks].reverse())modified=merge(a,modified,h,'a');assert.equal(modified,a);let original=a;for(const h of [...r.hunks].reverse())original=merge(original,b,h,'b');assert.equal(original,b);}});
test('ignore whitespace is optional',()=>{assert.equal(compare(' a\tb','ab',true).hunks.length,0);assert.equal(compare(' a\tb','ab',false).hunks.length,1);});
test('random repeated lines can reconstruct either input via hunks',()=>{let seed=4;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};for(let i=0;i<300;i++){const a=Array.from({length:rnd()%35},()=>['a','b','','<x>'][rnd()%4]).join('\n'),b=Array.from({length:rnd()%35},()=>['b','a','','c'][rnd()%4]).join('\n');const result=compare(a,b);let actual=b;for(const h of [...result.hunks].reverse())actual=merge(a,actual,h,'a');assert.equal(actual,a);}});
test('30k line localized changes complete in a bounded time',()=>{const a=Array.from({length:30000},(_,i)=>'line '+i).join('\n'),b=a.replace('line 15000\n','changed\n');const start=performance.now();assert.equal(compare(a,b).hunks.length,1);assert.ok(performance.now()-start<3000);});
test('ignore case is opt-in and preserves original equal rows and coordinates',()=>{
  const a='Name\nSAME\nLast',b='name\nSAME\nlast';
  assert.equal(compare(a,b).hunks.length,2);
  const result=compare(a,b,false,[],true);
  assert.equal(result.hunks.length,0);assert.equal(result.ignoredLineCount,2);
  assert.deepEqual(result.rows.map(row=>[row.a,row.b,row.ai,row.bi,row.type]),[['Name','name',0,0,'equal'],['SAME','SAME',1,1,'equal'],['Last','last',2,2,'equal']]);
  assert.equal(compare(a,a,false,[],true).ignoredLineCount,0);
});
test('case and whitespace rules combine while counting each ignored line once',()=>{
  const a=' A\tB \nSpace Only\nCase',b='ab\nSpaceOnly\ncase';
  assert.equal(compare(a,b,false,[],true).hunks.length,1);
  assert.equal(compare(a,b,true).ignoredLineCount,1);
  const combined=compare(a,b,true,[],true);
  assert.equal(combined.hunks.length,0);assert.equal(combined.ignoredLineCount,3);
  assert.equal(combined.rows[0].a,' A\tB ');
});
test('ignore case uses Unicode lowercase equality rather than full case folding or normalization',()=>{
  for(const [a,b]of [['É','é'],['Ω','ω'],['İ','i\u0307'],['ẞ','ß']])assert.equal(compare(a,b,false,[],true).hunks.length,0);
  for(const [a,b]of [['Straße','STRASSE'],['é','e\u0301'],['Σ','ς'],['İ','i']])assert.equal(compare(a,b,false,[],true).hunks.length,1);
});
test('manual anchors honor case rules while remaining hunks merge original text',()=>{
  const a='HEADER\nLeft Original\nAnchor\nTail',b='header\nRight Original\nanchor\ntail';
  const result=compare(a,b,false,[{a:2,b:2}],true);
  assert.equal(result.ignoredLineCount,3);assert.equal(result.hunks.length,1);
  assert.deepEqual(result.hunks[0],{aStart:1,bStart:1,aCount:1,bCount:1,row:1});
  assert.equal(result.rows[2].anchor,true);assert.equal(result.rows[2].type,'equal');
  assert.equal(merge(a,b,result.hunks[0],'a'),'header\nLeft Original\nanchor\ntail');
  assert.equal(merge(a,b,result.hunks[0],'b'),'HEADER\nRight Original\nAnchor\nTail');
  const changed=compare('A\nX','a\nY',false,[{a:1,b:1}],true);
  assert.equal(changed.rows[1].anchor,true);assert.equal(changed.rows[1].type,'changed');
});
test('case rules preserve blank and final lines and do not turn absent lines into equal rows',()=>{
  const result=compare('A\n\n','a\n\n',false,[],true);
  assert.equal(result.rows.length,3);assert.equal(result.ignoredLineCount,1);assert.equal(result.hunks.length,0);
  const trailing=compare('A\n','a',false,[],true);
  assert.equal(trailing.hunks.length,1);assert.equal(trailing.hunks[0].aCount,1);assert.equal(trailing.hunks[0].bCount,0);
  assert.equal(trailing.ignoredLineCount,1);
  assert.equal(compare('','',true,[],true).ignoredLineCount,0);
  assert.equal(compare('','A',false,[],true).rows[0].type,'added');
});
test('combined case and whitespace normalization scales to 30k lines',()=>{
  const a=Array.from({length:30000},(_,i)=>' LINE '+i+' ').join('\n'),b=Array.from({length:30000},(_,i)=>i===15000?'changed':'line'+i).join('\n');
  const start=performance.now(),result=compare(a,b,true,[],true);
  assert.equal(result.hunks.length,1);assert.equal(result.ignoredLineCount,29999);assert.equal(result.rows[15000].a,' LINE 15000 ');
  assert.ok(performance.now()-start<3000);
});
test('minor metadata marks only normalized equal text, including anchors, without creating merge hunks',()=>{
  const a=' Header \nunchanged\n LEFT\n Anchor \n\n',b='header\nunchanged\nRIGHT\nanchor\n\n';
  const result=compare(a,b,true,[{a:3,b:3}],true);
  assert.deepEqual(result.rows.map(row=>row.minor),[true,undefined,undefined,true,undefined,undefined]);
  assert.deepEqual(result.rows.map(row=>[row.ai,row.bi]),[[0,0],[1,1],[2,2],[3,3],[4,4],[5,5]]);
  assert.equal(result.rows[3].anchor,true);
  assert.equal(result.rows[3].type,'equal');
  assert.equal(result.rows[3].hunk,undefined);
  assert.equal(result.ignoredLineCount,2);
  assert.deepEqual(result.hunks,[{aStart:2,bStart:2,aCount:1,bCount:1,row:2}]);
  assert.equal(merge(a,b,result.hunks[0],'a'),'header\nunchanged\n LEFT\nanchor\n\n');
  assert.equal(merge(a,b,result.hunks[0],'b'),' Header \nunchanged\nRIGHT\n Anchor \n\n');
  assert.equal(result.rows.map(row=>row.a).join('\n'),a);
  assert.equal(result.rows.map(row=>row.b).join('\n'),b);
  for(const row of compare(a,b).rows)assert.equal(row.minor,undefined);
  for(const row of compare('',' \n',true,[],true).rows)assert.equal(row.minor,undefined);
});
test('horizontal whitespace ignores spaces and tabs while preserving nonbreaking and other whitespace',()=>{
  const a=' A \tB\nC\u00a0D\nE\r\nF\vG',b='ab\nCD\nE\nFG';
  const horizontal=compare(a,b,true,[],true,'horizontal');
  assert.equal(horizontal.rows[0].minor,true);
  assert.equal(horizontal.rows[0].a,' A \tB');
  assert.equal(horizontal.rows[0].b,'ab');
  assert.deepEqual(horizontal.rows.map(row=>row.type),['equal','changed','changed','changed']);
  assert.equal(horizontal.ignoredLineCount,1);
  assert.deepEqual(horizontal.hunks,[{aStart:1,bStart:1,aCount:3,bCount:3,row:1}]);
  assert.equal(compare(a,b,true,[],true,'all').hunks.length,0);
  assert.deepEqual(compare(a,b,true,[],true),compare(a,b,true,[],true,'all'));
  assert.equal(merge(a,b,horizontal.hunks[0],'a'),'ab\nC\u00a0D\nE\r\nF\vG');
  assert.equal(merge(a,b,horizontal.hunks[0],'b'),' A \tB\nCD\nE\nFG');
});
test('horizontal whitespace preserves line structure and anchored merge coordinates',()=>{
  const a='a \n \t\nAnchor\nleft\n',b='a\n\nAnchor\nright\n';
  const result=compare(a,b,true,[{a:2,b:2}],false,'horizontal');
  assert.deepEqual(result.rows.map(row=>[row.ai,row.bi]),[[0,0],[1,1],[2,2],[3,3],[4,4]]);
  assert.deepEqual(result.rows.map(row=>row.minor),[true,true,undefined,undefined,undefined]);
  assert.equal(result.rows[2].anchor,true);
  assert.deepEqual(result.hunks,[{aStart:3,bStart:3,aCount:1,bCount:1,row:3}]);
  const trailing=compare('a\n','a',true,[],false,'horizontal');
  assert.equal(trailing.rows[1].type,'removed');
  assert.equal(trailing.rows[1].minor,undefined);
  assert.equal(compare(' a','a',false,[],false,'horizontal').hunks.length,1);
});
test('whitespace scope accepts only supported values even when whitespace is significant',()=>{
  for(const scope of [null,true,false,0,{},[],'spaces','ALL']){
    assert.throws(()=>compare('same','same',false,[],false,scope),/whitespace comparison scope/);
  }
});
