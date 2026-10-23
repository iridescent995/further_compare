'use strict';
const path=require('node:path');
const {createHash}=require('node:crypto');
const {scanProviderSubtrees}=require('./provider-subtree-inventory.cjs');
const {snapshotProviderFile}=require('./provider-file-snapshot.cjs');
const {FolderAlignment}=require('./folder-alignment.cjs');
const {FilenameMatching}=require('./folder-filename-matching.cjs');
const {PathNameMatching}=require('./folder-name-matching.cjs');
const {validateEndpointKinds,endpointRelative}=require('./folder-endpoint-path-policy.cjs');
const {validateOperationScope,selectOperationEntries}=require('./folder-operation-scope.cjs');
const {validateLocalTransferPath}=require('./local-transfer-writer.cjs');
const {checkSignal}=require('./local-folder-reader.cjs');
const {filterEntries}=require('../src/folder-view.cjs');
const states=new WeakMap(),sides=['a','b'];
const stale=()=>Object.assign(Error('Copy inventory or comparison evidence changed. Review again.'),{code:'STALE_SOURCE'});
const parent=p=>path.posix.dirname(p)==='.'?'':path.posix.dirname(p);
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const signature=inventory=>JSON.stringify([inventory.root,inventory.entries,inventory.directories,inventory.exclusions]);
function assertActive(state,signal){checkSignal(signal);for(const side of sides)if(state.service.endpoint(side)!==state.endpoints[side])throw stale();if(state.revoked)throw Error('Copy inventory has been revoked.');}
async function scanBoth(state,signal){const result={};for(const side of sides){assertActive(state,signal);result[side]=await scanProviderSubtrees(state.endpoints[side],[''],{...state.scanOptions,signal,isIgnoredPath:state.ignored});}return result;}
async function validateState(state,signal){
 assertActive(state,signal);
 for(const item of state.evidence){const observed=await snapshotProviderFile(state.endpoints[item.side],item.relative,{signal});assertActive(state,signal);if(observed.sha256!==item.sha256||observed.byteLength!==item.byteLength)throw stale();}
 const current=await scanBoth(state,signal);for(const side of sides)if(signature(current[side])!==state.signatures[side])throw stale();assertActive(state,signal);
}
// Read-only native authority, never an executable transfer plan. Full bounded
// root namespaces are scanned even for manual alignment; this trades extra IO
// for complete reservations and ancestry (50,000 entries per endpoint).
async function prepareProviderCopyInventory(service,side,selections,{scope={},alignment,endpointKinds={a:'local',b:'local'},signal,maxEntries=50000,maxNodes=5000,maxDepth=256}={}){
 checkSignal(signal);if(!sides.includes(side)||!service||typeof service.endpoint!=='function'||typeof service.compareRows!=='function')throw Error('Choose paired folder providers.');
 const kinds=validateEndpointKinds(endpointKinds),other=side==='a'?'b':'a',validatedScope=validateOperationScope(scope);
 if(!Array.isArray(selections)||!selections.length||selections.length>1000)throw Error('Select between 1 and 1000 paths.');
 for(const relative of selections)if(relative!=='')endpointRelative(relative,kinds[side]);
 const requested=[...new Set(selections)],underSelection=p=>requested.some(root=>root===''||p===root||p.startsWith(root+'/'));
 const manual=new FolderAlignment(alignment instanceof FilenameMatching?alignment.manualPairs:(alignment?.manualAlignment||alignment)?.pairs||[],kinds);
 if(alignment&&!(alignment instanceof FolderAlignment)&&!(alignment instanceof FilenameMatching)&&!(alignment instanceof PathNameMatching))throw Error('Unsupported folder matching model.');
 const state={service,endpoints:{a:service.endpoint('a'),b:service.endpoint('b')},scanOptions:{maxEntries,maxNodes,maxDepth},ignored:relative=>service.isIgnoredPath(relative),evidence:[],revoked:false};
 const inventories=await scanBoth(state,signal),maps=Object.fromEntries(sides.map(s=>[s,new Map(inventories[s].entries.filter(e=>e.path).map(e=>[e.path,e]))]));
 for(const relative of requested)if(relative&&!maps[side].has(relative))throw Error('Selected path is missing, ignored, or unsupported: '+relative);
 const namespaces=Object.fromEntries(sides.map(s=>[s,{entries:new Map([...maps[s]].map(([p,e])=>[p,{kind:e.kind}])),identity:inventories[s].root.identity,skipped:inventories[s].exclusions.length}]));
 const matching=alignment instanceof FilenameMatching?new FilenameMatching(namespaces,manual,alignment.options,kinds):alignment instanceof PathNameMatching?new PathNameMatching(namespaces,manual,alignment.nameRules,kinds):manual;
 const rows=[],byPath={a:new Map(),b:new Map()},used=new Set(),targets=new Map(),targetErrors=new Map();
 function row(a,b,syntheticA=false,syntheticB=false){
  if(rows.length>=50000)throw Error('Paired copy inventory exceeds the 50,000 row limit.');
  const value={id:'copy-row-'+rows.length,parentId:null,pathA:a?.path??null,pathB:b?.path??null,kindA:a?.kind??null,kindB:b?.kind??null,sizeA:a?.metadata?.size??null,sizeB:b?.metadata?.size??null,mtimeA:a?.metadata?.mtime??null,mtimeB:b?.metadata?.mtime??null,syntheticA,syntheticB,status:!a||syntheticA?'right':!b||syntheticB?'left':a.kind!==b.kind?'conflict':'unchecked'};
  rows.push(value);for(const s of sides){const p=value[s==='a'?'pathA':'pathB'];if(p!==null){if(byPath[s].has(p))throw Error('A mapped endpoint is reserved more than once.');byPath[s].set(p,value);}}return value;
 }
 for(const [relative,entry] of maps[side]){
  let target;try{target=matching.counterpart(side,relative);}catch(error){target=null;targetErrors.set(relative,error);}if(target!==null){let ancestor=parent(target);while(ancestor){if(maps[other].get(ancestor)?.kind==='file'){targetErrors.set(relative,Error('A destination parent is a file.'));target=null;break;}ancestor=parent(ancestor);}}targets.set(relative,target);
  const existing=target===null?null:maps[other].get(target),synthetic=target!==null&&!existing;
  if(existing){if(used.has(target))throw Error('Duplicate mapped target.');used.add(target);}
  const counterpart=existing||(synthetic?{path:target,kind:entry.kind}:null);
  row(side==='a'?entry:counterpart,side==='b'?entry:counterpart,side==='b'&&synthetic,side==='a'&&synthetic);
 }
 for(const [relative,entry] of maps[other])if(!used.has(relative)&&!byPath[other].has(relative))row(side==='a'?null:entry,side==='b'?null:entry);
 // Missing destination parents are explicit synthetic context. They are never
 // passed to the provider comparison reader as if they already existed.
 for(const value of [...rows])for(const s of sides){let ancestor=parent(value[s==='a'?'pathA':'pathB']||'');while(ancestor){if(!byPath[s].has(ancestor)){const entry={path:ancestor,kind:'directory'};row(s==='a'?entry:null,s==='b'?entry:null,s==='a',s==='b');}else if(byPath[s].get(ancestor)[s==='a'?'kindA':'kindB']!=='directory')throw Error('A destination parent is a file.');ancestor=parent(ancestor);}}
 for(const value of rows){const sourcePath=value[side==='a'?'pathA':'pathB'],destPath=value[other==='a'?'pathA':'pathB'];value.parentId=(sourcePath?byPath[side].get(parent(sourcePath)):byPath[other].get(parent(destPath||'')))?.id??null;}
 const selectedRows=rows.filter(r=>!r[side==='a'?'syntheticA':'syntheticB']&&r[side==='a'?'pathA':'pathB']!==null&&underSelection(r[side==='a'?'pathA':'pathB']));
 const compared=selectedRows.filter(r=>r.kindA&&r.kindB&&!r.syntheticA&&!r.syntheticB);
 for(const value of selectedRows)for(const s of sides){const relative=value[s==='a'?'pathA':'pathB'];if(value[s==='a'?'kindA':'kindB']!=='file'||value[s==='a'?'syntheticA':'syntheticB'])continue;const observed=await snapshotProviderFile(state.endpoints[s],relative,{signal});state.evidence.push({side:s,relative,sha256:observed.sha256,byteLength:observed.byteLength});}
 const comparison=await service.compareRows({rows:compared},validatedScope.rules,{signal,captureEvidence:true});
 // Bind the classification to the bytes actually used by comparison, not only
 // hashes taken before/after it (which could miss a temporary content change).
 const key=(s,p)=>JSON.stringify([s,p]),baselineIndex=new Map(state.evidence.map(e=>[key(e.side,e.relative),e])),capturedIndex=new Map((comparison.evidence||[]).map(e=>[key(e.side,e.relative),e]));
 for(const value of compared)if(value.kindA==='file'&&value.kindB==='file')for(const s of sides){const relative=value[s==='a'?'pathA':'pathB'],baseline=baselineIndex.get(key(s,relative)),captured=capturedIndex.get(key(s,relative)),prior=maps[s].get(relative).metadata;if(!captured||captured.sha256!==baseline.sha256||Object.keys(prior).some(field=>captured.metadata[field]!==prior[field]))throw stale();}
 for(const value of compared)if(value.kindA==='directory'&&value.kindB==='directory')for(const s of sides){const relative=value[s==='a'?'pathA':'pathB'],captured=capturedIndex.get(key(s,relative)),prior=maps[s].get(relative).metadata;if((validatedScope.rules.comparePermissions||validatedScope.rules.compareOwner||validatedScope.rules.compareGroup||validatedScope.rules.compareFilename)&&!captured||captured&&Object.keys(prior).some(field=>captured.metadata[field]!==prior[field]))throw stale();}
 for(const value of rows)if(value.status==='directory')value.status='unchecked';
 const eligible=selectOperationEntries(rows,{...validatedScope,status:'all'},side,kinds);
 // Desired paths participate in filename filters, but absent synthetic entries
 // must not satisfy statuses requiring two real endpoints (for example newer).
 const filterRows=rows.map(value=>({...value,kindA:value.syntheticA?null:value.kindA,kindB:value.syntheticB?null:value.kindB}));
 const filteredIds=new Set(filterEntries(filterRows,{...validatedScope,retainDirectories:false}).map(value=>value.id));
 for(const id of eligible.fileIds)if(!filteredIds.has(id))eligible.fileIds.delete(id);for(const id of eligible.directoryIds)if(!filteredIds.has(id))eligible.directoryIds.delete(id);
 const selectedMappings=[],required=new Map(),localNames=new Map(),blockedTargets=new Set(inventories[other].exclusions.map(entry=>entry.path));
 if(kinds[other]==='local')for(const name of maps[other].keys()){const folded=name.normalize('NFC').toLowerCase();if(!localNames.has(folded))localNames.set(folded,[]);localNames.get(folded).push(name);}
 const validateTarget=target=>{endpointRelative(target,kinds[other]);for(let current=target;current;current=parent(current))if(blockedTargets.has(current))throw Error('Destination is ignored or unsupported: '+target);if(kinds[other]==='local'){validateLocalTransferPath(target);let current=target;while(current){const folded=current.normalize('NFC').toLowerCase();if(localNames.get(folded)?.some(name=>name!==current))throw Error('A destination has a case or Unicode alias: '+current);if(!localNames.has(folded))localNames.set(folded,[current]);current=parent(current);}}};
 const addDirectory=(target,source=null)=>{if(!target)return;validateTarget(target);const existing=maps[other].get(target);if(existing&&existing.kind!=='directory')throw Error('A destination parent is a file.');if(!required.has(target))required.set(target,{source,target,exists:!!existing});else if(source)required.get(target).source=source;};
 for(const value of selectedRows){
  const source=value[side==='a'?'pathA':'pathB'],kind=value[side==='a'?'kindA':'kindB'];if(!(kind==='file'?eligible.fileIds:eligible.directoryIds).has(value.id))continue;
  if(targetErrors.has(source))throw targetErrors.get(source);const target=targets.get(source);if(target===null)throw Error('Selected path has a reserved or incompatible destination: '+source);
  validateTarget(target);
  const existing=maps[other].get(target);if(existing&&existing.kind!==kind)throw Error('Source and destination types conflict: '+source);
  if(kind==='file')selectedMappings.push({source,target,kind,rowId:value.id});else addDirectory(target,source);
  let ancestor=parent(target);while(ancestor){addDirectory(ancestor);ancestor=parent(ancestor);}
 }
 state.inventories=Object.freeze({...inventories});
 state.signatures=Object.fromEntries(sides.map(s=>[s,signature(inventories[s])]));
 await validateState(state,signal);
 const authority={matchingRevision:matching.revision,signatures:Object.fromEntries(sides.map(s=>[s,createHash('sha256').update(state.signatures[s]).digest('hex')]))};
 const result=freeze({rows,selectedMappings,requiredDirectories:[...required.values()].sort((a,b)=>a.target.split('/').length-b.target.split('/').length||a.target.localeCompare(b.target)),coverage:{mode:'complete-root-namespaces',selections:requested,endpoints:Object.fromEntries(sides.map(s=>[s,{counts:inventories[s].counts,exclusions:inventories[s].exclusions}]))},namespaceAuthority:authority});
 states.set(result,state);return result;
}
async function revalidateProviderCopyInventory(result,{signal}={}){const state=states.get(result);if(!state)throw Error('Unknown copy inventory.');await validateState(state,signal);}
function revokeProviderCopyInventory(result){const state=states.get(result);if(state)state.revoked=true;}
function getProviderCopyInventoryObservations(result){const state=states.get(result);if(!state||state.revoked)throw Error('Unknown or revoked copy inventory.');return Object.freeze({inventories:state.inventories,evidence:Object.freeze(state.evidence.map(value=>Object.freeze({...value})))});}
module.exports={getProviderCopyInventoryObservations,prepareProviderCopyInventory,revalidateProviderCopyInventory,revokeProviderCopyInventory};
