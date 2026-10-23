const {test}=require('node:test'),assert=require('node:assert/strict'),{compare,mergeLines}=require('../src/diff.cjs');
const copy=(a,b,side,selected)=>mergeLines(a,b,compare(a,b).rows,side,selected);
test('disjoint lines replace only aligned counterparts in either direction',()=>{
 const a='head\nA\nB\nC\ntail\n',b='head\nx\ny\nz\ntail\n';
 assert.equal(copy(a,b,'a',[1,3]),'head\nA\ny\nC\ntail\n');
 assert.equal(copy(a,b,'b',[1,3]),'head\nx\nB\nz\ntail\n');
});
test('selected insertion preserves unselected source and target-only rows',()=>{
 assert.equal(copy('head\nnew1\nnew2\ntail','head\ntail','a',[2]),'head\nnew2\ntail');
 assert.equal(copy('head\nA\ntail','head\nx\nextra\ntail','a',[1]),'head\nA\nextra\ntail');
});
test('selected EOF and empty targets retain explicit separators',()=>{
 assert.equal(copy('a\n','a','a',[1]),'a\n');
 assert.equal(copy('a\nb','', 'a',[0,1]),'a\nb');
 assert.equal(copy('a\nb\n','a\nx\n','a',[1]),'a\nb\n');
});
test('stale row content and invalid selections are rejected',()=>{
 const rows=compare('a','b').rows;
 assert.throws(()=>mergeLines('changed','b',rows,'a',[0]),/source changed/);
 assert.throws(()=>mergeLines('a','changed',rows,'a',[0]),/destination changed/);
 assert.throws(()=>mergeLines('a','b',rows,'a',[-1]),/selected lines changed/);
});
