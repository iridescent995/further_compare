const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compare,merge,mergeLines}=require('../src/diff.cjs');
const {prepareComparisonKeys,comparisonPair}=require('../src/text-comparison-keys.cjs');
const {alignSyntaxRows}=require('../src/syntax-line-alignment.cjs');

function run(a,b,profile='java',options={}){
 const prepared=prepareComparisonKeys([a,b],[],profile,options.grammar);
 const before=compare(a,b,options.whitespace||false,options.anchors||[],false,'all',options.blank||false,comparisonPair(prepared));
 const snapshot=JSON.stringify(before),result=alignSyntaxRows(before,a,b,profile,options.grammar);
 assert.equal(JSON.stringify(before),snapshot,'postprocessor must not mutate the original result');
 for(const [side,text]of [['a',a],['b',b]]){
  const source=text===''?[]:text.split('\n'),rows=result.rows.filter(row=>row[side+'i']!==null);
  assert.deepEqual(rows.map(row=>row[side+'i']),source.map((_,i)=>i));
  assert.deepEqual(rows.map(row=>row[side]),source);
 }
 assert.deepEqual(result.hunks.map(({row,...rest})=>rest),before.hunks.map(({row,...rest})=>rest));
 assert.deepEqual(result.rows.filter(row=>row.anchor||row.minor||row.type==='equal'),before.rows.filter(row=>row.anchor||row.minor||row.type==='equal'));
 assert.equal(result.added,before.added);assert.equal(result.removed,before.removed);assert.equal(result.ignoredLineCount,before.ignoredLineCount);
 for(const [id,hunk]of result.hunks.entries()){
  assert.equal(result.rows[hunk.row].hunk,id);
  for(const direction of ['a','b'])assert.equal(merge(a,b,hunk,direction),merge(a,b,before.hunks[id],direction));
 }
 return {before,result};
}

test('Java lexical literals pair a changed call after an inserted statement without changing hunk copy',()=>{
 const a='send("old");\nreturn 1;',b='audit();\nsend("new");\nreturn 2;';
 const {result}=run(a,b);
 assert.deepEqual(result.rows.map(({ai,bi})=>[ai,bi]),[[null,0],[0,1],[1,2]]);
 assert.equal(result.syntaxAlignment.alignedRuns,1);
 assert.equal(mergeLines(a,b,result.rows,'a',[0]),'audit();\nsend("old");\nreturn 2;');
 assert.equal(mergeLines(a,b,result.rows,'b',[0]),'audit();\nsend("old");\nreturn 1;');
 assert.equal(mergeLines(a,b,result.rows,'b',[1]),'send("new");\nreturn 1;');
});

test('XML aligns actual attribute literals and preserves element identity',()=>{
 const {result}=run('<item id="old"/>\n<tail value="old"/>','<extra/>\n<item id="new"/>\n<tail value="new"/>','xml');
 assert.deepEqual(result.rows.map(({ai,bi})=>[ai,bi]),[[null,0],[0,1],[1,2]]);
 const unsupported=run('<one>old</one>','<two>new</two>','xml').result;
 assert.equal(unsupported.syntaxAlignment.pairedLines,0);
});

test('SQL aligns literals but preserves quoted identifiers and statement tokens',()=>{
 const {result}=run('UPDATE "users" SET age=1;\nSELECT \'old\';','DELETE FROM audit;\nUPDATE "users" SET age=2;\nSELECT \'new\';','sql');
 assert.deepEqual(result.rows.map(({ai,bi})=>[ai,bi]),[[null,0],[0,1],[1,2]]);
 for(const [a,b]of [['SELECT "old";','SELECT "new";'],['SELECT [old];','SELECT [new];'],['SELECT `old`;','SELECT `new`;']])assert.equal(run(a,b,'sql').result.syntaxAlignment.pairedLines,0);
 for(const prefix of ['/*+','/*!','/*M!'])assert.equal(run(`SELECT ${prefix} old */ 1;`,`SELECT ${prefix} new */ 2;`,'sql').result.syntaxAlignment.pairedLines,0);
});

test('lexical string protection prevents embedded comments/operators from changing structure',()=>{
 const {result}=run('log("/* old */ return 1;");\nreturn 1;','extra();\nlog("// new \\\" quote");\nreturn 2;');
 assert.deepEqual(result.rows.map(({ai,bi})=>[ai,bi]),[[null,0],[0,1],[1,2]]);
 assert.equal(run('item1(2);','item2(3);').result.syntaxAlignment.pairedLines,0);
 assert.equal(run('value = a << 1;','value = a < < 2;').result.syntaxAlignment.pairedLines,0);
});

test('manual anchors, ignored comments, blanks and EOF stay hard barriers',()=>{
 for(const options of [{anchors:[{a:0,b:0}]},{blank:true},{}]){
  const a='send("old");\n// left\n\nreturn 1;\n',b='extra();\nsend("new");\n// right\n\nreturn 2;';
  const {before,result}=run(a,b,'java',options);
  const eof=before.rows.find(row=>row.ai===4);
  assert.deepEqual(result.rows.find(row=>row.ai===4),eof);
 }
 const {before,result}=run('// before\n','// after','java');
 assert.equal(before.hunks[0].physicalCarrier,true);assert.deepEqual(result.rows,before.rows);
});

test('ambiguous repeated signatures remain positional and moved identities cannot cross',()=>{
 const {before,result}=run('send(1);\nsend(2);','extra();\nsend(3);\nsend(4);');
 assert.deepEqual(result.rows,before.rows);assert.equal(result.syntaxAlignment.fallbackRuns,1);
 const crossing=run('first(1);\nsecond(2);','second(3);\nfirst(4);').result;
 assert.equal(crossing.syntaxAlignment.pairedLines,1);
});

test('malformed syntax, plain profiles, custom regions and multiline protected constructs fall back',()=>{
 for(const [a,b,profile]of [['call("unterminated);','other();','java'],['<item a="open>','<item/>','xml'],["SELECT 'open",'SELECT 1','sql'],['return 1;','extra();\nreturn 2;','plain']]){
  const {before,result}=run(a,b,profile);assert.deepEqual(result.rows,before.rows);assert.ok(result.syntaxAlignment.fallbackReason);
 }
 const a='String x="""\nreturn 1;\n""";',b='String x="""\nextra();\nreturn 2;\n""";';
 assert.equal(run(a,b).result.syntaxAlignment.pairedLines,0);
 const grammar={version:1,importance:{},elements:[{name:'custom',kind:'pattern',pattern:'value[0-9]+',importance:'important'}]};
 assert.equal(run('call(value1);','extra();\ncall(value2);','java',{grammar}).result.syntaxAlignment.pairedLines,0);
});

test('bounded runs and oversized inputs return positional comparisons with metadata',()=>{
 const a=Array.from({length:2050},(_,i)=>`item${i}(1);`).join('\n'),b='extra();\n'+Array.from({length:2050},(_,i)=>`item${i}(2);`).join('\n');
 const {before,result}=run(a,b);assert.deepEqual(result.rows,before.rows);assert.equal(result.syntaxAlignment.fallbackRuns,1);
 const huge='x'.repeat(4*1024*1024+1),empty={rows:[],hunks:[]};
 assert.match(alignSyntaxRows(empty,huge,'','java').syntaxAlignment.fallbackReason,/4,194,304 characters/);
 const long='call('+Array.from({length:300},(_,i)=>`x${i}`).join(',')+');';
 assert.equal(run(long,long.replace('x0','y0')).result.syntaxAlignment.pairedLines,0);
});

test('stale physical row mappings reject instead of copying to wrong positions',()=>{
 const result=compare('send(1);','send(2);');result.rows[0].ai=1;
 assert.throws(()=>alignSyntaxRows(result,'send(1);','send(2);','java'),/comparison changed/);
});

test('deterministic generated changes preserve every index and exact hunk merge in both directions',()=>{
 let seed=18273;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let trial=0;trial<180;trial++){
  const count=1+random()%24,left=[],right=[];
  for(let i=0;i<count;i++){
   left.push(`item${i}(${random()%100});`);
   if(random()%3===0)right.push(`extra${i}(${random()%100});`);
   if(random()%4!==0)right.push(`item${i}(${random()%100+100});`);
  }
  const a=left.join('\n')+(random()%2?'\n':''),b=right.join('\n')+(random()%2?'\n':'');
  const {result}=run(a,b);let mergedA=a,mergedB=b;
  for(const from of ['a','b']){
   const to=from==='a'?'b':'a',source=from==='a'?left:right,picked=source.map((_,i)=>i).filter(()=>random()%2),selected=new Set(picked);
   const expected=result.rows.flatMap(row=>row[from+'i']!==null&&selected.has(row[from+'i'])?[row[from]]:row[to+'i']!==null?[row[to]]:[]).join('\n');
   assert.equal(mergeLines(a,b,result.rows,from,picked),expected);
  }
  for(const h of [...result.hunks].reverse()){mergedA=merge(mergedA,b,h,'b');mergedB=merge(a,mergedB,h,'a');}
  assert.equal(mergedA,b);assert.equal(mergedB,a);
 }
});
