'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {prepareTextProfile:prepare,validateTextProfile:validate}=require('../src/text-profile.cjs');
const expect=(text,profile,keys,omit=keys.map(()=>false))=>assert.deepEqual(prepare(text,profile),{keys,omit});
const unchanged=(text,profile)=>expect(text,profile,text===''?[]:text.split('\n'));

test('profile validation and original physical lines',()=>{
 assert.equal(validate(),'plain');for(const p of ['plain','java','xml','sql'])assert.equal(validate(p),p);
 for(const p of [null,{},true,0,'Java','javascript',''])assert.throws(()=>validate(p));
 assert.throws(()=>prepare(null));unchanged('a\r\nb\n','plain');unchanged('','java');unchanged('\n','java');
});
test('Java inline comments keep token boundaries, identifiers, operators and trailing spaces',()=>{
 expect('int/**/name = a/* one */+b; // note','java',['int name = a +b; ']);
 expect('a/**//**/b','java',['a b']);
 expect('x;//comment','java',['x;']);
 expect('/**/x/**/','java',['x']);
 assert.notDeepEqual(prepare('int/**/name','java').keys,prepare('intname','java').keys);
 expect('a/*a*/b/* longer */c','java',['a b c']);
 expect('a/* changed words */b','java',['a b']);
 expect('x// comment\r\ny','java',['x\r','y']);
});
test('whole Java comment lines omitted but ordinary blanks and final LF remain',()=>{
 expect(' // hello\n\t/* abc\n\n  content\n */ \n\nint x;\n','java',
  ['','','','','','','int x;',''],[true,true,true,true,true,false,false,false]);
 expect('/* comment */\n','java',['',''],[true,false]);
 expect('// comment','java',[''],[true]);
 expect('x/* comment\n content\n */y','java',['x','','y'],[false,true,false]);
});
test('Java strings, characters and text blocks protect apparent comments',()=>{
 const text='String s="// keep /* keep */"; char q=\'"\'; char x=\'\\\'\';\nString b="""\n// literal\n/* literal */\n"""; // omit';
 expect(text,'java',text.split('\n').map((line,i)=>i===4?'"""; ':line));
 unchanged('String s="a\\\"/* not comment */b";','java');
});
test('Java malformed strings, comments and Unicode preprocessing retain all input',()=>{
 for(const text of ['// prior\n/* unfinished','// prior\n"unfinished','// prior\n\'unfinished',
  '// prior\n"line\nbreak"','// prior\n"escape\\\nline"','// prior\n"""unfinished',
  '// prior\n\\u002f\\u002f hidden','// prior\n\\uuuu002a'])unchanged(text,'java');
});
test('XML comments excluded outside attributes, CDATA and processing instructions',()=>{
 expect('<root><!-- first -->text<!--second--></root>','xml',['<root>text</root>']);
 expect('<root a="<!-- value -->"><![CDATA[<!-- literal -->]]><?p <!-- pi -->?></root>\n<!-- omit -->','xml',
  ['<root a="<!-- value -->"><![CDATA[<!-- literal -->]]><?p <!-- pi -->?></root>',''],[false,true]);
 expect('<!-- a\n b -->\n<x/>\n','xml',['','','<x/>',''],[true,true,false,false]);
});
test('XML malformed and DTD documents retain all comments',()=>{
 for(const text of ['<!-- prior -->\n<!-- incomplete','<!-- prior -->\n<a b="unfinished>',
  '<!-- prior -->\n<![CDATA[incomplete','<!-- prior -->\n<?incomplete',
  '<!-- prior -->\n<!-- bad -- comment -->','<!-- prior -->\n<!DOCTYPE x [<!ENTITY a "x">]><x/>',
  '<!-- prior -->\n<tag'])unchanged(text,'xml');
});
test('SQL comments and quoted strings/names are lexically separated',()=>{
 expect("SELECT 'it''s -- text', \"a/*b*/\", [a]]--b], `x``/*y*/` /* note */ -- last\nFROM t",'sql',
  ["SELECT 'it''s -- text', \"a/*b*/\", [a]]--b], `x``/*y*/`  ",'FROM t']);
 expect('SELECT/*a*/name\n/* multiline\n\n end */\n-- final\n','sql',['SELECT name','','','','',''],[false,true,true,true,true,false]);
});
test('SQL dollar and alternative quoted values retain comment-like contents',()=>{
 const text="SELECT $$-- x /* keep */$$, $body$ ' -- keep\n/* keep */ $body$, q'[it's -- keep]', Q'{/* keep */}', q'!a'--b!' /*gone*/";
 expect(text,'sql',[text.split('\n')[0],text.split('\n')[1].replace('/*gone*/','')]);
});
test('SQL executable and optimizer comments remain important',()=>{
 unchanged('SELECT /*!50000 SQL_NO_CACHE */ x /*+ INDEX(x) */ FROM t','sql');
 expect('/* ordinary */ SELECT /*+ keep */ 1 -- remove','sql',[' SELECT /*+ keep */ 1 ']);
});
test('SQL nested comments conservatively preserve dialect-dependent text',()=>{
 unchanged('SELECT /* outer /* nested */ still outer */ 1','sql');
 unchanged('-- previous\n/* outer /* nested */ unfinished','sql');
});
test('SQL unterminated constructs retain original',()=>{
 for(const suffix of ["'unfinished",'"unfinished','[unfinished','`unfinished','$body$unfinished',"q'[unfinished",'/*unfinished'])unchanged('-- earlier\n'+suffix,'sql');
});
test('output cannot exceed source physical line lengths; comment masks preserve sentinel',()=>{
 for(const profile of ['plain','java','xml','sql']){
  for(const text of ['\n','/*a\n\n b*/\n','// a\r\n','<!-- a\n b-->\n',"'x' /*a*/ 'y'",'x/*a*/y/*b*/z']){
   const result=prepare(text,profile),lines=text.split('\n');
   assert.equal(result.keys.length,lines.length);assert.equal(result.omit.length,lines.length);
   result.keys.forEach((key,i)=>assert.ok(key.length<=lines[i].length));
   if(text.endsWith('\n'))assert.equal(result.omit.at(-1),false);
  }
 }
});
test('bounded input uses UTF-8 byte count and physical line limit',()=>{
 assert.throws(()=>prepare('a'.repeat(20*1024*1024+1),'java'),/exceeds/);
 assert.throws(()=>prepare('é'.repeat(10*1024*1024+1),'java'),/exceeds/);
 assert.throws(()=>prepare('😀'.repeat(5*1024*1024+1),'java'),/exceeds/);
 assert.throws(()=>prepare('\n'.repeat(100000),'plain'),/exceeds/);
 assert.equal(prepare('\n'.repeat(99999),'plain').keys.length,100000);
});
test('many short comments and multiline comment content stay aligned',()=>{
 const text=('a/**/b\n').repeat(20000);
 const result=prepare(text,'java');assert.equal(result.keys.length,20001);assert.equal(result.keys[19000],'a b');assert.equal(result.omit.at(-1),false);
});

test('SQL dialect ambiguity cannot hide executable differences',()=>{
 unchanged('-- previous\nSELECT 1--2','sql');
 const a="SELECT /* outer /* nested */ 1 */",b="SELECT /* outer /* nested */ 2 */";
 assert.notDeepEqual(prepare(a,'sql').keys,prepare(b,'sql').keys);
 const escaped=String.raw`SELECT 'a\' -- comment' /* preserve */`;
 unchanged(escaped,'sql');
});
test('XML comments have zero width in mixed text',()=>{
 expect('<x>a<!--note-->b</x>','xml',['<x>ab</x>']);
 expect('a<!--x--><!--y-->b','xml',['ab']);
});

test('standalone CR and SQL hash dialect ambiguity do not discard real content',()=>{
 unchanged('// comment\rint value=1;','java');
 unchanged('-- comment\rSELECT 1','sql');
 unchanged('# /* hash comment\nSELECT 1; /* second */','sql');
 unchanged('<!-- good -->\n<!-- invalid --->','xml');
 expect('SELECT foo$tag$, 1 -- comment','sql',['SELECT foo$tag$, 1 ']);
});

test('MariaDB executable comments remain significant',()=>{
 unchanged('SELECT /*M!100100 SQL_NO_CACHE */ x','sql');
 assert.notDeepEqual(prepare('/*M! SELECT 1 */','sql').keys,prepare('/*M! SELECT 2 */','sql').keys);
});

test('Java text block opening delimiter requires a physical line terminator',()=>{
 unchanged('// prior\nString x=\"\"\"not a valid block\"\"\"; // later','java');
 expect('String x=\"\"\" \t\n// literal\n\"\"\"; // ignored','java',['String x=\"\"\" \t','// literal','\"\"\"; ']);
});
