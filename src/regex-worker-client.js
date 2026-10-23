export function runRegexSearch(request){
 let worker,timer,settled=false,finish;
 const promise=new Promise((resolve,reject)=>{
  finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();error?reject(error):resolve(result);};
  try{worker=new Worker('search-worker.js');worker.onmessage=event=>finish(event.data.error?new Error(event.data.error):null,event.data.result);worker.onerror=()=>finish(new Error('Pattern search could not start.'));timer=setTimeout(()=>finish(new Error('Pattern search took too long. Simplify the expression.')),1000);worker.postMessage(request);}catch(error){finish(error);}
 });
 return {promise,cancel:()=>finish(new Error('Search cancelled.'))};
}
