export function runFilenameSearch(entries,options){
 return new Promise((resolve,reject)=>{
  let worker,timer,done=false;
  const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);worker?.terminate();error?reject(error):resolve(result);};
  try{worker=new Worker('filename-search-worker.js');worker.onmessage=event=>finish(event.data.error?new Error(event.data.error):null,event.data.result);worker.onerror=()=>finish(new Error('Filename search could not start.'));timer=setTimeout(()=>finish(new Error('Filename search took too long. Simplify the expression.')),1000);worker.postMessage({entries,options});}catch(error){finish(error);}
 });
}
