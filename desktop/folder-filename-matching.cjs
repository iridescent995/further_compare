'use strict';
const path=require('node:path');
const {createHash}=require('node:crypto');
const {FolderAlignment}=require('./folder-alignment.cjs');
const MAX_ENTRIES=50000;
const sides=['a','b'];
const compare=(a,b)=>a<b?-1:a>b?1:0;
const {endpointRelative:relative,validateEndpointKinds,swapEndpointKinds}=require('./folder-endpoint-path-policy.cjs');
function otherSide(side){if(!sides.includes(side))throw TypeError('Choose a valid filename-matching side.');return side==='a'?'b':'a';}
function namespace(snapshot,kind){
 if(!snapshot||!(snapshot.entries instanceof Map)||snapshot.entries.size>MAX_ENTRIES||!Number.isSafeInteger(snapshot.skipped)||snapshot.skipped<0||(snapshot.identity!==null&&(typeof snapshot.identity!=='string'||!snapshot.identity)))throw TypeError('Invalid filename-matching snapshot.');
 const entries=new Map();
 for(const [name,entry] of snapshot.entries){relative(name,kind);if(!entry||!['file','directory'].includes(entry.kind))throw TypeError('Invalid filename-matching entry.');entries.set(name,Object.freeze({kind:entry.kind}));}
 for(const name of entries.keys()){let parent=path.posix.dirname(name);while(parent!=='.'){if(entries.get(parent)?.kind!=='directory')throw Error('Filename matching requires a complete directory inventory.');parent=path.posix.dirname(parent);}}
 return {entries,identity:snapshot.identity,skipped:snapshot.skipped};
}
// Automatic pairs are process-local scan results, not persisted manual alignment.
// This indexed model deliberately avoids FolderAlignment's 1,000-pair manual limit.
class FilenameMatching{
 #snapshots;#manual;#options;#mapped={a:new Map(),b:new Map()};#folded={a:new Map(),b:new Map()};#manualFiles={a:new Map(),b:new Map()};#manualDirectories={a:new Map(),b:new Map()};
 constructor(pair,manualAlignment=new FolderAlignment(),options={},endpointKinds=manualAlignment.endpointKinds){
  if(!(manualAlignment instanceof FolderAlignment))throw TypeError('Choose a manual folder alignment.');
  if(!options||Object.getPrototypeOf(options)!==Object.prototype||Object.keys(options).some(key=>key!=='ignoreCase')||(options.ignoreCase!==undefined&&typeof options.ignoreCase!=='boolean'))throw TypeError('Invalid filename-matching options.');
  this.endpointKinds=validateEndpointKinds(endpointKinds);manualAlignment=new FolderAlignment(manualAlignment.pairs,this.endpointKinds);
  this.#options=Object.freeze({ignoreCase:options.ignoreCase===true});this.#manual=manualAlignment;
  this.#snapshots={a:namespace(pair?.a,this.endpointKinds.a),b:namespace(pair?.b,this.endpointKinds.b)};
  for(const side of sides)for(const name of this.#snapshots[side].entries.keys()){const key=name.normalize('NFC').toLowerCase();if(!this.#folded[side].has(key))this.#folded[side].set(key,new Set());this.#folded[side].get(key).add(name);}
  for(const mapping of manualAlignment.pairs)for(const side of sides){const entry=this.#snapshots[side].entries.get(mapping[side]);if(entry&&entry.kind!==mapping.kind)throw Error('A manual alignment endpoint changed type.');(mapping.kind==='file'?this.#manualFiles:this.#manualDirectories)[side].set(mapping[side],mapping[otherSide(side)]);}
  const used={a:new Set(),b:new Set()},rows=[],actualPairs=[],autoPairs=[];
  const add=(a,b,match)=>{if(a!==null)used.a.add(a);if(b!==null)used.b.add(b);rows.push(Object.freeze({pathA:a,pathB:b,kindA:a===null?null:'file',kindB:b===null?null:'file',match}));if(a!==null&&b!==null){const descriptor=Object.freeze({a,b,kind:'file'});actualPairs.push(descriptor);this.#mapped.a.set(a,b);this.#mapped.b.set(b,a);if(match!=='manual')autoPairs.push(descriptor);}};
  const files=Object.fromEntries(sides.map(side=>[side,[...this.#snapshots[side].entries].filter(([,entry])=>entry.kind==='file').map(([name])=>name).sort(compare)]));
  // Explicit directory descendants retain relative manual mapping even when
  // their counterpart is absent; they cannot be stolen by another name group.
  for(const side of sides){const other=otherSide(side);for(const name of files[side]){
   if(used[side].has(name)||!this.#covered(side,name))continue;
   const counterpart=this.#manualCounterpart(side,name),target=counterpart!==null&&this.#snapshots[other].entries.get(counterpart)?.kind==='file'&&!used[other].has(counterpart)?counterpart:null;
   add(side==='a'?name:target,side==='b'?name:target,'manual');
  }}
  const groups=new Map(),nameKey=name=>{const basename=path.posix.basename(name).normalize('NFC');return this.#options.ignoreCase?basename.toLowerCase():basename;};
  for(const side of sides)for(const name of files[side])if(!used[side].has(name)){const key=nameKey(name);if(!groups.has(key))groups.set(key,{a:[],b:[]});groups.get(key)[side].push(name);}
  let duplicateGroups=0,duplicateFiles=0,pathPairs=0,namePairs=0;
  for(const key of [...groups.keys()].sort(compare)){
   const group=groups.get(key);if(group.a.length>1||group.b.length>1){duplicateGroups++;duplicateFiles+=group.a.length+group.b.length;}
   const right=new Set(group.b);
   for(const name of group.a)if(right.has(name)){add(name,name,'path');pathPairs++;}
   const a=group.a.filter(name=>!used.a.has(name)),b=group.b.filter(name=>!used.b.has(name)),count=Math.min(a.length,b.length);
   for(let i=0;i<count;i++){add(a[i],b[i],'name');namePairs++;}
   for(let i=count;i<a.length;i++)add(a[i],null,'left');
   for(let i=count;i<b.length;i++)add(null,b[i],'right');
  }
  rows.sort((a,b)=>compare(a.pathA??a.pathB,b.pathA??b.pathB)||compare(a.pathA??'',b.pathA??'')||compare(a.pathB??'',b.pathB??''));
  this.rows=Object.freeze(rows);
  this.actualPairs=Object.freeze(actualPairs.sort((a,b)=>compare(a.a,b.a)||compare(a.b,b.b)));
  this.manualPairs=manualAlignment.pairs;
  this.pairs=Object.freeze([...manualAlignment.pairs,...autoPairs].sort((a,b)=>compare(a.a,b.a)||compare(a.b,b.b)));
  this.options=this.#options;
  this.mode='filename';
  this.diagnostics=Object.freeze({filesA:files.a.length,filesB:files.b.length,pairedFiles:actualPairs.length,manualPairs:rows.filter(row=>row.match==='manual'&&row.pathA!==null&&row.pathB!==null).length,pathPairs,namePairs,duplicateGroups,duplicateFiles,unmatchedA:rows.filter(row=>row.pathB===null).length,unmatchedB:rows.filter(row=>row.pathA===null).length,skippedA:this.#snapshots.a.skipped,skippedB:this.#snapshots.b.skipped});
  this.revision=createHash('sha256').update(JSON.stringify({mode:this.mode,manual:manualAlignment.revision,options:this.#options,inventory:sides.map(side=>[...this.#snapshots[side].entries].sort(([a],[b])=>compare(a,b)).map(([name,entry])=>[name,entry.kind])),pairs:this.pairs})).digest('hex');
  Object.freeze(this);
 }
 #project(side,name){const file=this.#manualFiles[side].get(name);if(file!==undefined)return file;let current=name;while(current!=='.'){const destination=this.#manualDirectories[side].get(current);if(destination!==undefined)return destination+name.slice(current.length);current=path.posix.dirname(current);}return name;}
 #manualCounterpart(side,name){const other=otherSide(side),projected=this.#project(side,name);return this.#project(other,projected)===name?projected:null;}
 #covered(side,name){if(this.#manualFiles[side].has(name))return true;let current=name;while(current!=='.'){if(this.#manualDirectories[side].has(current))return true;current=path.posix.dirname(current);}return false;}
 counterpart(side,name){
  const other=otherSide(side);if(name==='')return '';relative(name,this.endpointKinds[side]);
  if(this.#mapped[side].has(name))return relative(this.#mapped[side].get(name),this.endpointKinds[other]);
  const destination=this.#manualCounterpart(side,name);if(destination===null)return null;relative(destination,this.endpointKinds[other]);
  if(this.#mapped[other].has(destination)&&this.#mapped[other].get(destination)!==name)return null;
  const source=this.#snapshots[side].entries.get(name),target=this.#snapshots[other].entries.get(destination);
  if(source&&target&&source.kind!==target.kind)return null;
  // A fallback can scaffold missing directories but cannot cross an actual
  // target file or claim an alternate spelling of an existing destination.
  let current=destination;while(current!=='.'){
   if(current!==destination&&this.#snapshots[other].entries.get(current)?.kind==='file')return null;
   const aliases=this.#folded[other].get(current.normalize('NFC').toLowerCase());if(aliases&&[...aliases].some(alias=>alias!==current))return null;
   current=path.posix.dirname(current);
  }
  return destination;
 }
 swap(){return new FilenameMatching({a:this.#snapshots.b,b:this.#snapshots.a},this.#manual.swap(),this.#options,swapEndpointKinds(this.endpointKinds));}
}
function buildFilenameMatching(pair,manualAlignment,options,endpointKinds){return new FilenameMatching(pair,manualAlignment,options,endpointKinds);}
module.exports={FilenameMatching,buildFilenameMatching,MAX_ENTRIES};
