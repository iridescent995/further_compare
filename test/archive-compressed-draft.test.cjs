'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash,randomBytes}=require('node:crypto');
const {writeCompressedZipEntries,editArchive}=require('../src/archive-edit.cjs');
const {parseArchiveInput}=require('../src/archive-core.cjs');
const hash=data=>createHash('sha256').update(data).digest('hex');
async function fixture(){
 // Each child stays below the existing 32 MiB editor limit; aggregate content
 // exceeds stored-output capacity but remains below the 64 MiB expansion cap.
 const data=new Uint8Array(17*1024*1024).fill(65),other=new Uint8Array(17*1024*1024).fill(66);
 const bytes=await writeCompressedZipEntries([{path:'a.bin',kind:'file',data},{path:'b.bin',kind:'file',data:other},{path:'edit.txt',kind:'file',data:new TextEncoder().encode('original\n')}]);
 assert.ok(bytes.length<32*1024*1024);return {bytes,archive:await parseArchiveInput(bytes),hash:hash(bytes),aHash:hash(data),bHash:hash(other)};
}
test('compressed draft rename retains eligible large-expanded archive bytes',async()=>{
 const source=await fixture();
 const output=await editArchive(source.archive,{action:'rename',paths:['a.bin'],newPath:'renamed.bin'});
 assert.ok(output.length<=32*1024*1024);const result=await parseArchiveInput(output);
 assert.equal(result.entries.has('a.bin'),false);assert.equal(hash(await result.read('renamed.bin')),source.aHash);assert.equal(hash(await result.read('b.bin')),source.bHash);
 const independent=await require('jszip').loadAsync(output,{checkCRC32:true});assert.equal(hash(await independent.file('renamed.bin').async('uint8array')),source.aHash);assert.equal(hash(source.bytes),source.hash);assert.equal(source.archive.entries.has('a.bin'),true);
});
test('compressed draft entry replacement permits bounded child writeback without changing other entries',async()=>{
 const source=await fixture(),replacement=new TextEncoder().encode('edited child\n');
 // stageEntryEdit uses this exact add-existing-entry action after its parent
 // authority checks; renderer/native binding coverage remains a separate task.
 const output=await editArchive(source.archive,{action:'add',files:[{name:'edit.txt',data:replacement}],destination:''});
 assert.ok(output.length<=32*1024*1024);const result=await parseArchiveInput(output);
 assert.deepEqual(await result.read('edit.txt'),replacement);assert.equal(hash(await result.read('a.bin')),source.aHash);assert.equal(hash(await result.read('b.bin')),source.bHash);
 assert.equal(new TextDecoder().decode(await source.archive.read('edit.txt')),'original\n');assert.equal(hash(source.bytes),source.hash);
});

test('incompressible draft rejection preserves the prior archive and incoming bytes',async()=>{
 const source=await fixture(),data=Uint8Array.from(randomBytes(32*1024*1024)),before=hash(data);
 await assert.rejects(editArchive(source.archive,{action:'add',files:[{name:'a.bin',data}]}),/32 M(?:i)?B/);
 assert.equal(hash(data),before);assert.equal(hash(source.bytes),source.hash);assert.equal(hash(await source.archive.read('a.bin')),source.aHash);
});
test('preserved rename works without compressor; explicit rebuilt compression still rejects',async()=>{
 const source=await fixture(),original=globalThis.CompressionStream;
 try{globalThis.CompressionStream=undefined;const bytes=await editArchive(source.archive,{action:'rename',paths:['a.bin'],newPath:'new.bin'});assert.equal(hash(await (await parseArchiveInput(bytes)).read('new.bin')),source.aHash);await assert.rejects(editArchive(source.archive,{action:'rename',paths:['a.bin'],newPath:'new.bin',compression:'deflate'}),/compression is unavailable/);}finally{globalThis.CompressionStream=original;}
 assert.equal(hash(source.bytes),source.hash);assert.ok(source.archive.entries.has('a.bin'));assert.ok(!source.archive.entries.has('new.bin'));
});
