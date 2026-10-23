'use strict';
const {previewMove}=require('./folder-move.cjs');
const {validateOperationScope,selectOperationEntries}=require('./folder-operation-scope.cjs');
const {buildOperationInventory}=require('./folder-operation-inventory.cjs');
const {manualPairs,discoverOperationAlignment,validateOperationNamespace}=require('./folder-operation-name-matching.cjs');
// Classification always uses the original comparison, even when the destination
// picker chooses a third folder. Move execution owns its independent snapshots.
async function previewFilteredMove(active,tree,side,paths,value,chooseDirectory=null,{beforeStep}={}){
 if(!Array.isArray(paths))throw Error('Choose move source paths.');paths=[...paths];
 const scope=validateOperationScope(value),token=tree.revision,alignment=tree.alignment,target=side==='a'?'b':'a';
 let counterpartPaths,signature,effective=alignment,namespaceSignature=null;
 const check=async()=>{await tree.checkRevision(token);if(tree.alignment!==alignment)throw Error('Folder alignment changed. Preview again.');};
 const snapshotOptions={includeIgnored:true};
 const snapshotCounterpart=()=>active.roots[target]?active.snapshot(target,counterpartPaths,scope.rules,snapshotOptions):Promise.resolve({entries:new Map(),skipped:0,identity:null});
 const selectSourceEntries=async captured=>{
  await check();const discovered=await discoverOperationAlignment(active,alignment);effective=discovered.alignment;namespaceSignature=discovered.signature;const source=await active.snapshot(side,paths,scope.rules,snapshotOptions);
  const selected=relative=>paths.some(p=>relative===p||relative.startsWith(p+'/'));
  const selectedSnapshot=[...source.entries].filter(([relative])=>selected(relative));
  if(selectedSnapshot.length!==captured.size)throw Error('Move source changed during filter comparison. Preview again.');
  for(const [relative,entry] of selectedSnapshot){const original=captured.get(relative);
   if(!original||original.kind!==entry.kind||original.mode!==entry.mode||(entry.kind==='file'?(original.snapshotRevision!==entry.revision||original.hash!==entry.hash):original.snapshotIdentity!==entry.identity))throw Error('Move source changed during filter comparison. Preview again.');
  }
  counterpartPaths=[...new Set([...captured.keys()].map(relative=>effective.counterpart(side,relative)).filter(relative=>relative!==null))];
  const counterpart=await snapshotCounterpart(),pair={[side]:source,[target]:counterpart};
  for(const mapping of manualPairs(effective))for(const s of ['a','b']){const entry=pair[s].entries.get(mapping[s]);if(entry&&entry.kind!==mapping.kind)throw Error('An aligned entry changed type. Recreate the alignment.');}
  signature=active.signature({a:counterpart,b:counterpart});
  const rows=buildOperationInventory(pair,effective,side,scope.rules),eligible=selectOperationEntries(rows,scope,side),ids=new Set([...eligible.fileIds,...eligible.directoryIds]);
  await validateOperationNamespace(active,alignment,namespaceSignature);await check();return rows.filter(row=>ids.has(row.id)).map(row=>row[side==='a'?'pathA':'pathB']).filter(relative=>captured.has(relative));
 };
 const validateEligibility=async()=>{await check();if(!counterpartPaths||!signature)throw Error('Preview filtered move again.');await validateOperationNamespace(active,alignment,namespaceSignature);const current=await snapshotCounterpart();if(active.signature({a:current,b:current})!==signature)throw Error('Comparison counterpart changed after preview. Preview again.');};
 const result=await previewMove(active,side,paths,chooseDirectory,{...(beforeStep?{beforeStep}:{}),selectSourceEntries,validateEligibility,validateContext:check,targetPath:chooseDirectory?null:(relative)=>{const mapped=effective.counterpart(side,relative);if(mapped===null)throw Error('Cannot move a displaced source entry.');return mapped;}});
 return result;
}
module.exports={previewFilteredMove};
