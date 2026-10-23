'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {runDocWorker}=require('../src/doc-worker-client.cjs');
const {DOC_MAIN_EXCLUSIONS,POLICY}=require('../src/doc-projection.cjs');
function response(){return {id:1,ok:true,result:{content:'Text',projection:{kind:'doc',version:1,policy:POLICY,scope:'main-document',nFib:0x101,relatedParts:[],exclusions:[...DOC_MAIN_EXCLUSIONS]}}};}
class Fake extends EventEmitter{constructor(task){super();this.task=task;this.stopped=false;}postMessage(data){this.data=data;this.task?.(this,data);}terminate(){this.stopped=true;return Promise.resolve(0);}}
test('worker transfers an owned snapshot, validates response and terminates on success',async()=>{
 const bytes=Buffer.from([1,2,3]);let worker;
 const result=await runDocWorker(bytes,{createWorker:()=>worker=new Fake((w,d)=>{d.bytes.fill(0);queueMicrotask(()=>w.emit('message',response()));})});
 assert.equal(result.content,'Text');assert.deepEqual([...bytes],[1,2,3]);assert(worker.stopped);assert.equal(worker.listenerCount('message'),0);
});
test('aborted input never starts worker; running abort and timeout terminate without publishing late output',async()=>{
 const before=new AbortController();before.abort();await assert.rejects(runDocWorker(new Uint8Array([1]),{signal:before.signal,createWorker:()=>assert.fail('must not start')}),e=>e.code==='DOCUMENT_CANCELLED');
 for(const mode of ['abort','timeout']){const control=new AbortController();let worker;const pending=runDocWorker(new Uint8Array([1]),{signal:control.signal,timeoutMs:10,createWorker:()=>worker=new Fake()});if(mode==='abort')control.abort();await assert.rejects(pending,e=>e.code===(mode==='abort'?'DOCUMENT_CANCELLED':'DOCUMENT_TIMEOUT'));assert(worker.stopped);worker.emit('message',response());assert.equal(worker.listenerCount('message'),0);}
});
test('scope forgery, worker crash and oversized output fail atomically and terminate',async()=>{
 for(const mode of ['scope','crash','large']){let worker;await assert.rejects(runDocWorker(new Uint8Array([1]),{createWorker:()=>worker=new Fake(w=>queueMicrotask(()=>{if(mode==='crash'){w.emit('error',Error('crash'));return;}const r=response();if(mode==='scope')r.result.projection.scope='main-and-related-text';else r.result.content='x'.repeat(8*1024*1024+1);w.emit('message',r);})),}),/scope|crash|output|metadata/i);assert(worker.stopped);}
});
test('concurrency limit holds until workers are terminated and releases after cancellation',async()=>{
 const c=new AbortController(),workers=[];const options={signal:c.signal,createWorker:()=>{const w=new Fake();workers.push(w);return w;}};
 const first=runDocWorker(new Uint8Array([1]),options),second=runDocWorker(new Uint8Array([1]),options);const handled=[assert.rejects(first,e=>e.code==='DOCUMENT_CANCELLED'),assert.rejects(second,e=>e.code==='DOCUMENT_CANCELLED')];
 await assert.rejects(runDocWorker(new Uint8Array([1]),options),e=>e.code==='DOCUMENT_LIMIT');c.abort();await Promise.all(handled);assert(workers.every(w=>w.stopped));
 const result=await runDocWorker(new Uint8Array([1]),{createWorker:()=>new Fake(w=>queueMicrotask(()=>w.emit('message',response())))});assert.equal(result.content,'Text');
});
