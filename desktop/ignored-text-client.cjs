'use strict';
const {validateTextGrammar}=require('../src/text-grammar.cjs');
const {validateTextProfile}=require('../src/text-profile.cjs');
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const {validateIgnoredTextPatterns}=require('../src/ignored-text-rules.cjs');
function createIgnoredTextPool({timeoutMs=1000,bootTimeoutMs=5000,idleTimeoutMs=1000,maxQueue=64}={}){
 const slots=new Set(),queue=[];let serial=0,closed=false,queuedBytes=0;
 const take=()=>{const job=queue.shift();if(job)queuedBytes-=job.bytes;return job;};
 function retire(slot,error){
  if(slot.retiring)return;slot.retiring=true;clearTimeout(slot.timer);clearTimeout(slot.idle);
  const job=slot.job;slot.job=null;if(job)job.reject(error||Error('Ignored-text processing was cancelled.'));
  void slot.worker.terminate().catch(()=>{}).finally(()=>{slots.delete(slot);pump();});
 }
 function dispatch(slot,job){
  clearTimeout(slot.idle);slot.worker.ref();slot.job=job;
  slot.timer=setTimeout(()=>retire(slot,Error('Ignored-text processing took too long. Simplify the patterns.')),timeoutMs);
  try{slot.worker.postMessage({id:job.id,texts:job.texts,patterns:job.patterns,profile:job.profile,structured:job.structured,grammar:job.grammar});}catch(error){retire(slot,error);}
 }
 function spawn(job){
  const worker=new Worker(path.join(__dirname,'ignored-text-worker.cjs'),{resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32,stackSizeMb:4}}),slot={worker,ready:false,job,retiring:false,timer:null,idle:null};slots.add(slot);
  slot.timer=setTimeout(()=>retire(slot,Error('Ignored-text worker could not start in time.')),bootTimeoutMs);
  worker.on('message',message=>{
   if(slot.retiring)return;
   if(!slot.ready){if(message?.ready!==true){retire(slot,Error('Invalid ignored-text worker startup.'));return;}clearTimeout(slot.timer);slot.ready=true;dispatch(slot,slot.job);pump();return;}
   const job=slot.job;if(!job||message?.id!==job.id){retire(slot,Error('Invalid ignored-text worker response.'));return;}
   if(message.error){retire(slot,Error(message.error));return;}
   clearTimeout(slot.timer);slot.job=null;job.resolve(message.result);worker.unref();
   slot.idle=setTimeout(()=>retire(slot),idleTimeoutMs);slot.idle.unref?.();pump();
  });
  worker.on('error',error=>retire(slot,error));worker.on('exit',()=>{if(!slot.retiring)retire(slot,Error('Ignored-text worker stopped before completion.'));});
 }
 function pump(){
  if(closed)return;
  for(const slot of slots)if(queue.length&&slot.ready&&!slot.retiring&&!slot.job)dispatch(slot,take());
  while(queue.length&&slots.size<2){const job=take();try{spawn(job);}catch(error){job.reject(error);}}
 }
 function prepare(texts,value=[],profile='plain',structured=false,grammar){
  let patterns,bytes;try{
   grammar=validateTextGrammar(grammar);patterns=validateIgnoredTextPatterns(value);profile=validateTextProfile(profile);if(profile==='auto')throw Error('Resolve the automatic text profile before worker processing.');
   if(!Array.isArray(texts)||texts.length>20||Array.from(texts).some(text=>typeof text!=='string'||text.includes('\r'))||texts.reduce((n,text)=>n+text.length,0)>20*1024*1024)throw Error('Ignored-text input exceeds supported limits.');
   if(texts.reduce((n,text)=>n+(text===''?0:text.split('\n').length),0)>100000)throw Error('Ignored-text input exceeds 100,000 lines.');
   if(closed)throw Error('Ignored-text worker pool is closed.');
   if(!patterns.length&&profile==='plain'&&!structured)return Promise.resolve(texts.map(text=>text===''?[]:text.split('\n')));
   bytes=texts.reduce((n,text)=>n+text.length*2,0);
   if(queuedBytes+bytes>64*1024*1024)throw Error('Pending ignored-text inputs exceed 64 MiB. Retry after current work finishes.');
   if(queue.length>=maxQueue)throw Error('Too many pending ignored-text comparisons. Retry after current work finishes.');
  }catch(error){return Promise.reject(error);}
  return new Promise((resolve,reject)=>{queuedBytes+=bytes;queue.push({id:++serial,texts:[...texts],patterns,profile,structured,grammar,bytes,resolve,reject});pump();});
 }
 async function close(){closed=true;queuedBytes=0;for(const job of queue.splice(0))job.reject(Error('Ignored-text worker pool is closed.'));await Promise.all([...slots].map(async slot=>{retire(slot,Error('Ignored-text worker pool is closed.'));await slot.worker.terminate();}));}
 return {prepare,close};
}
const pool=createIgnoredTextPool();
module.exports={prepareIgnoredText:(texts,patterns)=>pool.prepare(texts,patterns),prepareTextComparison:(texts,patterns,profile,grammar)=>pool.prepare(texts,patterns,profile,true,grammar),createIgnoredTextPool};
