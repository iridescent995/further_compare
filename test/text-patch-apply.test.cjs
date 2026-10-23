'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createTwoFilesPatch}=require('diff');
const {createTextPatch}=require('../src/text-patch.cjs');
const {inspectTextPatch,applyTextPatch,MAX_PATCH_BYTES,MAX_TEXT_BYTES,MAX_TEXT_LINES}=require('../src/text-patch-apply.cjs');
for(const [label,text,target]of [['insert','a\nb\n','a\nx\nb\n'],['delete','a\nb\n','b\n'],['create','','hello\n'],['remove','hello\n',''],['CRLF','a\r\nb\r\n','a\r\nc\r\n'],['mixed','a\r\nb\nc','a\nb\r\nD'],['no final newline','abc','xyz'],['add final newline','abc','abc\n'],['remove final newline','abc\n','abc'],['unicode','😀\nこんにちは','🌿\nहिन्दी']])test('exact forward/reverse source patch: '+label,()=>{
 const patch=createTextPatch({left:text,right:target});assert.equal(applyTextPatch({text,patch}),target);assert.equal(applyTextPatch({text:target,patch,reverse:true}),text);
});
test('git style headers inspect and apply without accessing paths',()=>{
 const patch='diff --git a/a.txt b/a.txt\nindex 123..456 100644\n--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,2 @@ function\n keep\n-old\n+new\n';assert.deepEqual(inspectTextPatch(patch),[{index:0,oldName:'a/a.txt',newName:'b/a.txt',hunks:1,added:1,removed:1}]);assert.equal(applyTextPatch({text:'keep\nold\n',patch}),'keep\nnew\n');
 const hostile=createTwoFilesPatch('../../private/file','/etc/passwd','old\n','new\n');assert.equal(inspectTextPatch(hostile)[0].newName,'/etc/passwd');assert.equal(applyTextPatch({text:'old\n',patch:hostile}),'new\n');
});
test('multi-file patch applies only selected record and supports reversing it',()=>{
 const patch=createTwoFilesPatch('old/a','new/a','one\n','ONE\n')+createTwoFilesPatch('old/b','new/b','two\n','TWO\n');assert.equal(inspectTextPatch(patch).length,2);assert.equal(applyTextPatch({text:'two\n',patch,index:1}),'TWO\n');assert.equal(applyTextPatch({text:'TWO\n',patch,index:1,reverse:true}),'two\n');assert.throws(()=>applyTextPatch({text:'two\n',patch,index:0}),/does not match/);assert.throws(()=>applyTextPatch({text:'two\n',patch,index:2}),/available/);
});
test('exact-context offsets are accepted but mismatched context and line endings reject',()=>{
 const patch=createTextPatch({left:'before\nold\nafter\n',right:'before\nnew\nafter\n'});assert.equal(applyTextPatch({text:'extra\nbefore\nold\nafter\n',patch}),'extra\nbefore\nnew\nafter\n');
 assert.throws(()=>applyTextPatch({text:'BEFORE\nold\nafter\n',patch}),/does not match/);assert.throws(()=>applyTextPatch({text:'before\r\nold\r\nafter\r\n',patch}),/does not match/);
});
test('later hunk failure returns no partial text and leaves immutable input intact',()=>{
 const text=Array.from({length:20},(_,i)=>String(i)).join('\n')+'\n',target=text.replace('1\n','ONE\n').replace('18\n','EIGHTEEN\n'),patch=createTextPatch({left:text,right:target,context:1}),wrong=text.replace('18\n','DIFFERENT\n');assert.equal(inspectTextPatch(patch)[0].hunks,2);assert.throws(()=>applyTextPatch({text:wrong,patch}),/No changes were applied/);assert.ok(wrong.includes('1\n'));assert.ok(!wrong.includes('ONE'));
});
test('malformed counts, binary, no-hunk, overlap and unsupported syntax reject',()=>{
 for(const patch of ['', 'GIT binary patch\nliteral 4\nAAAA\n','Binary files a and b differ\n','--- a\n+++ b\n','--- a\n+++ b\n@@ -1,2 +1,1 @@\n-old\n+new\n','--- a\n+++ b\n@@ -0 +1 @@\n-a\n+b\n','--- a\n+++ b\n@@ -1 +1 @@\n same\n','--- a\n+++ b\n@@ bogus @@\n-a\n+b\n','--- a\n+++ b\n@@ -1 +1 @@\n-a\n+b\n\\ mystery\n','--- a\n+++ b\n@@ -1 +1 @@\n-a\n+b\n@@ -1 +1 @@\n-a\n+c\n'])assert.throws(()=>inspectTextPatch(patch));
 const patch=createTextPatch({left:'a',right:'b'});for(const index of [-1,0.5,'0'])assert.throws(()=>applyTextPatch({text:'a',patch,index}));assert.throws(()=>applyTextPatch({text:'a',patch,reverse:'yes'}));
});
test('input and output enforce Unicode, NUL, bytes and line bounds',()=>{
 const patch=createTextPatch({left:'a',right:'b'});for(const text of ['\0','\ud800','\udfff','x'.repeat(MAX_TEXT_BYTES+1),'x\n'.repeat(MAX_TEXT_LINES+1)])assert.throws(()=>applyTextPatch({text,patch}));
 for(const invalid of [patch+'\0',patch+'\ud800','x'.repeat(MAX_PATCH_BYTES+1)])assert.throws(()=>inspectTextPatch(invalid));
 const output='x'.repeat(MAX_TEXT_BYTES+1),large=createTwoFilesPatch('a','b','a',output);assert.throws(()=>applyTextPatch({text:'a',patch:large}),/bounded|size limit/);
});

test('metadata-only trailing records and excessive file/hunk counts reject',()=>{
 const patch=createTwoFilesPatch('a','b','a\n','b\n');assert.throws(()=>inspectTextPatch(patch+'diff --git a/mode b/mode\nold mode 100644\nnew mode 100755\n'),/change hunks/);
 assert.throws(()=>inspectTextPatch(patch.repeat(257)),/too many file records/);
 const hunks=Array.from({length:10001},(_,i)=>`@@ -${i+1} +${i+1} @@\n-a\n+b\n`).join('');assert.throws(()=>inspectTextPatch('--- a\n+++ b\n'+hunks),/too many hunks/);
});

test('/dev/null creation and deletion require empty corresponding side, including reverse',()=>{
 const create=createTwoFilesPatch('/dev/null','b/new','','new\n'),remove=createTwoFilesPatch('a/old','/dev/null','old\n','');
 assert.equal(applyTextPatch({text:'',patch:create}),'new\n');assert.throws(()=>applyTextPatch({text:'existing\n',patch:create}),/requires empty/);
 assert.equal(applyTextPatch({text:'new\n',patch:create,reverse:true}),'');assert.throws(()=>applyTextPatch({text:'new\nextra\n',patch:create,reverse:true}),/entire input|does not match/);
 assert.equal(applyTextPatch({text:'old\n',patch:remove}),'');assert.throws(()=>applyTextPatch({text:'old\nextra\n',patch:remove}),/entire input|does not match/);
 assert.equal(applyTextPatch({text:'',patch:remove,reverse:true}),'old\n');assert.throws(()=>applyTextPatch({text:'existing',patch:remove,reverse:true}),/requires empty/);
});
