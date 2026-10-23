'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{gzipSync}=require('node:zlib');
const {parseArchive,parseArchiveInput,compareArchiveNode}=require('../src/archive-core.cjs');
const {zip}=require('./archive-fixture.cjs');
const {tar:fixture}=require('./tar-fixture.cjs');
function checksum(bytes,p=0){bytes.fill(32,p+148,p+156);const sum=bytes.subarray(p,p+512).reduce((a,b)=>a+b,0);bytes.write(sum.toString(8).padStart(6,'0')+'\0 ',p+148,'ascii');return bytes;}
test('USTAR, GNU and PAX interoperate with ZIP and compare only requested children',async()=>{
 for(const format of ['USTAR','GNU','PAX']){
  const bytes=fixture(format,[{name:'./',directory:true},{name:'./root.txt',data:'same'},{name:'./nested/child.txt',data:'before'}]);
  const tar=await parseArchiveInput(bytes),other=parseArchive(zip([{name:'root.txt',data:'same'},{name:'nested/child.txt',data:'after'}]));
  assert.equal(tar.entries.size,3);const read=tar.read,calls=[];tar.read=async p=>{calls.push(p);return read(p);};
  assert.equal((await compareArchiveNode(tar,other)).find(r=>r.name==='root.txt').status,'equal');assert.deepEqual(calls,['root.txt']);
  assert.equal((await compareArchiveNode(tar,other,'nested'))[0].status,'changed');assert.deepEqual(calls,['root.txt','nested/child.txt']);
  const compressed=await parseArchiveInput(gzipSync(bytes));assert.equal(new TextDecoder().decode(await compressed.read('nested/child.txt')),'before');
  assert.match(tar.entries.get('root.txt').modified,/UTC$/);
 }
});
test('GNU long names, USTAR prefixes, Unicode PAX paths and fractional dates',async()=>{
 const long='nested/'.repeat(25)+'file.txt';
 for(const format of ['GNU','PAX']){const archive=parseArchive(fixture(format,[{name:long,data:'long'}]));assert.equal(new TextDecoder().decode(await archive.read(long)),'long');}
 const prefixed='directory/'.repeat(12)+'file.txt';assert.ok(parseArchive(fixture('USTAR',[{name:prefixed}])).entries.has(prefixed));
 const unicode=parseArchive(fixture('PAX',[{name:'résumé/日本語.txt',data:'hello',mtime:-0.25}]));assert.equal(unicode.entries.get('résumé/日本語.txt').modified,'1969-12-31 23:59:59.750 UTC');
 const negative=parseArchive(fixture('GNU',[{name:'negative',mtime:-1}]));assert.equal(negative.entries.get('negative').modified,'1969-12-31 23:59:59.000 UTC');
});
test('TAR rejects unsafe paths, collisions, links and sparse metadata',()=>{
 for(const name of ['../escape','/root','C:/file','a\\b','a/../b'])assert.throws(()=>parseArchive(fixture('PAX',[{name,data:'x'}])),/Unsafe/);
 for(const entries of [[{name:'x'},{name:'x'}],[{name:'x',data:'file'},{name:'x/child'}],[{name:'x/child'},{name:'x',data:'file'}]])assert.throws(()=>parseArchive(fixture('PAX',entries)),/Duplicate|parent|conflict/);
 assert.throws(()=>parseArchive(fixture('PAX',[{name:'link',link:true}])),/links/);
 assert.throws(()=>parseArchive(fixture('PAX',[{name:'sparse',pax:{'GNU.sparse.size':'100'}}])),/Sparse/);
});
test('TAR rejects corrupt headers, truncation, missing terminators and gzip corruption',async()=>{
 const original=fixture('USTAR',[{name:'x',data:'content'}]);
 const corrupt=Buffer.from(original);corrupt[0]^=1;assert.throws(()=>parseArchive(corrupt),/checksum/);
 assert.throws(()=>parseArchive(original.subarray(0,700)),/complete/);
 assert.throws(()=>parseArchive(original.subarray(0,1024)),/Incomplete/);
 assert.throws(()=>parseArchive(original.subarray(0,1536)),/end records/);
 const tail=Buffer.from(original);tail[tail.length-1]=1;assert.throws(()=>parseArchive(tail),/end records/);
 const oversized=Buffer.from(original);oversized.write('77777777777\0',124,'ascii');checksum(oversized);assert.throws(()=>parseArchive(oversized),/limit/);
 const gzip=gzipSync(original);gzip[gzip.length-8]^=1;await assert.rejects(parseArchiveInput(gzip));
 await assert.rejects(parseArchiveInput(gzipSync(Buffer.from('not a tar'))),/complete TAR/);
});
test('PAX path overrides non-UTF8 legacy names',async()=>{
 const bytes=fixture('PAX',[{name:'original',data:'abc',pax:{path:'actual.txt'}}]);
 bytes[1024]=255;checksum(bytes,1024);
 const archive=parseArchive(bytes);assert.equal(new TextDecoder().decode(await archive.read('actual.txt')),'abc');
});
test('Empty local PAX headers still require a following entry',()=>{
 const header=Buffer.from(fixture('USTAR',[{name:'metadata'}]).subarray(0,512));header[156]=120;checksum(header);
 assert.throws(()=>parseArchive(Buffer.concat([header,Buffer.alloc(1024)])),/Incomplete/);
});
test('Gzip expansion is bounded before parsing TAR',async()=>{
 const bomb=gzipSync(Buffer.alloc(64*1024*1024+512));await assert.rejects(parseArchiveInput(bomb),/64 MB expanded limit/);
});
test('PAX size overrides a noncompliant legacy size field',async()=>{
 const bytes=fixture('PAX',[{name:'sized',data:'abc',pax:{size:'3'}}]);bytes.fill(120,1024+124,1024+136);checksum(bytes,1024);
 assert.equal(new TextDecoder().decode(await parseArchive(bytes).read('sized')),'abc');
});
