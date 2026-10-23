'use strict';
const path = require('node:path');
const {createHash,randomUUID} = require('node:crypto');
const {FolderAlignment} = require('./folder-alignment.cjs');
const {buildPathNameMatching,validateFolderNameRules}=require('./folder-name-matching.cjs');
const {validateFolderRules} = require('./folder-rules.cjs');
const {scanFilenameInventory}=require('./folder-filename-inventory.cjs');
const {buildFilenameMatching}=require('./folder-filename-matching.cjs');
const {assertMetadataPlatform,applyMetadataComparison}=require('./folder-metadata-comparison.cjs');
const {checkSignal}=require('./local-folder-reader.cjs');
const sides = ['a','b'];
class FolderTree {
  #nameRules; #nameInventory={a:{entries:new Map()},b:{entries:new Map()}};
  #service; #alignment; #manualAlignment; #matchingMode='path'; #filenameReady=false; #filenameDiagnostics=null; #filenameSkipped=0; #explicitKinds; #roots = null; #invalidRoots = false;
  #disposed=false;
  #operation = null; #requests = new Map(); #activeRequests = new Map(); #generation = 0; #revision = randomUUID(); #registry = new Map(); #children = new Map(); #owners = {a:new Map(),b:new Map()};
  constructor(service,alignment = new FolderAlignment(),nameRules = {}) {
    if (!service || typeof service.inspectRoot !== 'function' || typeof service.inspectEntry !== 'function' || typeof service.listDirectoryPair !== 'function' || typeof service.compareFilePairs !== 'function') throw new TypeError('Choose a folder service.');
    if (!(alignment instanceof FolderAlignment)) throw new TypeError('Choose a folder alignment model.');
    this.#nameRules=validateFolderNameRules(nameRules);
    this.#service = service; this.#alignment = alignment; this.#manualAlignment = alignment;
    this.#explicitKinds = new Map(alignment.pairs.map(pair=>[JSON.stringify([pair.a,pair.b]),pair.kind]));
    this.#resetNameMatching();
  }
  get revision() { return this.#revision; }
  get alignment() { return this.#alignment; }
  get manualAlignment() { return this.#manualAlignment; }
  get matchingMode() { return this.#matchingMode; }
  get nameRules() { return this.#nameRules; }
  #nameMatchingEnabled() { return this.#matchingMode==='path'&&Object.keys(this.#nameRules).length>0; }
  #resetNameMatching() {
    this.#nameInventory={a:{entries:new Map()},b:{entries:new Map()}};
    if(this.#matchingMode==='path')this.#alignment=this.#nameMatchingEnabled()?buildPathNameMatching(this.#nameInventory,this.#manualAlignment,this.#nameRules):this.#manualAlignment;
  }
  async setNameRules(value) {
    const rules=validateFolderNameRules(value);this.#assertUnlocked();const generation=await this.#begin();await this.#finish(generation);this.#assertUnlocked();
    if(JSON.stringify(rules)!==JSON.stringify(this.#nameRules)){this.#nameRules=rules;if(this.#matchingMode==='path')this.#clear();else this.#revision=randomUUID();}
    return {revision:this.#revision,nameRules:this.#nameRules,alignmentRevision:this.#alignment.revision,pairs:this.#manualAlignment.pairs};
  }
  #stageNameMatching(nodes,listed) {
    const previous=this.#alignment,inventory={a:{entries:new Map(this.#nameInventory.a.entries)},b:{entries:new Map(this.#nameInventory.b.entries)}};
    for(const side of sides){
      const parent=nodes[side];if(parent===null)continue;
      const observed=new Map();for(const row of listed.rows){const name=row[side==='a'?'pathA':'pathB'];if(name!==null)observed.set(name,{kind:row[side==='a'?'kindA':'kindB']||row.kind});}
      const entries=inventory[side].entries;
      // Replace just this immediate namespace; keep already opened descendants
      // only while their actual parent entry remains present with the same type.
      const oldChildren=[...entries.keys()].filter(name=>(path.posix.dirname(name)==='.'?'':path.posix.dirname(name))===parent);
      for(const name of oldChildren)if(!observed.has(name)||observed.get(name).kind!==entries.get(name).kind)for(const existing of [...entries.keys()])if(existing===name||existing.startsWith(name+'/'))entries.delete(existing);
      for(const [name,entry]of observed)entries.set(name,entry);
    }
    const model=buildPathNameMatching(inventory,this.#manualAlignment,this.#nameRules);
    return {previous,inventory,alignment:model.revision===previous.revision?previous:model};
  }
  #cancelRequests() { for(const request of this.#requests.values())request.abort();this.#requests.clear(); }
  dispose() { if(!this.#disposed){this.#disposed=true;this.#clear();} }
  #clear() { this.#cancelRequests();this.#resetNameMatching(); this.#filenameReady=false; this.#requests.clear(); this.#generation++; this.#revision = randomUUID(); this.#registry.clear(); this.#children.clear(); this.#owners.a.clear(); this.#owners.b.clear(); }
  #assertGeneration(generation) { if (generation !== this.#generation) throw new Error('Folder tree changed. Refresh and try again.'); }
  async #checkRoots(options={}) {
    checkSignal(options.signal);
    if(this.#disposed)throw Error('Folder tree is disposed.');
    if (this.#invalidRoots) throw new Error('A selected root changed. Create a new folder tree.');
    const current = {};
    try {
      for (const side of sides) {
        const root = await this.#service.inspectRoot(side,options);
        checkSignal(options.signal);
        current[side] = root===null?null:{path:root.path,identity:root.identity};
      }
      if (this.#roots && JSON.stringify(this.#roots) !== JSON.stringify(current)) throw new Error('A selected root changed.');
      if (!this.#roots) this.#roots = current;
    } catch (error) {
      if(options.signal?.aborted)throw error;
      this.#invalidRoots = true; this.#clear();
      throw new Error('A selected root changed. Create a new folder tree.',{cause:error});
    }
  }
  async #begin(options={}) { const generation = this.#generation; await this.#checkRoots(options);checkSignal(options.signal); this.#assertGeneration(generation); return generation; }
  async #finish(generation,options={}) { await this.#checkRoots(options);checkSignal(options.signal); this.#assertGeneration(generation); }
  #assertUnlocked() { if (this.#operation) throw new Error('Wait for the current folder operation before changing the tree.'); }
  async withOperation(revisionToken,operation,options={}) {
    this.#assertUnlocked();
    if (typeof operation !== 'function' || revisionToken !== this.#revision) throw new Error('Folder tree revision changed. Preview again.');
    const generation=this.#generation,lock = Symbol(); this.#operation = lock;
    try {
      if(options.drainReads){
        // Aborting an SFTP request closes its shared transport. Let existing
        // reads settle before mutation instead, while refusing new requests.
        checkSignal(options.signal);const pending=Promise.all([...this.#activeRequests.values()].map(request=>request.done));
        if(options.signal)await new Promise((resolve,reject)=>{const abort=()=>{try{checkSignal(options.signal);}catch(error){reject(error);}};options.signal.addEventListener('abort',abort,{once:true});pending.then(resolve,reject).finally(()=>options.signal.removeEventListener('abort',abort));if(options.signal.aborted)abort();});else await pending;
        checkSignal(options.signal);this.#assertGeneration(generation);if(revisionToken!==this.#revision)throw Error('Folder tree revision changed. Preview again.');
      }else this.#cancelRequests();
      await this.#begin({signal:options.signal}); return await operation();
    }
    finally { if (this.#operation === lock) { this.#clear(); this.#operation = null; } }
  }
  async refresh() { this.#assertUnlocked();this.#cancelRequests();if(this.#matchingMode==='filename')return this.setMatchingMode('filename');this.#assertUnlocked(); await this.#begin(); this.#assertUnlocked(); this.#clear(); return {revision:this.#revision}; }
  async #entry(side,relative,options={}) {
    checkSignal(options.signal);return this.#service.inspectEntry(side,relative,options);
  }
  async #stageFilename(model,generation,options={}) {
    const cancelled=()=>{if(options.signal?.aborted||options.isCancelled?.()){const error=Error('Filename matching scan cancelled.');error.code='ABORT_ERR';throw error;}};
    const inventory=await scanFilenameInventory(this.#service,options);cancelled();
    const alignment=buildFilenameMatching(inventory,model),explicitKinds=new Map(alignment.pairs.map(pair=>[JSON.stringify([pair.a,pair.b]),pair.kind])),staged=[];
    for(const row of alignment.rows){
      cancelled();const expected={a:row.pathA??alignment.counterpart('b',row.pathB),b:row.pathB??alignment.counterpart('a',row.pathA)},entries={};
      for(const side of sides){
        const actual=side==='a'?row.pathA:row.pathB,current=await this.#entry(side,expected[side],options);
        if(actual===null?current!==null:!current||current.stamp!==inventory[side].entries.get(actual)?.stamp||current.identity!==inventory[side].entries.get(actual)?.identity)throw Error('Folder entries changed after filename scanning. Refresh and try again.');
        entries[side]=current;
      }
      explicitKinds.set(JSON.stringify([expected.a,expected.b]),'file');
      staged.push(this.#row(expected,entries,'root',alignment,explicitKinds));
    }
    // Recheck the complete inventory, including directories: file-only flat rows
    // must not overlook additions or replacements after metadata scanning ends.
    for(const side of sides){
      for(const [relative,entry]of inventory[side].entries){cancelled();const current=await this.#entry(side,relative,options);if(current?.stamp!==entry.stamp||current?.identity!==entry.identity)throw Error('Folder entries changed after filename scanning. Refresh and try again.');}
      if(this.#service.roots[side]){const current=await this.#service.inspectRoot(side,options);if(current?.stamp!==inventory[side].rootStamp||current?.identity!==inventory[side].identity)throw Error('Folder root changed after filename scanning. Refresh and try again.');}
    }
    await this.#finish(generation,options);this.#assertUnlocked();cancelled();
    return {alignment,explicitKinds,staged,skipped:inventory.a.skipped+inventory.b.skipped,generation,scan:{nodes:inventory.nodes,entries:inventory.entries,inspected:inventory.inspected}};
  }
  #commitFilename(manual,prepared) {
    this.#assertGeneration(prepared.generation);this.#assertUnlocked();
    this.#manualAlignment=manual;this.#alignment=prepared.alignment;this.#explicitKinds=prepared.explicitKinds;this.#matchingMode='filename';this.#clear();this.#filenameReady=true;
    this.#filenameDiagnostics=prepared.alignment.diagnostics;this.#filenameSkipped=prepared.skipped;
    return {...this.#commit('root',prepared.staged,prepared.skipped),matchingMode:'filename',diagnostics:this.#filenameDiagnostics,scan:prepared.scan,alignmentRevision:prepared.alignment.revision,pairs:manual.pairs};
  }
  async setMatchingMode(mode,options={}) {
    if(!['path','filename'].includes(mode)||!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['isCancelled','onProgress','signal'].includes(key))||(options.isCancelled!==undefined&&typeof options.isCancelled!=='function')||(options.onProgress!==undefined&&typeof options.onProgress!=='function'))throw Error('Choose a valid filename matching mode and scan options.');
    this.#assertUnlocked();const generation=await this.#begin(options);
    if(mode==='filename')return this.#commitFilename(this.#manualAlignment,await this.#stageFilename(this.#manualAlignment,generation,options));
    if(options.signal?.aborted||options.isCancelled?.()){const error=Error('Filename matching scan cancelled.');error.code='ABORT_ERR';throw error;}
    await this.#finish(generation,options);this.#assertUnlocked();this.#alignment=this.#manualAlignment;this.#explicitKinds=new Map(this.#alignment.pairs.map(pair=>[JSON.stringify([pair.a,pair.b]),pair.kind]));this.#matchingMode='path';this.#filenameDiagnostics=null;this.#filenameSkipped=0;this.#clear();
    return {revision:this.#revision,nodeId:'root',rows:[],skipped:0,removedIds:[],matchingMode:'path',alignmentRevision:this.#alignment.revision,pairs:this.#manualAlignment.pairs};
  }
  async #loadFilename(nodeId,generation,options={}) {
    if(nodeId!=='root')throw Error('Filename matching uses a flat file list.');
    if(!this.#filenameReady)throw Error('Refresh filename matching after changing folders.');
    const originals=[...(this.#children.get('root')||[])].map(id=>this.#registry.get(id)),staged=[];
    for(const record of originals)staged.push(await this.#updatedParent(record,options));
    await this.#finish(generation,options);
    for(const record of originals)if(this.#registry.get(record.row.id)!==record)throw Error('Folder row changed while listing. Refresh the tree.');
    return {staged,skipped:this.#filenameSkipped};
  }
  async setAlignment(pairs) {
    this.#assertUnlocked();
    const generation = await this.#begin(), model = new FolderAlignment(pairs), used = {a:new Set(),b:new Set()}, checked = [];
    for (const pair of model.pairs) for (const side of sides) {
      const entry = await this.#entry(side,pair[side]);
      if (!entry || entry.kind !== pair.kind) throw new Error('Alignment endpoints must exist with matching regular entry types.');
      if (used[side].has(entry.identity)) throw new Error('Alignment endpoints must identify unique physical entries on each side.');
      used[side].add(entry.identity); checked.push({side,entry});
    }
    for (const {side,entry} of checked) if ((await this.#entry(side,entry.path))?.stamp !== entry.stamp) throw new Error('An alignment endpoint changed while pairing.');
    await this.#finish(generation);
    this.#assertUnlocked();
    if(this.#matchingMode==='filename')return this.#commitFilename(model,await this.#stageFilename(model,generation));
    this.#manualAlignment=model;this.#alignment = model; this.#explicitKinds = new Map(model.pairs.map(pair=>[JSON.stringify([pair.a,pair.b]),pair.kind])); this.#clear();
    return {revision:this.#revision,alignmentRevision:model.revision,pairs:model.pairs};
  }
  async #validate(record,fullRevision = true,options={}) {
    for (const side of sides) {
      const expected = record.entries[side];
      if (!expected) {
        if (record.expected[side] !== null && await this.#entry(side,record.expected[side],options)) throw new Error('A missing counterpart appeared. Refresh the folder tree.');
        continue;
      }
      const current = await this.#entry(side,expected.path,options);
      if (!current || (fullRevision ? current.stamp !== expected.stamp : current.identity !== expected.identity || current.kind !== expected.kind)) throw new Error('A folder entry changed. Refresh the folder tree.');
    }
  }
  #evict(id,removed) {
    this.#requests.get(id)?.abort();this.#requests.delete(id);
    for (const child of [...(this.#children.get(id) || [])]) this.#evict(child,removed);
    this.#children.delete(id);
    const record = this.#registry.get(id);
    if (record) {
      for (const side of sides) if (record.entries[side] && this.#owners[side].get(record.entries[side].path) === id) this.#owners[side].delete(record.entries[side].path);
      this.#children.get(record.row.parentId)?.delete(id);
      this.#registry.delete(id); removed.add(id);
    }
  }
  #row(expected,entries,parentId,alignment=this.#alignment,explicitKinds=this.#explicitKinds) {
    const a = entries.a, b = entries.b, expectedKind = explicitKinds.get(JSON.stringify([expected.a,expected.b]));
    const alignmentConflict = !!expectedKind && [a,b].some(entry=>entry && entry.kind !== expectedKind);
    const conflict = alignmentConflict || a && b && a.kind !== b.kind;
    const logicalRevision=this.#nameMatchingEnabled()?JSON.stringify([this.#manualAlignment.revision,this.#nameRules]):alignment.revision;
    const id = createHash('sha256').update(JSON.stringify([logicalRevision,expected.a,expected.b])).digest('hex');
    const row = {id,parentId,alignmentRevision:alignment.revision,alignmentConflict,pathA:a?.path??null,pathB:b?.path??null,
      nameA:a?path.posix.basename(a.path):null,nameB:b?path.posix.basename(b.path):null,
      kind:conflict?'conflict':(a||b).kind,kindA:a?.kind??null,kindB:b?.kind??null,
      sizeA:a?.size??null,sizeB:b?.size??null,mtimeA:a?.mtime??null,mtimeB:b?.mtime??null,
      versionA:a?createHash('sha256').update(a.stamp).digest('hex'):null,versionB:b?createHash('sha256').update(b.stamp).digest('hex'):null,
      status:conflict?'conflict':!a?'right':!b?'left':a.kind==='directory'?'directory':a.size!==b.size?'different':'unchecked'};
    return {row,expected,entries};
  }
  async #load(nodeId,generation,options={}) {
    if(this.#matchingMode==='filename')return this.#loadFilename(nodeId,generation,options);
    let node = null, nodes;
    if (nodeId === 'root') nodes = {a:this.#service.roots.a?'':null,b:this.#service.roots.b?'':null};
    else {
      node = this.#registry.get(nodeId);
      if (!node) throw new Error('Load this folder node before expanding it.');
      if (node.row.alignmentConflict) throw new Error('An aligned entry changed type. Remove or recreate this alignment before expanding it.');
      await this.#validate(node,false,options);
      nodes = {a:node.entries.a?.kind==='directory'?node.entries.a.path:null,b:node.entries.b?.kind==='directory'?node.entries.b.path:null};
    }
    if (nodes.a === null && nodes.b === null) throw new Error('Choose a directory node to list.');
    const listed = await this.#service.listDirectoryPair(nodes,options), staged = [], usedRight = new Set();
    this.#assertGeneration(generation);
    const nameMatching=this.#nameMatchingEnabled()?this.#stageNameMatching(nodes,listed):null;
    const alignment=nameMatching?.alignment||this.#alignment;
    for (const child of listed.rows) if (child.pathA !== null) {
      const a = await this.#entry('a',child.pathA,options); if (!a) continue;
      const expectedB = alignment.counterpart('a',a.path), b = await this.#entry('b',expectedB,options);
      if (b) usedRight.add(b.path);
      staged.push(this.#row({a:a.path,b:expectedB},{a,b},nodeId,alignment));
    }
    for (const child of listed.rows) if (child.pathB !== null && !usedRight.has(child.pathB)) {
      const b = await this.#entry('b',child.pathB,options); if (!b) continue;
      const expectedA = alignment.counterpart('b',b.path), a = await this.#entry('a',expectedA,options);
      if (a) continue; // This pair belongs at its left endpoint's logical parent.
      staged.push(this.#row({a:expectedA,b:b.path},{a:null,b},nodeId,alignment));
    }
    for (const record of staged) await this.#validate(record,true,options);
    if (node) await this.#validate(node,false,options);
    await this.#finish(generation,options);
    if(this.#alignment!==(nameMatching?.previous||alignment))throw Error('Folder name matching changed while loading. Refresh the tree.');
    if (node && this.#registry.get(nodeId) !== node) throw new Error('Folder node changed while loading. Refresh the tree.');
    return {staged,skipped:listed.skipped,nameMatching};
  }
  async #updatedParent(record,options={}) {
    const entries = {};
    for (const side of sides) {
      const old = record.entries[side], current = await this.#entry(side,record.expected[side],options);
      if (old ? !current || current.identity !== old.identity || current.kind !== old.kind : current !== null) throw new Error('Folder node changed while comparing. Refresh the tree.');
      entries[side] = current;
    }
    return this.#row(record.expected,entries,record.row.parentId);
  }
  #commit(nodeId,staged,skipped,parent = null,nameMatching = null) {
    if(nameMatching){
      if(this.#alignment!==nameMatching.previous)throw Error('Folder name matching changed before publishing. Refresh the tree.');
      if(nameMatching.alignment!==nameMatching.previous){this.#alignment=nameMatching.alignment;this.#nameInventory=nameMatching.inventory;this.#revision=randomUUID();}
    }
    const removed = new Set(), ids = new Set(staged.map(record=>record.row.id));
    for (const old of [...(this.#children.get(nodeId)||[])]) if (!ids.has(old)) this.#evict(old,removed);
    for (const record of staged) {
      for (const side of sides) if (record.entries[side]) {
        const owner = this.#owners[side].get(record.entries[side].path);
        if (owner && owner !== record.row.id) this.#evict(owner,removed);
      }
      if (this.#registry.get(record.row.id)?.row.parentId !== undefined && this.#registry.get(record.row.id).row.parentId !== nodeId) this.#evict(record.row.id,removed);
      const previous = this.#registry.get(record.row.id);
      if (previous && sides.some(side=>previous.entries[side]?.identity !== record.entries[side]?.identity || previous.entries[side]?.kind !== record.entries[side]?.kind)) {
        for (const child of [...(this.#children.get(record.row.id)||[])]) this.#evict(child,removed);
      }
      if (previous) for (const side of sides) if (previous.entries[side] && this.#owners[side].get(previous.entries[side].path) === record.row.id) this.#owners[side].delete(previous.entries[side].path);
      this.#registry.set(record.row.id,record);
      for (const side of sides) if (record.entries[side]) this.#owners[side].set(record.entries[side].path,record.row.id);
    }
    this.#children.set(nodeId,ids);
    const rows = staged.map(record=>({...record.row})).sort((a,b)=>Number(b.kind==='directory')-Number(a.kind==='directory')||(a.nameA||a.nameB).localeCompare(b.nameA||b.nameB));
    if(parent)this.#registry.set(nodeId,parent);
    return {revision:this.#revision,nodeId,rows,skipped,removedIds:[...removed],...(this.#matchingMode==='filename'?{matchingMode:'filename',diagnostics:this.#filenameDiagnostics}:{}),...(parent?{parentRow:{...parent.row}}:{})};
  }
  #request(nodeId,request=new AbortController()) {
    this.#assertUnlocked();this.#requests.get(nodeId)?.abort();this.#requests.set(nodeId,request);
    let active=this.#activeRequests.get(request);if(!active){let resolve;const done=new Promise(finish=>{resolve=finish;});active={count:0,done,resolve};this.#activeRequests.set(request,active);}active.count++;return request;
  }
  #releaseRequest(nodeId,request) { if(this.#requests.get(nodeId)===request)this.#requests.delete(nodeId);const active=this.#activeRequests.get(request);if(active&&--active.count===0){this.#activeRequests.delete(request);active.resolve();} }
  #checkRequest(nodeId,request) { if(request.signal.aborted||this.#requests.get(nodeId)!==request)throw Error('A newer folder node request replaced this result.'); }
  async list(nodeId = 'root',options={}) {
    const request = this.#request(nodeId),abort=()=>request.abort();
    options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    try {
    const readOptions={signal:request.signal};
    this.#checkRequest(nodeId,request);
    const generation = await this.#begin(readOptions);
    const {staged,skipped,nameMatching} = await this.#load(nodeId,generation,readOptions);
    this.#checkRequest(nodeId,request);
    return this.#commit(nodeId,staged,skipped,null,nameMatching);
    } finally { options.signal?.removeEventListener('abort',abort);this.#releaseRequest(nodeId,request); }
  }
  async compare(nodeId = 'root',rules = {},options={}) {
    rules = validateFolderRules(rules); assertMetadataPlatform(rules);
    const request = this.#request(nodeId),abort=()=>request.abort();
    options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    try {
    const readOptions={signal:request.signal};
    this.#checkRequest(nodeId,request);
    const generation = await this.#begin(readOptions), {staged,skipped,nameMatching} = await this.#load(nodeId,generation,readOptions);
    const parent = nodeId === 'root' ? null : this.#registry.get(nodeId);
    const files = staged.filter(record=>!record.row.alignmentConflict && record.entries.a?.kind==='file' && record.entries.b?.kind==='file');
    this.#checkRequest(nodeId,request);
    const result = await this.#service.compareFilePairs(files.map(record=>({a:record.entries.a.path,b:record.entries.b.path})),rules,{signal:request.signal});
    this.#checkRequest(nodeId,request);
    for (let i=0;i<files.length;i++) Object.assign(files[i].row,{status:result.rows[i].status,comparison:result.rows[i].comparison,...(result.rows[i].contentStatus?{contentStatus:result.rows[i].contentStatus,metadataDifferences:result.rows[i].metadataDifferences}:{})});
    for (const record of staged) await this.#validate(record,true,readOptions);
    for(const record of staged)if(record.entries.a?.kind==='directory'&&record.entries.b?.kind==='directory')Object.assign(record.row,applyMetadataComparison(record.row,record.entries.a,record.entries.b,rules,{a:record.entries.a?.path,b:record.entries.b?.path}));
    const updatedParent = parent ? await this.#updatedParent(parent,readOptions) : null;
    if(updatedParent)Object.assign(updatedParent.row,applyMetadataComparison(updatedParent.row,updatedParent.entries.a,updatedParent.entries.b,rules,{a:updatedParent.entries.a?.path,b:updatedParent.entries.b?.path}));
    await this.#finish(generation,readOptions);
    if (parent && this.#registry.get(nodeId) !== parent) throw new Error('Folder node changed while comparing. Refresh the tree.');
    this.#checkRequest(nodeId,request);
    return {...this.#commit(nodeId,staged,skipped,updatedParent,nameMatching),rules};
    } finally { options.signal?.removeEventListener('abort',abort);this.#releaseRequest(nodeId,request); }
  }
  async compareSelected(ids,revisionToken,rules = {},options={}) {
    rules = validateFolderRules(rules); assertMetadataPlatform(rules);
    if (!Array.isArray(ids) || !ids.length || ids.length > 50000 || new Set(ids).size !== ids.length || ids.some(id=>typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))) throw new Error('Choose unique loaded file rows to compare.');
    this.#assertUnlocked();
    const generation = await this.#begin(options);
    if (revisionToken !== this.#revision) throw new Error('Folder tree revision changed. Refresh the selection.');
    const originals = ids.map(id=>this.#registry.get(id));
    if (originals.some(record=>!record || record.row.alignmentConflict || record.row.kind !== 'file' || sides.some(side=>record.entries[side] && record.entries[side].kind !== 'file'))) throw new Error('Choose regular file rows to compare.');
    const parents = new Map();
    for (const record of originals) {
      let id = record.row.parentId;
      while (id !== 'root') {
        const parent = this.#registry.get(id);
        if (!parent) throw new Error('Folder parent changed. Refresh the tree.');
        if (parents.has(id)) break;
        parents.set(id,parent); id = parent.row.parentId;
      }
    }
    const controller=new AbortController(),abort=()=>controller.abort();
    options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    const requests = new Map([...new Set(originals.map(record=>record.row.parentId))].map(id=>[id,this.#request(id,controller)]));
    try {
    for (const parent of parents.values()) await this.#validate(parent,false,{signal:controller.signal});
    // Re-read metadata while preserving each authorized endpoint identity.
    // Ordinary edits are comparable; replacements and new counterparts require a refresh.
    const staged = [];
    for (const record of originals) staged.push(await this.#updatedParent(record,{signal:controller.signal}));
    const paired = staged.filter(record=>record.entries.a && record.entries.b);
    if (paired.length) {
      this.#assertGeneration(generation);for(const [id,request] of requests)this.#checkRequest(id,request);
      const result = await this.#service.compareFilePairs(paired.map(record=>({a:record.entries.a.path,b:record.entries.b.path})),rules,{signal:controller.signal});
      this.#assertGeneration(generation);for(const [id,request] of requests)this.#checkRequest(id,request);
      for (let i=0;i<paired.length;i++) Object.assign(paired[i].row,{status:result.rows[i].status,comparison:result.rows[i].comparison,...(result.rows[i].contentStatus?{contentStatus:result.rows[i].contentStatus,metadataDifferences:result.rows[i].metadataDifferences}:{})});
    }
    for (const record of staged) await this.#validate(record,true,{signal:controller.signal});
    for (const parent of parents.values()) await this.#validate(parent,false,{signal:controller.signal});
    await this.#finish(generation,{signal:controller.signal}); this.#assertUnlocked();
    for (const record of originals) if (this.#registry.get(record.row.id) !== record) throw new Error('Folder row changed while comparing. Refresh the selection.');
    for (const [id,parent] of parents) if (this.#registry.get(id) !== parent) throw new Error('Folder parent changed while comparing. Refresh the selection.');
    for (const [id,request] of requests) this.#checkRequest(id,request);
    // Replace only requested rows; committing a node would evict unselected siblings.
    for (const record of staged) this.#registry.set(record.row.id,record);
    return {revision:this.#revision,rows:staged.map(record=>({...record.row})),rules,skipped:0,removedIds:[]};
    } finally { options.signal?.removeEventListener('abort',abort);for(const [id,request] of requests)this.#releaseRequest(id,request); }
  }
  async refreshSelectedFiles(ids,revisionToken,rules = {},options={}) {
    return this.#refreshSelectedEntries(ids,revisionToken,rules,true,options);
  }
  async refreshSelectedEntries(ids,revisionToken,rules = {},options={}) {
    return this.#refreshSelectedEntries(ids,revisionToken,rules,false,options);
  }
  async #refreshSelectedEntries(ids,revisionToken,rules,filesOnly,options={}) {
    rules = validateFolderRules(rules); assertMetadataPlatform(rules);
    if (!Array.isArray(ids) || !ids.length || ids.length > 50000 || new Set(ids).size !== ids.length || ids.some(id=>typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))) throw new Error('Choose unique loaded file rows to refresh.');
    this.#assertUnlocked();
    const generation = await this.#begin(options);
    if (revisionToken !== this.#revision) throw new Error('Folder tree revision changed. Refresh the selection.');
    const originals = ids.map(id=>this.#registry.get(id));
    if (originals.some(record=>!record || filesOnly && (record.row.alignmentConflict || record.row.kind !== 'file' || sides.some(side=>record.entries[side] && record.entries[side].kind !== 'file')))) throw new Error('Choose regular file rows to refresh.');
    const parents = new Map();
    for (const record of originals) {
      let id = record.row.parentId;
      while (id !== 'root') {
        const parent = this.#registry.get(id);
        if (!parent) throw new Error('Folder parent changed. Refresh the tree.');
        if (parents.has(id)) break;
        parents.set(id,parent); id = parent.row.parentId;
      }
    }
    const controller=new AbortController(),abort=()=>controller.abort();
    options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    const requests = new Map([...new Set(originals.flatMap(record=>[record.row.parentId,record.row.id]))].map(id=>[id,this.#request(id,controller)]));
    try {
    const selected = new Set(ids), invalidated = new Set(), checkedParents = new Map();
    const ancestors = record => {
      const chain = []; let id = record.row.parentId;
      while (id !== 'root') { const parent = parents.get(id); chain.push(parent); id = parent.row.parentId; }
      return chain;
    };
    // Refresh authorizes rereading the registered paths, never a caller-supplied path.
    // Unlike compareSelected, endpoint identity and existence may have changed.
    const staged = [], absent = [];
    for (const record of [...originals].sort((a,b)=>ancestors(a).length-ancestors(b).length)) {
      const chain = ancestors(record);
      // A replacement parent revokes all previously loaded child authority.
      if (chain.some(parent=>invalidated.has(parent.row.id))) continue;
      for (const parent of chain) if (!selected.has(parent.row.id)) {
        await this.#validate(parent,false,{signal:controller.signal}); checkedParents.set(parent.row.id,parent);
      }
      const entries = {};
      for (const side of sides) entries[side] = await this.#entry(side,record.expected[side],{signal:controller.signal});
      if (sides.some(side=>record.entries[side]?.identity !== entries[side]?.identity || record.entries[side]?.kind !== entries[side]?.kind)) invalidated.add(record.row.id);
      if (!entries.a && !entries.b) absent.push(record);
      else {
        const next = this.#row(record.expected,entries,record.row.parentId);
        if (next.row.kind === 'conflict') invalidated.add(record.row.id);
        staged.push(next);
      }
    }
    const paired = staged.filter(record=>!record.row.alignmentConflict && record.entries.a?.kind==='file' && record.entries.b?.kind==='file');
    if (paired.length) {
      this.#assertGeneration(generation);for(const [id,request] of requests)this.#checkRequest(id,request);
      const result = await this.#service.compareFilePairs(paired.map(record=>({a:record.entries.a.path,b:record.entries.b.path})),rules,{signal:controller.signal});
      this.#assertGeneration(generation);for(const [id,request] of requests)this.#checkRequest(id,request);
      for (let i=0;i<paired.length;i++) Object.assign(paired[i].row,{status:result.rows[i].status,comparison:result.rows[i].comparison,...(result.rows[i].contentStatus?{contentStatus:result.rows[i].contentStatus,metadataDifferences:result.rows[i].metadataDifferences}:{})});
    }
    for (const record of staged) await this.#validate(record,true,{signal:controller.signal});
    for(const record of staged)if(record.entries.a?.kind==='directory'&&record.entries.b?.kind==='directory')Object.assign(record.row,applyMetadataComparison(record.row,record.entries.a,record.entries.b,rules,{a:record.entries.a?.path,b:record.entries.b?.path}));
    for (const record of absent) for (const side of sides) if (await this.#entry(side,record.expected[side],{signal:controller.signal})) throw new Error('A folder entry changed while refreshing. Refresh the selection.');
    for (const parent of checkedParents.values()) await this.#validate(parent,false,{signal:controller.signal});
    await this.#finish(generation,{signal:controller.signal}); this.#assertUnlocked();
    for (const record of originals) if (this.#registry.get(record.row.id) !== record) throw new Error('Folder row changed while refreshing. Refresh the selection.');
    for (const [id,parent] of parents) if (this.#registry.get(id) !== parent) throw new Error('Folder parent changed while refreshing. Refresh the selection.');
    for (const [id,request] of requests) this.#checkRequest(id,request);
    // Commit only requested endpoints, keeping unselected siblings registered.
    const removed = new Set();
    for (const record of absent) this.#evict(record.row.id,removed);
    for (const record of staged) {
      for (const side of sides) if (record.entries[side]) {
        const owner = this.#owners[side].get(record.entries[side].path);
        if (owner && owner !== record.row.id) this.#evict(owner,removed);
      }
      const previous = this.#registry.get(record.row.id);
      if (previous) {
        if (invalidated.has(record.row.id) || record.row.kind === 'conflict') for (const child of [...(this.#children.get(record.row.id)||[])]) this.#evict(child,removed);
        for (const side of sides) if (previous.entries[side] && this.#owners[side].get(previous.entries[side].path) === record.row.id) this.#owners[side].delete(previous.entries[side].path);
      }
      this.#registry.set(record.row.id,record);
      this.#children.get(record.row.parentId)?.add(record.row.id);
      for (const side of sides) if (record.entries[side]) this.#owners[side].set(record.entries[side].path,record.row.id);
    }
    return {revision:this.#revision,rows:staged.map(record=>({...record.row})),rules,skipped:0,removedIds:[...removed]};
    } finally { options.signal?.removeEventListener('abort',abort);for(const [id,request] of requests)this.#releaseRequest(id,request); }
  }
  async checkRevision(revisionToken) {
    await this.#begin();
    if (revisionToken !== this.#revision) throw new Error('Folder tree revision changed. Refresh the selection.');
  }
  async resolveRow(rowId,revisionToken) {
    const generation = await this.#begin();
    if (revisionToken !== this.#revision) throw new Error('Folder tree revision changed. Refresh the selection.');
    const record = this.#registry.get(rowId);
    if (!record) throw new Error('Choose a loaded folder row.');
    await this.#validate(record); await this.#finish(generation);
    if (this.#registry.get(rowId) !== record) throw new Error('Folder row changed while resolving. Refresh the selection.');
    return {...record.row};
  }
  async resolve(rowId,side,revisionToken) {
    if (!sides.includes(side)) throw new Error('Choose a valid folder side.');
    const generation = await this.#begin();
    if (revisionToken !== this.#revision) throw new Error('Folder tree revision changed. Refresh the selection.');
    const record = this.#registry.get(rowId);
    if (!record) throw new Error('Choose a loaded folder row.');
    if (!record.entries[side]) throw new Error('This row has no entry on the selected side.');
    await this.#validate(record); await this.#finish(generation);
    if (this.#registry.get(rowId) !== record) throw new Error('Folder row changed while resolving. Refresh the selection.');
    const entry = record.entries[side];
    return {path:entry.path,kind:entry.kind,id:rowId,revision:this.#revision,alignmentRevision:this.#alignment.revision};
  }
}
module.exports = {FolderTree};
