'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {decodeText,encodeText,validateFormat,ENCODINGS,MAX_BYTES}=require('../src/text-codec.cjs');
const {WINDOWS_CODEPAGES}=require('../src/windows-codepages.cjs');
const format=(encoding)=>({encoding,bom:false,lineEnding:'none'});
const examples=[
 ['windows1250','Příliš žluťoučký kůň',[80,248,237,108,105,154,32,158,108,117,157,111,117,232,107,253,32,107,249,242]],
 ['windows1253','Ελληνικά',[197,235,235,231,237,233,234,220]],
 ['windows1254','Türkçe ığŞ',[84,252,114,107,231,101,32,253,240,222]],
 ['windows1255','שלום',[249,236,229,237]],
 ['windows1256','العربية',[199,225,218,209,200,237,201]],
 ['windows1257','Latviešu Āē',[76,97,116,118,105,101,240,117,32,194,231]],
 ['windows1258','Viê\u0323t Nam',[86,105,234,242,116,32,78,97,109]],
];
for(const [encoding,example,raw] of examples){
 test(`${encoding}: all defined non-null bytes round-trip and undefined bytes fail`,()=>{
  assert.ok(ENCODINGS.includes(encoding));const mapping=WINDOWS_CODEPAGES[encoding];assert.equal(mapping.length,128);
  for(let byte=1;byte<256;byte++){
   const point=byte<128?byte:mapping[byte-128],bytes=Uint8Array.of(byte);
   if(point===null){assert.throws(()=>decodeText(bytes,encoding),/undefined/);continue;}
   const text=String.fromCodePoint(point);assert.equal(decodeText(bytes,encoding).content,text,`byte ${byte}`);
   assert.deepEqual(encodeText(text,format(encoding)),bytes,`byte ${byte}`);
  }
  assert.throws(()=>decodeText(Uint8Array.of(0),encoding),/Binary/);
  assert.throws(()=>encodeText('\0',format(encoding)),/null character/);
 });
 test(`${encoding}: language fixture, line endings and lossless constraints`,()=>{
  const bytes=Uint8Array.from(raw);assert.equal(decodeText(bytes,encoding).content,example);assert.deepEqual(encodeText(example,format(encoding)),bytes);
  assert.throws(()=>encodeText('😀',format(encoding)),/data loss/);
  assert.throws(()=>encodeText('\uFFFD',format(encoding)),/data loss/);
  assert.throws(()=>encodeText('\ud800',format(encoding)),/surrogate/);
  assert.throws(()=>validateFormat({...format(encoding),bom:true}),/BOM/);
  assert.throws(()=>encodeText(example,{...format(encoding),bom:true}),/BOM/);
  for(const prefix of [[0xef,0xbb,0xbf],[0xff,0xfe],[0xfe,0xff]]){const bytes=Uint8Array.from(prefix);let decoded;try{decoded=decodeText(bytes,encoding);}catch(error){assert.match(error.message,/undefined/);continue;}assert.equal(decoded.format.bom,false);assert.deepEqual(encodeText(decoded.content,decoded.format),bytes);}
  for(const prefix of [[0xff,0xfe,0,0],[0,0,0xfe,0xff]])assert.throws(()=>decodeText(Uint8Array.from(prefix),encoding),/Binary|undefined/);
  const mixed=example+'\r\nx\ry\nz';assert.deepEqual(decodeText(encodeText(mixed,format(encoding)),encoding),{content:mixed,format:{...format(encoding),lineEnding:'mixed'}});
  assert.equal(decodeText(encodeText(mixed,{...format(encoding),lineEnding:'crlf'}),encoding).content,example+'\r\nx\r\ny\r\nz');
  assert.throws(()=>decodeText(new Uint8Array(MAX_BYTES+1),encoding),/10 MB/);
  assert.throws(()=>encodeText('x'.repeat(MAX_BYTES+1),format(encoding)),/10 MB/);
 });
}
test('Windows-1258 preserves combining marks exactly without precomposed conversion',()=>{
 const text='a\u0300a\u0309a\u0303a\u0301a\u0323';
 const bytes=Uint8Array.from([0x61,0xcc,0x61,0xd2,0x61,0xde,0x61,0xec,0x61,0xf2]);
 assert.equal(decodeText(bytes,'windows1258').content,text);
 assert.deepEqual(encodeText(text,format('windows1258')),bytes);
 assert.throws(()=>encodeText('Việt',format('windows1258')),/data loss/);
});
