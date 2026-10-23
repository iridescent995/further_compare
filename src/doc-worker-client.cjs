'use strict';
const {validateDocProjection}=require('./doc-projection.cjs');
let active=0;
const failure=(code,message)=>Object.assign(Error(message),{code});
function runDocWorker(input,{scope='main-document',signal,createWorker,timeoutMs=30000}={}){
 if(!(input instanceof Uint8Array)||!input.length||input.length>32*1024*1024)return Promise.reject(failure('DOCUMENT_LIMIT','DOC input must be between 1 byte and 32 MiB.'));
 if(!['main-document','main-and-related-text'].includes(scope))return Promise.reject(failure('DOCUMENT_INVALID','Invalid DOC text scope.'));
 if(signal?.aborted)return Promise.reject(failure('DOCUMENT_CANCELLED','DOC extraction cancelled.'));
 if(active>=2)return Promise.reject(failure('DOCUMENT_LIMIT','Two DOC extractions are already running.'));
 const bytes=new Uint8Array(input);active++;
 return new Promise((resolve,reject)=>{
  let worker,timer,finished=false;const removers=[];
  const abort=()=>finish(failure('DOCUMENT_CANCELLED','DOC extraction cancelled.'));
  function finish(error,result){if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);for(const remove of removers)remove();let stopped;try{stopped=worker?.terminate();}catch(e){error||=failure('DOCUMENT_RESOURCE',String(e.message));}Promise.resolve(stopped).then(()=>{active--;error?reject(error):resolve(result);},e=>{active--;reject(error||failure('DOCUMENT_RESOURCE',String(e.message)));});}
  function listen(name,handler){if(worker.addEventListener){worker.addEventListener(name,handler);removers.push(()=>worker.removeEventListener(name,handler));}else{worker.on(name,handler);removers.push(()=>worker.off(name,handler));}}
  try{
   worker=createWorker();
   listen('message',event=>{if(finished)return;try{const data=worker.addEventListener?event.data:event;if(!data||data.id!==1||typeof data.ok!=='boolean')throw Error('Invalid DOC worker response.');if(!data.ok){const code=['DOCUMENT_INVALID','DOCUMENT_UNSUPPORTED','DOCUMENT_LIMIT','DOCUMENT_CANCELLED'].includes(data.code)?data.code:'DOCUMENT_INVALID';finish(failure(code,String(data.message||'DOC extraction failed.').slice(0,2048)));return;}
    const result=data.result;if(typeof result?.content!=='string'||new TextEncoder().encode(result.content).length>8*1024*1024||JSON.stringify(result.projection).length>2*1024*1024)throw Error('Invalid or excessive DOC worker output.');const projection=validateDocProjection(result.projection);if(projection.scope!==scope)throw Error('DOC extraction scope mismatch.');finish(null,{content:result.content,projection});
   }catch(error){finish(failure('DOCUMENT_INVALID',String(error.message)));}});
   listen('error',error=>finish(failure('DOCUMENT_RESOURCE',String(error.message||'DOC worker failed.'))));
   if(!worker.addEventListener)listen('exit',()=>finish(failure('DOCUMENT_RESOURCE','DOC worker exited before returning text.')));
   timer=setTimeout(()=>finish(failure('DOCUMENT_TIMEOUT','DOC extraction timed out.')),timeoutMs);
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
   worker.postMessage({id:1,bytes,scope},[bytes.buffer]);
  }catch(error){finish(failure('DOCUMENT_RESOURCE',String(error.message)));}
 });
}
module.exports={runDocWorker};
