'use strict';
const path=require('node:path');
const {FolderService}=require('./folders.cjs');
const {FolderTree}=require('./folder-tree.cjs');
const {validateOperationScope,selectOperationEntries}=require('./folder-operation-scope.cjs');
const {buildOperationInventory}=require('./folder-operation-inventory.cjs');
const {manualPairs,discoverOperationAlignment,validateOperationNamespace}=require('./folder-operation-name-matching.cjs');
async function previewFilteredCopyToFolder(active,tree,side,paths,value,chooseDirectory){
 if(!(active instanceof FolderService)||!(tree instanceof FolderTree)||!['a','b'].includes(side)||!Array.isArray(paths)||!paths.length||paths.length>1000||new Set(paths).size!==paths.length||paths.some(p=>typeof p!=='string'||!p||p.length>32768)||typeof chooseDirectory!=='function')throw Error('Choose valid entries and a destination folder.');
 const scope=validateOperationScope(value),selected=[...paths],token=tree.revision,alignment=tree.alignment,roots={...active.roots},other=side==='a'?'b':'a';
 const check=async()=>{await tree.checkRevision(token);if(tree.alignment!==alignment||['a','b'].some(s=>active.roots[s]!==roots[s]))throw Error('Folder selection changed. Preview again.');};
 await check();for(const relative of selected)await active.safe(side,relative);
 const destination=await chooseDirectory();if(!destination)return null;await check();
 class CopyPlanner extends FolderService{
  async safe(s,relative,allowMissing=false){await check();const full=await super.safe(s,relative,allowMissing);await check();return full;}
  async pair(){
   await check();if(this.prepared){const pair=this.prepared;this.prepared=null;return pair;}
   const discovered=await discoverOperationAlignment(active,alignment),effective=discovered.alignment;this.namespaceSignature=discovered.signature;
   const source=await active.snapshot(side,selected,scope.rules),targetPaths=[];
   if(selected.some(relative=>!source.entries.has(relative)))throw Error('Selected source entry is missing or excluded. Preview again.');
   const isSelected=relative=>selected.some(p=>relative===p||relative.startsWith(p+'/'));
   for(const relative of source.entries.keys())if(isSelected(relative)){const mapped=effective.counterpart(side,relative);if(mapped!==null)targetPaths.push(mapped);}
   const counterpart=roots[other]?await active.snapshot(other,targetPaths,scope.rules):{entries:new Map(),skipped:0,identity:null},original={[side]:source,[other]:counterpart};
   for(const mapping of manualPairs(effective))for(const s of ['a','b']){const entry=original[s].entries.get(mapping[s]);if(entry&&entry.kind!==mapping.kind)throw Error('An aligned entry changed type. Recreate the alignment.');}
   const rows=buildOperationInventory(original,effective,side,scope.rules),eligible=selectOperationEntries(rows,scope,side),ids=new Set([...eligible.fileIds,...eligible.directoryIds]),key=side==='a'?'pathA':'pathB';
   const entries=new Map(rows.filter(row=>ids.has(row.id)&&isSelected(row[key])).map(row=>[row[key],source.entries.get(row[key])]));
   for(const relative of [...entries.keys()]){let parent=path.posix.dirname(relative);while(parent!=='.'){entries.set(parent,source.entries.get(parent));parent=path.posix.dirname(parent);}}
   const external=await this.snapshot('b',selected,scope.rules);await validateOperationNamespace(active,alignment,this.namespaceSignature);await check();
   return {a:{...source,entries,coverage:[...source.entries]},b:external,counterpart};
  }
  signature(pair){return JSON.stringify([super.signature(pair),pair.a.coverage,[...pair.counterpart.entries],pair.counterpart.identity,scope,alignment.revision,this.namespaceSignature]);}
 }
 const planner=new CopyPlanner(active.backupRoot);await planner.select('a',roots[side]);await planner.select('b',destination);await check();
 const pair=await planner.pair();planner.prepared=pair;
 // Filter the source used by the actual planner, retaining complete original
 // snapshots separately for execution checks. No displayed-plan-only filtering.
 const preview=await planner.preview('merge','a-to-b',[...pair.a.entries.keys()],'copy');await check();
 return {source:planner.roots.a,destination:planner.roots.b,preview:structuredClone({...preview,treeRevision:token,alignmentRevision:alignment.revision}),service:{execute:async id=>{await check();const result=await planner.execute(id);return {...result,treeRevision:tree.revision};}}};
}
module.exports={previewFilteredCopyToFolder};
