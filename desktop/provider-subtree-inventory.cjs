'use strict';
const {checkSignal}=require('./local-folder-reader.cjs');
const yieldTurn=()=>new Promise(resolve=>setImmediate(resolve));
const validRelative=value=>typeof value==='string'&&value.length<=32768&&!/[\\\0]/.test(value)&&(value===''||!value.split('/').some(part=>!part||part==='.'||part==='..'));
const stale=()=>Object.assign(Error('The selected folder contents changed. Scan again before copying.'),{code:'STALE_SOURCE'});
const same=(a,b)=>!!a&&!!b&&a.path===b.path&&a.identity===b.identity&&a.stamp===b.stamp&&a.kind===b.kind&&a.size===b.size;
const compare=(a,b)=>a<b?-1:a>b?1:0;
function copyMetadata(value,relative,root=false){
 if(!value||typeof value.path!=='string'||root&&(!value.path||value.kind!==undefined&&value.kind!=='directory')||typeof value.identity!=='string'||!value.identity||typeof value.stamp!=='string'||!value.stamp||!root&&(value.path!==relative||!['file','directory'].includes(value.kind))||!root&&value.kind==='file'&&(!Number.isSafeInteger(value.size)||value.size<0))throw stale();
 const copied={};for(const key of ['path','identity','stamp','kind','size','mode','uid','gid','mtime','mtimeNs','strongRevision'])if(['string','number','boolean'].includes(typeof value[key])||value[key]===null)copied[key]=value[key];
 return Object.freeze(copied);
}
// A completed read-only coverage record. No UI expansion state or file contents
// are consulted. It is not an atomic filesystem snapshot; writers must revalidate.
async function scanProviderSubtrees(provider,selections,{signal,isIgnoredPath=provider?.isIgnoredPath?.bind(provider)||(()=>false),isExcludedPath=()=>false,maxEntries=50000,maxNodes=5000,maxDepth=256,onProgress=()=>{}}={}){
 checkSignal(signal);
 if(!provider||!['inspectRoot','inspectEntry','enumerateDirectory'].every(key=>typeof provider[key]==='function'))throw Error('Choose a folder provider.');
 if(!Array.isArray(selections)||!selections.length||selections.length>1000||selections.some(value=>!validRelative(value)))throw Error('Select between 1 and 1000 valid file or folder paths.');
 if(![maxEntries,maxNodes,maxDepth].every(value=>Number.isSafeInteger(value)&&value>0)||maxEntries>50000||maxNodes>5000||maxDepth>1024||![isIgnoredPath,isExcludedPath,onProgress].every(value=>typeof value==='function'))throw Error('Invalid subtree inventory options.');
 const originals=new Set(selections),requested=[...originals].sort(compare),normalized=requested.filter(value=>!requested.some(parent=>parent!==value&&(parent===''||value.startsWith(parent+'/'))));
 if(requested.some(value=>value&&value.split('/').length>maxDepth))throw Error('Subtree exceeds the depth limit.');
 const root=copyMetadata(await provider.inspectRoot({signal}),'',true);checkSignal(signal);
 const observations=new Map(),entries=new Map(),directories=new Map(),exclusions=new Map(),queue=[],budget=new Set();let nodes=0,inspected=0,verificationInspected=0;
 const depth=value=>value?value.split('/').length:0;
 const consume=relative=>{if(!validRelative(relative))throw Error('Invalid or excessive subtree path.');if(depth(relative)>maxDepth)throw Error('Subtree exceeds the depth limit.');budget.add(relative);if(budget.size>maxEntries)throw Error('Subtree exceeds the inspected entry limit.');};
 const exclusion=relative=>isIgnoredPath(relative)?'ignored':isExcludedPath(relative)?'excluded':null;
 const blockedAncestor=relative=>{const components=relative.split('/');for(let index=1;index<=components.length;index++){const part=components.slice(0,index).join('/'),reason=exclusion(part);if(reason)return {path:part,kind:index<components.length?'directory':null,reason};}return null;};
 const inspect=async relative=>{
  checkSignal(signal);consume(relative);const value=relative===''?{...root,path:'',kind:'directory'}:await provider.inspectEntry(relative,{signal});checkSignal(signal);
  const info=copyMetadata(value,relative),previous=observations.get(relative);if(previous&&!same(previous,info))throw stale();if(!previous){if(info.kind==='directory'&&++nodes>maxNodes)throw Error('Subtree exceeds the folder limit.');observations.set(relative,info);}return info;
 };
 const add=async(relative,context=false)=>{const info=await inspect(relative);const prior=entries.get(relative);entries.set(relative,{path:relative,kind:info.kind,selected:originals.has(relative),context:prior?prior.context&&context:context,metadata:info});return info;};
 for(const relative of normalized){
  checkSignal(signal);consume(relative);const blocked=blockedAncestor(relative);if(blocked){consume(blocked.path);exclusions.set(blocked.path,Object.freeze(blocked));continue;}
  const parts=relative?relative.split('/'):[];
  for(let index=1;index<parts.length;index++){const ancestor=parts.slice(0,index).join('/');if((await add(ancestor,true)).kind!=='directory')throw stale();}
  const info=await add(relative);if(info.kind==='directory')queue.push(relative);else if(requested.some(value=>value.startsWith(relative+'/')))throw Error('A selected file cannot contain another selection.');
 }
 const readChildren=async(relative,verifying=false)=>{
  const children=[],seen=new Set();
  for await(const child of provider.enumerateDirectory(relative,{signal})){
   checkSignal(signal);
   if(verifying){if(++verificationInspected>maxEntries)throw Error('Subtree verification exceeds the inspected entry limit.');}else if(++inspected>maxEntries)throw Error('Subtree exceeds the inspected entry limit.');
   if(!child||typeof child.name!=='string'||!child.name||child.name==='.'||child.name==='..'||/[\\/\0]/.test(child.name)||!['file','directory','symlink','other'].includes(child.kind)||seen.has(child.name))throw Error('Invalid or duplicate subtree directory entry.');
   seen.add(child.name);const full=relative?relative+'/'+child.name:child.name;consume(full);children.push(Object.freeze({name:child.name,kind:child.kind}));
   if((verifying?verificationInspected:inspected)%32===0){await yieldTurn();checkSignal(signal);}
  }
  checkSignal(signal);children.sort((a,b)=>compare(a.name,b.name));return children;
 };
 for(let index=0;index<queue.length;index++){
  checkSignal(signal);const relative=queue[index];if((await inspect(relative)).kind!=='directory')throw stale();
  const children=await readChildren(relative);directories.set(relative,Object.freeze({path:relative,children:Object.freeze(children)}));
  for(const child of children){
   const full=relative?relative+'/'+child.name:child.name,reason=exclusion(full)||(!['file','directory'].includes(child.kind)?'unsupported':null);
   if(reason){exclusions.set(full,Object.freeze({path:full,kind:child.kind,reason}));continue;}
   const info=await add(full);if(info.kind!==child.kind)throw stale();if(info.kind==='directory')queue.push(full);
  }
  await onProgress({nodes,entries:entries.size,inspected,excluded:exclusions.size});await yieldTurn();checkSignal(signal);
 }
 // Compare names/types as well as stamps: SFTP directory mtime granularity
 // cannot reliably expose a new child when its timestamp has been restored.
 for(const [relative,prior] of directories){
  const children=await readChildren(relative,true);if(children.length!==prior.children.length||children.some((child,index)=>child.name!==prior.children[index].name||child.kind!==prior.children[index].kind))throw stale();
 }
 for(const [relative,prior] of observations){checkSignal(signal);const current=relative===''?{...await provider.inspectRoot({signal}),path:'',kind:'directory'}:await provider.inspectEntry(relative,{signal});if(!same(copyMetadata(current,relative),prior))throw stale();}
 const finalRoot=copyMetadata(await provider.inspectRoot({signal}),'',true);if(!same(finalRoot,root))throw stale();checkSignal(signal);
 return Object.freeze({root,selections:Object.freeze(normalized),entries:Object.freeze([...entries.values()].sort((a,b)=>compare(a.path,b.path)).map(Object.freeze)),directories:Object.freeze([...directories.values()].sort((a,b)=>compare(a.path,b.path))),exclusions:Object.freeze([...exclusions.values()].sort((a,b)=>compare(a.path,b.path))),complete:true,counts:Object.freeze({entries:entries.size,nodes,inspected,verificationInspected})});
}
module.exports={scanProviderSubtrees};
