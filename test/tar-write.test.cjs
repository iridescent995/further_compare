'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto'),{execFileSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {writeTarEntries,writeTarGzipEntries,writeZipEntries,writeArchive}=require('../src/archive-edit.cjs'),{parseArchiveInput}=require('../src/archive-core.cjs');
const file=(path,data=new Uint8Array([0,255,7]),modified='2026-10-21 12:34:57 UTC')=>({path,kind:'file',data,modified});
test('TAR and gzip roundtrip exact bytes, directories, Unicode and long PAX paths',async()=>{
 const long='日本語/'+('abcdef'.repeat(30))+'/leaf.txt',records=[file(long),{path:'empty',kind:'directory'},file('zero',new Uint8Array()),file('a'.repeat(100)),file('old',undefined,'1960-01-01 01:02:03 UTC'),file('future',undefined,'2300-01-01 01:02:03 UTC')];
 for(const write of [writeTarEntries,writeTarGzipEntries]){const output=await write(records),parsed=await parseArchiveInput(output);for(const e of records){assert.equal(parsed.entries.get(e.path).kind,e.kind);if(e.kind==='file'){assert.deepEqual(await parsed.read(e.path),e.data);assert.equal(parsed.entries.get(e.path).modified,e.modified.replace(' UTC','.000 UTC'));}}assert.equal(parsed.entries.get('empty').modified,'1970-01-01 00:00:00.000 UTC');}
});
test('format option defaults to ZIP and preserves source bytes, validates format before reading',async()=>{
 const original=writeZipEntries([file('x')]),archive=await parseArchiveInput(original);assert.deepEqual(await writeArchive(archive),original);
 for(const format of ['tar','tar.gz']){const output=await writeArchive(archive,{format,compression:'ignored'});assert.deepEqual(await (await parseArchiveInput(output)).read('x'),new Uint8Array([0,255,7]));assert.deepEqual(await archive.read('x'),new Uint8Array([0,255,7]));}
 await assert.rejects(writeArchive(null,{format:'rar'}),/Choose ZIP/);await assert.rejects(writeArchive({entries:new Map([['x',{path:'x',kind:'file',size:3,crc:1}]]),read:async()=>new Uint8Array(3)},{format:'tar.gz'}),/CRC/);
});
test('gzip snapshots mutable records before first await',async()=>{const data=new Uint8Array([1,2,3]),records=[file('x',data)],pending=writeTarGzipEntries(records);data.fill(7);records[0].path='y';assert.deepEqual(await (await parseArchiveInput(await pending)).read('x'),new Uint8Array([1,2,3]));});
test('TAR rejects unsafe, conflicting and oversized entries and output',async()=>{
 for(const records of [[file('../bad')],[file('A'),file('a')],[file('a'),file('a/b')],[{path:'x',kind:'symlink'}]])assert.throws(()=>writeTarEntries(records));
 assert.throws(()=>writeTarEntries(Array.from({length:50001},(_,i)=>file('x'+i,new Uint8Array()))),/50,000/);
 assert.throws(()=>writeTarEntries([file('big',new Uint8Array(64*1024*1024+1))]),/64 MB/);
 assert.throws(()=>writeTarEntries([file('big',new Uint8Array(32*1024*1024))]),/32 MB/);
 await assert.rejects(writeTarGzipEntries([file('big',new Uint8Array(64*1024*1024))]),/64 MB including headers/);
 const compressed=await writeTarGzipEntries([file('big',new Uint8Array(33*1024*1024))]);assert.ok(compressed.length<1024*1024);assert.equal((await (await parseArchiveInput(compressed)).read('big')).length,33*1024*1024);
 await assert.rejects(writeTarGzipEntries([file('noise',Uint8Array.from(randomBytes(32*1024*1024)))]),/32 MB/);
});
test('gzip compressor unavailable and stream failures are explicit',async()=>{const original=global.CompressionStream;try{global.CompressionStream=undefined;await assert.rejects(writeTarGzipEntries([]),/unavailable/);global.CompressionStream=class{constructor(){throw Error('unsupported');}};await assert.rejects(writeTarGzipEntries([]),/unavailable/);global.CompressionStream=class{constructor(){return new TransformStream({transform(){throw Error('stream failure');}});}};await assert.rejects(writeTarGzipEntries([]),/stream failure/);}finally{global.CompressionStream=original;}});
test('TAR dates use UTC whole seconds, invalid dates and missing dates use epoch',async()=>{const parsed=await parseArchiveInput(writeTarEntries([file('fraction',undefined,'2026-10-21T12:34:57.999Z'),file('bad',undefined,'2026-02-30 01:02:03'),file('missing',undefined,null)]));assert.equal(parsed.entries.get('fraction').modified,'2026-10-21 12:34:57.000 UTC');for(const name of ['bad','missing'])assert.equal(parsed.entries.get(name).modified,'1970-01-01 00:00:00.000 UTC');});
test('system tar independently reads generated PAX TAR and TAR.GZ',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'fc-tar-writer-'));try{const name='日本語/'+('long'.repeat(40))+'.txt',data=new Uint8Array([0,1,2,255]);for(const [suffix,write]of [['tar',writeTarEntries],['tar.gz',writeTarGzipEntries]]){const target=path.join(tmp,'export.'+suffix);fs.writeFileSync(target,await write([file(name,data),{path:'empty',kind:'directory'}]));const listing=execFileSync('tar',['-tf',target],{encoding:'utf8'});assert.ok(listing.includes(name));assert.ok(listing.includes('empty/'));assert.deepEqual(new Uint8Array(execFileSync('tar',['-xOf',target,name])),data);}}finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('directory trailing slash stays within reader limit, including implicit parents',async()=>{
 const tooLong={path:'a'.repeat(32768),kind:'directory'};
 assert.throws(()=>writeZipEntries([tooLong]),/trailing slash/);assert.throws(()=>writeTarEntries([tooLong]),/trailing slash/);await assert.rejects(writeTarGzipEntries([tooLong]),/trailing slash/);
 for(const write of [writeZipEntries,writeTarEntries,writeTarGzipEntries]){const directory='a'.repeat(32767),parent='b'.repeat(32766),records=[{path:directory,kind:'directory'},file(parent+'/x')],parsed=await parseArchiveInput(await write(records));assert.equal(parsed.entries.get(directory).kind,'directory');assert.equal(parsed.entries.get(parent).kind,'directory');assert.deepEqual(await parsed.read(parent+'/x'),new Uint8Array([0,255,7]));}
});
