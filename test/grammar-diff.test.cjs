'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compare,merge,mergeLines}=require('../src/diff.cjs');
const split=text=>text===''?[]:text.split('\n');
// Independent tiny grammar fixture: whole-line // comments are unimportant;
// suffix comments leave executable text significant.
function keys(text){const original=split(text);return {keys:original.map(line=>line.replace(/\/\/.*$/,'')),omit:original.map(line=>/^\s*\/\//.test(line))};}
function diff(a,b,{anchors=[],blanks=false}={}){const x=keys(a),y=keys(b);return compare(a,b,false,anchors,false,'all',blanks,{a:x.keys,b:y.keys,omitA:x.omit,omitB:y.omit});}
function apply(a,b,from){let target=from==='a'?b:a;for(const h of diff(a,b).hunks.toReversed())target=from==='a'?merge(a,target,h,from):merge(target,b,h,from);return target;}
function physical(result,a,b){for(const side of ['a','b'])assert.deepEqual(result.rows.filter(r=>r[side+'i']!==null).map(r=>[r[side+'i'],r[side]]),split(side==='a'?a:b).map((s,i)=>[i,s]));}
test('independent comment insertions and deletions retain physical minor rows',()=>{
 for(const [a,b]of [['// header\nrun();\n','run();\n'],['run();\n','// header\nrun();\n'],['// left\nrun();\n// tail','run();\n// right']]){const result=diff(a,b);assert.equal(result.hunks.length,0);assert.ok(result.ignoredLineCount);physical(result,a,b);}
});
test('token lines remain significant and inline comment keys do not erase code changes',()=>{
 const a='// left\nold(); // note\n// tail',b='// right\nnew(); // other\n// end';const r=diff(a,b);assert.equal(r.hunks.length,1);assert.deepEqual(r.hunks[0],{aStart:1,bStart:1,aCount:1,bCount:1,row:1,omitLines:true});
 assert.equal(apply(a,b,'a'),'// right\nold(); // note\n// end');assert.equal(apply(a,b,'b'),'// left\nnew(); // other\n// tail');
 assert.equal(diff('run(); // one','run(); // two').hunks.length,0);
});
test('hunk copying leaves omitted source and destination comments outside hunks untouched',()=>{
 const a='old1\n// source middle\nold2\nend',b='new1\n// target middle\nnew2\nend';const r=diff(a,b);assert.equal(r.hunks.length,2);physical(r,a,b);assert.equal(apply(a,b,'a'),'old1\n// target middle\nold2\nend');assert.equal(apply(a,b,'b'),'new1\n// source middle\nnew2\nend');
});
test('selected-line copying is physical and never copies the whole difference group',()=>{
 const a='old1\nold2\n// source\nend',b='new1\nnew2\n// destination\nend',r=diff(a,b);
 assert.equal(mergeLines(a,b,r.rows,'a',[1]),'new1\nold2\n// destination\nend');assert.equal(mergeLines(a,b,r.rows,'a',[2]),'new1\nnew2\n// source\nend');
 assert.equal(mergeLines(a,b,r.rows,'a',[0,2]),'old1\nnew2\n// source\nend');
});
test('manual anchors retain physical authority for omitted versus significant lines',()=>{
 const a='// comment\nrun',b='code\nrun',r=diff(a,b,{anchors:[{a:0,b:0}]});assert.equal(r.hunks.length,1);assert.equal(r.rows[0].anchor,true);assert.equal(merge(a,b,r.hunks[0],'a'),a);
 const comments=diff('// one\nrun','// two\nrun',{anchors:[{a:0,b:0}]});assert.equal(comments.hunks.length,0);assert.equal(comments.rows[0].minor,true);assert.equal(comments.rows[0].anchor,true);
});
test('final newline remains significant beside omitted comments and merges converge',()=>{
 for(const [a,b]of [['// comment\nrun\n','run'],['// c\nold\n','new'],['run\n// a\n','run\n// b']]){
 const r=diff(a,b);assert.ok(r.hunks.length,JSON.stringify([a,b]));physical(r,a,b);
 for(const from of ['a','b']){const merged=apply(a,b,from),next=from==='a'?diff(a,merged):diff(merged,b);assert.equal(next.hunks.length,0,JSON.stringify({a,b,from,merged,next}));}
 }
});
test('unrepresentable comment-only EOF exposes its physical carrier in the selected hunk',()=>{
 const a='// comment\n',b='',r=diff(a,b);assert.equal(r.hunks.length,1);assert.equal(r.hunks[0].aCount,2);assert.equal(r.hunks[0].physicalCarrier,true);assert.equal(r.rows[0].hunk,0);assert.equal(r.rows[0].type,'removed');assert.equal(merge(a,b,r.hunks[0],'a'),a);assert.equal(merge(a,b,r.hunks[0],'b'),b);
});
test('blank suppression combines with comment omissions without treating blank lines as comments',()=>{
 const a='// a\n\nrun\n',b='run\n';assert.ok(diff(a,b).hunks.length);assert.equal(diff(a,b,{blanks:true}).hunks.length,0);
 const r=diff('// a\n\nold\n','new\n',{blanks:true});assert.equal(r.hunks.length,1);assert.equal(r.hunks[0].ignoreBlankLines,true);assert.equal(r.hunks[0].omitLines,true);
});
test('malformed omission masks and omitted final-newline sentinel are rejected',()=>{
 const a=['// a',''],b=['x',''];for(const omitA of [null,{},[true],[true,0],[true,undefined],new Array(2),[true,true]])assert.throws(()=>compare('// a\n','x\n',false,[],false,'all',false,{a,b,omitA}),/omission masks/);
 assert.throws(()=>compare('x','x',false,[],false,'all',false,{a:['x'],b:['x'],omitB:[1]}),/omission masks/);
 assert.throws(()=>compare('x','x',false,[],false,'all',false,{a:['x'],b:['x'],omitC:[false]}),/Invalid prepared/);
 assert.equal(compare('x','x',false,[],false,'all',false,{a:['x'],b:['x'],omitA:[false]}).hunks.length,0);
});
test('explicit all-false masks retain stable tagged EOF semantics without requiring a peer comment',()=>{
 const a='old\n',b='new',r=diff(a,b);assert.equal(r.hunks.length,1);assert.equal(r.hunks[0].omitLines,true);assert.equal(merge(a,b,r.hunks[0],'a'),a);assert.equal(merge(a,b,r.hunks[0],'b'),b);
 assert.equal(diff('x\n','x\n').hunks.length,0);
});
test('grammar EOF handles blank-only files without losing a copied newline',()=>{
 const values=['','\n','\n\n','x','x\n','\nx\n',' \n'];
 for(const a of values)for(const b of values)for(const from of ['a','b']){
  const wanted=from==='a'?a:b;let target=from==='a'?b:a;
  for(let attempt=0;attempt<12;attempt++){
   const r=from==='a'?diff(a,target):diff(target,b);if(!r.hunks.length)break;
   target=from==='a'?merge(a,target,r.hunks[0],from):merge(target,b,r.hunks[0],from);
  }
  assert.equal(target,wanted,JSON.stringify({a,b,from,target}));
 }
 assert.throws(()=>compare('\n','',false,[],false,'all',false,{a:['',''],b:[],omitA:[false,true],omitB:[]}),/omission masks/);
});
test('recomputed substantive copies converge with interspersed ignored comments and final newlines',()=>{
 const values=['x\n// a\n','\n// a\nx\n','// a\nx','x\n// a','x','x\n',''];
 for(const a of values)for(const b of values)for(const from of ['a','b']){
  let target=from==='a'?b:a;
  for(let attempt=0;attempt<12;attempt++){
   const r=from==='a'?diff(a,target):diff(target,b);if(!r.hunks.length)break;
   target=from==='a'?merge(a,target,r.hunks[0],from):merge(target,b,r.hunks[0],from);
  }
  const r=from==='a'?diff(a,target):diff(target,b);assert.equal(r.hunks.length,0,JSON.stringify({a,b,from,target,r}));
 }
});
test('real grammar profiles converge for first and last hunk choices across blank/comment-only files',()=>{
 const {prepareTextProfile}=require('../src/text-profile.cjs');
 for(const profile of ['java','xml','sql']){
  const comment=profile==='java'?'// b':profile==='xml'?'<!-- b -->':'-- b';
  const values=['','\n','\n\n',' ',' \n','\t\n','x','x\n','x\n\n',comment,comment+'\n',comment+'\n\n','\n'+comment+'\n','x\n'+comment+'\n',comment+'\nx\n','\n'+comment+'\nx',comment+'\n'+comment+'\n'];
  for(const blanks of [false,true])for(const a of values)for(const b of values)for(const from of ['a','b'])for(const last of [false,true]){
   const compareCurrent=(left,right)=>{const x=prepareTextProfile(left,profile),y=prepareTextProfile(right,profile);return compare(left,right,false,[],false,'all',blanks,{a:x.keys,b:y.keys,omitA:x.omit,omitB:y.omit});};
   let target=from==='a'?b:a;const seen=new Set();
   for(let attempt=0;attempt<20;attempt++){
    const r=from==='a'?compareCurrent(a,target):compareCurrent(target,b);if(!r.hunks.length)break;
    assert.ok(!seen.has(target),JSON.stringify({profile,blanks,a,b,from,last,target,r}));seen.add(target);
    const h=last?r.hunks.at(-1):r.hunks[0];target=from==='a'?merge(a,target,h,from):merge(target,b,h,from);
   }
   const r=from==='a'?compareCurrent(a,target):compareCurrent(target,b);assert.equal(r.hunks.length,0,JSON.stringify({profile,blanks,a,b,from,last,target,r}));
  }
 }
});
test('physical carrier grouping keeps manual alignment rows and copies only its visible range',()=>{
 const a='// b\n',b='x\n\ny',r=diff(a,b,{anchors:[{a:0,b:1}]});assert.equal(r.hunks.length,1);assert.equal(r.hunks[0].physicalCarrier,true);physical(r,a,b);assert.ok(r.rows.some(row=>row.anchor&&row.ai===0&&row.bi===1));assert.ok(r.rows.every(row=>row.hunk===0&&!row.minor));assert.equal(merge(a,b,r.hunks[0],'a'),a);assert.equal(merge(a,b,r.hunks[0],'b'),b);
});
