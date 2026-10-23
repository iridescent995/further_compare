const test=require('node:test'),assert=require('node:assert/strict');const {decodeText,encodeText,detectLineEnding,validateFormat}=require('../src/text-codec.cjs');
const format=(encoding,bom=false,lineEnding='none')=>({encoding,bom,lineEnding});
test('Unicode BOM and explicit BOMless UTF16 round-trip without replacing characters',()=>{
 const content='Hello Ω 世界 😀\r\nnext\rfinal\n';
 for(const encoding of ['utf8','utf16le','utf16be'])for(const bom of [false,true]){const encoded=encodeText(content,format(encoding,bom)),decoded=decodeText(encoded,bom?'auto':encoding);assert.equal(decoded.content,content);assert.deepEqual(decoded.format,format(encoding,bom,'mixed'));assert.deepEqual(encodeText(decoded.content,decoded.format),encoded);}
 assert.equal(decodeText(new Uint8Array([0xef,0xbb,0xbf,0x41])).content,'A');
 assert.throws(()=>decodeText(encodeText('text',format('utf16le',true)),'utf8'),/BOM/);
});
test('line endings preserve mixed bytes unless conversion is explicitly selected',()=>{
 const raw='a\r\nb\nc\rd';assert.equal(detectLineEnding(raw),'mixed');assert.equal(detectLineEnding('none'),'none');
 assert.equal(new TextDecoder().decode(encodeText(raw,format('utf8',false,'mixed'))),raw);
 assert.equal(new TextDecoder().decode(encodeText(raw,format('utf8',false,'crlf'))),'a\r\nb\r\nc\r\nd');
 assert.equal(new TextDecoder().decode(encodeText(raw,format('utf8',false,'cr'))),'a\rb\rc\rd');
});
test('Windows1252 and Latin1 explicit decoding differs and loss is rejected',()=>{
 const bytes=new Uint8Array([0x80,0x93,0xe9,0x81]);assert.equal(decodeText(bytes,'windows1252').content,'€“é\u0081');assert.equal(decodeText(bytes,'latin1').content,'\u0080\u0093é\u0081');
 for(const encoding of ['windows1252','latin1'])assert.deepEqual(encodeText(decodeText(bytes,encoding).content,format(encoding)),bytes);
 assert.throws(()=>decodeText(bytes),/Invalid UTF-8/);assert.throws(()=>encodeText('€',format('latin1')),/data loss/);assert.throws(()=>encodeText('\u0080',format('windows1252')),/data loss/);
 assert.throws(()=>encodeText('😀',format('windows1252')),/data loss/);assert.throws(()=>validateFormat(format('latin1',true)),/BOM/);
});
test('invalid bytes, surrogates, binary nulls and encoded limits fail strictly',()=>{
 assert.throws(()=>decodeText(new Uint8Array([0xc3,0x28])),/Invalid UTF-8/);assert.throws(()=>decodeText(new Uint8Array([0xff,0xfe,0x00])),/Invalid UTF-16LE/);
 for(const text of ['\ud800','\udc00','x\ud800z'])assert.throws(()=>encodeText(text),/surrogate/);
 assert.throws(()=>decodeText(new Uint8Array([0])),/Binary/);
 assert.throws(()=>encodeText('x'.repeat(5*1024*1024),format('utf16le',true)),/10 MB/);
});

test('Windows-1251 Cyrillic uses explicit decoding and byte-exact output',()=>{
 const bytes=new Uint8Array([0xcf,0xf0,0xe8,0xe2,0xe5,0xf2,0x20,0xcc,0xe8,0xf0,13,10]);
 const result=decodeText(bytes,'windows1251');assert.equal(result.content,'Привет Мир\r\n');assert.equal(result.format.encoding,'windows1251');assert.equal(result.format.lineEnding,'crlf');
 assert.deepEqual(encodeText(result.content,result.format),bytes);
 assert.throws(()=>decodeText(bytes),/Invalid UTF-8/);
 const alphabet=new Uint8Array(Array.from({length:255},(_,i)=>i+1).filter(x=>x!==0x98));assert.deepEqual(encodeText(decodeText(alphabet,'windows1251').content,format('windows1251')),alphabet);
 assert.equal(decodeText(new Uint8Array([0xa8,0xb8,0xa5,0xb4,0xaa,0xba,0xaf,0xbf,0xb2,0xb3]),'windows1251').content,'ЁёҐґЄєЇїІі');
});
test('Windows-1251 rejects undefined bytes and unrepresentable output',()=>{
 assert.throws(()=>decodeText(new Uint8Array([0x98]),'windows1251'),/undefined/);
 for(const text of ['é','😀','\u0098','\ufffd'])assert.throws(()=>encodeText(text,format('windows1251')),/data loss/);
 assert.throws(()=>validateFormat(format('windows1251',true)),/BOM/);
 assert.equal(decodeText(new Uint8Array([0xef,0xbb,0xbf,65]),'windows1251').content,'п»їA');
});

test('UTF-32 scalar values, byte order marks and mixed line endings round-trip exactly',()=>{
 const text='A\uFEFF\uD7FF\uE000\uFFFF😀\u{10ffff}\r\nB\rC\n';
 for(const encoding of ['utf32le','utf32be'])for(const bom of [true,false]){const bytes=encodeText(text,format(encoding,bom,'mixed'));const decoded=decodeText(bytes,bom?'auto':encoding);assert.equal(decoded.content,text);assert.deepEqual(decoded.format,format(encoding,bom,'mixed'));assert.deepEqual(encodeText(decoded.content,decoded.format),bytes);const padded=new Uint8Array(bytes.length+7);padded.set(bytes,3);assert.equal(decodeText(padded.subarray(3,3+bytes.length),encoding).content,text);}
 assert.deepEqual([...encodeText('A😀',format('utf32le',true))],[255,254,0,0,65,0,0,0,0,246,1,0]);
 assert.deepEqual([...encodeText('A😀',format('utf32be',true))],[0,0,254,255,0,0,0,65,0,1,246,0]);
 for(const encoding of ['utf32le','utf32be'])assert.equal(decodeText(encodeText('',format(encoding,true))).content,'');
});
test('UTF-32 rejects truncated units, invalid scalars, conflicting BOMs and oversized encoded output',()=>{
 for(const encoding of ['utf32le','utf32be']){
  for(const value of [0xd800,0xdfff,0x110000,0xffffffff]){const bytes=new Uint8Array(4);new DataView(bytes.buffer).setUint32(0,value,encoding==='utf32le');assert.throws(()=>decodeText(bytes,encoding),/scalar/);}
  for(const size of [1,2,3,5])assert.throws(()=>decodeText(new Uint8Array(size),encoding),/incomplete/);
  assert.throws(()=>encodeText('A'.repeat(2621441),format(encoding)),/10 MB/);
  assert.throws(()=>encodeText('\ud800',format(encoding)),/surrogate/);
  assert.throws(()=>decodeText(new Uint8Array(4),encoding),/Binary/);
 }
 assert.throws(()=>decodeText(encodeText('A',format('utf32le',true)),'utf16le'),/BOM/);
 assert.throws(()=>decodeText(encodeText('A',format('utf32be',true)),'utf32le'),/BOM/);
});
