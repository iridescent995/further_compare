'use strict';
const fs=require('node:fs/promises');
const identity=stat=>`${stat.dev}:${stat.ino}`;
const stamp=stat=>`${identity(stat)}:${stat.mode}:${stat.uid}:${stat.gid}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
const missing=error=>['ENOENT','ENOTDIR'].includes(error.code);
const metadataFromStat=(relative,stat)=>({path:relative,kind:stat.isDirectory()?'directory':'file',size:stat.isFile()?Number(stat.size):null,mtime:Number(stat.mtimeNs)/1e6,mtimeNs:String(stat.mtimeNs),mode:Number(stat.mode),uid:Number(stat.uid),gid:Number(stat.gid),identity:identity(stat),stamp:stamp(stat),strongRevision:true});
// Native metadata authority. Consumers use opaque identity/stamp strings rather
// than depending on local stat fields or treating remote paths as disk paths.
class LocalFolderMetadata {
 constructor(service){this.service=service;}
 async inspectRoot(side){
  if(!['a','b'].includes(side))throw Error('Invalid folder side.');
  const root=this.service.roots[side]||null;if(root===null)return null;
  const stat=await fs.lstat(root,{bigint:true});
  if(!stat.isDirectory()||await fs.realpath(root)!==root||this.service.roots[side]!==root)throw Error('A selected root changed.');
  return {path:root,kind:'directory',identity:identity(stat),stamp:stamp(stat),mode:Number(stat.mode),uid:Number(stat.uid),gid:Number(stat.gid)};
 }
 async *enumerateDirectory(side,relative=''){
  if(!['a','b'].includes(side))throw Error('Invalid folder side.');
  const full=await this.service.directoryPath(side,relative);
  // Async iteration keeps enumeration bounded and closes the native handle when
  // a consumer stops for cancellation, a limit, or a stale metadata observation.
  for await(const child of await fs.opendir(full))yield {name:child.name,kind:child.isSymbolicLink()?'symlink':child.isDirectory()?'directory':child.isFile()?'file':'other'};
 }
 async inspectEntry(side,relative){
  if(!['a','b'].includes(side))throw Error('Invalid folder side.');
  if(relative===null||!this.service.roots[side]||this.service.isIgnoredPath?.(relative))return null;
  try{
   const full=await this.service.safe(side,relative);
   // Case/Unicode aliases are not exact-path entries. Preserve enumerated spelling.
   if(await fs.realpath(full)!==full)return null;
   const stat=await fs.lstat(full,{bigint:true});
   if(!stat.isFile()&&!stat.isDirectory())throw Error('Aligned entries must be regular files or directories.');
   const checked=await this.service.safe(side,relative);
   if(checked!==full||await fs.realpath(checked)!==checked||stamp(await fs.lstat(checked,{bigint:true}))!==stamp(stat))throw Error('A folder entry changed while reading metadata. Refresh the folder tree.');
   return metadataFromStat(relative,stat);
  }catch(error){if(missing(error))return null;throw error;}
 }
}
module.exports={LocalFolderMetadata,metadataFromStat};
