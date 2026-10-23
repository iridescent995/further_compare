'use strict';
// Serial jobs, one disposable worker per parse. A timed-out parser cannot affect its successor.
// Include worker startup and slow-platform scheduling in the finite 30-second budget.
function createLegacyWorkbookReader({workerFactory,timeoutMs=30000,maxQueue=8}={}){
 if(typeof workerFactory!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isInteger(maxQueue)||maxQueue<1||maxQueue>32)throw Error('Invalid workbook worker options.');
 let closed=false,active=null,sequence=0;const queue=[];
 const error=message=>Error('Binary workbook input: '+message);
 function settle(job,failure,value){if(job.done)return;job.done=true;clearTimeout(job.timer);job.signal?.removeEventListener('abort',job.abort);job.bytes=null;try{job.worker?.terminate();}catch{}if(active===job)active=null;const index=queue.indexOf(job);if(index!==-1)queue.splice(index,1);failure?job.reject(failure):job.resolve(value);pump();}
 function pump(){if(closed||active||!queue.length)return;const job=queue.shift();active=job;
  try{job.worker=workerFactory();job.worker.onmessage=({data})=>{if(data?.id!==job.id){settle(job,error('Invalid worker response.'));return;}if(typeof data.error==='string'){settle(job,error(data.error));return;}if(!Array.isArray(data.result)||data.result.length>64){settle(job,error('Invalid worker result.'));return;}settle(job,null,data.result);};job.worker.onerror=()=>settle(job,error('Worker stopped unexpectedly.'));job.worker.onmessageerror=()=>settle(job,error('Invalid worker message.'));job.timer=setTimeout(()=>settle(job,error('Reading took too long.')),timeoutMs);job.worker.postMessage({id:job.id,bytes:job.bytes,format:job.format});job.bytes=null;}catch(e){settle(job,e);}
 }
 function read(bytes,{format,signal}={}){if(closed)return Promise.reject(error('Reader is closed.'));if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>32*1024*1024||!['xls','xlsb'].includes(format))return Promise.reject(error('Invalid workbook input.'));if(signal?.aborted)return Promise.reject(error('Reading cancelled.'));if(queue.length+(active?1:0)>=maxQueue)return Promise.reject(error('Too many pending workbooks.'));
  return new Promise((resolve,reject)=>{const job={id:++sequence,bytes:bytes.slice(),format,signal,resolve,reject};job.abort=()=>settle(job,error('Reading cancelled.'));signal?.addEventListener('abort',job.abort,{once:true});queue.push(job);if(signal?.aborted)job.abort();else pump();});
 }
 function dispose(){if(closed)return;closed=true;if(active)settle(active,error('Reader is closed.'));for(const job of [...queue])settle(job,error('Reader is closed.'));}
 return Object.freeze({read,dispose});
}
module.exports={createLegacyWorkbookReader};
