'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {applyPatch,parsePatch}=require('diff');
const {createTextPatch,MAX_PATCH_TEXT_BYTES,MAX_PATCH_LINES}=require('../src/text-patch.cjs');
const cases=[
 ['insert','one\ntwo\n','one\nnew\ntwo\n'],['delete','one\ntwo\n','two\n'],['empty left','','created\n'],['empty right','deleted\n',''],['both empty','',''],['CRLF','one\r\ntwo\r\n','one\r\nthree\r\n'],['no final newline','one\ntwo','one\nthree'],['add final newline','one','one\n'],['remove final newline','one\n','one'],['unicode','こんにちは\n😀 café\n','こんにちは\n🌿 कैफ़े\n'],['space and case','a \nBeta\n','A\nbeta\n'],['mixed endings','a\r\nb\nc','a\nb\r\nD'],['BOM in content','\ufeffsame\n','\ufeffchanged\n'],['identical','same\n','same\n']
];
for(const [name,left,right]of cases)test('exact patch roundtrip: '+name,()=>{const patch=createTextPatch({left,right,leftName:'before.txt',rightName:'after.txt'});if(left===right){assert.equal(patch,'');return;}assert.equal(applyPatch(left,patch),right);assert.equal(parsePatch(patch)[0].oldFileName,'left/before.txt');assert.equal(parsePatch(patch)[0].newFileName,'right/after.txt');});
test('missing final newline markers are retained',()=>{assert.match(createTextPatch({left:'a',right:'b'}),/\\ No newline at end of file/);});
test('filenames hide directories and sanitize injected headers and controls',()=>{
 const patch=createTextPatch({left:'old\n',right:'new\n',leftName:'/Users/private/report\t\n--- injected.txt',rightName:'C:\\private\\new\r\n+++ forged.txt'}),parsed=parsePatch(patch);
 assert.equal(parsed.length,1);assert.equal(parsed[0].oldFileName,'left/report--- injected.txt');assert.equal(parsed[0].newFileName,'right/new+++ forged.txt');assert.ok(!patch.includes('private'));assert.equal(applyPatch('old\n',patch),'new\n');
 const fallback=parsePatch(createTextPatch({left:'',right:'x',leftName:'..',rightName:'\0\n'}))[0];assert.equal(fallback.oldFileName,'left/untitled.txt');assert.equal(fallback.newFileName,'right/untitled.txt');
});
test('context controls hunk surrounding lines and rejects unsupported values',()=>{
 const left='a\nb\nc\nd\ne\n',right='a\nb\nC\nd\ne\n';assert.equal(parsePatch(createTextPatch({left,right,context:0}))[0].hunks[0].lines.length,2);assert.equal(parsePatch(createTextPatch({left,right,context:3}))[0].hunks[0].lines.length,6);
 for(const context of [-1,101,1.5,'3',NaN,null])assert.throws(()=>createTextPatch({left,right,context}),/context/);
});
test('input bounds measure UTF8 bytes and logical lines without altering inputs',()=>{
 assert.throws(()=>createTextPatch({left:'x'.repeat(MAX_PATCH_TEXT_BYTES+1),right:''}),/10 MB/);assert.throws(()=>createTextPatch({left:'é'.repeat(MAX_PATCH_TEXT_BYTES/2+1),right:''}),/10 MB/);
 assert.throws(()=>createTextPatch({left:'x\n'.repeat(MAX_PATCH_LINES+1),right:''}),/50,000/);assert.throws(()=>createTextPatch({left:'x\r\n'.repeat(MAX_PATCH_LINES+1),right:''}),/50,000/);
 const valid='x\n'.repeat(MAX_PATCH_LINES);assert.equal(createTextPatch({left:valid,right:valid}),'');
 for(const left of [undefined,null,1,{}])assert.throws(()=>createTextPatch({left,right:''}));
});

test('identical inputs return empty patch only after all validation',()=>{
 assert.equal(createTextPatch({left:'same',right:'same'}),'');
 assert.throws(()=>createTextPatch({left:'same',right:'same',context:-1}),/context/);
 assert.throws(()=>createTextPatch({left:'same',right:'same',leftName:42}),/filename/);
});
test('unpaired Unicode surrogates reject instead of silently replacing text',()=>{
 for(const text of ['\ud800','\udfff','x\ud800a','x\udc00','\ud800\ud800']){
  assert.throws(()=>createTextPatch({left:text,right:'valid'}),/unpaired Unicode surrogate/);
  assert.throws(()=>createTextPatch({left:'valid',right:text}),/unpaired Unicode surrogate/);
  assert.throws(()=>createTextPatch({left:text,right:text}),/unpaired Unicode surrogate/);
  assert.throws(()=>createTextPatch({left:'a',right:'b',leftName:text}),/unpaired Unicode surrogate/);
 }
 assert.equal(applyPatch('😀',createTextPatch({left:'😀',right:'🌿'})),'🌿');
});
