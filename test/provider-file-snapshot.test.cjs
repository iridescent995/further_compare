'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {snapshotProviderFile}=require('../desktop/provider-file-snapshot.cjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(bytes=Buffer.from('original bytes'),options={}){
 const state={root:{path:'opaque-root',identity:'root-identity',stamp:'root-before'},info:{path:'nested/file.bin',kind:'file',identity:'file-identity',stamp:'file-before',size:bytes.length},opened:0,closed:0,requests:[],offset:0,rootReads:0,entryReads:0,validated:0,readHook:null,validateHook:null,rootHook:null,entryHook:null,closeError:null};
 const provider={
  inspectRoot:async()=>{state.rootReads++;state.rootHook?.();return {...state.root};},
  inspectEntry:async relative=>{assert.equal(relative,'nested/file.bin');state.entryReads++;state.entryHook?.();return {...state.info};},
  openFileReader:async relative=>{assert.equal(relative,'nested/file.bin');state.opened++;return {
   metadata:{...state.info,...options.readerMetadata},
   read:async max=>{state.requests.push(max);const custom=await state.readHook?.(max);if(custom!==undefined)return custom;if(state.offset===bytes.length)return null;const chunk=bytes.subarray(state.offset,state.offset+Math.min(max,options.chunkSize||max));state.offset+=chunk.length;return chunk;},
   validate:async()=>{state.validated++;state.validateHook?.();return {...state.info};},
   close:async()=>{state.closed++;if(state.closeError)throw state.closeError;}
  };}
 };
 return {state,provider,bytes};
}
test('hashes exact binary bytes through short reads and awaits ordered consumer offsets',async()=>{
 const f=fixture(Buffer.from([0,255,13,10,128,65,0]),{chunkSize:2}),received=[];let active=0;
 const result=await snapshotProviderFile(f.provider,'nested/file.bin',{onChunk:async(chunk,offset)=>{assert.ok(chunk instanceof Uint8Array);assert.equal(active++,0);await new Promise(resolve=>setImmediate(resolve));received.push({bytes:Buffer.from(chunk),offset});active--;}});
 assert.equal(result.sha256,hash(f.bytes));assert.equal(result.byteLength,f.bytes.length);assert.deepEqual(result.root,f.state.root);assert.deepEqual(result.metadata,f.state.info);
 assert.deepEqual(received.map(item=>item.offset),[0,2,4,6]);assert.deepEqual(Buffer.concat(received.map(item=>item.bytes)),f.bytes);assert.equal(f.state.closed,1);assert.ok(f.state.validated);assert.ok(f.state.requests.every(size=>size>0&&size<=65536));
});
test('streams beyond the text limit without truncation or a hidden 10 MiB ceiling',async()=>{
 const bytes=Buffer.alloc(12*1024*1024+17,0xa7),f=fixture(bytes);let delivered=0;
 const result=await snapshotProviderFile(f.provider,'nested/file.bin',{onChunk:async(chunk,offset)=>{assert.equal(offset,delivered);assert.ok(chunk.length<=65536);delivered+=chunk.length;}});
 assert.equal(delivered,bytes.length);assert.equal(result.byteLength,bytes.length);assert.equal(result.sha256,hash(bytes));assert.equal(f.state.closed,1);
});
test('empty files have a real SHA-256 and deliver no invented chunks',async()=>{
 const f=fixture(Buffer.alloc(0));let delivered=0;const result=await snapshotProviderFile(f.provider,'nested/file.bin',{onChunk:()=>{delivered++;}});
 assert.equal(result.sha256,hash(Buffer.alloc(0)));assert.equal(result.byteLength,0);assert.equal(delivered,0);assert.equal(f.state.closed,1);
});
test('maximum size rejects before opening a reader and exact-size limits succeed',async()=>{
 const f=fixture();await assert.rejects(snapshotProviderFile(f.provider,'nested/file.bin',{maxBytes:f.bytes.length-1}));assert.equal(f.state.opened,0);
 const result=await snapshotProviderFile(f.provider,'nested/file.bin',{maxBytes:f.bytes.length});assert.equal(result.byteLength,f.bytes.length);assert.equal(f.state.closed,1);
});
test('rejects invalid relative paths without accessing provider metadata',async()=>{
 for(const relative of ['',null,42,'/outside','../outside','nested/../file','nested//file','nested/./file','nested\\file','nested/\0file']){const f=fixture();await assert.rejects(snapshotProviderFile(f.provider,relative));assert.equal(f.state.rootReads,0);assert.equal(f.state.opened,0);}
});
test('rejects non-file and invalid byte-size metadata before reading',async()=>{
 for(const patch of [{kind:'directory'},{size:-1},{size:1.5},{size:Number.MAX_SAFE_INTEGER+1},{size:NaN},{size:'14'},{path:'other.bin'},{identity:''},{stamp:''}]){const f=fixture();Object.assign(f.state.info,patch);await assert.rejects(snapshotProviderFile(f.provider,'nested/file.bin'));assert.equal(f.state.opened,0);}
});
test('rejects reader metadata that differs from the selected file and closes the reader',async()=>{
 const f=fixture(undefined,{readerMetadata:{stamp:'replaced'}});await assert.rejects(snapshotProviderFile(f.provider,'nested/file.bin'));assert.equal(f.state.closed,1);assert.equal(f.state.requests.length,0);
});
test('rejects truncation and growth, including a single byte after the recorded length',async()=>{
 for(const delta of [-1,1]){const f=fixture();f.state.info.size+=delta;await assert.rejects(snapshotProviderFile(f.provider,'nested/file.bin'));assert.equal(f.state.closed,1);}
});
test('rejects malformed, empty, or oversized chunks and closes the reader',async()=>{
 for(const value of ['not bytes',Buffer.alloc(0),{},Buffer.alloc(65537)]){const f=fixture();f.state.readHook=()=>value;await assert.rejects(snapshotProviderFile(f.provider,'nested/file.bin'));assert.equal(f.state.closed,1);}
});
test('a file changed during streaming or final path validation is rejected',async()=>{
 for(const point of ['read','validate','entry']){const f=fixture();if(point==='read')f.state.readHook=()=>{f.state.info.stamp='changed';};if(point==='validate')f.state.validateHook=()=>{f.state.info.stamp='changed';};if(point==='entry')f.state.entryHook=()=>{if(f.state.entryReads>1)f.state.info.stamp='changed';};await assert.rejects(snapshotProviderFile(f.provider,'nested/file.bin'));assert.equal(f.state.closed,1);}
});
test('root replacement is rejected but unrelated root timestamp changes are allowed',async()=>{
 for(const field of ['identity','path']){const f=fixture();f.state.readHook=()=>{f.state.root[field]='replaced';};await assert.rejects(snapshotProviderFile(f.provider,'nested/file.bin'));assert.equal(f.state.closed,1);}
 const f=fixture();f.state.readHook=()=>{f.state.root.stamp='unrelated sibling changed';};assert.equal((await snapshotProviderFile(f.provider,'nested/file.bin')).sha256,hash(f.bytes));assert.equal(f.state.closed,1);
});
test('consumer failure stops streaming and closes the retained reader',async()=>{
 const f=fixture(undefined,{chunkSize:2}),failure=Error('destination refused bytes');await assert.rejects(snapshotProviderFile(f.provider,'nested/file.bin',{onChunk:async()=>{throw failure;}}),error=>error===failure);assert.equal(f.state.closed,1);assert.equal(f.state.requests.length,1);
});
test('pre-abort never opens; abort during streaming or consumer await closes the reader',async()=>{
 const pre=fixture(),early=new AbortController();early.abort();await assert.rejects(snapshotProviderFile(pre.provider,'nested/file.bin',{signal:early.signal}),{code:'ABORT_ERR'});assert.equal(pre.state.opened,0);
 for(const point of ['read','consumer']){const f=fixture(undefined,{chunkSize:2}),controller=new AbortController();if(point==='read')f.state.readHook=()=>{controller.abort();};await assert.rejects(snapshotProviderFile(f.provider,'nested/file.bin',{signal:controller.signal,onChunk:async()=>{if(point==='consumer'){await new Promise(resolve=>setImmediate(resolve));controller.abort();}}}),{code:'ABORT_ERR'});assert.equal(f.state.closed,1);assert.equal(f.state.requests.length,1);}
});
test('close failure prevents successful publication of an otherwise valid snapshot',async()=>{
 const f=fixture(),failure=Error('handle close failed');f.state.closeError=failure;await assert.rejects(snapshotProviderFile(f.provider,'nested/file.bin'),error=>error===failure);assert.equal(f.state.closed,1);
});
test('safe-integer maximum metadata keeps read requests bounded and still rejects premature EOF',async()=>{
 const f=fixture(Buffer.alloc(0));f.state.info.size=Number.MAX_SAFE_INTEGER;
 await assert.rejects(snapshotProviderFile(f.provider,'nested/file.bin'),{code:'STALE_SOURCE'});
 assert.deepEqual(f.state.requests,[65536]);assert.equal(f.state.closed,1);
});
test('exact byte limits still probe EOF with one byte, including the zero-byte limit',async()=>{
 for(const bytes of [Buffer.alloc(0),Buffer.alloc(65536,0xab)]){const f=fixture(bytes);const result=await snapshotProviderFile(f.provider,'nested/file.bin',{maxBytes:bytes.length});assert.equal(result.byteLength,bytes.length);assert.equal(f.state.requests.at(-1),1);assert.equal(f.state.closed,1);}
});
test('a failed close cannot hide the original consumer error',async()=>{
 const f=fixture(),consumer=Error('destination write failed');f.state.closeError=Error('cleanup also failed');
 await assert.rejects(snapshotProviderFile(f.provider,'nested/file.bin',{onChunk:async()=>{throw consumer;}}),error=>error===consumer);
 assert.equal(f.state.closed,1);
});
