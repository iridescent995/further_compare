const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compare,merge,validateAnchors}=require('../src/diff.cjs');
function reconstruct(a,b,anchors){
  const result=compare(a,b,false,anchors);
  assert.equal(result.rows.filter(row=>row.ai!==null).map(row=>row.a).join('\n'),a);
  assert.equal(result.rows.filter(row=>row.bi!==null).map(row=>row.b).join('\n'),b);
  assert.deepEqual(result.rows.filter(row=>row.anchor).map(row=>({a:row.ai,b:row.bi})),anchors);
  let left=a,right=b;
  for(const h of [...result.hunks].reverse()){
    right=merge(a,right,h,'a');left=merge(left,b,h,'b');
  }
  assert.equal(right,a);assert.equal(left,b);
  for(const [id,h] of result.hunks.entries()){
    assert.equal(result.rows[h.row].hunk,id);
    const rows=result.rows.filter(row=>row.hunk===id);
    assert.equal(rows.filter(row=>row.ai!==null).length,h.aCount);
    assert.equal(rows.filter(row=>row.bi!==null).length,h.bCount);
  }
  return result;
}
test('manual anchors pair repeated blocks and preserve global merge ranges',()=>{
  const a='start\nrepeat\nleft\nrepeat\nend',b='start\nright\nrepeat\nrepeat\nend';
  const result=reconstruct(a,b,[{a:1,b:3}]);
  assert.equal(result.rows.find(row=>row.anchor).type,'equal');
  assert.ok(result.rows.some(row=>row.type==='added'));
  assert.ok(result.rows.some(row=>row.type==='removed'));
});
test('different anchored lines remain independently mergeable and respect whitespace rules',()=>{
  const r=reconstruct('old\n a b\ntail','new\nab\nlast',[{a:0,b:0},{a:1,b:1},{a:2,b:2}]);
  assert.equal(r.hunks.length,3);
  const ignored=compare(' a b','ab',true,[{a:0,b:0}]);
  assert.equal(ignored.hunks.length,0);assert.equal(ignored.rows[0].anchor,true);
  reconstruct('\n','one\n',[{a:0,b:0},{a:1,b:1}]);
  reconstruct('','a',[]);reconstruct('a','',[]);
});
test('manual alignment rejects malformed, absent, repeated and crossing lines',()=>{
  for(const anchors of [null,{},new Array(1),[{a:-1,b:0}],[{a:0.5,b:0}],[{a:NaN,b:0}],[{a:0,b:Infinity}],[{a:0,b:3}],[null],[{a:'0',b:0}],[{a:1,b:1},{a:1,b:2}],[{a:0,b:2},{a:1,b:1}],Array(1001).fill({a:0,b:0})])assert.throws(()=>compare('a\nb\nc','a\nb\nc',false,anchors),/Manual alignment/);
  assert.throws(()=>validateAnchors([{a:0,b:0}],'','x'),/must exist/);
  const input=[{a:0,b:0,extra:'ignored'}],output=validateAnchors(input,'x','y');
  assert.deepEqual(output,[{a:0,b:0}]);assert.notEqual(output[0],input[0]);
});
test('random ordered anchors reconstruct both repeated-line inputs',()=>{
  let seed=71;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
  for(let i=0;i<350;i++){
    const a=Array.from({length:1+rnd()%40},()=>['repeat','other','','<text>'][rnd()%4]).join('\n');
    const b=Array.from({length:1+rnd()%40},()=>['repeat','','changed','other'][rnd()%4]).join('\n');
    const an=a===''?0:a.split('\n').length,bn=b===''?0:b.split('\n').length,anchors=[];
    let ai=-1,bi=-1;
    while(true){ai+=1+rnd()%5;bi+=1+rnd()%5;if(ai>=an||bi>=bn)break;anchors.push({a:ai,b:bi});}
    reconstruct(a,b,anchors);
  }
});
test('maximum anchor count remains bounded on a large document',()=>{
  const a=Array.from({length:30000},(_,i)=>'line '+i).join('\n');
  const anchors=Array.from({length:1000},(_,i)=>({a:i*30,b:i*30}));
  const start=performance.now(),r=compare(a,a.replace('line 15001\n','changed\n'),false,anchors);
  assert.equal(r.hunks.length,1);assert.equal(r.rows.filter(row=>row.anchor).length,1000);
  assert.ok(performance.now()-start<3000);
});
