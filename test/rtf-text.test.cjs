'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {extractRtfText,validateRtfProjection,RTF_EXCLUSIONS,MAX_RTF_BYTES,MAX_RTF_TEXT_BYTES}=require('../src/rtf-text.cjs');
const bytes=s=>Uint8Array.from(Buffer.from(s,'latin1')),read=s=>extractRtfText(bytes(s)).content;
test('RTF groups, delimiters, escaped characters and text breaks preserve readable text',()=>{
 assert.equal(read(String.raw`{\rtf1\ansi Hello {\b bold} plain\par One\tab Two\line \{x\} \\ \~\_\-\emdash\endash}`),'Hello bold plain\nOne\tTwo\n{x} \\ \u00a0\u2011\u00ad\u2014\u2013');
 assert.equal(read('{\\rtf1 A\r\nB\\\r\nC}'),'AB\nC');
 assert.equal(read(String.raw`{\rtf1\unknown123  two spaces}`),' two spaces');
 assert.equal(read(String.raw`{\rtf1\fromtext plain}`),'plain');
});
test('Unicode fallback consumes bytes, controls and binary as tokens and restores scoped uc',()=>{
 assert.equal(read(String.raw`{\rtf1\uc1\u945?{\uc2\u946\'62?}\u947?}`),'αβγ');
 assert.equal(read(String.raw`{\rtf1\uc2\u945\tab\~X}`),'αX');
 assert.equal(read('{\\rtf1\\uc1\\u945\\bin3 {\\}X}'),'αX');
 assert.equal(read(String.raw`{\rtf1\uc9\u945?{X}Y}`),'αXY');
 assert.equal(read(String.raw`{\rtf1\uc0\u55357\u56960}`),'🚀');
 assert.equal(read(String.raw`{\rtf1\u-10179?\u-8576?}`),'🚀');
});
test('Unicode alternative groups prefer ud once and never duplicate ANSI text',()=>{
 assert.equal(read(String.raw`{\rtf1 A{\upr{wrong ANSI}{\*\ud Unicode \uc0\u945}}Z}`),'AUnicode αZ');
 assert.throws(()=>read(String.raw`{\rtf1{\upr{only}}}`),/alternative/);
 assert.throws(()=>read(String.raw`{\rtf1{\upr{ansi}{missing ud}}}`),/alternative/);
});
test('codepage and font encoding decode hex/raw bytes without replacement',()=>{
 assert.equal(read(String.raw`{\rtf1\ansi\ansicpg1252 caf\'e9 \'80}`),'café €');
 assert.equal(read("{\\rtf1\\ansi caf\xe9}"),'café');
 assert.equal(read(String.raw`{\rtf1\ansi\ansicpg932 \'82\'a0\'82\'a2}`),'あい');
 assert.equal(read(String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0\fcharset0 Latin;}{\f1\fcharset128 Japanese;}}\f1\'82\'a0{\f0 caf\'e9}\'82\'a2}`),'あcaféい');
 assert.equal(read(String.raw`{\rtf1\mac \'8e}`),'é');
 assert.throws(()=>read(String.raw`{\rtf1\ansicpg9999 text}`),/Unsupported code page/);
 assert.throws(()=>read(String.raw`{\rtf1\ansicpg932 \'82}`),/incomplete/);
 assert.throws(()=>read(String.raw`{\rtf1{\fonttbl{\f0\fcharset2 Symbol;}}\f0 x}`),/Unsupported code page/);
});
test('nontext destinations and binary bytes cannot leak or change nesting',()=>{
 const document=Buffer.concat([Buffer.from(String.raw`{\rtf1 visible{\info secret}{\header header}{\footnote foot}{\*\unknown nested{private}}{\pict\bin5 `),Buffer.from([123,125,92,0,255]),Buffer.from(String.raw`}{\object{\result ignored}}{\field{\*\fldinst HYPERLINK "https://example.invalid"}{\fldrslt Link}}{\v hidden}{\deleted removed} end}`)]);
 assert.equal(extractRtfText(document).content,'visibleLink end');
 assert.equal(read(String.raw`{\rtf1{\*\unknown\u945?}visible}`),'visible');
});
test('malformed RTF, unsupported alternate representations and invalid Unicode reject',()=>{
 for(const value of ['','plain','{\\rtf1','{\\rtf2 x}','{\\rtf1 x}}','{\\rtf1 x}garbage','{\\rtf1 \\}','{\\rtf1 \\'+'a'.repeat(33)+'}','{\\rtf1 \\bin9 a}',String.raw`{\rtf1\'xz}`,String.raw`{\rtf1\uc-1 a}`,String.raw`{\rtf1\u65536?}`,String.raw`{\rtf1\uc0\u55296}`,String.raw`{\rtf1\uc0\u56320}`,String.raw`{\rtf1\fromhtml1 html}`,String.raw`{\rtf1\htmlrtf alternate}`,String.raw`{\rtf1\pc text}`])assert.throws(()=>read(value),/RTF text extraction/);
 assert.throws(()=>read('{\\rtf1'+'{'.repeat(128)+'x'+'}'.repeat(129)),/nesting/);
 assert.throws(()=>extractRtfText(new Uint8Array(MAX_RTF_BYTES+1)),/32 MiB/);
});
test('projection metadata is exact and immutable across caller modifications',()=>{
 const result=extractRtfText(bytes(String.raw`{\rtf1 A\par{\header X\par}B\par}`));assert.equal(result.content,'A\nB\n');assert.equal(result.projection.paragraphs,2);assert.equal(result.projection.kind,'rtf');assert.deepEqual(validateRtfProjection(result.projection),result.projection);result.projection.exclusions[0]='changed';assert.equal(RTF_EXCLUSIONS[0],'Formatting, styles, numbering labels and page layout');assert.throws(()=>validateRtfProjection(result.projection));for(const patch of [{extra:1},{paragraphs:-1},{kind:'docx'},{scope:'all-document'}])assert.throws(()=>validateRtfProjection({...extractRtfText(bytes('{\\rtf1}')).projection,...patch}));
});

test('raw text exceeding output limit reports the actual limit rather than an encoding error',()=>{
 assert.throws(()=>read('{\\rtf1 '+ 'a'.repeat(MAX_RTF_TEXT_BYTES+1)+'}'),/Extracted text exceeds 8 MiB/);
});
