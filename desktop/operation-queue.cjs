'use strict';
// Read jobs wait for earlier mutations, then release the transaction queue after
// their synchronous start captures session authority. Their returned promise
// still tracks completion, errors, cancellation and reader cleanup.
function createOperationQueue(){
 let tail=Promise.resolve();
 return {schedule(run,{detach=false}={}){
  if(typeof run!=='function')throw TypeError('Choose an operation.');
  if(detach){
   const started=tail.then(()=>({completion:Promise.resolve(run())}));
   tail=started.then(()=>undefined,()=>undefined);
   return started.then(job=>job.completion);
  }
  const completion=tail.then(run);tail=completion.catch(()=>{});return completion;
 }};
}
module.exports={createOperationQueue};
