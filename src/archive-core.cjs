'use strict';
const MAX_INPUT=32*1024*1024,MAX_TOTAL=64*1024*1024,MAX_ENTRIES=50000;
const crcTable=Uint32Array.from({length:256},(_,i)=>{for(let k=0;k<8;k++)i=(i&1)?0xedb88320^(i>>>1):i>>>1;return i>>>0;});
function crc32(bytes){let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
function safeName(name){if(!name||name.length>32768||/[\x00-\x1f\\]/.test(name)||name.startsWith('/')||/^[A-Za-z]:/.test(name))throw Error('Unsafe archive entry name.');const pieces=name.replace(/\/$/,'').split('/');if(pieces.some(p=>!p||p==='.'||p==='..'))throw Error('Unsafe archive entry path.');return pieces.join('/');}
function dosTime(date,time){const year=1980+(date>>>9),month=(date>>>5)&15,day=date&31,hour=time>>>11,minute=(time>>>5)&63,second=(time&31)*2;if(month<1||month>12||day<1||day>31||hour>23||minute>59||second>59)return null;const value=new Date(year,month-1,day,hour,minute,second);if(value.getFullYear()!==year||value.getMonth()!==month-1||value.getDate()!==day)return null;return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:${String(second).padStart(2,'0')}`;}
function parseZip(input){
 const source=input instanceof Uint8Array?input:new Uint8Array(input);if(source.length<22||source.length>MAX_INPUT)throw Error('Choose a ZIP or JAR archive up to 32 MB.');const bytes=Uint8Array.from(source);
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=o=>view.getUint16(o,true),u32=o=>view.getUint32(o,true);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(u32(i)===0x06054b50&&i+22+u16(i+20)===bytes.length){end=i;break;}
 if(end<0)throw Error('Invalid ZIP end record.');
 // ZIP64 values are decoded without rounding before any range arithmetic/allocation.
 const u64=o=>{if(o<0||o+8>bytes.length)throw Error('Truncated ZIP64 value.');const value=view.getBigUint64(o,true);if(value>BigInt(Number.MAX_SAFE_INTEGER))throw Error('ZIP64 value exceeds safe limits.');return Number(value);};
 let count=u16(end+10),centralSize=u32(end+12),centralOffset=u32(end+16),centralEnd=end;
 const diskCount=u16(end+8),hasLocator=end>=20&&u32(end-20)===0x07064b50;
 if(u16(end+4)||u16(end+6))throw Error('Multi-disk ZIP archives are unsupported.');
 if(hasLocator){
  const locator=end-20;if(u32(locator+4)!==0||u32(locator+16)!==1)throw Error('Multi-disk ZIP64 archives are unsupported.');
  const record=u64(locator+8);if(record>locator-56||u32(record)!==0x06064b50)throw Error('Invalid ZIP64 end record offset.');
  const length=u64(record+4);if(length<44||length>locator-record-12||record+12+length!==locator)throw Error('Invalid ZIP64 end record size.');
  if(u32(record+16)||u32(record+20))throw Error('Multi-disk ZIP64 archives are unsupported.');
  const diskEntries=u64(record+24),allEntries=u64(record+32),directorySize=u64(record+40),directoryOffset=u64(record+48);
  if(diskEntries!==allEntries)throw Error('Multi-disk ZIP64 archives are unsupported.');
  if((count!==65535&&count!==allEntries)||(diskCount!==65535&&diskCount!==allEntries)||(centralSize!==0xffffffff&&centralSize!==directorySize)||(centralOffset!==0xffffffff&&centralOffset!==directoryOffset))throw Error('ZIP64 and classic directory records disagree.');
  // Extensible sector records have a two-byte identifier and four-byte length.
  for(let offset=record+56;offset<locator;){if(offset+6>locator)throw Error('Truncated ZIP64 extensible record.');const next=offset+6+u32(offset+2);if(next>locator)throw Error('Truncated ZIP64 extensible data.');offset=next;}
  count=allEntries;centralSize=directorySize;centralOffset=directoryOffset;centralEnd=record;
 }else if(count===65535||diskCount===65535||centralSize===0xffffffff||centralOffset===0xffffffff)throw Error('Missing ZIP64 end record.');
 else if(diskCount!==count)throw Error('Multi-disk ZIP archives are unsupported.');
 if(count>MAX_ENTRIES||centralOffset>centralEnd||centralSize!==centralEnd-centralOffset)throw Error('Invalid or oversized ZIP directory.');
 function zip64Extra(start,length,fields){
  let found=null;const limit=start+length;
  for(let offset=start;offset<limit;){if(offset+4>limit)throw Error('Truncated ZIP extra field.');const id=u16(offset),size=u16(offset+2),next=offset+4+size;if(next>limit)throw Error('Truncated ZIP extra data.');if(id===1){if(found)throw Error('Duplicate ZIP64 extra field.');found={start:offset+4,size};}offset=next;}
  const required=fields.reduce((sum,field)=>sum+(field.required?field.width:0),0);
  if(required&&!found)throw Error('Missing ZIP64 extra field.');
  if(found&&(!required||found.size!==required))throw Error('Ambiguous or truncated ZIP64 extra field.');
  let offset=found?.start;const result={present:Boolean(found)};
  for(const field of fields){result[field.name]=field.required?(field.width===8?u64(offset):u32(offset)):field.value;if(field.required)offset+=field.width;}
  return result;
 }
 const entries=new Map(),explicit=new Set(),ranges=[],preserved=[];let cursor=centralOffset,total=0;
 const decodeName=(start,length,flags)=>{const chunk=bytes.subarray(start,start+length);if(!(flags&0x800)&&chunk.some(b=>b>127))throw Error('Archive names must use UTF-8 or ASCII encoding.');return new TextDecoder('utf-8',{fatal:true}).decode(chunk);};
 for(let index=0;index<count;index++){
  if(cursor+46>centralEnd||u32(cursor)!==0x02014b50)throw Error('Invalid ZIP directory entry.');
  const flags=u16(cursor+8),method=u16(cursor+10),crc=u32(cursor+16),rawCompressed=u32(cursor+20),rawSize=u32(cursor+24),nameLength=u16(cursor+28),extraLength=u16(cursor+30),commentLength=u16(cursor+32),rawDisk=u16(cursor+34),attributes=u32(cursor+38),rawLocal=u32(cursor+42),next=cursor+46+nameLength+extraLength+commentLength;
  if(next>centralEnd||!nameLength)throw Error('Truncated ZIP directory entry.');
  if(flags&1||flags&0x40)throw Object.assign(Error('Encrypted archive requires a password-capable reader.'),{code:'ARCHIVE_ENCRYPTED'});
  const extended=zip64Extra(cursor+46+nameLength,extraLength,[{name:'size',value:rawSize,required:rawSize===0xffffffff,width:8},{name:'compressed',value:rawCompressed,required:rawCompressed===0xffffffff,width:8},{name:'local',value:rawLocal,required:rawLocal===0xffffffff,width:8},{name:'disk',value:rawDisk,required:rawDisk===65535,width:4}]);
  const {compressed,size,local,disk}=extended;if(disk)throw Error('Multi-disk ZIP archives are unsupported.');
  if(size>MAX_TOTAL||compressed>MAX_INPUT)throw Error('ZIP entry exceeds archive size limits.');
  if(![0,8].includes(method))throw Error('Only stored and deflated ZIP entries are supported.');
  // External attributes are host-dependent (PKWARE APPNOTE 4.4.2/4.4.15).
  // Only Unix-origin mode words establish POSIX permissions; zero without a
  // file type is unknown, whereas S_IFREG alone preserves explicit mode 000.
  const unixMode=attributes>>>16,host=u16(cursor+4)>>>8,permissions=host===3&&unixMode!==0?unixMode&0o777:undefined;
  const mode=unixMode&0xf000;if(mode===0xa000)throw Error('Symbolic links in archives are unsupported.');if(mode&&mode!==0x8000&&mode!==0x4000)throw Error('Special archive entries are unsupported.');
  const rawName=decodeName(cursor+46,nameLength,flags),name=safeName(rawName),directory=rawName.endsWith('/');
  if(explicit.has(name)||entries.has(name)&&!directory)throw Error('Duplicate or conflicting archive entry.');explicit.add(name);
  if(directory&&size!==0)throw Error('Archive directory contains file data.');
  total+=size;if(total>MAX_TOTAL)throw Error('Archive expands beyond the 64 MB content limit.');
  if(local>centralOffset-30||u32(local)!==0x04034b50)throw Error('Invalid ZIP local header.');
  const localFlags=u16(local+6),localMethod=u16(local+8),localNameLength=u16(local+26),localExtraLength=u16(local+28),start=local+30+localNameLength+localExtraLength;
  if(start>centralOffset||compressed>centralOffset-start||localFlags!==flags||localMethod!==method||decodeName(local+30,localNameLength,flags)!==rawName)throw Error('ZIP local header does not match its directory.');
  const rawLocalSize=u32(local+22),rawLocalCompressed=u32(local+18),local64=rawLocalSize===0xffffffff||rawLocalCompressed===0xffffffff;
  if(local64&&(rawLocalSize!==0xffffffff||rawLocalCompressed!==0xffffffff))throw Error('ZIP64 local header requires both sizes.');
  const localValues=zip64Extra(local+30+localNameLength,localExtraLength,[{name:'size',value:rawLocalSize,required:local64,width:8},{name:'compressed',value:rawLocalCompressed,required:local64,width:8}]),localCRC=u32(local+14);
  if(flags&8){if((localCRC!==0&&localCRC!==crc)||(localValues.size!==0&&localValues.size!==size)||(localValues.compressed!==0&&localValues.compressed!==compressed))throw Error('ZIP local sizes or checksum disagree.');}
  else if(localCRC!==crc||localValues.compressed!==compressed||localValues.size!==size)throw Error('ZIP local sizes or checksum disagree.');
  if(method===0&&compressed!==size)throw Error('Invalid stored ZIP entry size.');
  let recordEnd=start+compressed;
  if(flags&8){
   const wide=localValues.present||extended.present,width=wide?8:4,candidates=[];
   for(const signature of [false,true]){
    const offset=recordEnd+(signature?4:0),finish=offset+4+2*width;if(finish>centralOffset||(signature&&u32(recordEnd)!==0x08074b50))continue;
    // Compare 64-bit descriptor numbers as BigInt: malformed values never round.
    const sizesMatch=wide?view.getBigUint64(offset+4,true)===BigInt(compressed)&&view.getBigUint64(offset+12,true)===BigInt(size):u32(offset+4)===compressed&&u32(offset+8)===size;
    if(u32(offset)===crc&&sizesMatch)candidates.push(finish);
   }
   if(candidates.length!==1)throw Error('Missing, ambiguous or mismatched ZIP data descriptor.');recordEnd=candidates[0];
  }
  ranges.push([local,recordEnd]);preserved.push({path:name,kind:directory?'directory':'file',size,compressed,crc,method,start,local,recordEnd,central:cursor,centralEnd:next,localExtraStart:local+30+localNameLength,localExtraLength,centralExtraStart:cursor+46+nameLength,centralExtraLength:extraLength,flags,rawName,...(permissions===undefined?{}:{permissions}),modified:dosTime(u16(cursor+14),u16(cursor+12))});
  let parent=name.includes('/')?name.slice(0,name.lastIndexOf('/')):'';
  while(parent){const prior=entries.get(parent);if(prior&&prior.kind!=='directory')throw Error('Archive file used as a parent directory.');if(!prior)entries.set(parent,{path:parent,name:parent.split('/').pop(),kind:'directory',size:0,modified:null,implicit:true});parent=parent.includes('/')?parent.slice(0,parent.lastIndexOf('/')):'';}
  if(entries.get(name)?.kind==='directory'&&!directory)throw Error('Archive path conflicts with a directory.');
  entries.set(name,{path:name,name:name.split('/').pop(),kind:directory?'directory':'file',size,compressed,crc,method,start,...(permissions===undefined?{}:{permissions}),modified:dosTime(u16(cursor+14),u16(cursor+12))});
  if(entries.size>MAX_ENTRIES)throw Error('Archive exceeds 50,000 entries.');cursor=next;
 }
 if(cursor!==centralEnd)throw Error('Invalid ZIP central directory size.');
 ranges.sort((a,b)=>a[0]-b[0]);for(let i=1;i<ranges.length;i++)if(ranges[i][0]<ranges[i-1][1])throw Error('Overlapping ZIP entries are unsupported.');
 const cache=new Map();let cacheBytes=0;
 const readEntries=new Map([...entries].map(([k,v])=>[k,{...v}]));
 async function read(name){const entry=readEntries.get(safeName(name));if(!entry||entry.kind!=='file')throw Error('Choose an archive file.');if(cache.has(name))return cache.get(name).slice();const compressed=bytes.slice(entry.start,entry.start+entry.compressed);let output;
  if(entry.method===0)output=compressed;
  else{const reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let length=0;try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>entry.size||length>MAX_TOTAL){await reader.cancel();throw Error('ZIP entry exceeds its declared size.');}chunks.push(value);}output=new Uint8Array(length);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}}catch(error){throw Error('Could not safely decompress ZIP entry: '+error.message);}finally{reader.releaseLock();}}
  if(output.length!==entry.size||crc32(output)!==entry.crc)throw Error('ZIP entry failed its size or CRC integrity check.');
  if(cacheBytes+output.length<=MAX_TOTAL){cache.set(name,output);cacheBytes+=output.length;}return output.slice();
 }
 function list(parent=''){if(parent)safeName(parent);return [...entries.values()].filter(e=>(e.path.includes('/')?e.path.slice(0,e.path.lastIndexOf('/')):'')===parent).sort((a,b)=>Number(b.kind==='directory')-Number(a.kind==='directory')||a.name.localeCompare(b.name));}
 const result={entries,list,read,totalBytes:total};require('./zip-preserve.cjs').registerZipSnapshot(result,{bytes,records:preserved,implicitPaths:new Set([...entries.values()].filter(e=>e.implicit).map(e=>e.path)),centralOffset,centralEnd,end,hasLocator,crc32});return result;
}
function parseArchive(input){const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length>MAX_INPUT)throw Error('Choose an archive up to 32 MB.');const {looksLikeTar,parseTar}=require('./tar-core.cjs');return looksLikeTar(bytes)?parseTar(bytes,safeName):parseZip(bytes);}
async function parseArchiveInput(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length>MAX_INPUT)throw Error('Choose an archive up to 32 MB.');if(bytes[0]!==31||bytes[1]!==139)return parseArchive(bytes);
 const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX_TOTAL){await reader.cancel();throw Error('Gzip archive exceeds the 64 MB expanded limit.');}chunks.push(value);}const output=new Uint8Array(length);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}return require('./tar-core.cjs').parseTar(output,safeName);}finally{reader.releaseLock();}
}
async function compareArchiveNode(a,b,parent=''){
 const left=new Map((a?.list(parent)||[]).map(e=>[e.path,e])),right=new Map((b?.list(parent)||[]).map(e=>[e.path,e]));const rows=[];
 for(const name of [...new Set([...left.keys(),...right.keys()])]){const x=left.get(name),y=right.get(name);let status=!x?'right':!y?'left':x.kind!==y.kind?'conflict':x.kind==='directory'?'directory':'pending';
  if(status==='pending'){const one=await a.read(name),two=await b.read(name);status=one.length===two.length&&one.every((v,i)=>v===two[i])?'equal':'changed';}
  rows.push({path:name,name:(x||y).name,kind:x?.kind==='directory'||y?.kind==='directory'?'directory':'file',status,sizeA:x?.kind==='file'?x.size:null,sizeB:y?.kind==='file'?y.size:null,modifiedA:x?.modified??null,modifiedB:y?.modified??null});}
 return rows.sort((a,b)=>Number(b.kind==='directory')-Number(a.kind==='directory')||a.name.localeCompare(b.name));
}
const {hasZipSource,preserveZipArchive}=require('./zip-preserve.cjs');
module.exports={parseArchive,parseArchiveInput,compareArchiveNode,crc32,hasZipSource,preserveZipArchive};
