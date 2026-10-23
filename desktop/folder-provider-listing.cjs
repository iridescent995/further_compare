'use strict';
const {checkSignal}=require('./local-folder-reader.cjs');
const SIDES=['a','b'];
const validRelative=value=>typeof value==='string'&&!/[\\\0]/.test(value)&&(value===''||!value.split('/').some(part=>!part||part==='.'||part==='..'));
const sameAuthority=(a,b)=>!!a&&!!b&&a.path===b.path&&a.identity===b.identity;
// Immediate paired listing; provider paths and identities are opaque. Directory
// timestamps may change during live refresh, but replacement authority may not.
async function listDirectoryPair(service,nodes,options={}){
 checkSignal(options.signal);
 if(!nodes||typeof nodes!=='object'||Array.isArray(nodes)||Object.keys(nodes).some(key=>!SIDES.includes(key))||!SIDES.every(side=>nodes[side]===null||validRelative(nodes[side]))||nodes.a===null&&nodes.b===null)throw Error('Invalid directory pair.');
 if(!service||!['inspectRoot','inspectEntry','enumerateDirectory','isIgnoredPath'].every(method=>typeof service[method]==='function'))throw Error('Choose a folder service.');
 nodes={a:nodes.a,b:nodes.b};
 const roots={...service.roots},authorities={},listed={},checks=[];
 const root=async side=>{
  checkSignal(options.signal);
  if((service.roots[side]||null)!==(roots[side]||null))throw Error('A selected root changed. Refresh the folder.');
  const info=await service.inspectRoot(side,options);
  if(!info)throw Error('Choose a folder first.');
  return {...info};
 };
 const directory=async(side,rootInfo)=>{
  if(nodes[side]==='')return rootInfo;
  const info=await service.inspectEntry(side,nodes[side],options);
  if(!info||info.kind!=='directory'||info.path!==nodes[side])throw Error('An aligned directory changed. Refresh the folder.');
  return {...info};
 };
 for(const side of SIDES)if(nodes[side]!==null){const rootInfo=await root(side);authorities[side]={root:rootInfo,directory:await directory(side,rootInfo)};}
 for(const side of SIDES){
  const entries=new Map();let skipped=0;listed[side]={entries,skipped};
  if(nodes[side]===null)continue;
  for await(const child of service.enumerateDirectory(side,nodes[side],options)){
   checkSignal(options.signal);
   if(!child||typeof child.name!=='string'||!child.name||child.name==='.'||child.name==='..'||/[\\/\0]/.test(child.name)||!['file','directory','symlink','other'].includes(child.kind))throw Error('Invalid folder directory entry.');
   const relative=(nodes[side]?nodes[side]+'/':'')+child.name;
   if(service.isIgnoredPath(relative)||!['file','directory'].includes(child.kind)){skipped++;continue;}
   const info=await service.inspectEntry(side,relative,options);
   // Live refresh may observe a child that vanished after enumeration.
   if(!info)continue;
   if(info.path!==relative)throw Error('A folder entry changed path. Refresh the folder.');
   if(!['file','directory'].includes(info.kind)){skipped++;continue;}
   entries.set(child.name,{kind:info.kind,size:info.kind==='file'?info.size:null,mtime:info.mtime});
   checks.push({side,relative,info:{...info}});
   if(entries.size>50000)throw Error('Folder exceeds the 50,000 entry limit.');
  }
  listed[side].skipped=skipped;
 }
 // A row read on the first side must not silently become stale while the
 // second side is being enumerated. Nothing is published on a failed check.
 for(const prior of checks){const current=await service.inspectEntry(prior.side,prior.relative,options);if(!sameAuthority(current,prior.info)||current.stamp!==prior.info.stamp||current.kind!==prior.info.kind)throw Error('A folder entry changed during listing. Refresh the folder.');}
 // Revalidate both original root-to-node chains after both listings complete.
 for(const side of SIDES)if(nodes[side]!==null){const current=await root(side);if(!sameAuthority(current,authorities[side].root)||!sameAuthority(await directory(side,current),authorities[side].directory))throw Error('An aligned directory changed. Refresh the folder.');}
 for(const side of SIDES)if(nodes[side]!==null&&(service.roots[side]||null)!==(roots[side]||null))throw Error('A selected root changed. Refresh the folder.');
 const rows=[...new Set([...listed.a.entries.keys(),...listed.b.entries.keys()])].map(name=>{
  const left=listed.a.entries.get(name),right=listed.b.entries.get(name),conflict=left&&right&&left.kind!==right.kind;
  const pathA=left?(nodes.a?nodes.a+'/':'')+name:null,pathB=right?(nodes.b?nodes.b+'/':'')+name:null;
  return {name,kind:conflict?'conflict':(left||right).kind,kindA:left?.kind??null,kindB:right?.kind??null,sizeA:left?.size??null,sizeB:right?.size??null,mtimeA:left?.mtime??null,mtimeB:right?.mtime??null,status:!left?'right':!right?'left':conflict?'conflict':left.kind==='directory'?'directory':left.size!==right.size?'different':'unchecked',id:JSON.stringify([pathA,pathB]),pathA,pathB,nameA:left?name:null,nameB:right?name:null};
 }).sort((a,b)=>Number(b.kind==='directory')-Number(a.kind==='directory')||a.name.localeCompare(b.name));
 checkSignal(options.signal);
 return {nodes,skipped:listed.a.skipped+listed.b.skipped,rows};
}
module.exports={listDirectoryPair};
