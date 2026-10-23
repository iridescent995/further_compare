'use strict';
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const MAX_ENTRIES=5000,MAX_BYTES=32*1024*1024,MAX_DEPTH=128;
const stamp=s=>[s.dev,s.ino,s.mode,s.size,s.mtimeNs,s.ctimeNs].join(':');
const changed=()=>Error('The selected folder changed while reading. Choose it again.');
function modifiedTime(ms){const d=new Date(Number(ms)),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;}
// Only native picker paths enter here. Snapshots carry bytes, never disk authority.
async function readArchiveFolder(selected,{io=fs,check=()=>{}}={}){
 check();
 if(typeof selected!=='string'||!path.isAbsolute(selected))throw Error('Choose a folder from disk.');
 const initial=await io.lstat(selected,{bigint:true});
 if(!initial.isDirectory()||initial.isSymbolicLink())throw Error('Choose a regular folder, not a symbolic link.');
 const root=await io.realpath(selected),basename=path.basename(selected);
 if(!basename||basename==='.'||basename==='..')throw Error('Choose a named folder.');
 const queue=[{file:root,path:basename,depth:0}],entries=[],directories=new Map();let total=0;
 async function namesAt(file,limit){
  const directory=await io.opendir(file),names=[];
  try{for await(const entry of directory){check();if(names.length>=limit)throw Error('Selected folder exceeds 5,000 entries.');names.push(entry.name);}}
  finally{try{await directory.close();}catch(error){if(error.code!=='ERR_DIR_CLOSED')throw error;}}
  return names.sort();
 }
 async function checkAncestors(file){
  for(let parent=path.dirname(file);parent===root||parent.startsWith(root+path.sep);parent=path.dirname(parent)){
   const expected=directories.get(parent);if(!expected||stamp(await io.lstat(parent,{bigint:true}))!==stamp(expected))throw changed();
   if(parent===root)break;
  }
  if(await io.realpath(file)!==file)throw changed();
 }
 for(let index=0;index<queue.length;index++){
  check();const item=queue[index];
  if(item.depth>MAX_DEPTH)throw Error('Folder depth exceeds 128 levels.');
  if(index)await checkAncestors(item.file);
  const before=await io.lstat(item.file,{bigint:true});
  if(index===0&&stamp(before)!==stamp(initial))throw changed();
  if(before.isSymbolicLink()||(!before.isDirectory()&&!before.isFile()))throw Error('Folders containing symbolic links or special files cannot be added.');
  const entry={...item,before,kind:before.isDirectory()?'directory':'file'};entries.push(entry);
  if(entry.kind==='directory'){
   directories.set(item.file,before);
   const names=await namesAt(item.file,MAX_ENTRIES-queue.length);entry.names=names;
   if(stamp(await io.lstat(item.file,{bigint:true}))!==stamp(before))throw changed();
   if(queue.length+names.length>MAX_ENTRIES)throw Error('Selected folder exceeds 5,000 entries.');
   for(const name of names)queue.push({file:path.join(item.file,name),path:`${item.path}/${name}`,depth:item.depth+1});
  }else{
   total+=Number(before.size);if(total>MAX_BYTES)throw Error('Selected folder exceeds 32 MiB in total.');
  }
 }
 const output=[];
 for(const entry of entries){
  check();const out={path:entry.path,kind:entry.kind,modified:modifiedTime(entry.before.mtimeMs),...(process.platform!=='win32'?{permissions:Number(entry.before.mode)&0o777}:{})};
  if(entry.kind==='file'){
   await checkAncestors(entry.file);
   const handle=await io.open(entry.file,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
   try{
    const opened=await handle.stat({bigint:true});if(!opened.isFile()||stamp(opened)!==stamp(entry.before))throw changed();
    const bytes=Buffer.alloc(Number(entry.before.size)+1);let count=0;
    while(count<bytes.length){check();const {bytesRead}=await handle.read(bytes,count,bytes.length-count,count);if(!bytesRead)break;count+=bytesRead;}
    if(count!==Number(entry.before.size)||stamp(await handle.stat({bigint:true}))!==stamp(entry.before))throw changed();
    out.data=bytes.subarray(0,count).toString('base64');
   }finally{await handle.close();}
  }
  output.push(out);
 }
 // Validate the entire traversal after reading: earlier files and directory listings
 // must still match, including ancestors replaced while a later file was read.
 for(const entry of entries){
  check();if(stamp(await io.lstat(entry.file,{bigint:true}))!==stamp(entry.before))throw changed();
  if(entry.kind==='directory'&&JSON.stringify(await namesAt(entry.file,MAX_ENTRIES))!==JSON.stringify(entry.names))throw changed();
 }
 if(stamp(await io.lstat(selected,{bigint:true}))!==stamp(initial)||await io.realpath(selected)!==root)throw changed();
 check();return output;
}
module.exports={readArchiveFolder,MAX_ENTRIES,MAX_BYTES,MAX_DEPTH};
