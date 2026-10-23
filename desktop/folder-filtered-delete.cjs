'use strict';
const {FolderService}=require('./folders.cjs');
const {FolderTree}=require('./folder-tree.cjs');
const {validateOperationScope,selectOperationEntries}=require('./folder-operation-scope.cjs');
const {buildOperationInventory}=require('./folder-operation-inventory.cjs');
const {manualPairs,discoverOperationAlignment,validateOperationNamespace}=require('./folder-operation-name-matching.cjs');

function eligiblePaths(pair,alignment,side,scope){
  const rows=buildOperationInventory(pair,alignment,side,scope.rules),selection=selectOperationEntries(rows,scope,side),key=side==='a'?'pathA':'pathB';
  return {files:new Set(rows.filter(row=>selection.fileIds.has(row.id)).map(row=>row[key])),directories:new Set(rows.filter(row=>selection.removableDirectoryIds.has(row.id)).map(row=>row[key]))};
}

async function previewFilteredDelete(active,tree,side,paths,value){
  if(!(active instanceof FolderService)||!(tree instanceof FolderTree)||!['a','b'].includes(side)||!Array.isArray(paths)||!paths.length||paths.length>50000||paths.some(p=>typeof p!=='string'||!p))throw Error('Choose valid entries to delete.');
  const scope=validateOperationScope(value),selected=[...new Set(paths)],revision=tree.revision,alignment=tree.alignment,roots={...active.roots},other=side==='a'?'b':'a';
  const check=async()=>{await tree.checkRevision(revision);if(tree.alignment!==alignment||['a','b'].some(s=>active.roots[s]!==roots[s]))throw Error('Folder selection changed. Preview again.');};
  class DeletePlanner extends FolderService{
    constructor(){super(active.backupRoot);this.roots=Object.freeze({...roots});}
    async safe(s,relative,allowMissing=false){await check();const full=await active.safe(s,relative,allowMissing);await check();return full;}
    async pair(){
      await check();
      const discovered=await discoverOperationAlignment(active,alignment),effective=discovered.alignment;this.namespaceSignature=discovered.signature;
      const source=await active.snapshot(side,selected,scope.rules),targetPaths=[];
      for(const relative of source.entries.keys())if(selected.some(p=>relative===p||relative.startsWith(p+'/'))){const mapped=effective.counterpart(side,relative);if(mapped!==null)targetPaths.push(mapped);}
      const target=roots[other]?await active.snapshot(other,targetPaths,scope.rules):{entries:new Map(),skipped:0,identity:null},pair={[side]:source,[other]:target};
      for(const mapping of manualPairs(effective))for(const s of ['a','b']){const entry=pair[s].entries.get(mapping[s]);if(entry&&entry.kind!==mapping.kind)throw Error('An aligned entry changed type. Recreate the alignment.');}
      this.eligible=eligiblePaths(pair,effective,side,scope);await validateOperationNamespace(active,alignment,this.namespaceSignature);await check();return discovered.signature===null?pair:{...pair,[other]:{entries:new Map(),skipped:0,identity:target.identity},comparisonTarget:target};
    }
    signature(pair){return JSON.stringify([super.signature(pair),scope,alignment.revision,selected,this.namespaceSignature,pair.comparisonTarget&&[...pair.comparisonTarget.entries]]);}
  }
  await check();for(const relative of selected)await active.safe(side,relative);
  const planner=new DeletePlanner(),preview=await planner.previewAction('delete',side,selected),plan=planner.plans.get(preview.id);
  // Prune the stored transaction, not only its displayed preview. Its captured
  // snapshots remain complete, including excluded source and counterpart files.
  plan.operations=plan.operations.filter(op=>(op.action==='delete-folder'?planner.eligible.directories:planner.eligible.files).has(op.path));
  await check();
  return {preview:structuredClone({...preview,operations:plan.operations,treeRevision:revision,alignmentRevision:alignment.revision}),service:{execute:async id=>{await check();const result=await tree.withOperation(revision,()=>planner.execute(id));return {...result,treeRevision:tree.revision};}}};
}
module.exports={previewFilteredDelete};
