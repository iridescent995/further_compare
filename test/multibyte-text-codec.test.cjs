'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {decodeText,encodeText,validateFormat,ENCODINGS,MAX_BYTES}=require('../src/text-codec.cjs');
const fixtures=require('./east-asian-encoding-fixtures.cjs');
const format=encoding=>({encoding,bom:false,lineEnding:'mixed'});
for(const fixture of fixtures){
 const {encoding,text,bytes}=fixture;
 test(`${encoding} uses independent fixed bytes and preserves mixed line endings`,()=>{
  assert.ok(ENCODINGS.includes(encoding));
  const decoded=decodeText(bytes,encoding);assert.equal(decoded.content,text+'\r\n');assert.deepEqual(decoded.format,{encoding,bom:false,lineEnding:'crlf'});
  assert.deepEqual(Buffer.from(encodeText(decoded.content,decoded.format)),bytes);
  const mixed=text+'\r\nnext\nend\r';assert.equal(decodeText(encodeText(mixed,format(encoding)),encoding).content,mixed);
  const wrapped=Buffer.concat([Buffer.from('prefix'),bytes,Buffer.from('suffix')]);assert.equal(decodeText(wrapped.subarray(6,-6),encoding).content,text+'\r\n');
 });
 test(`${encoding} rejects malformed byte sequences and unsupported output BOM requests`,()=>{
  const malformed=encoding==='euc-jp'||encoding==='euc-kr'?[0xa1]:[0x81];
  assert.throws(()=>decodeText(Uint8Array.from(malformed),encoding),/Invalid|round.trip/);
  assert.throws(()=>validateFormat({...format(encoding),bom:true}),/BOM/);
  assert.throws(()=>encodeText('\ud800',format(encoding)),/surrogate/);
  assert.throws(()=>encodeText('a\0b',format(encoding)),/null/);
  assert.throws(()=>decodeText(Uint8Array.of(0),encoding),/Binary/);
 });
 if(encoding!=='gb18030')test(`${encoding} rejects unmappable supplementary Unicode instead of replacement`,()=>{
  assert.throws(()=>encodeText('before😀after',format(encoding)),/data loss/);
 });
}
test('GB18030 supports supplementary Unicode and real replacement-character text without normalization',()=>{
 const text='中文 😀 \ufffd \ufeff';const bytes=encodeText(text,format('gb18030'));
 assert.equal(decodeText(bytes,'gb18030').content,text);
 assert.deepEqual(Buffer.from(encodeText('😀',format('gb18030'))),Buffer.from('9439fc36','hex'));
});
test('legacy formats remain explicit: Auto does not silently guess multibyte text',()=>{
 for(const {bytes}of fixtures)assert.throws(()=>decodeText(bytes),/UTF-8/);
 for(const encoding of fixtures.map(item=>item.encoding))assert.equal(decodeText(Buffer.from('ASCII\r\n'),encoding).content,'ASCII\r\n');
});
test('multibyte encoding size limits apply to emitted bytes',()=>{
 assert.throws(()=>decodeText(new Uint8Array(MAX_BYTES+1),'shift-jis'),/10 MB/);
 assert.throws(()=>encodeText('日'.repeat(MAX_BYTES/2+1),format('shift-jis')),/10 MB/);
});

for(const [encoding,hex,text,canonical]of [['big5','a2cc','十','a451'],['shift-jis','eeef','ⅰ','fa40']])test(`${encoding} valid byte aliases open and preserve exact original bytes until explicit edited normalization`,()=>{
 const original=Buffer.from(hex,'hex'),decoded=decodeText(original,encoding);
 assert.equal(decoded.content,text);assert.equal(decoded.format.legacyBytes,original.toString('base64'));assert.deepEqual(validateFormat(decoded.format),decoded.format);
 assert.deepEqual(Buffer.from(encodeText(text,decoded.format)),original);
 assert.deepEqual(Buffer.from(encodeText(text,{...decoded.format,normalizeLegacy:true})),original);
 assert.throws(()=>encodeText(text+'!',decoded.format),/Normalize legacy byte aliases/);
 const encoded=encodeText(text+'!',{...decoded.format,normalizeLegacy:true});assert.equal(Buffer.from(encoded).toString('hex'),canonical+'21');assert.equal(decodeText(encoded,encoding).content,text+'!');
 assert.throws(()=>encodeText(text+'😀',{...decoded.format,normalizeLegacy:true}),/data loss/);
 assert.equal(decodeText(encodeText(text+'!',{encoding:'utf8',bom:false,lineEnding:'none'})).content,text+'!');
});
test('alias provenance handles line ending changes explicitly and rejects malformed or unrelated metadata',()=>{
 const original=Buffer.from('a2cc0d0a','hex'),decoded=decodeText(original,'big5');
 assert.throws(()=>encodeText(decoded.content,{...decoded.format,lineEnding:'lf'}),/Normalize/);
 assert.equal(Buffer.from(encodeText(decoded.content,{...decoded.format,lineEnding:'lf',normalizeLegacy:true})).toString('hex'),'a4510a');
 for(const patch of [{legacyBytes:'??=='},{legacyBytes:'gQ=='},{legacyBytes:'QQ=='},{legacyBytes:'oSz='},{legacyBytes:5},{normalizeLegacy:'true'},{encoding:'utf8'},{legacyBytes:'77u/QQ=='}])assert.throws(()=>validateFormat({...decoded.format,...patch}));
 assert.throws(()=>validateFormat({...decoded.format,legacyBytes:'A'.repeat(Math.ceil(MAX_BYTES/3)*4+4)}),/legacy byte/);
});
test('distinct decoder sentinels reject malformed sequences without rejecting literal replacement/noncharacters',()=>{
 const text='\ufffd\ufffe中文';const bytes=encodeText(text,format('gb18030'));assert.equal(decodeText(bytes,'gb18030').content,text);
 for(const {encoding,bytes}of fixtures)for(const invalid of [Buffer.concat([bytes,Buffer.from([0x81])]),Buffer.concat([bytes,Buffer.from([0xa1])])]){
  // Some single bytes are valid CP932 halfwidth characters; accepted inputs must
  // still round trip exactly, including byte provenance where needed.
  try{const decoded=decodeText(invalid,encoding);assert.deepEqual(Buffer.from(encodeText(decoded.content,decoded.format)),invalid);}catch(error){assert.match(error.message,/Invalid/);}
 }
});
test('GB18030 rejects unmapped four-byte pointer gaps and pointers beyond Unicode',()=>{
 const bytes=pointer=>{const fourth=pointer%10+0x30;pointer=Math.floor(pointer/10);const third=pointer%126+0x81;pointer=Math.floor(pointer/126);const second=pointer%10+0x30;return Buffer.from([Math.floor(pointer/10)+0x81,second,third,fourth]);};
 for(const pointer of [39420,50000,188999,1237576,1587599])assert.throws(()=>decodeText(bytes(pointer),'gb18030'),/Invalid/);
 for(const pointer of [39419,189000,1237575]){const encoded=bytes(pointer),decoded=decodeText(encoded,'gb18030');assert.deepEqual(Buffer.from(encodeText(decoded.content,decoded.format)),encoded);}
});
test('bounded byte fuzz never replaces accepted original legacy data on unchanged save',()=>{
 let seed=1701;
 for(const {encoding}of fixtures)for(let n=0;n<300;n++){
  const bytes=Buffer.alloc(1+n%7);for(let i=0;i<bytes.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;bytes[i]=seed>>>24;}
  let decoded;try{decoded=decodeText(bytes,encoding);}catch(error){assert.match(error.message,/Invalid|Binary|surrogate|BOM/);continue;}
  assert.deepEqual(Buffer.from(encodeText(decoded.content,decoded.format)),bytes);
 }
});
