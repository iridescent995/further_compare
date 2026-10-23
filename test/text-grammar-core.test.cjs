'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateTextGrammar,hasTextGrammar}=require('../src/text-grammar.cjs');
const {classifyTextProfile,prepareTextProfile,prepareTextProfileDetailed}=require('../src/text-profile.cjs');
const {prepareComparisonKeys}=require('../src/text-comparison-keys.cjs');
const grammar=(elements=[],importance={})=>({version:1,importance,elements});
const block=(extra={})=>({name:'Region',kind:'block',importance:'unimportant',start:'BEGIN',end:'END',...extra});
const pattern=(pattern,extra={})=>({name:'Token',kind:'pattern',importance:'unimportant',pattern,...extra});
test('grammar validates strictly, copies canonical ordered values and distinguishes defaults',()=>{
 assert.deepEqual(validateTextGrammar(),grammar());assert.equal(hasTextGrammar(),false);assert.equal(hasTextGrammar(grammar([],{lineComment:'important'})),true);
 const input=grammar([pattern('id=\\d+'),block()]);const value=validateTextGrammar(input);assert.notEqual(value,input);assert.equal(value.elements[0].matchCase,true);assert.equal(value.elements[1].escape,'');
 for(const input of [null,{},grammar([pattern('(')]),grammar([pattern('x',{matchCase:1})]),grammar([block({end:''})]),grammar([block(),block()]),grammar([],{code:'unimportant'}),grammar([],{lineComment:'other'}),{...grammar(),extra:1},grammar([block({extra:1})]),grammar(Array.from({length:33},(_,i)=>block({name:String(i)})))])assert.throws(()=>validateTextGrammar(input));
});
test('comment importance selectively keeps line, ordinary block and documentation comments',()=>{
 const source='a // line\nb /* block */ c\n/** doc */\n';
 assert.deepEqual(prepareTextProfile(source,'java',grammar()),prepareTextProfile(source,'java'));
 assert.deepEqual(prepareTextProfile(source,'java',grammar([],{lineComment:'important',docComment:'important'})),{keys:['a // line','b  c','/** doc */',''],omit:[false,false,false,false]});
 assert.equal(prepareTextProfile('a/**x*/b','java',grammar()).keys[0],'a b');
 assert.equal(prepareTextProfile('a<!--x-->b','xml',grammar()).keys[0],'ab');
});
test('custom line and multiline regions own quote-looking contents and retain physical lines',()=>{
 const g=grammar([{name:'Note',kind:'line',start:'NOTE:',importance:'unimportant'},block()]);
 assert.deepEqual(prepareTextProfile('a NOTE: "unterminated\nBEGIN "hi\n\nEND b\n','java',g),{keys:['a ','','',' b',''],omit:[false,true,true,false,false]});
 const escaped=grammar([block({escape:'\\'})]);assert.equal(prepareTextProfile('a BEGIN \\END ignored END b','plain',escaped).keys[0],'a  b');
});
test('built-in strings, comments, XML attributes and SQL protected forms beat custom elements',()=>{
 const g=grammar([pattern('SECRET'),{name:'Slash',kind:'line',start:'//',importance:'unimportant'}],{lineComment:'important'});
 for(const [profile,source] of [['java','"SECRET" // SECRET'],['java',"'S' // SECRET"],['java','"""\nSECRET\n"""'],['xml','<x a="SECRET"><![CDATA[SECRET]]><?pi SECRET?></x>'],['sql',"'SECRET' \"SECRET\" `SECRET` [SECRET] $$SECRET$$ q'[SECRET]' /*+ SECRET */"]])assert.deepEqual(prepareTextProfile(source,profile,g).keys,source.split('\n'));
 const g2=grammar([pattern('.+')]);assert.equal(prepareTextProfile('abc "SECRET" xyz','java',g2).keys[0],'"SECRET"');
});
test('ordered elements permit significant exceptions; pattern matching is bounded to original code gap and line',()=>{
 const g=grammar([pattern('KEEP',{name:'Keep',importance:'important'}),pattern('[A-Z]+')]);assert.equal(prepareTextProfile('KEEP DROP','plain',g).keys[0],'KEEP ');
 assert.deepEqual(prepareTextProfile('foo bar\nfoo','plain',grammar([pattern('^foo')])).keys,[' bar','']);
 assert.equal(prepareTextProfile('😀 TOKEN','plain',grammar([pattern('token',{matchCase:false})])).keys[0],'😀 ');
 assert.deepEqual(prepareTextProfile('ab\ncd','plain',grammar([pattern('ab\\ncd')])).keys,['ab','cd']);
});
test('classified spans partition original UTF16 without gaps, including Unicode and protected literals',()=>{
 const text='😀 a /* note */ "BEGIN" BEGIN💡END z';const classified=classifyTextProfile(text,'java',grammar([block()]));assert.equal(classified.fallback,null);
 let end=0;for(const s of classified.spans){assert.equal(s.start,end);assert.ok(s.end>s.start);assert.ok(['important','unimportant'].includes(s.importance));assert.equal(typeof s.protected,'boolean');assert.equal(typeof s.element,'string');end=s.end;}assert.equal(end,text.length);
 assert.equal(classified.spans.find(s=>s.element==='Region').importance,'unimportant');assert.ok(classified.spans.some(s=>s.protected&&text.slice(s.start,s.end)==='"BEGIN"'));
});
test('malformed syntax and zero-width matches conservatively retain all original text',()=>{
 for(const [text,profile,g] of [['a BEGIN no end','plain',grammar([block()])],['x /* unfinished','java',grammar()],['x "unterminated','java',grammar()],['a token','plain',grammar([pattern('(?=token)')])],['\\u002f\\u002f code','java',grammar()],['<!DOCTYPE x>','xml',grammar()]]){
  const result=prepareTextProfileDetailed(text,profile,g);assert.ok(result.fallback);assert.deepEqual(result.keys,text.split('\n'));assert.ok(result.omit.every(v=>!v));assert.equal(classifyTextProfile(text,profile,g).spans.length,1);
 }
});
test('plain active grammar produces physical omit mask and EOF remains represented',()=>{
 const g=grammar([{name:'Note',kind:'line',start:'#',importance:'unimportant'}]);
 const items=prepareComparisonKeys(['# note\n',''],[],'plain',g);assert.deepEqual(items[0],{keys:['',''],omit:[true,false]});assert.deepEqual(items[1],{keys:[],omit:[]});assert.equal(prepareComparisonKeys(['x'],[],'plain')[0].omit,undefined);
 assert.ok(prepareComparisonKeys(['BEGIN'],[],'plain',grammar([block()]))[0].fallback);
});
test('Unicode scanning cannot begin a regex inside a surrogate pair',()=>{
 for(const expression of ['x','.','(?=x)x','[a-z]']){
  const text='😀x💡z';const result=classifyTextProfile(text,'plain',grammar([pattern(expression)]));let end=0;
  for(const span of result.spans){assert.equal(span.start,end);assert.ok(span.end<=text.length);assert.ok(!/[\uDC00-\uDFFF]/.test(text[span.start]));end=span.end;}assert.equal(end,text.length);
 }
});
test('malformed XML comment inside a tag keeps the source significant',()=>{
 for(const source of ['<x <!-- note --> y>','<x <y>'])assert.ok(classifyTextProfile(source,'xml').fallback);
});
test('custom grammar substantive merges converge across comment-only EOF and physical rows',()=>{
 const {compare,merge}=require('../src/diff.cjs');const {comparisonPair}=require('../src/text-comparison-keys.cjs');
 const g=grammar([{name:'Note',kind:'line',start:'#',importance:'unimportant'},block()]);
 const values=['','\n','x','x\n','# note','# note\n','\n# note\nx','BEGIN\nEND\n','x\n# note\n'];
 const diff=(a,b,blank)=>compare(a,b,false,[],false,'all',blank,comparisonPair(prepareComparisonKeys([a,b],[],'plain',g)));
 for(const blank of [false,true])for(const a of values)for(const b of values)for(const side of ['a','b'])for(const last of [false,true]){
  let target=side==='a'?b:a;const seen=new Set();for(let count=0;count<20;count++){
   const r=side==='a'?diff(a,target,blank):diff(target,b,blank);if(!r.hunks.length)break;assert.ok(!seen.has(target));seen.add(target);const h=last?r.hunks.at(-1):r.hunks[0];target=side==='a'?merge(a,target,h,side):merge(target,b,h,side);
  }assert.equal((side==='a'?diff(a,target,blank):diff(target,b,blank)).hunks.length,0,JSON.stringify({a,b,side,last,target}));
 }
});
test('regular expression word boundaries use the original unclaimed gap, not each candidate suffix',()=>{
 assert.equal(prepareTextProfile('prefixword word','plain',grammar([pattern('\\bword\\b')])).keys[0],'prefixword ');
});
test('plain grammar without custom elements retains direct original classification after enforcing bounds',()=>{
 const source='x\r\ny\rz';assert.equal(classifyTextProfile(source,'plain',grammar([],{lineComment:'important'})).fallback,null);
 assert.deepEqual(classifyTextProfile(source,'plain').spans,[{start:0,end:source.length,type:'code',element:'code',protected:false,importance:'important'}]);
 assert.throws(()=>classifyTextProfile('\n'.repeat(100000),'plain'),/100,000/);
});
