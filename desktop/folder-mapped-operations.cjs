'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {FolderService} = require('./folders.cjs');
const {FolderTree} = require('./folder-tree.cjs');
const {previewMove:previewMoveTransaction} = require('./folder-move.cjs');
const {projectSnapshot,projectSelectedSnapshot} = require('./folder-projection.cjs');
const {validateOperationScope,selectOperationEntries}=require('./folder-operation-scope.cjs');
const {buildOperationInventory}=require('./folder-operation-inventory.cjs');
const {manualPairs,discoverOperationAlignment,validateOperationNamespace}=require('./folder-operation-name-matching.cjs');

function copyEligibility(pair,alignment,source,scope){const rows=buildOperationInventory(pair,alignment,source,scope.rules),selected=selectOperationEntries(rows,scope,source),ids=new Set([...selected.fileIds,...selected.directoryIds]);return new Set(rows.filter(row=>ids.has(row.id)).map(row=>row[source==='a'?'pathA':'pathB']));}

// Plans use the target's namespace. Only source reads translate through alignment;
// backup manifests and every destination operation retain their actual paths.
class MappedPlanner extends FolderService {
  constructor(service,alignment,source,check) {
    super(service.backupRoot);
    this.roots = Object.freeze({...service.roots});
    this.service = service; this.baseAlignment = alignment; this.alignment = alignment; this.source = source; this.check = check;
  }
  async safe(side,relative,allowMissing=false) {
    await this.check();
    const actual = side === this.source ? this.alignment.counterpart(side === 'a' ? 'b' : 'a',relative) : relative;
    if (actual === null) throw new Error(`This destination belongs to another aligned entry: ${relative}.`);
    const resolved = await this.service.safe(side,actual,allowMissing);
    await this.check();
    return resolved;
  }
  async checkSpelling(side,relative) {
    let current = relative;
    while (current !== '.') {
      const parent = path.posix.dirname(current), name = path.posix.basename(current), folded = name.normalize('NFC').toLowerCase();
      try {
        const directory = await this.service.directoryPath(side,parent === '.' ? '' : parent);
        const names = await fs.readdir(directory);
        if (names.some(entry=>entry !== name && entry.normalize('NFC').toLowerCase() === folded)) throw new Error(`Conflicting filename spelling at ${current}.`);
      } catch (error) { if (!['ENOENT','ENOTDIR'].includes(error.code)) throw error; }
      current = parent;
    }
  }
  signature(pair) { return JSON.stringify([super.signature(pair),pair[this.source].coverage || null,this.alignment.revision,this.copyPaths || null,this.operationScope || null,this.originalSignature || null,this.namespaceSignature || null]); }
  async previewScoped(mode,direction,selectedPaths,scope) {
    this.operationScope=validateOperationScope(scope);
    return super.preview(mode,direction,null);
  }
  rows(pair) {
    // Filename matching compares files across structures. Directories remain in
    // snapshots for validation and required parents, never standalone actions.
    const rows=super.rows(pair).filter(row=>this.alignment.mode!=='filename'||this.copyPaths||row.kind!=='directory');
    if(!this.operationScope||this.copyPaths)return rows;
    const available=new Set(rows.map(row=>row.path));
    if(this.scope&&[...this.scope].some(relative=>!available.has(relative)))throw new Error('Selection changed. Scan again.');
    return rows.filter(row=>(this.scope===null||this.scope.has(row.path))&&this.eligiblePaths.has(row.path));
  }
  async previewCopy(paths,scope=null) {
    this.operationScope=scope===null?null:validateOperationScope(scope);
    this.copyPaths = [...paths];
    const pair = await this.pair();
    this.preparedPair = pair;
    return super.preview('merge',this.source === 'a' ? 'a-to-b' : 'b-to-a',[...pair[this.source].entries.keys()],'copy');
  }
  async pair() {
    await this.check();
    if (this.preparedPair) { const pair = this.preparedPair; this.preparedPair = null; return pair; }
    let pair,projected;
    const discovered=await discoverOperationAlignment(this.service,this.baseAlignment);
    this.alignment=discovered.alignment;this.namespaceSignature=discovered.signature;
    if (this.copyPaths) {
      const target = this.source === 'a' ? 'b' : 'a';
      for (const relative of this.copyPaths) {
        if (this.service.isIgnoredPath(relative)) throw new Error('Cannot copy an excluded entry.');
        await this.service.safe(this.source,relative);
        await this.checkSpelling(this.source,relative);
      }
      const source = await this.service.snapshot(this.source,this.copyPaths,this.operationScope?.rules??null);
      projected = projectSelectedSnapshot(source,this.alignment,this.source,this.copyPaths);
      const targetPaths = [...projected.entries].filter(([,entry])=>!entry.synthetic).map(([relative])=>relative);
      for (const relative of targetPaths) await this.checkSpelling(target,relative);
      pair = {[this.source]:source,[target]:await this.service.snapshot(target,targetPaths,this.operationScope?.rules??null)};
    } else {
      pair = {a:await this.service.snapshot('a',null,this.operationScope?.rules??null),b:await this.service.snapshot('b',null,this.operationScope?.rules??null)};
      projected = projectSnapshot(pair[this.source],this.alignment,this.source);
    }
    // A type change must not silently reinterpret a declared mapping.
    for (const mapping of manualPairs(this.alignment)) for (const side of ['a','b']) {
      const entry = pair[side].entries.get(mapping[side]);
      if (entry && entry.kind !== mapping.kind) throw new Error(`An aligned entry changed type: ${mapping[side]}. Recreate the alignment.`);
      if (this.service.isIgnoredPath(mapping[side])) throw new Error('An alignment points into an excluded folder.');
    }
    if(this.subtreeRoots){
      const paths=new Set([...projected.entries.keys(),...pair[this.source==='a'?'b':'a'].entries.keys()]);
      const roots=new Set(this.subtreeRoots);
      this.scope=new Set(roots);
      for(const relative of paths){let parent=relative;while(parent.includes('/')){parent=parent.slice(0,parent.lastIndexOf('/'));if(roots.has(parent)){this.scope.add(relative);break;}}}
    }
    const selected = relative => this.scope === null || this.scope.has(relative);
    const reserved = projected.reserved.filter(relative=>this.alignment.mode!=='filename'||pair[this.source].entries.get(relative)?.kind==='file');
    if ((!this.operationScope||this.copyPaths) && this.scope === null && reserved.length) throw new Error(`Resolve displaced source entries before applying the whole folder: ${reserved[0]}.`);
    const target = this.source === 'a' ? 'b' : 'a';
    if ((!this.operationScope||this.copyPaths) && this.mode === 'sync') for (const relative of pair[target].entries.keys()) {
      if(this.alignment.mode==='filename'&&pair[target].entries.get(relative).kind==='directory')continue;
      if (selected(relative) && this.alignment.counterpart(target,relative) === null) throw new Error(`Sync cannot delete a reserved alignment counterpart: ${relative}.`);
    }
    if(this.operationScope&&!this.copyPaths){
      // Eligibility uses actual paths and both original endpoints. Keep complete
      // snapshots so an excluded source never becomes a sync deletion candidate.
      this.originalSignature=super.signature(pair);
      const rows=buildOperationInventory(pair,this.alignment,this.source,this.operationScope.rules);
      const sourceSelection=selectOperationEntries(rows,this.operationScope,this.source);
      const targetSelection=selectOperationEntries(rows,this.operationScope,target);
      this.eligiblePaths=new Set();
      for(const row of rows){
        if(this.alignment.mode==='filename'&&row.kindA!=='file'&&row.kindB!=='file')continue;
        const sourcePath=row[this.source==='a'?'pathA':'pathB'];
        const targetPath=row[target==='a'?'pathA':'pathB'];
        if(sourcePath!==null){
          const mapped=this.alignment.counterpart(this.source,sourcePath);
          if(sourceSelection.fileIds.has(row.id)||sourceSelection.directoryIds.has(row.id)){
            if(mapped===null&&this.scope===null)throw new Error(`Resolve displaced source entries before applying the whole folder: ${sourcePath}.`);
            if(mapped!==null)this.eligiblePaths.add(mapped);
          }
        }else if(targetPath!==null&&!projected.entries.has(targetPath)&&(targetSelection.fileIds.has(row.id)||targetSelection.removableDirectoryIds.has(row.id)))this.eligiblePaths.add(targetPath);
      }
      if(this.mode==='sync')for(const relative of this.eligiblePaths){
        if(selected(relative)&&this.alignment.counterpart(target,relative)===null)throw new Error(`Sync cannot delete a reserved alignment counterpart: ${relative}.`);
      }
    }
    if(this.operationScope&&this.copyPaths){
      const eligible=copyEligibility(pair,this.alignment,this.source,this.operationScope),entries=new Map([...projected.entries].filter(([,entry])=>!entry.synthetic&&eligible.has(entry.sourcePath)));
      for(const relative of [...entries.keys()]){let parent=path.posix.dirname(relative);while(parent!=='.'){if(!entries.has(parent))entries.set(parent,projected.entries.get(parent));parent=path.posix.dirname(parent);}}
      projected={...projected,entries};
    }
    await validateOperationNamespace(this.service,this.baseAlignment,this.namespaceSignature);
    pair[this.source] = projected;
    await this.check();
    return pair;
  }
}
class MappedFolderOperations {
  #service; #tree; #revision; #alignment; #roots; #identities = null; #planner = null; #busy = false;
  constructor(service,tree) {
    if (!(service instanceof FolderService) || !(tree instanceof FolderTree)) throw new TypeError('Choose a native folder service and tree.');
    this.#service = service; this.#tree = tree; this.#revision = tree.revision; this.#alignment = tree.alignment;
    this.#roots = Object.freeze({...service.roots});
  }
  async #check() {
    if (this.#tree.revision !== this.#revision || this.#tree.alignment !== this.#alignment) throw new Error('Folder alignment changed. Preview again.');
    const identities = {};
    for (const side of ['a','b']) {
      const root = this.#roots[side];
      if (!root || this.#service.roots[side] !== root) throw new Error('Selected roots changed. Preview again.');
      const stat = await fs.lstat(root,{bigint:true});
      if (!stat.isDirectory() || await fs.realpath(root) !== root) throw new Error('Selected roots changed. Preview again.');
      identities[side] = `${stat.dev}:${stat.ino}`;
    }
    if (this.#identities && JSON.stringify(this.#identities) !== JSON.stringify(identities)) throw new Error('Selected roots changed. Preview again.');
    if (['a','b'].some(side=>this.#service.roots[side] !== this.#roots[side])) throw new Error('Selected roots changed. Preview again.');
    this.#identities ||= identities;
    if (this.#tree.revision !== this.#revision) throw new Error('Folder alignment changed. Preview again.');
  }
  async previewMove(side,sourcePaths) {
    if (this.#busy) throw new Error('A mapped folder operation is already running.');
    if (!['a','b'].includes(side) || !Array.isArray(sourcePaths)) throw new Error('Choose source entries to move.');
    this.#busy = true; this.#planner = null;
    try {
      await this.#check();
      const discovered=await discoverOperationAlignment(this.#service,this.#alignment),effective=discovered.alignment;
      const kinds = new Map(manualPairs(effective).map(pair=>[pair[side],pair.kind]));
      const moved = await previewMoveTransaction(this.#service,side,[...sourcePaths],null,{
        targetPath:(relative,kind)=>{
          if (kinds.has(relative) && kinds.get(relative) !== kind) throw new Error('An aligned entry changed type. Recreate the alignment.');
          const target = effective.counterpart(side,relative);
          if (target === null) throw new Error(`Cannot move a displaced source entry: ${relative}.`);
          return target;
        },
        validateContext:()=>this.#check(),
        validateEligibility:()=>validateOperationNamespace(this.#service,this.#alignment,discovered.signature)
      });
      await validateOperationNamespace(this.#service,this.#alignment,discovered.signature);
      await this.#check(); this.#planner = moved.service;
      return structuredClone({...moved.preview,source:moved.source,destination:moved.destination,alignmentRevision:this.#alignment.revision,treeRevision:this.#revision});
    } finally { this.#busy = false; }
  }
  async previewCopy(side,sourcePaths,scope=null) {
    if (!['a','b'].includes(side) || !Array.isArray(sourcePaths) || !sourcePaths.length || sourcePaths.length > 50000 || sourcePaths.some(p=>typeof p !== 'string' || !p)) throw new Error('Choose source entries to copy.');
    return this.#preview('merge',side === 'a' ? 'a-to-b' : 'b-to-a',null,[...new Set(sourcePaths)],scope);
  }
  async preview(mode,direction,selectedTargetPaths=null,scope=null,subtrees=false) { if(typeof subtrees!=='boolean'||(subtrees&&(!selectedTargetPaths||!selectedTargetPaths.length)))throw Error('Choose selected entries to mirror.');return this.#preview(mode,direction,selectedTargetPaths,null,subtrees?(scope??{}):scope,subtrees); }
  async #preview(mode,direction,selectedTargetPaths=null,copyPaths=null,operationScope=null,subtrees=false) {
    if (this.#busy) throw new Error('A mapped folder operation is already running.');
    if (!['merge','sync'].includes(mode) || !['a-to-b','b-to-a'].includes(direction)) throw new Error('Invalid mapped folder operation.');
    if (selectedTargetPaths !== null && (!Array.isArray(selectedTargetPaths) || selectedTargetPaths.some(p=>typeof p !== 'string' || !p))) throw new Error('Choose valid target paths.');
    this.#busy = true; this.#planner = null;
    try {
      await this.#check();
      const source = direction === 'a-to-b' ? 'a' : 'b';
      const planner = new MappedPlanner(this.#service,this.#alignment,source,()=>this.#check());
      if(subtrees)planner.subtreeRoots=[...selectedTargetPaths];
      planner.mode = mode; planner.scope = selectedTargetPaths === null ? null : new Set(selectedTargetPaths);
      const result = copyPaths ? await planner.previewCopy(copyPaths,operationScope) : operationScope!==null ? await planner.previewScoped(mode,direction,selectedTargetPaths,operationScope) : await planner.preview(mode,direction,selectedTargetPaths === null ? null : [...selectedTargetPaths]);
      for (const op of result.operations) {
        op.targetPath = op.path;
        op.sourcePath = op.action === 'copy' ? planner.alignment.counterpart(source === 'a' ? 'b' : 'a',op.path) : null;
      }
      await this.#check(); this.#planner = planner;
      return structuredClone({...result,...(operationScope!==null?{operationScope:planner.operationScope}:{}),alignmentRevision:this.#alignment.revision,treeRevision:this.#revision});
    } finally { this.#busy = false; }
  }
  async execute(id) {
    if (this.#busy) throw new Error('A mapped folder operation is already running.');
    if (!this.#planner) throw new Error('Preview the mapped operation again.');
    this.#busy = true;
    const planner = this.#planner; this.#planner = null;
    try { await this.#check(); const result = await this.#tree.withOperation(this.#revision,()=>planner.execute(id)); return {...result,treeRevision:this.#tree.revision}; }
    finally { this.#busy = false; }
  }
}
module.exports = {MappedFolderOperations};
