'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createLegacyWorkbookReader}=require('../src/legacy-workbook-worker-client.cjs');
test('default worker budget accepts legitimate reads beyond five seconds and still terminates stalled work',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const workers=[];const reader=createLegacyWorkbookReader({workerFactory:()=>{const w={terminate(){this.terminated=true;},postMessage(message){this.message=message;if(workers.length===1)setTimeout(()=>w.onmessage({data:{id:message.id,result:[{name:'Slow valid worksheet'}]}}),6000);}};workers.push(w);return w;}});t.after(()=>reader.dispose());
 const valid=reader.read(new Uint8Array([1]),{format:'xlsb'});t.mock.timers.tick(6000);assert.deepEqual(await valid,[{name:'Slow valid worksheet'}]);assert.equal(workers[0].terminated,true);
 const stalled=reader.read(new Uint8Array([1]),{format:'xlsb'}),rejected=assert.rejects(stalled,/too long/);t.mock.timers.tick(30000);await rejected;assert.equal(workers[1].terminated,true);
 const controller=new AbortController(),cancelled=reader.read(new Uint8Array([1]),{format:'xlsb',signal:controller.signal}),aborted=assert.rejects(cancelled,/cancelled/);controller.abort();await aborted;assert.equal(workers[2].terminated,true);
});
