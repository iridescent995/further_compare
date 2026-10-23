'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const source=fs.readFileSync(path.join(__dirname,'../desktop/window-runtime.cjs'),'utf8');
const start=source.indexOf(' const pdfLifetime='),end=source.indexOf(' const createFolderService=',start);
assert.ok(start>=0&&end>start);
function owner(service){const mainWindow=new EventEmitter();const context={AbortController,AbortSignal,mainWindow,shared:{pdfTextService:service}};vm.runInNewContext(source.slice(start,end)+'\nglobalThis.extract=extractPdfText;globalThis.cancel=cancelPdfExtraction;',context);return context;}
test('window closure aborts active and queued PDF extraction without affecting another window',async()=>{
 const calls=[],service={extract(bytes,{signal}){calls.push(signal);return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}};
 const a=owner(service),b=owner(service),one=a.extract(new Uint8Array()),two=a.extract(new Uint8Array()),three=b.extract(new Uint8Array());
 const rejected=Promise.all([assert.rejects(one,{name:'AbortError'}),assert.rejects(two,{name:'AbortError'})]);a.mainWindow.emit('closed');await rejected;assert.equal(calls[2].aborted,false);assert.throws(()=>a.extract(new Uint8Array()),{name:'AbortError'});assert.equal(calls.length,3);const last=assert.rejects(three,{name:'AbortError'});b.cancel();await last;
});
test('caller cancellation remains effective and does not cancel the window lifetime',async()=>{
 const calls=[],ownerWindow=owner({extract:async(bytes,options)=>{calls.push(options);return 'text';}}),caller=new AbortController();await ownerWindow.extract(new Uint8Array(),{signal:caller.signal,tag:'retained'});caller.abort();assert.equal(calls[0].signal.aborted,true);assert.equal(calls[0].tag,'retained');assert.throws(()=>ownerWindow.extract(new Uint8Array(),{signal:caller.signal}),{name:'AbortError'});await ownerWindow.extract(new Uint8Array());assert.equal(calls[1].signal.aborted,false);ownerWindow.cancel();assert.equal(calls[1].signal.aborted,true);
 assert.match(source,/dispose\(\)\{disposed=true;cancelPdfExtraction\(\);mainWindow.removeListener\('closed',cancelPdfExtraction\)/);
});
