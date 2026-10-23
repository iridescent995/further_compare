import client from './doc-worker-client.cjs';
export function extractDocTextInBrowser(bytes,{scope='main-document',signal}={}){
 return client.runDocWorker(bytes,{scope,signal,createWorker:()=>new Worker(new URL('./doc-text-browser-worker.js',document.baseURI))});
}
