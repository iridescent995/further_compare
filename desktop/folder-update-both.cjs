'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {constants}=require('node:fs');
const {createHash,randomUUID}=require('node:crypto');
const {FolderService}=require('./folders.cjs');
const {FolderTree}=require('./folder-tree.cjs');
const {validateOperationScope,selectOperationEntries}=require('./folder-operation-scope.cjs');
const {buildOperationInventory}=require('./folder-operation-inventory.cjs');
const {manualPairs}=require('./folder-operation-name-matching.cjs');
const identity=s=>`${s.dev}:${s.ino}`;
const revision=s=>`${identity(s)}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
async function inspect(file){
 const handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{const before=await handle.stat({bigint:true});if(!before.isFile())throw Error('An entry changed type.');const hash=createHash('sha256');for await(const chunk of handle.createReadStream({autoClose:false}))hash.update(chunk);const after=await handle.stat({bigint:true}),current=await fs.lstat(file,{bigint:true});if(current.isSymbolicLink()||revision(before)!==revision(after)||revision(after)!==revision(current))throw Error('File changed while reading.');return {hash:hash.digest('hex'),revision:revision(after)};}finally{await handle.close();}
}
class UpdateBothOperations{
 #service;#tree;#roots;#revision;#alignment;#identities;#plan=null;#busy=false;#effective;
 constructor(service,tree){if(!(service instanceof FolderService)||!(tree instanceof FolderTree))throw TypeError('Choose a native folder service and tree.');this.#service=service;this.#tree=tree;this.#roots={...service.roots};this.#revision=tree.revision;this.#alignment=tree.alignment;}
 async #check(){if(this.#tree.revision!==this.#revision||this.#tree.alignment!==this.#alignment)throw Error('Folder tree changed. Preview again.');const identities={};for(const side of ['a','b']){const root=this.#roots[side];if(!root||this.#service.roots[side]!==root||await fs.realpath(root)!==root)throw Error('Selected roots changed.');const stat=await fs.lstat(root,{bigint:true});if(!stat.isDirectory())throw Error('Selected roots changed.');identities[side]=identity(stat);}if(this.#identities&&JSON.stringify(identities)!==JSON.stringify(this.#identities))throw Error('Selected roots changed.');this.#identities=identities;await this.#tree.checkRevision(this.#revision);}
 async #pair(scope){await this.#check();const pair=await this.#service.pair(null,null,scope.rules);await this.#check();this.#effective=this.#alignment.forSnapshots?this.#alignment.forSnapshots(pair):this.#alignment;for(const mapping of manualPairs(this.#effective))for(const side of ['a','b'])if(this.#service.isIgnoredPath(mapping[side])||(pair[side].entries.has(mapping[side])&&pair[side].entries.get(mapping[side]).kind!==mapping.kind))throw Error('Aligned entry changed type. Recreate alignment.');return pair;}
 async #spelling(side,relative){let current=relative;while(current!=='.'){const parent=path.posix.dirname(current),name=path.posix.basename(current);try{const full=parent==='.'?this.#roots[side]:await this.#service.safe(side,parent);const names=await fs.readdir(full);if(names.some(n=>n!==name&&n.normalize('NFC').toLowerCase()===name.normalize('NFC').toLowerCase()))throw Error('Conflicting filename spelling: '+current);}catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}current=parent;}}
 async preview(selectedRows=null,scope=null,direction='both'){
  if(this.#busy)throw Error('An update operation is already running.');this.#busy=true;this.#plan=null;
  try{
   if(!['both','a-to-b','b-to-a'].includes(direction))throw Error('Invalid update direction.');
   const requestedSource=direction==='both'?null:direction==='a-to-b'?'a':'b';
   scope=validateOperationScope(scope??{});const pair=await this.#pair(scope),rows=buildOperationInventory(pair,this.#effective,'a',scope.rules);
   if(selectedRows!==null&&(!Array.isArray(selectedRows)||!selectedRows.length||selectedRows.length>50000))throw Error('Choose folder rows to update.');
   const rowKey=row=>JSON.stringify([row.pathA,row.pathB,row.kindA,row.kindB]),available=new Set(rows.map(rowKey));
   const selectedPaths={a:new Set(),b:new Set()},selectedDirectories={a:new Set(),b:new Set()};
   if(selectedRows)for(const selected of selectedRows){if(!selected||!available.has(rowKey(selected)))throw Error('Selection changed. Refresh the folder tree.');for(const side of ['a','b']){const relative=selected[side==='a'?'pathA':'pathB'];if(relative!==null){selectedPaths[side].add(relative);if(selected[side==='a'?'kindA':'kindB']==='directory')selectedDirectories[side].add(relative);}}}
   const hasAncestor=(relative,ancestors)=>{if(relative===null)return false;let current=relative;while(current!=='.'){if(ancestors.has(current))return true;current=path.posix.dirname(current);}return false;};
   const chosen=row=>selectedRows===null||['a','b'].some(side=>{const relative=row[side==='a'?'pathA':'pathB'];return selectedPaths[side].has(relative)||hasAncestor(relative,selectedDirectories[side]);});
   const eligibility={a:selectOperationEntries(rows,scope,'a'),b:selectOperationEntries(rows,scope,'b')};
   const operations=[],unresolved=[],directories=new Map(),conflicts=rows.filter(row=>row.kindA&&row.kindB&&row.kindA!==row.kindB);
   const conflictPaths={a:new Set(conflicts.map(row=>row.pathA)),b:new Set(conflicts.map(row=>row.pathB))};
   const blocked=row=>['a','b'].some(side=>hasAncestor(row[side==='a'?'pathA':'pathB'],conflictPaths[side]));
   const addDirectory=(side,relative)=>{let current=relative;while(current!=='.'){const existing=pair[side].entries.get(current);if(existing){if(existing.kind!=='directory')throw Error('Target ancestor is not a directory: '+current);break;}const key=side+':'+current;directories.set(key,{action:'create-folder',path:current,targetSide:side,targetPath:current,sourceSide:null,sourcePath:null,overwrite:false});current=path.posix.dirname(current);}};
   for(const row of rows){if(this.#alignment.mode==='filename'&&row.kindA!=='file'&&row.kindB!=='file')continue;if(!chosen(row)||(requestedSource&&row[requestedSource==='a'?'pathA':'pathB']===null))continue;const eligible=['a','b'].some(side=>eligibility[side].fileIds.has(row.id)||eligibility[side].directoryIds.has(row.id));if(!eligible)continue;
    if(blocked(row)){unresolved.push({path:row.pathA||row.pathB,reason:'File/folder type conflict at this entry or an ancestor.'});continue;}
    const a=row.pathA===null?null:pair.a.entries.get(row.pathA),b=row.pathB===null?null:pair.b.entries.get(row.pathB);
    let sourceSide;if(!a)sourceSide='b';else if(!b)sourceSide='a';else if(a.kind==='directory'||a.hash===b.hash)continue;else{const delta=a.mtimeMs-b.mtimeMs;if(Math.abs(delta)<=scope.rules.timeToleranceMs){unresolved.push({path:row.pathA,reason:'Different contents with indistinguishable modification times.'});continue;}sourceSide=delta>0?'a':'b';}
    if(requestedSource&&sourceSide!==requestedSource)continue;
    const targetSide=sourceSide==='a'?'b':'a',sourcePath=row[sourceSide==='a'?'pathA':'pathB'],source=pair[sourceSide].entries.get(sourcePath),targetPath=this.#effective.counterpart(sourceSide,sourcePath);
    if(targetPath===null){unresolved.push({path:sourcePath,reason:'Displaced alignment endpoint.'});continue;}
    if(!(source.kind==='file'?eligibility[sourceSide].fileIds:eligibility[sourceSide].directoryIds).has(row.id))continue;
    await this.#service.safe(targetSide,targetPath,true);await this.#spelling(targetSide,targetPath);
    if(source.kind==='directory'){addDirectory(targetSide,targetPath);continue;}
    addDirectory(targetSide,path.posix.dirname(targetPath));operations.push({action:'copy',path:targetPath,sourceSide,targetSide,sourcePath,targetPath,overwrite:pair[targetSide].entries.has(targetPath),size:source.size});
   }
   operations.unshift(...[...directories.values()].sort((a,b)=>a.path.split('/').length-b.path.split('/').length||a.path.localeCompare(b.path)));
   const destinations=new Set();for(const op of operations){const key=op.targetSide+':'+op.targetPath.normalize('NFC').toLowerCase();if(destinations.has(key))throw Error('Ambiguous update destination.');destinations.add(key);}
   await this.#check();const result={id:randomUUID(),mode:direction==='both'?'update-both':'update',direction,operations,unresolved,operationScope:scope,treeRevision:this.#revision,alignmentRevision:this.#alignment.revision};this.#plan={result:structuredClone(result),pair,signature:this.#service.signature(pair)};return result;
  }finally{this.#busy=false;}
 }
 async execute(id){
  if(this.#busy)throw Error('An update operation is already running.');if(!this.#plan||this.#plan.result.id!==id)throw Error('Preview the update again.');this.#busy=true;const plan=this.#plan;this.#plan=null;
  try{await this.#check();const result=await this.#tree.withOperation(this.#revision,async()=>{
   if(this.#service.signature(await this.#pair(plan.result.operationScope))!==plan.signature)throw Error('Folders changed after preview. Preview again.');
   const backupRoot=this.#service.backupRoot;if(await fs.realpath(backupRoot)!==backupRoot)throw Error('Backup directory changed.');const backupPath=path.join(backupRoot,new Date().toISOString().replace(/[:.]/g,'-')+'-'+id);await fs.mkdir(backupPath);
   const overwritten=new Set(plan.result.operations.filter(op=>op.overwrite).map(op=>op.targetSide+':'+op.targetPath));
   await fs.writeFile(path.join(backupPath,'manifest.json'),JSON.stringify({mode:plan.result.mode,direction:plan.result.direction,roots:this.#roots,operations:plan.result.operations,originals:Object.fromEntries(['a','b'].map(side=>[side,[...plan.pair[side].entries].filter(([p])=>overwritten.has(side+':'+p))]))},null,2));
   const createdDirectories=new Map();
   const validate=async(side,relative,expected)=>{await this.#check();let ancestor=path.posix.dirname(relative);while(ancestor!=='.'){const original=plan.pair[side].entries.get(ancestor),expectedIdentity=original?.identity??createdDirectories.get(side+':'+ancestor);if(expectedIdentity){const stat=await fs.lstat(await this.#service.safe(side,ancestor),{bigint:true});if(!stat.isDirectory()||identity(stat)!==expectedIdentity)throw Error('Ancestor directory changed during execution.');}ancestor=path.posix.dirname(ancestor);}const full=await this.#service.safe(side,relative,true);if(!expected){try{await fs.lstat(full);throw Error('Target appeared during execution.');}catch(e){if(e.code!=='ENOENT')throw e;}}else if(expected.kind==='file'){if((await inspect(full)).revision!==expected.revision)throw Error('File changed during execution.');}else if(identity(await fs.lstat(full,{bigint:true}))!==expected.identity)throw Error('Directory changed during execution.');return full;};
   for(const op of plan.result.operations.filter(op=>op.overwrite)){const expected=plan.pair[op.targetSide].entries.get(op.targetPath),original=await validate(op.targetSide,op.targetPath,expected),backup=path.join(backupPath,'files',op.targetSide,...op.targetPath.split('/'));await fs.mkdir(path.dirname(backup),{recursive:true});await fs.copyFile(original,backup,constants.COPYFILE_EXCL);if((await inspect(backup)).hash!==expected.hash)throw Error('Target changed while backing up. No changes applied.');}
   let completed=0;try{for(const op of plan.result.operations){const expected=plan.pair[op.targetSide].entries.get(op.targetPath),destination=await validate(op.targetSide,op.targetPath,expected);await this.#spelling(op.targetSide,op.targetPath);
    if(op.action==='create-folder'){await fs.mkdir(destination);createdDirectories.set(op.targetSide+':'+op.targetPath,identity(await fs.lstat(destination,{bigint:true})));}else{const original=plan.pair[op.sourceSide].entries.get(op.sourcePath),source=await validate(op.sourceSide,op.sourcePath,original),temporary=path.join(path.dirname(destination),'.further-'+randomUUID());try{await fs.copyFile(source,temporary,constants.COPYFILE_EXCL);if((await inspect(temporary)).hash!==original.hash)throw Error('Source changed during copy.');await fs.utimes(temporary,original.mtimeMs/1000,original.mtimeMs/1000);await validate(op.sourceSide,op.sourcePath,original);await validate(op.targetSide,op.targetPath,expected);if(op.overwrite)await fs.rename(temporary,destination);else await fs.link(temporary,destination);}finally{await fs.rm(temporary,{force:true});}}
    completed++;
   }}catch(error){throw Error(`${error.message} Stopped after ${completed} operations. Backups: ${backupPath}`);}return {completed,backupPath};
  });return {...result,treeRevision:this.#tree.revision};}finally{this.#busy=false;}
 }
}
module.exports={UpdateBothOperations};
