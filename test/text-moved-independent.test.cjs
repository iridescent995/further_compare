'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {compare,merge,mergeLines}=require('../src/diff.cjs');
const {annotateMovedBlocks}=require('../src/text-moved-blocks.cjs');
const directory=path.join(__dirname,'fixtures/text-moved-independent');
const fixtures=require('./fixtures/text-moved-independent/expected.json').map(f=>({...f,a:fs.readFileSync(path.join(directory,f.a),'utf8'),b:fs.readFileSync(path.join(directory,f.b),'utf8')}));
function inspect(a,b,options={}){
 const result=compare(a,b,false,options.anchors||[]),snapshot=JSON.stringify(result);
 const copies=result.hunks.flatMap(h=>['a','b'].map(side=>merge(a,b,h,side)));
 const selected=['a','b'].flatMap(side=>[[1],[1,3]].map(indices=>mergeLines(a,b,result.rows,side,indices)));
 const annotations=annotateMovedBlocks(a,b,result,options);
 assert.equal(JSON.stringify(result),snapshot,'annotation cannot mutate rows, hunks, counts or source indexes');
 assert.deepEqual(result.hunks.flatMap(h=>['a','b'].map(side=>merge(a,b,h,side))),copies,'hunk copy remains byte-for-byte identical');
 assert.deepEqual(['a','b'].flatMap(side=>[[1],[1,3]].map(indices=>mergeLines(a,b,result.rows,side,indices))),selected,'single and discontiguous selected line copies remain identical');
 return annotations;
}
const ranges=value=>value.pairs.map(({aStart,bStart,lineCount})=>({aStart,bStart,lineCount}));
for(const f of fixtures)test(`independent ${f.name}: exact hand-authored range, reverse direction and immutable copy semantics`,()=>{
 const actual=inspect(f.a,f.b);assert.equal(actual.reason,null);assert.deepEqual(ranges(actual),f.expected);
 assert.equal(new Set(actual.pairs.map(p=>p.id)).size,actual.pairs.length);
 assert.deepEqual(inspect(f.a,f.b),actual,'stable derived identifiers for unchanged result');
 assert.deepEqual(ranges(inspect(f.b,f.a)),f.expected.map(p=>({aStart:p.bStart,bStart:p.aStart,lineCount:p.lineCount})));
 assert.deepEqual(ranges(inspect(f.a+'\n',f.b+'\n')),f.expected,'EOF sentinel is not added to matching range');
});
test('same correspondence and copied/equal-region duplicates never imply unique movement',()=>{
 const f=fixtures[0],block=f.a.split('\n').slice(1,4).join('\n');
 assert.deepEqual(inspect(f.a,f.a).pairs,[]);
 assert.deepEqual(inspect(f.a+'\n'+block,f.b+'\n'+block).pairs,[]);
 assert.deepEqual(inspect(f.a,f.a+'\n'+block).pairs,[]);
});
test('changed literal, whitespace, case and comment are not exact moves',()=>{
 const f=fixtures[0];
 for(const value of [f.b.replace('Hello','Goodbye'),f.b.replace('    return','   return'),f.b.replace('Hello','HELLO'),f.b.replace('    return','    /* comment */ return')])assert.deepEqual(inspect(f.a,value).pairs,[]);
});
test('manual anchor partitions refuse a move crossing a confirmed correspondence',()=>{
 const f=fixtures[0];assert.deepEqual(inspect(f.a,f.b,{anchors:[{a:6,b:3}]}).pairs,[]);
});
test('blank and brace-only fragments cannot be reported as meaningful blocks',()=>{
 const block=['{','','}'],corridor=Array.from({length:7},(_,i)=>`stable long corridor line ${i}`);
 assert.deepEqual(inspect(['start',...block,...corridor,'end'].join('\n'),['start',...corridor,...block,'end'].join('\n')).pairs,[]);
});
test('intervening blank lines and Unicode preserve exact full physical range',()=>{
 const block=['Unicode Café Ω first meaningful line','','Second meaningful statement with 中'],corridor=Array.from({length:7},(_,i)=>`unique unchanged corridor ${i}`);
 assert.deepEqual(ranges(inspect(['start',...block,...corridor,'end'].join('\n'),['start',...corridor,...block,'end'].join('\n'))),[{aStart:1,bStart:8,lineCount:3}]);
});
test('two independently located blocks retain disjoint exact movement ranges',()=>{
 const one=fixtures[0].a.split('\n').slice(1,4),two=fixtures[1].a.split('\n').slice(1,4),first=Array.from({length:7},(_,i)=>`first stable corridor ${i}`),second=Array.from({length:7},(_,i)=>`second stable corridor ${i}`);
 const a=['start',...one,...first,'separator',...two,...second,'end'].join('\n'),b=['start',...first,...one,'separator',...second,...two,'end'].join('\n');
 assert.deepEqual(ranges(inspect(a,b)),[{aStart:1,bStart:8,lineCount:3},{aStart:12,bStart:19,lineCount:3}]);
});
