'use strict';
const path=require('node:path');
const {createHash}=require('node:crypto');
const {FolderAlignment}=require('./folder-alignment.cjs');
const sides=['a','b'];
const {validateFolderNameRules}=require('../src/folder-name-rules.cjs');
const {endpointRelative:relative,validateEndpointKinds,swapEndpointKinds}=require('./folder-endpoint-path-policy.cjs');
function opposite(side){if(!sides.includes(side))throw TypeError('Choose a valid folder side.');return side==='a'?'b':'a';}
function namespace(snapshot,kind){
 if(!snapshot||!(snapshot.entries instanceof Map))throw TypeError('Choose a folder namespace snapshot.');
 const entries=new Map();for(const [name,entry]of snapshot.entries){relative(name,kind);if(!entry||!['file','directory'].includes(entry.kind))throw TypeError('Invalid folder namespace entry.');entries.set(name,Object.freeze({kind:entry.kind}));}
 return {entries};
}
class PathNameMatching{
 #snapshots;#mapped={a:new Map(),b:new Map()};#directories={a:new Map(),b:new Map()};
 constructor(pair,manualAlignment=new FolderAlignment(),nameRules={},endpointKinds=manualAlignment.endpointKinds){
  if(!(manualAlignment instanceof FolderAlignment))throw TypeError('Choose a manual folder alignment.');
  this.endpointKinds=validateEndpointKinds(endpointKinds);manualAlignment=new FolderAlignment(manualAlignment.pairs,this.endpointKinds);
  this.nameRules=validateFolderNameRules(nameRules);this.options=this.nameRules;this.manualAlignment=manualAlignment;this.mode='path';
  this.#snapshots={a:namespace(pair?.a,this.endpointKinds.a),b:namespace(pair?.b,this.endpointKinds.b)};
  const children={a:new Map(),b:new Map()},used={a:new Set(),b:new Set()},pairs=[],queue=[['','']],visited=new Set();
  for(const side of sides)for(const [name,entry]of this.#snapshots[side].entries){const parent=path.posix.dirname(name)==='.'?'':path.posix.dirname(name);if(!children[side].has(parent))children[side].set(parent,new Map());children[side].get(parent).set(path.posix.basename(name),{path:name,...entry});}
  const add=(a,b,kind)=>{used.a.add(a);used.b.add(b);pairs.push(Object.freeze({a,b,kind}));this.#mapped.a.set(a,b);this.#mapped.b.set(b,a);if(kind==='directory'){this.#directories.a.set(a,b);this.#directories.b.set(b,a);}if(this.#snapshots.a.entries.get(a)?.kind==='directory'&&this.#snapshots.b.entries.get(b)?.kind==='directory')queue.push([a,b]);};
  // Manual endpoints are reserved globally, including those outside the opened node.
  for(const item of manualAlignment.pairs)add(item.a,item.b,item.kind);
  const fold=name=>{if(this.nameRules.normalizeUnicode)name=name.normalize('NFC');if(this.nameRules.ignoreCase)name=name.toLowerCase();return name;};
  for(let i=0;i<queue.length;i++){
   const [aParent,bParent]=queue[i],key=JSON.stringify(queue[i]);if(visited.has(key))continue;visited.add(key);
   const left=children.a.get(aParent)||new Map(),right=children.b.get(bParent)||new Map();
   for(const [name,a]of left){const b=right.get(name);if(b&&!used.a.has(a.path)&&!used.b.has(b.path))add(a.path,b.path,a.kind);}
   const matchGroups=(keyFor,filesOnly=false)=>{
    const groups=new Map();for(const side of sides)for(const entry of (side==='a'?left:right).values())if(!used[side].has(entry.path)&&(!filesOnly||entry.kind==='file')){const key=keyFor(path.posix.basename(entry.path));if(!groups.has(key))groups.set(key,{a:[],b:[]});groups.get(key)[side].push(entry);}
    for(const group of groups.values())if(group.a.length===1&&group.b.length===1)add(group.a[0].path,group.b[0].path,group.a[0].kind);
   };
   // Preserve full-name identity before considering a less specific stem.
   if(this.nameRules.ignoreCase||this.nameRules.normalizeUnicode)matchGroups(fold);
   if(this.nameRules.ignoreExtension)matchGroups(name=>{const dot=name.lastIndexOf('.');return fold(dot>0?name.slice(0,dot):name);},true);
  }
  this.pairs=Object.freeze(pairs.sort((x,y)=>x.a<y.a?-1:x.a>y.a?1:x.b<y.b?-1:x.b>y.b?1:0));
  this.manualPairs=manualAlignment.pairs;
  // Inventory participates in authority even if a new ambiguous alias creates no pair.
  this.revision=createHash('sha256').update(JSON.stringify({manual:manualAlignment.revision,rules:this.nameRules,pairs:this.pairs,inventory:sides.map(side=>[...this.#snapshots[side].entries].map(([name,entry])=>[name,entry.kind]).sort(([a],[b])=>a<b?-1:a>b?1:0))})).digest('hex');
  Object.freeze(this);
 }
 #project(side,name){if(this.#mapped[side].has(name))return this.#mapped[side].get(name);let parent=path.posix.dirname(name);while(parent!=='.'){if(this.#directories[side].has(parent))return this.#directories[side].get(parent)+name.slice(parent.length);parent=path.posix.dirname(parent);}return name;}
 counterpart(side,name){const other=opposite(side);if(name==='')return '';relative(name,this.endpointKinds[side]);const target=relative(this.#project(side,name),this.endpointKinds[other]);return this.#project(other,target)===name?target:null;}
 swap(){return new PathNameMatching({a:this.#snapshots.b,b:this.#snapshots.a},this.manualAlignment.swap(),this.nameRules,swapEndpointKinds(this.endpointKinds));}
 forSnapshots(pair){return new PathNameMatching(pair,this.manualAlignment,this.nameRules,this.endpointKinds);}
}
const buildPathNameMatching=(pair,manualAlignment,nameRules,endpointKinds)=>new PathNameMatching(pair,manualAlignment,nameRules,endpointKinds);
module.exports={PathNameMatching,buildPathNameMatching,validateFolderNameRules};
