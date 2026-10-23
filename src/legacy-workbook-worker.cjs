'use strict';
const {readLegacyWorkbook}=require('./legacy-workbook-reader.cjs');
// Dependency injection keeps the same worker protocol testable in browser and native harnesses.
function installLegacyWorkbookWorker(scope,{parser,preflights}){
 let busy=false;
 scope.onmessage=async({data})=>{
  const id=data?.id;
  if(!Number.isSafeInteger(id)||id<1||busy){scope.postMessage({id,error:'Invalid or overlapping workbook request.'});return;}
  busy=true;
  try{const result=await readLegacyWorkbook(data.bytes,{format:data.format,parser,preflight:preflights?.[data.format]});scope.postMessage({id,result});}
  catch(error){scope.postMessage({id,error:String(error?.message||'Workbook reading failed.').slice(0,2048)});}
  finally{busy=false;}
 };
}
module.exports={installLegacyWorkbookWorker};
