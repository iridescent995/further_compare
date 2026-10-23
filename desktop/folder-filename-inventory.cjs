'use strict';
const yieldTurn=()=>new Promise(resolve=>setImmediate(resolve));

// Stage a complete metadata inventory. No content reads and no partial result is
// published: filename pairing must not change as individual directories arrive.
async function scanFilenameInventory(service,{isCancelled=()=>false,onProgress=()=>{},maxEntries=50000,maxNodes=5000,signal}={}){
 if(!service||typeof service.inspectRoot!=='function'||typeof service.inspectEntry!=='function'||typeof service.enumerateDirectory!=='function'||typeof service.isIgnoredPath!=='function')throw Error('Choose a folder service.');
 if(typeof isCancelled!=='function'||typeof onProgress!=='function'||![maxEntries,maxNodes].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Invalid filename inventory options.');
 const cancel=()=>{if(signal?.aborted||isCancelled()){const error=Error('Filename matching scan cancelled.');error.code='ABORT_ERR';throw error;}};
 const roots={...service.roots},result={a:{entries:new Map(),skipped:0,identity:null},b:{entries:new Map(),skipped:0,identity:null}},checks=[],directories=new Map(),queue=[];
 let entries=0,nodes=0,inspected=0;
 const checkRoots=async()=>{for(const side of ['a','b'])if((service.roots[side]||null)!==(roots[side]||null))throw Error('Selected folders changed while scanning.');};
 const checked=async(side,relative)=>{
  cancel();await checkRoots();
  const info=relative?await service.inspectEntry(side,relative,{signal}):await service.inspectRoot(side,{signal});
  if(!info||relative&&!['file','directory'].includes(info.kind))throw Error('A filename matching entry changed type or path. Refresh and try again.');
  return {full:info.path,info:relative?info:{...info,kind:'directory'}};
 };
 for(const side of ['a','b'])if(roots[side]){const root=await checked(side,'');if(root.info.kind!=='directory')throw Error('Choose directory roots.');result[side].identity=root.info.identity;result[side].rootStamp=root.info.stamp;checks.push({side,relative:'',stamp:root.info.stamp,identity:root.info.identity,full:root.full});directories.set(side+':',checks.at(-1));queue.push({side,relative:''});}
 if(!queue.length)throw Error('Choose at least one folder.');
 for(let index=0;index<queue.length;index++){
  cancel();if(nodes>=maxNodes)throw Error(`Filename matching exceeds the ${maxNodes.toLocaleString()} folder limit. Choose a smaller root.`);
  const {side,relative}=queue[index],{full,info}=await checked(side,relative);
  const expected=directories.get(side+':'+relative);
  if(full!==expected.full||info.kind!=='directory'||info.stamp!==expected.stamp||info.identity!==expected.identity)throw Error('A folder changed while scanning filenames. Refresh and try again.');
  for await(const child of service.enumerateDirectory(side,relative,{signal})){
   cancel();if(inspected>=maxEntries)throw Error(`Filename matching exceeds the ${maxEntries.toLocaleString()} inspected entry limit. Choose a smaller root.`);
   inspected++;if(inspected%32===0){await yieldTurn();cancel();}
   if(!child||typeof child.name!=='string'||!child.name||child.name==='.'||child.name==='..'||/[\\/\0]/.test(child.name)||!['file','directory','symlink','other'].includes(child.kind))throw Error('Invalid filename inventory directory entry.');
   const rel=relative?relative+'/'+child.name:child.name;
   if(service.isIgnoredPath(rel)||!['file','directory'].includes(child.kind)){result[side].skipped++;continue;}
   const current=await checked(side,rel),kind=current.info.kind;
   if(child.kind!==kind)throw Error('A filename matching entry changed type. Refresh and try again.');
   result[side].entries.set(rel,{kind,identity:current.info.identity,stamp:current.info.stamp,mode:current.info.mode,size:current.info.size,mtime:current.info.mtime});
   checks.push({side,relative:rel,stamp:current.info.stamp,identity:current.info.identity,full:current.full});entries++;
   if(kind==='directory'){directories.set(side+':'+rel,checks.at(-1));queue.push({side,relative:rel});}
   if(entries%32===0)await yieldTurn();
  }
  nodes++;await onProgress({nodes,entries,inspected,skipped:result.a.skipped+result.b.skipped});await yieldTurn();
 }
 // Detect additions, removals and replacements anywhere in the scanned tree,
 // including changes to an earlier node while a later node was being read.
 for(let index=0;index<checks.length;index++){
  cancel();const prior=checks[index],current=await checked(prior.side,prior.relative);
  if(current.full!==prior.full||current.info.stamp!==prior.stamp||current.info.identity!==prior.identity)throw Error('Folder contents changed during filename matching. Refresh and try again.');
  if(index%32===0)await yieldTurn();
 }
 cancel();await checkRoots();
 for(const side of ['a','b'])if(roots[side]){const current=await checked(side,''),prior=directories.get(side+':');if(current.full!==prior.full||current.info.stamp!==prior.stamp||current.info.identity!==prior.identity)throw Error('A selected root changed during filename matching. Refresh and try again.');}
 cancel();return {...result,nodes,entries,inspected,complete:true};
}
module.exports={scanFilenameInventory};
