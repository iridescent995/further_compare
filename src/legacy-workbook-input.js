import client from './legacy-workbook-worker-client.cjs';
let reader;
/** Cached-value input only. Every request is independently validated in a disposable worker. */
export function readLegacyWorkbookFile(bytes,{format,signal}={}){
 if(!reader)reader=client.createLegacyWorkbookReader({workerFactory:()=>new Worker('legacy-workbook-browser-worker.js'),maxQueue:8});
 return reader.read(bytes,{format,signal});
}
export function disposeLegacyWorkbookReader(){reader?.dispose();reader=undefined;}
