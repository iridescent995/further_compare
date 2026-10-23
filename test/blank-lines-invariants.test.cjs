'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{compare,merge}=require('../src/diff.cjs');
const run=(a,b,anchors=[])=>compare(a,b,false,anchors,false,'horizontal',true);
function indices(result,a,b){for(const [side,text]of [['a',a],['b',b]]){const expected=text===''?[]:text.split('\n');assert.deepEqual(result.rows.filter(row=>row[side+'i']!==null).map(row=>row[side+'i']),expected.map((_,i)=>i));for(const row of result.rows)if(row[side+'i']!==null)assert.equal(row[side],expected[row[side+'i']]);}}
test('ignored blank rows remain visible with original coordinates and null missing peers',()=>{const a='\nstart\n \t\nend\n',b='start\nend\n';const result=run(a,b);assert.equal(result.hunks.length,0);indices(result,a,b);const blanks=result.rows.filter(row=>row.minor);assert.equal(blanks.length,2);assert.ok(blanks.every(row=>row.type==='equal'&&row.b===null&&row.bi===null));});
test('merging substantive edits preserves each target blank placement in both directions',()=>{
 for(const [a,b,intoB,intoA]of [
 ['start\nleft\n\nend','start\n\nright\nend','start\n\nleft\nend','start\nright\n\nend'],
 ['start\nL1\nL2\nend','start\nR1\n \t\nR2\nend','start\nL1\n \t\nL2\nend','start\nR1\nR2\nend'],
 ['\nleft\n','right\n\n','left\n\n','\nright\n']]){
  const result=run(a,b);indices(result,a,b);let right=b,left=a;for(const h of [...result.hunks].reverse()){right=merge(a,right,h,'a');left=merge(left,b,h,'b');}assert.equal(right,intoB);assert.equal(left,intoA);
  for(const h of result.hunks){for(const [side,text]of [['a',a],['b',b]]){const selected=text.split('\n').slice(h[side+'Start'],h[side+'Start']+h[side+'Count']);assert.ok(selected.every(line=>!/^[ \t]*$/.test(line)),'Substantive hunks must exclude ignored blank lines');}}
 }
});
test('final newline remains significant while extra blank lines are minor',()=>{assert.ok(run('x','x\n').hunks.length);assert.equal(run('x\n','x\n\n').hunks.length,0);assert.equal(run('',' \t\n\n').hunks.length,0);assert.ok(run('x\n\u00a0\ny','x\ny').hunks.length);});
test('manual blank anchors retain original coordinates and mixed anchors override ignoring',()=>{let a='head\n\nleft\nend',b='head\n \t\nright\nend',result=run(a,b,[{a:1,b:1}]);indices(result,a,b);let anchor=result.rows.find(row=>row.anchor);assert.equal(anchor.ai,1);assert.equal(anchor.bi,1);assert.equal(anchor.type,'equal');assert.equal(anchor.minor,true);result=run('head\n\nend','head\nvalue\nend',[{a:1,b:1}]);anchor=result.rows.find(row=>row.anchor);assert.equal(anchor.type,'changed');assert.equal(result.hunks.length,1);assert.equal(merge('head\n\nend','head\nvalue\nend',result.hunks[0],'a'),'head\n\nend');});
test('all substantive hunks converge under ignored-blank comparison in both directions',()=>{
 let seed=0x1973;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;},choices=['a','b','c','',' ','\t'];
 const cases=[['x','y\n\n'],['x\n\n','y'],['','x\n\n'],['x\n\n','']];for(let i=0;i<700;i++)cases.push(Array.from({length:2},()=>Array.from({length:random()%13},()=>choices[random()%choices.length]).join('\n')));
 for(const [a,b]of cases){const result=run(a,b);indices(result,a,b);for(const from of ['a','b']){let left=a,right=b;for(const h of [...result.hunks].reverse()){if(from==='a')right=merge(left,right,h,'a');else left=merge(left,right,h,'b');}assert.equal(run(left,right).hunks.length,0,JSON.stringify({a,b,from,left,right,hunks:result.hunks}));}}
});
