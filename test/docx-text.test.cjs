'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DOMParser}=require('@xmldom/xmldom');
const {writeZipEntries,writeCompressedZipEntries}=require('../src/archive-edit.cjs');
const {extractDocxText,validateDocumentProjection}=require('../src/docx-text.cjs');
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',R='http://schemas.openxmlformats.org/package/2006/relationships',C='http://schemas.openxmlformats.org/package/2006/content-types';
const O='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',M='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const enc=text=>new TextEncoder().encode(text),p=text=>`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
function records(body,options={}){const main=options.main||'word/document.xml';return [
 {path:'[Content_Types].xml',kind:'file',data:enc(options.types||`<Types xmlns="${C}"><Override PartName="/${main}" ContentType="${options.type||M}"/></Types>`)},
 {path:'_rels/.rels',kind:'file',data:enc(options.rels||`<Relationships xmlns="${R}"><Relationship Id="rId1" Type="${O}" Target="${main}"/></Relationships>`)},
 {path:main,kind:'file',data:options.documentBytes||enc(options.document||`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`)},...(options.extra||[])];}
const pack=(body,options)=>writeZipEntries(records(body,options));
const extract=bytes=>extractDocxText(bytes,{DOMParser});
test('DOCX extracts paragraphs, entities, Unicode, tabs, line breaks and empty paragraphs without changing input',async()=>{
 const bytes=pack(p('A &amp; B &lt; C &#x1F600;')+'<w:p><w:r><w:t xml:space="preserve">  space </w:t><w:tab/><w:t>after</w:t><w:br/><w:t>break</w:t><w:cr/><w:noBreakHyphen/><w:softHyphen/></w:r></w:p><w:p/>'),before=bytes.slice();
 const result=await extract(bytes);assert.equal(result.content,'A & B < C 😀\n  space \tafter\nbreak\n\u2011\u00ad\n\n');assert.deepEqual(bytes,before);assert.equal(result.projection.paragraphs,3);assert.equal(result.projection.tables,0);assert.equal(result.projection.scope,'main-document');assert.ok(result.projection.exclusions.some(x=>x.includes('Headers')));
});
test('DOCX resolves main part by package relationship and content type instead of guessed filename',async()=>{
 const result=await extract(pack(p('Actual document'),{main:'custom/body.xml',extra:[{path:'word/document.xml',kind:'file',data:enc('not parsed')}]}));assert.equal(result.content,'Actual document\n');assert.equal(result.projection.mainPart,'custom/body.xml');
 const strict=pack('',{document:`<s:document xmlns:s="http://purl.oclc.org/ooxml/wordprocessingml/main"><s:body><s:p><s:r><s:t>Strict</s:t></s:r></s:p></s:body></s:document>`,rels:`<Relationships xmlns="${R}"><Relationship Id="main" Type="http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument" Target="/word/document.xml"/></Relationships>`});assert.equal((await extract(strict)).content,'Strict\n');
});
test('DOCX preserves table cell and row boundaries, multiline cells and nested tables',async()=>{
 const table='<w:tbl><w:tr><w:tc>'+p('A')+p('second')+'</w:tc><w:tc>'+p('B')+'</w:tc></w:tr><w:tr><w:tc><w:p/></w:tc><w:tc><w:tbl><w:tr><w:tc>'+p('nested')+'</w:tc></w:tr></w:tbl></w:tc></w:tr></w:tbl>';
 const result=await extract(pack(p('Before')+table+p('After')));assert.equal(result.content,'Before\nA\nsecond\tB\n\tnested\nAfter\n');assert.equal(result.projection.tables,2);assert.equal(result.projection.paragraphs,7);
});
test('DOCX includes inserted text and cached field results but does not execute links or include excluded stories',async()=>{
 const result=await extract(pack('<w:p><w:del><w:r><w:delText>deleted</w:delText></w:r></w:del><w:ins><w:r><w:t>inserted</w:t></w:r></w:ins><w:moveFrom><w:r><w:t>old</w:t></w:r></w:moveFrom><w:moveTo><w:r><w:t> moved</w:t></w:r></w:moveTo><w:r><w:instrText>INCLUDETEXT https://invalid.test/secret</w:instrText><w:t> cached</w:t><w:drawing>'+p('drawing text')+'</w:drawing></w:r><w:hyperlink><w:r><w:t> link label</w:t></w:r></w:hyperlink></w:p>',{extra:[{path:'word/header1.xml',kind:'file',data:enc('<!DOCTYPE unsafe>ignored header')},{path:'word/vbaProject.bin',kind:'file',data:enc('NEVER EXECUTE')},{path:'word/_rels/document.xml.rels',kind:'file',data:enc(`<Relationships xmlns="${R}"><Relationship Id="external" Type="hyperlink" Target="https://invalid.test/" TargetMode="External"/></Relationships>`)}]}));assert.equal(result.content,'inserted moved cached link label\n');assert.ok(result.projection.exclusions.some(x=>x.includes('macros')));
});
test('DOCX supports bounded deflate input and UTF16 XML',async()=>{
 const input=await writeCompressedZipEntries(records(p('Repeated '.repeat(100))));assert.equal((await extract(input)).content,'Repeated '.repeat(100)+'\n');
 const xml=`<?xml version="1.0" encoding="UTF-16"?><w:document xmlns:w="${W}"><w:body>${p('UTF16 Ω')}</w:body></w:document>`;
 const bytes=Buffer.concat([Buffer.from([255,254]),Buffer.from(xml,'utf16le')]);assert.equal((await extract(pack('',{documentBytes:bytes}))).content,'UTF16 Ω\n');
});
test('DOCX rejects fake packages, wrong main content type and external/escaping main relationships',async()=>{
 for(const options of [{type:'application/vnd.ms-word.document.macroEnabled.main+xml'},{type:'application/xml'},{rels:`<Relationships xmlns="${R}"><Relationship Id="a" Type="${O}" Target="https://invalid.test/document.xml" TargetMode="External"/></Relationships>`},{rels:`<Relationships xmlns="${R}"><Relationship Id="a" Type="${O}" Target="../outside.xml"/></Relationships>`},{rels:`<Relationships xmlns="${R}"><Relationship Id="a" Type="${O}" Target="word%2fdocument.xml"/></Relationships>`},{rels:`<Relationships xmlns="${R}"><Relationship Id="a" Type="${O}" Target="word/document.xml"/><Relationship Id="b" Type="${O}" Target="word/document.xml"/></Relationships>`},{types:`<Types xmlns="${C}"><Override PartName="/word/document.xml" ContentType="${M}"/><Override PartName="/word/document.xml" ContentType="${M}"/></Types>`}])await assert.rejects(extract(pack(p('x'),options)));
 await assert.rejects(extract(writeZipEntries([{path:'word/document.xml',kind:'file',data:enc(p('fake'))}])));await assert.rejects(extract(enc('not ZIP')));await assert.rejects(extract(new Uint8Array(32*1024*1024+1)));
});
test('DOCX rejects malformed XML, external entities, invalid references and processing instructions',async()=>{
 for(const document of [`<!DOCTYPE w:document [<!ENTITY x SYSTEM "file:///etc/passwd">]><w:document xmlns:w="${W}"><w:body>${p('&x;')}</w:body></w:document>`,`<w:document xmlns:w="${W}"><w:body><w:p></w:body></w:document>`,`<w:document xmlns:w="${W}"><w:body>${p('&missing;')}</w:body></w:document>`,`<w:document xmlns:w="${W}"><w:body>${p('&#0;')}</w:body></w:document>`,`<w:document xmlns:w="${W}"><w:body>${p('&#xD800;')}</w:body></w:document>`,`<?unsafe execute="yes"?><w:document xmlns:w="${W}"><w:body/></w:document>`,`<w:document xmlns:w="${W}"><w:body/><w:body/></w:document>`])await assert.rejects(extract(pack('',{document})));
});
test('DOCX rejects excessive XML nesting, oversized metadata and encrypted ZIP flags',async()=>{
 await assert.rejects(extract(pack('',{document:`<w:document xmlns:w="${W}"><w:body>${'<w:sdt>'.repeat(130)}${'</w:sdt>'.repeat(130)}</w:body></w:document>`})),/nesting/);
 await assert.rejects(extract(pack(p('x'),{types:' '.repeat(1024*1024+1)})),/size limit/);
 const bytes=pack(p('x'));const v=new DataView(bytes.buffer);v.setUint16(6,v.getUint16(6,true)|1,true);for(let i=0;i<bytes.length-4;i++)if(v.getUint32(i,true)===0x02014b50){v.setUint16(i+8,v.getUint16(i+8,true)|1,true);break;}await assert.rejects(extract(bytes),/Encrypted/);
});
test('DOCX projection metadata validates strict immutable-copy semantics',async()=>{
 const value=(await extract(pack(p('a')))).projection,copy=validateDocumentProjection(value);copy.exclusions[0]='changed';assert.notEqual(value.exclusions[0],'changed');
 for(const invalid of [{...value,extra:true},{...value,version:2},{...value,mainPart:'../x'},{...value,paragraphs:-1},{...value,tables:1.2},{...value,exclusions:[]}])assert.throws(()=>validateDocumentProjection(invalid));
});
function changeEntry(bytes,name,change){const output=bytes.slice(),view=new DataView(output.buffer);for(let i=0;i<output.length-46;i++)if(view.getUint32(i,true)===0x02014b50){const length=view.getUint16(i+28,true);if(new TextDecoder().decode(output.subarray(i+46,i+46+length))===name){change(view,i,view.getUint32(i+42,true),output);return output;}}throw Error('Missing ZIP fixture entry');}
test('DOCX rejects ZIP expansion bombs, false deflate sizes and corrupt main-part bytes',async()=>{
 const compressed=await writeCompressedZipEntries(records(p('large '.repeat(1000))));
 const bomb=changeEntry(compressed,'word/document.xml',(view,central,local)=>{view.setUint32(central+24,65*1024*1024,true);view.setUint32(local+22,65*1024*1024,true);});await assert.rejects(extract(bomb),/size limits|64 MB/);
 const lying=changeEntry(compressed,'word/document.xml',(view,central,local)=>{view.setUint32(central+24,1,true);view.setUint32(local+22,1,true);});await assert.rejects(extract(lying),/declared size/);
 const corrupt=changeEntry(pack(p('integrity')),'word/document.xml',(view,central,local,bytes)=>{const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);bytes[start]^=1;});await assert.rejects(extract(corrupt),/CRC/);
});
test('DOCX snapshots caller bytes before asynchronous decompression',async()=>{
 for(const bytes of [pack(p('original')),Buffer.from(pack(p('original')))]){const promise=extract(bytes);bytes.fill(0);assert.equal((await promise).content,'original\n');}
});
test('DOCX decodes part URIs once and preserves spaces and literal percent names in saved metadata',async()=>{
 for(const main of ['word/body text.xml','word/body%text.xml','word/literal%20text.xml','word/literal%2ftext.xml']){
  const uri=main.split('/').map(encodeURIComponent).join('/');
  const options={main,types:`<Types xmlns="${C}"><Override PartName="/${uri}" ContentType="${M}"/></Types>`,rels:`<Relationships xmlns="${R}"><Relationship Id="main" Type="${O}" Target="${uri}"/></Relationships>`};
  const result=await extract(pack(p('Literal names'),options));assert.equal(result.content,'Literal names\n');assert.equal(result.projection.mainPart,main);assert.deepEqual(validateDocumentProjection(JSON.parse(JSON.stringify(result.projection))),result.projection);
 }
 for(const target of ['word/%2e%2e/document.xml','%2e%2e/word/document.xml','word/a%2fb.xml','word/a%5cb.xml','word/./document.xml','word//document.xml','word/document.xml%00']){
  await assert.rejects(extract(pack(p('unsafe'),{rels:`<Relationships xmlns="${R}"><Relationship Id="main" Type="${O}" Target="${target}"/></Relationships>`})),/path|encoding|archive/i);
 }
});
test('DOCX preserves tables, rows and cells wrapped in structured document tags',async()=>{
 const wrap=text=>'<w:sdt><w:sdtPr/><w:sdtContent>'+text+'</w:sdtContent></w:sdt>';
 const first=wrap('<w:tr>'+wrap('<w:tc>'+p('A')+'</w:tc>')+'<w:tc>'+p('B')+'</w:tc></w:tr>');
 const second='<w:tr><w:tc>'+p('C')+'</w:tc>'+wrap('<w:tc>'+p('D')+'</w:tc>')+'</w:tr>';
 const result=await extract(pack(wrap('<w:tbl>'+first+second+'</w:tbl>')));assert.equal(result.content,'A\tB\nC\tD\n');assert.equal(result.projection.tables,1);assert.equal(result.projection.paragraphs,4);
});
