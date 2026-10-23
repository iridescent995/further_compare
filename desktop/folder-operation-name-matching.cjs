'use strict';
const {scanFilenameInventory}=require('./folder-filename-inventory.cjs');
const automatic=alignment=>typeof alignment.forSnapshots==='function';
const manualPairs=alignment=>(alignment.manualAlignment||alignment).pairs;
function namespaceSignature(pair){return JSON.stringify(['a','b'].map(side=>[pair[side].identity,[...pair[side].entries].map(([name,entry])=>[name,entry.kind,entry.identity]).sort(([a],[b])=>a<b?-1:a>b?1:0)]));}
async function discoverOperationAlignment(service,alignment){
 if(!automatic(alignment))return {alignment,signature:null};
 const pair=await scanFilenameInventory(service);
 return {alignment:alignment.forSnapshots(pair),signature:namespaceSignature(pair)};
}
async function validateOperationNamespace(service,alignment,signature){
 if(signature===null)return;
 const current=await discoverOperationAlignment(service,alignment);
 if(current.signature!==signature)throw Error('Folder filename namespace changed. Preview again.');
}
module.exports={automatic,manualPairs,discoverOperationAlignment,validateOperationNamespace};
