'use strict';
const {crc32,hasZipSource,preserveZipArchive}=require('./archive-core.cjs');
const isZipArchive=archive=>hasZipSource(archive);
const {writeValidatedTar,writeValidatedTarGzip}=require('./tar-write.cjs');
const MAX_OUTPUT=32*1024*1024,MAX_TOTAL=64*1024*1024,MAX_ENTRIES=50000;
function portablePath(value){
 if(typeof value!=='string'||!value||value.length>32768||value!==value.normalize('NFC')||/[\x00-\x1f\x7f\\<>:"|?*]/u.test(value)||value.startsWith('/')||value.endsWith('/'))throw Error('Unsafe archive path.');
 if(new TextEncoder().encode(value).length>65534||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))throw Error('Invalid archive path encoding.');
 for(const part of value.split('/'))if(!part||part==='.'||part==='..'||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))throw Error('Unsafe portable archive path.');
 return value;
}
function validateEntries(records){
 records=Array.from(records);if(records.length>MAX_ENTRIES)throw Error('Archive exceeds 50,000 entries.');
 const result=new Map(),aliases=new Map();let total=0;
 for(const entry of records){const path=portablePath(entry.path);if(!['file','directory'].includes(entry.kind))throw Error('Unsupported archive entry kind.');const alias=path.toLowerCase();if(result.has(path)||aliases.has(alias))throw Error('Duplicate or case-conflicting archive paths.');aliases.set(alias,path);
 if(entry.permissions!==undefined&&(!Number.isInteger(entry.permissions)||entry.permissions<0||entry.permissions>0o777))throw Error('Archive permissions must be ordinary POSIX rwx bits from 000 to 777.');
 const data=entry.kind==='file'?entry.data:new Uint8Array();if(!(data instanceof Uint8Array))throw Error('Archive file data must be bytes.');if(entry.kind==='directory'&&entry.data?.length)throw Error('Archive directory contains data.');total+=data.length;if(total>MAX_TOTAL)throw Error('Archive expands beyond 64 MB.');result.set(path,{path,kind:entry.kind,modified:entry.modified??null,...(entry.permissions===undefined?{}:{permissions:entry.permissions}),data});}
 for(const entry of [...result.values()]){let parent=entry.path;while(parent.includes('/')){parent=parent.slice(0,parent.lastIndexOf('/'));const prior=result.get(parent);if(prior?.kind==='file')throw Error('Archive file used as a parent directory.');if(!prior){const alias=parent.toLowerCase();if(aliases.has(alias)&&aliases.get(alias)!==parent)throw Error('Case-conflicting archive parents.');aliases.set(alias,parent);result.set(parent,{path:parent,kind:'directory',modified:null,data:new Uint8Array()});}}}
 if(result.size>MAX_ENTRIES)throw Error('Archive exceeds 50,000 entries.');
 for(const entry of result.values())if(entry.kind==='directory'&&entry.path.length+1>32768)throw Error('Archive directory path exceeds 32,768 characters including its trailing slash.');
 return result;
}
function timestamp(value){
 const match=typeof value==='string'&&/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?: UTC|Z)?$/.exec(value);
 if(!match)return {date:33,time:0};const [,y,m,d,h,n,s]=match.map(Number),date=new Date(y,m-1,d,h,n,s);
 if(y<1980||y>2107||date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d||h>23||n>59||s>59)return {date:33,time:0};
 return {date:((y-1980)<<9)|(m<<5)|d,time:(h<<11)|(n<<5)|Math.floor(s/2)};
}
function zipRecords(records){return [...validateEntries(records).values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0).map(e=>({...e,name:new TextEncoder().encode(e.path+(e.kind==='directory'?'/':''))}));}
function writeZipEntries(records){return assembleZip(zipRecords(records).map(e=>({...e,method:0,payload:e.data})),'Stored');}
// Drafts retain deterministic stored bytes when they fit; compression only
// expands editing coverage, never the serialized or expanded-content limits.
function writeArchiveDraft(records){
 const entries=zipRecords(records);let stored=22;
 for(const entry of entries)stored+=76+2*entry.name.length+entry.data.length;
 if(stored<=MAX_OUTPUT)return assembleZip(entries.map(e=>({...e,method:0,payload:e.data})),'Stored');
 return writeCompressedZipEntries(entries);
}
async function deflateSmaller(data){
 if(!data.length)return null;
 if(typeof CompressionStream!=='function')throw Error('ZIP compression is unavailable in this runtime.');
 let stream;try{stream=new CompressionStream('deflate-raw');}catch{throw Error('Raw deflate ZIP compression is unavailable in this runtime.');}
 const reader=new Blob([data]).stream().pipeThrough(stream).getReader(),chunks=[];let length=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>=data.length){await reader.cancel();return null;}chunks.push(value);}
  const output=new Uint8Array(length);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}return output;
 }finally{reader.releaseLock();}
}
async function writeCompressedZipEntries(records){
 // Copy before the first await so edits to caller-owned buffers cannot change export bytes.
 const entries=zipRecords(records).map(e=>({...e,data:new Uint8Array(e.data),method:0}));let length=22;
 for(const entry of entries)length+=76+2*entry.name.length;
 if(length>MAX_OUTPUT)throw Error('Compressed ZIP output exceeds 32 MB.');
 for(const entry of entries){const compressed=entry.kind==='file'?await deflateSmaller(entry.data):null;entry.method=compressed?8:0;entry.payload=compressed||entry.data;length+=entry.payload.length;if(length>MAX_OUTPUT)throw Error('Compressed ZIP output exceeds 32 MB.');}
 return assembleZip(entries,'Compressed');
}
function assembleZip(entries,label){
 let length=22;for(const e of entries)length+=76+2*e.name.length+e.payload.length;if(length>MAX_OUTPUT)throw Error(label+' ZIP output exceeds 32 MB.');
 const bytes=new Uint8Array(length),view=new DataView(bytes.buffer),u16=(o,v)=>view.setUint16(o,v,true),u32=(o,v)=>view.setUint32(o,v,true);let cursor=0;
 for(const e of entries){e.offset=cursor;e.crc=crc32(e.data);e.stamp=timestamp(e.modified);u32(cursor,0x04034b50);u16(cursor+4,20);u16(cursor+6,0x800);u16(cursor+8,e.method);u16(cursor+10,e.stamp.time);u16(cursor+12,e.stamp.date);u32(cursor+14,e.crc);u32(cursor+18,e.payload.length);u32(cursor+22,e.data.length);u16(cursor+26,e.name.length);bytes.set(e.name,cursor+30);bytes.set(e.payload,cursor+30+e.name.length);cursor+=30+e.name.length+e.payload.length;}
 const central=cursor;
 for(const e of entries){u32(cursor,0x02014b50);u16(cursor+4,(3<<8)|20);u16(cursor+6,20);u16(cursor+8,0x800);u16(cursor+10,e.method);u16(cursor+12,e.stamp.time);u16(cursor+14,e.stamp.date);u32(cursor+16,e.crc);u32(cursor+20,e.payload.length);u32(cursor+24,e.data.length);u16(cursor+28,e.name.length);u32(cursor+38,(((e.kind==='directory'?0o40000:0o100000)|(e.permissions??(e.kind==='directory'?0o755:0o644)))<<16)|(e.kind==='directory'?16:0));u32(cursor+42,e.offset);bytes.set(e.name,cursor+46);cursor+=46+e.name.length;}
 u32(cursor,0x06054b50);u16(cursor+8,entries.length);u16(cursor+10,entries.length);u32(cursor+12,cursor-central);u32(cursor+16,central);return bytes;
}
async function snapshot(archive){
 if(!archive||!(archive.entries instanceof Map)||typeof archive.read!=='function')throw Error('Choose a parsed archive.');
 const read=archive.read.bind(archive);
 const records=[...archive.entries].map(([path,e])=>{if(e.path!==path)throw Error('Archive entry path mismatch.');if(e.kind==='directory'&&(e.size>0||e.crc!=null&&e.crc!==0))throw Error('Archive directory integrity check failed.');return {...e,data:new Uint8Array()};});validateEntries(records);
 let total=0;for(const e of records)if(e.kind==='file'){const data=await read(e.path);if(!(data instanceof Uint8Array)||data.length!==e.size)throw Error('Archive file size mismatch.');if(e.crc!=null&&crc32(data)!==e.crc)throw Error('Archive file CRC integrity check failed.');total+=data.length;if(total>MAX_TOTAL)throw Error('Archive expands beyond 64 MB.');e.data=new Uint8Array(data);}
 return validateEntries(records);
}
const within=(path,parent)=>path===parent||path.startsWith(parent+'/');
function selectedAncestor(path,selection,includeSelf=true){let candidate=path;if(includeSelf&&selection.has(candidate))return true;while(candidate.includes('/')){candidate=candidate.slice(0,candidate.lastIndexOf('/'));if(selection.has(candidate))return true;}return false;}
function writeTarEntries(records){return writeValidatedTar([...validateEntries(records).values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0));}
async function writeTarGzipEntries(records){return writeValidatedTarGzip([...validateEntries(records).values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0));}
function validateCompression(compression){if(compression!==undefined&&!['preserve','stored','deflate'].includes(compression))throw Error('Choose preserve, stored or deflate ZIP compression.');}
async function finishDraft(target,entries,compression,origins=new Map()){
 const checked=validateEntries(entries);
 if(compression==='preserve'||compression===undefined&&(isZipArchive(target)||target==null&&origins.size>0))return preserveZipArchive(target,checked.values(),{origins});
 if(compression==='stored')return writeZipEntries(checked.values());
 if(compression==='deflate')return writeCompressedZipEntries(checked.values());
 return writeArchiveDraft(checked.values());
}
async function writeArchive(archive,{format='zip',compression}={}){if(!['zip','tar','tar.gz'].includes(format))throw Error('Choose ZIP, TAR or TAR.GZ output.');if(format==='zip')validateCompression(compression);const entries=(await snapshot(archive)).values();if(format==='tar')return writeTarEntries(entries);if(format==='tar.gz')return writeTarGzipEntries(entries);return finishDraft(archive,entries,compression===undefined&&!isZipArchive(archive)?'stored':compression);}
function prepareArchiveAdd(target,files,destination=''){
 if(typeof destination!=='string')throw Error('Enter a destination folder.');if(destination)portablePath(destination);
 if(!Array.isArray(files)||!files.length||files.length>5000)throw Error('Choose between 1 and 5,000 files.');
 const incoming=files.map(file=>{portablePath(file.name);if(file.name.includes('/'))throw Error('Choose files with simple names.');return {path:destination?destination+'/'+file.name:file.name,kind:'file',data:file.data instanceof Uint8Array?new Uint8Array(file.data):file.data,modified:file.modified??null,...(file.permissions===undefined?{}:{permissions:file.permissions})};});
 validateEntries(incoming);
 return prepareIncoming(target,incoming);
}
function prepareArchiveFolderAdd(target,records,destination=''){
 if(typeof destination!=='string')throw Error('Enter a destination folder.');if(destination)portablePath(destination);
 if(!Array.isArray(records)||!records.length||records.length>5000)throw Error('Choose a folder with between 1 and 5,000 entries.');
 const incoming=records.map(entry=>{portablePath(entry.path);if(!['file','directory'].includes(entry.kind))throw Error('Unsupported archive entry kind.');if(entry.modified!=null&&typeof entry.modified!=='string')throw Error('Invalid archive modification date.');if(entry.kind==='directory'&&entry.data!=null&&(!(entry.data instanceof Uint8Array)||entry.data.length))throw Error('Archive directory contains data.');return {path:destination?destination+'/'+entry.path:entry.path,kind:entry.kind,data:entry.kind==='directory'?new Uint8Array():entry.data instanceof Uint8Array?new Uint8Array(entry.data):entry.data,modified:entry.modified??null,...(entry.permissions===undefined?{}:{permissions:entry.permissions})};});
 validateEntries(incoming);
 const root=records[0].path;if(root.includes('/')||records[0].kind!=='directory'||records.some(entry=>!within(entry.path,root)))throw Error('Choose one complete folder tree.');
 return prepareIncoming(target,incoming);
}
function prepareIncoming(target,incoming){
 const combined=new Map([...(target?.entries||[])].map(([path,e])=>[path,{...e,data:new Uint8Array()}]));let overwrites=0,merges=0;
 for(const entry of incoming){const prior=combined.get(entry.path);if(prior&&prior.kind!==entry.kind)throw Error('File and folder types conflict: '+entry.path);if(prior){if(entry.kind==='file')overwrites++;else merges++;}combined.set(entry.path,entry);}
 const checked=validateEntries(combined.values()),added=new Set(incoming.map(e=>e.path));let overhead=22,total=0;
 for(const e of checked.values()){const size=e.kind==='file'?(added.has(e.path)?e.data.length:target.entries.get(e.path).size):0;if(!Number.isSafeInteger(size)||size<0)throw Error('Invalid archive file size.');total+=size;overhead+=76+2*new TextEncoder().encode(e.path+(e.kind==='directory'?'/':'')).length;}
 if(total>MAX_TOTAL)throw Error('Archive expands beyond 64 MB.');if(overhead>MAX_OUTPUT)throw Error('ZIP headers exceed 32 MB.');
 return {entries:incoming,overwrites,merges};
}
async function editArchive(target,{action,paths,source,newPath,files,destination,compression}={}){
 validateCompression(compression);
 if(action==='add'||action==='add-folder'){const plan=(action==='add'?prepareArchiveAdd:prepareArchiveFolderAdd)(target,files,destination),entries=target==null?new Map():await snapshot(target);for(const entry of plan.entries){const prior=entries.get(entry.path),preserving=compression==='preserve'||compression===undefined&&isZipArchive(target);entries.set(entry.path,{...entry,modified:preserving&&entry.modified===null&&prior?prior.modified:entry.modified,data:new Uint8Array(entry.data)});}return finishDraft(target,entries.values(),compression);}
 if(!['copy','delete','rename'].includes(action))throw Error('Unknown archive edit action.');if(!Array.isArray(paths)||!paths.length||paths.length>MAX_ENTRIES)throw Error('Select archive entries.');
 const selected=[...new Set(paths.map(portablePath))];if(action==='rename'&&selected.length!==1)throw Error('Rename one archive entry at a time.');if(action==='rename')portablePath(newPath);
 const [targetEntries,copiedEntries]=await Promise.all([target==null&&action==='copy'?Promise.resolve(new Map()):snapshot(target),action==='copy'?snapshot(source):Promise.resolve(null)]),sourceEntries=action==='copy'?copiedEntries:targetEntries,origins=new Map();
 for(const path of selected)if(!sourceEntries.has(path))throw Error('Selected archive entry no longer exists.');
 const selection=new Set(selected),roots=selected.filter(path=>!selectedAncestor(path,selection,false)),rootSet=new Set(roots);
 if(action==='copy'){for(const e of sourceEntries.values())if(selectedAncestor(e.path,rootSet)){const prior=targetEntries.get(e.path);if(prior&&prior.kind!==e.kind)throw Error('File and folder types conflict.');targetEntries.set(e.path,{...e});if(isZipArchive(source))origins.set(e.path,{archive:source,path:e.path});}}
 else if(action==='delete'){for(const path of targetEntries.keys())if(selectedAncestor(path,rootSet))targetEntries.delete(path);}
 else {const oldPath=roots[0];if(within(newPath,oldPath)||within(oldPath,newPath))throw Error('Cannot rename a folder into itself or an ancestor.');if(targetEntries.has(newPath))throw Error('Rename destination already exists.');const moving=[...targetEntries.values()].filter(e=>within(e.path,oldPath));for(const e of moving){const path=newPath+e.path.slice(oldPath.length);if(targetEntries.has(path))throw Error('Rename destination already exists.');}for(const e of moving)targetEntries.delete(e.path);for(const e of moving){const path=newPath+e.path.slice(oldPath.length);targetEntries.set(path,{...e,path});if(isZipArchive(target))origins.set(path,{archive:target,path:e.path});}}
 return finishDraft(target,targetEntries.values(),compression,origins);
}
module.exports={isZipArchive,writeTarEntries,writeTarGzipEntries,editArchive,writeArchive,writeZipEntries,writeCompressedZipEntries,prepareArchiveAdd,prepareArchiveFolderAdd};
