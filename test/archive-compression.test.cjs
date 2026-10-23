'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto');
const {writeZipEntries,writeCompressedZipEntries,writeArchive}=require('../src/archive-edit.cjs');
const {parseArchiveInput,crc32}=require('../src/archive-core.cjs');
const bytes=value=>new TextEncoder().encode(value),file=(path,data)=>({path,kind:'file',data,modified:'2026-10-20 19:28:46'});
const metadata=output=>{const view=new DataView(output.buffer,output.byteOffset,output.byteLength),end=output.length-22,records=[];let cursor=view.getUint32(end+16,true);for(let n=0;n<view.getUint16(end+10,true);n++){const nameLength=view.getUint16(cursor+28,true),local=view.getUint32(cursor+42,true);records.push({name:new TextDecoder().decode(output.subarray(cursor+46,cursor+46+nameLength)),method:view.getUint16(cursor+10,true),localMethod:view.getUint16(local+8,true),compressed:view.getUint32(cursor+20,true),size:view.getUint32(cursor+24,true),crc:view.getUint32(cursor+16,true),localCompressed:view.getUint32(local+18,true),localSize:view.getUint32(local+22,true),localCrc:view.getUint32(local+14,true)});cursor+=46+nameLength+view.getUint16(cursor+30,true)+view.getUint16(cursor+32,true);}return records;};
test('compressed ZIP roundtrips mixed methods, UTF-8 names, CRC and timestamps',async()=>{
 const repeat=bytes('Hello 🌏\n'.repeat(10000)),noise=Uint8Array.from(randomBytes(16384)),records=[file('日本語/repeated.txt',repeat),file('random.bin',noise),file('empty.bin',new Uint8Array()),{path:'empty-dir',kind:'directory'}];
 const output=await writeCompressedZipEntries(records),archive=await parseArchiveInput(output),entries=metadata(output);
 for(const record of records)if(record.kind==='file'){assert.deepEqual(await archive.read(record.path),record.data);assert.equal(archive.entries.get(record.path).modified,'2026-10-20 19:28:46');}
 assert.equal(entries.find(e=>e.name==='日本語/repeated.txt').method,8);assert.equal(entries.find(e=>e.name==='random.bin').method,0);assert.equal(entries.find(e=>e.name==='empty.bin').method,0);assert.equal(entries.find(e=>e.name==='empty-dir/').method,0);
 for(const entry of entries){assert.equal(entry.method,entry.localMethod);assert.equal(entry.compressed,entry.localCompressed);assert.equal(entry.size,entry.localSize);assert.equal(entry.crc,entry.localCrc);if(entry.method===8)assert.ok(entry.compressed<entry.size);}
 assert.equal(entries.find(e=>e.name==='日本語/repeated.txt').crc,crc32(repeat));assert.ok(output.length<writeZipEntries(records).length);
});
test('default writer remains stored and compressed export leaves source unchanged',async()=>{
 const original=writeZipEntries([file('x',bytes('repeat'.repeat(10000)))]),source=await parseArchiveInput(original),stored=await writeArchive(source),compressed=await writeArchive(source,{compression:'deflate'});
 assert.deepEqual(stored,original);assert.equal(metadata(stored)[0].method,0);assert.equal(metadata(compressed)[0].method,8);assert.deepEqual(await source.read('x'),bytes('repeat'.repeat(10000)));await assert.rejects(writeArchive(source,{compression:'unknown'}),/stored or deflate/);
});
test('compressed writer snapshots caller arrays and later records before awaiting compression',async()=>{
 const first=bytes('first'.repeat(10000)),later=bytes('later'.repeat(1000)),records=[file('first',first),file('later',later)],pending=writeCompressedZipEntries(records);first.fill(0);later.fill(0);records[1].path='changed';records.push(file('extra',bytes('extra')));const archive=await parseArchiveInput(await pending);assert.deepEqual(await archive.read('first'),bytes('first'.repeat(10000)));assert.deepEqual(await archive.read('later'),bytes('later'.repeat(1000)));assert.equal(archive.entries.has('changed'),false);assert.equal(archive.entries.has('extra'),false);
});
test('empty archive and directory-only exports do not require compression support',async()=>{
 assert.deepEqual(await writeCompressedZipEntries([]),writeZipEntries([]));const original=global.CompressionStream;try{global.CompressionStream=undefined;assert.deepEqual(await writeCompressedZipEntries([{path:'empty',kind:'directory'}]),writeZipEntries([{path:'empty',kind:'directory'}]));await assert.rejects(writeCompressedZipEntries([file('x',bytes('x'))]),/unavailable/);}finally{global.CompressionStream=original;}
});
test('unsupported raw deflate and compressor stream errors surface clearly',async()=>{
 const original=global.CompressionStream;try{global.CompressionStream=class{constructor(){throw Error('unsupported');}};await assert.rejects(writeCompressedZipEntries([file('x',bytes('x'))]),/Raw deflate.*unavailable/);global.CompressionStream=class{constructor(){return new TransformStream({transform(){throw Error('compression failed');}});}};await assert.rejects(writeCompressedZipEntries([file('x',bytes('x'))]),/compression failed/);}finally{global.CompressionStream=original;}
});
test('compressed export enforces paths, entry count, expanded and final output bounds',async()=>{
 await assert.rejects(writeCompressedZipEntries([file('../bad',bytes('x'))]),/Unsafe/);await assert.rejects(writeCompressedZipEntries(Array.from({length:50001},(_,i)=>file('x'+i,new Uint8Array()))),/50,000/);await assert.rejects(writeCompressedZipEntries([file('too-big',new Uint8Array(64*1024*1024+1))]),/64 MB/);
 await assert.rejects(writeCompressedZipEntries([file('random',Uint8Array.from(randomBytes(32*1024*1024)))]),/32 MB/);
 // Stored ZIP rejects the raw size; deflate permits it within expanded/output bounds.
 const large=[file('compressible',new Uint8Array(33*1024*1024))];assert.throws(()=>writeZipEntries(large),/32 MB/);const output=await writeCompressedZipEntries(large);assert.ok(output.length<1024*1024);const parsed=await parseArchiveInput(output);assert.equal((await parsed.read('compressible')).length,33*1024*1024);
});
test('compressed save checks source integrity before exporting',async()=>{
 const source={entries:new Map([['x',{path:'x',kind:'file',size:1,crc:123}]]),read:async()=>new Uint8Array([1])};await assert.rejects(writeArchive(source,{compression:'deflate'}),/CRC/);
});
