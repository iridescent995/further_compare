'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inlineDiff}=require('../src/inline-diff.cjs');
test('inline spans preserve exact text while isolating character edits',()=>{
  const result=inlineDiff('hello old <tag> 😀','hello new <tag> 😃');
  assert.equal(result.a.map(x=>x.text).join(''),'hello old <tag> 😀');
  assert.equal(result.b.map(x=>x.text).join(''),'hello new <tag> 😃');
  assert.equal(result.detailed,true);
  assert.ok(result.a.some(x=>!x.changed&&x.text.includes('<tag>')));
  assert.ok(result.a.filter(x=>x.changed).map(x=>x.text).join('').includes('old'));
  for(const [a,b] of [['','addition'],['removed',''],[' \t','  '],['same','same']]){
    const value=inlineDiff(a,b);
    assert.equal(value.a.map(x=>x.text).join(''),a);
    assert.equal(value.b.map(x=>x.text).join(''),b);
  }
});
test('long or excessively different lines use a bounded full-line fallback',()=>{
  const value=inlineDiff('x'.repeat(10000),'y'.repeat(10000));
  assert.equal(value.detailed,false);
  assert.equal(value.a[0].text.length,10000);
  assert.equal(inlineDiff('a'.repeat(1000),'b'.repeat(1000)).detailed,false);
});
