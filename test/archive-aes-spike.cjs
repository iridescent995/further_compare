'use strict';
// Opt-in investigation only; no project dependency or archive implementation change.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=process.env.FC_AES_SPIKE_ROOT;if(!root)throw Error('Set FC_AES_SPIKE_ROOT to the isolated package/fixtures directory.');
const zip=require(path.join(root,'package/index.cjs'));zip.configure({useWebWorkers:false});
(async()=>{
 const meta=JSON.parse(await fs.readFile(path.join(root,'package/package.json')));assert.equal(meta.version,'2.24.0');assert.equal(meta.license,'BSD-3-Clause');
 const fixtures=JSON.parse(await fs.readFile(path.join(root,'fixtures.json')));let passed=0,unauthenticatedBytes=0;
 async function read(bytes,{password=fixtures.password,limit=64*1024*1024,controller,onChunk}={}){
  const reader=new zip.ZipReader(new zip.Uint8ArrayReader(bytes),{checkAuthenticationCode:true,checkCrc32:true,strictness:'strict',checkOverlappingEntry:true,useWebWorkers:false});
  const chunks=[];let length=0;
  try{const entries=await reader.getEntries();assert.equal(entries.length,1);await entries[0].getData(new WritableStream({write(chunk){length+=chunk.length;if(length>limit)throw Error('SPIKE_OUTPUT_LIMIT');chunks.push(chunk.slice());onChunk?.(controller,chunk.length);}}),{password,signal:controller?.signal,checkAuthenticationCode:true,checkCrc32:true,strictness:'strict',checkOverlappingEntry:true});return {bytes:Buffer.concat(chunks),length};}
  finally{await reader.close();}
 }
 for(const f of fixtures.fixtures){const bytes=await fs.readFile(path.join(root,'fixtures',f.name));assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);const result=await read(bytes);assert.equal(result.length,f.size);assert.equal(createHash('sha256').update(result.bytes).digest('hex'),f.contentSha256);passed++;}
 const original=await fs.readFile(path.join(root,'fixtures/ae2-256-0.zip'));const start=30+original.readUInt16LE(26)+original.readUInt16LE(28),compressed=original.readUInt32LE(18);
 await assert.rejects(read(original,{password:'incorrect password'}),/password/i);passed++;
 for(const offset of [start+18,start+compressed-1]){const altered=Buffer.from(original);altered[offset]^=1;await assert.rejects(read(altered,{onChunk:(_c,n)=>unauthenticatedBytes+=n}),/signature|authentication|invalid/i);passed++;}
 await assert.rejects(read(original.subarray(0,original.length-4)));passed++;
 const ae1=Buffer.from(await fs.readFile(path.join(root,'fixtures/ae1-256-0.zip'))),central=ae1.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));ae1.writeUInt32LE((ae1.readUInt32LE(14)^1)>>>0,14);ae1.writeUInt32LE((ae1.readUInt32LE(central+16)^1)>>>0,central+16);await assert.rejects(read(ae1),/signature|CRC|checksum/i);passed++;
 const expanded=await fs.readFile(path.join(root,'fixtures/expanded.zip'));const lateTamper=Buffer.from(await fs.readFile(path.join(root,'fixtures/large-stored.zip'))),lateStart=30+lateTamper.readUInt16LE(26)+lateTamper.readUInt16LE(28);lateTamper[lateStart+lateTamper.readUInt32LE(18)-1]^=1;await assert.rejects(read(lateTamper,{onChunk:(_c,n)=>unauthenticatedBytes+=n}),/signature|authentication|invalid/i);passed++;await assert.rejects(read(expanded,{limit:65536}),/SPIKE_OUTPUT_LIMIT/);passed++;
 const controller=new AbortController();await assert.rejects(read(expanded,{controller,onChunk:c=>c.abort()}),e=>e.name==='AbortError'||/abort/i.test(e.message));passed++;
 assert.equal((await read(original)).length,fixtures.fixtures[0].size);passed++;
 console.log(JSON.stringify({passed,version:meta.version,license:meta.license,fixtureGenerator:fixtures.generator,unauthenticatedBytesObservedBeforeFailure:unauthenticatedBytes,checks:'12 independent AES variants, wrong password, ciphertext/tag corruption, truncated archive, AE1 CRC, output cap, midstream abort, recovery',note:'Plaintext chunks may arrive before authentication fails; adapter must quarantine them until successful completion. Metadata is not authenticated.'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
