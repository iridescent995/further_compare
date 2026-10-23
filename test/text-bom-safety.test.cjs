'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {decodeText,encodeText,validateText,ENCODINGS}=require('../src/text-codec.cjs');
const format=encoding=>({encoding,bom:false,lineEnding:'none'});
test('explicit legacy encodings retain BOM-looking bytes as ordinary text',()=>{
 const bytes=Buffer.from('efbbbf41','hex');
 for(const [encoding,content] of [['gb18030','锘緼'],['big5','嚜澤'],['euc-kr','癤풞'],['windows1252','ï»¿A'],['latin1','ï»¿A']]){
  const decoded=decodeText(bytes,encoding);assert.equal(decoded.content,content);assert.equal(decoded.format.bom,false);
  assert.deepEqual(Buffer.from(encodeText(content,decoded.format)),bytes);
 }
 assert.equal(decodeText(bytes).content,'A');assert.equal(decodeText(bytes).format.bom,true);
});
test('all accepted explicit legacy signature prefixes round trip unchanged',()=>{
 for(const encoding of ENCODINGS.filter(x=>!x.startsWith('utf')))for(const hex of ['efbbbf41','fffe4142','feff4142']){
  const bytes=Buffer.from(hex,'hex');let decoded;
  try{decoded=decodeText(bytes,encoding);}catch(error){assert.doesNotMatch(error.message,/BOM/);continue;}
  assert.deepEqual(Buffer.from(encodeText(decoded.content,decoded.format)),bytes);
 }
});
test('Unicode output cannot silently consume a leading character as a BOM',()=>{
 for(const encoding of ENCODINGS.filter(x=>x.startsWith('utf'))){
  assert.throws(()=>encodeText('\ufeffA',format(encoding)),/Enable BOM/);
  const bytes=encodeText('\ufeffA',{...format(encoding),bom:true});
  assert.equal(decodeText(bytes,encoding).content,'\ufeffA');
 }
 for(const encoding of ['utf16le','utf16be']){
  assert.throws(()=>encodeText('\ufffeA',format(encoding)),/Enable BOM/);
  assert.equal(decodeText(encodeText('\ufffeA',{...format(encoding),bom:true}),encoding).content,'\ufffeA');
 }
});
test('draft validation keeps literal leading BOM characters and rejects invalid text',()=>{
 assert.deepEqual(Buffer.from(validateText('\ufeffA')),Buffer.from('efbbbf41','hex'));
 assert.throws(()=>validateText('\ud800'),/surrogate/);assert.throws(()=>validateText('a\0b'),/null/);
});
