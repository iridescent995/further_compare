import archiveCore from './archive-core.cjs';
import {ZipReader,Uint8ArrayReader,ERR_INVALID_PASSWORD,ERR_INVALID_CRC32,ERR_INVALID_COMPRESSED_DATA,ERR_INVALID_UNCOMPRESSED_SIZE} from '@zip.js/zip.js/lib/zip-native.js';
const MAX_INPUT=32*1024*1024,MAX_TOTAL=64*1024*1024,MAX_ENTRIES=50000;
const fail=message=>{throw Error('Encrypted ZIP: '+message);};
function inspect(bytes){
 if(bytes.length<22||bytes.length>MAX_INPUT)fail('input exceeds supported bounds');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=p=>view.getUint16(p,true),u32=p=>view.getUint32(p,true),u64=p=>{const n=view.getBigUint64(p,true);if(n>BigInt(Number.MAX_SAFE_INTEGER))fail('ZIP64 value exceeds bounds');return Number(n);};let end=-1;
 for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(u32(p)===0x06054b50&&p+22+u16(p+20)===bytes.length){end=p;break;}
 if(end<0)fail('missing end record');let count=u16(end+10),central=u32(end+16);
 if(end>=20&&u32(end-20)===0x07064b50){const pos=u64(end-12);if(pos<0||pos>end-76||u32(pos)!==0x06064b50)fail('invalid ZIP64 record');count=u64(pos+32);central=u64(pos+48);}
 if(count>MAX_ENTRIES||central>end)fail('invalid directory bounds');
 const validation=bytes.slice(),vv=new DataView(validation.buffer),records=[];let p=central;
 function extra(start,length,id){let found=null;for(let q=start;q<start+length;){if(q+4>start+length)fail('truncated extra field');const size=u16(q+2),next=q+4+size;if(next>start+length||next>bytes.length)fail('truncated extra value');if(u16(q)===id){if(found)fail('duplicate encryption metadata');found={start:q+4,size};}q=next;}return found;}
 for(let i=0;i<count;i++){
  if(p+46>end||u32(p)!==0x02014b50)fail('invalid central entry');const flags=u16(p+8),method=u16(p+10),nl=u16(p+28),el=u16(p+30),cl=u16(p+32),next=p+46+nl+el+cl;if(next>end)fail('truncated central entry');
  let local=u32(p+42);if(local===0xffffffff){const z=extra(p+46+nl,el,1);if(!z)fail('missing ZIP64 offset');let offset=z.start;if(u32(p+24)===0xffffffff)offset+=8;if(u32(p+20)===0xffffffff)offset+=8;if(offset+8>z.start+z.size)fail('truncated ZIP64 offset');local=u64(offset);}
  if(local+30>central||u32(local)!==0x04034b50)fail('invalid local entry');const lnl=u16(local+26),lel=u16(local+28);if(local+30+lnl+lel>central)fail('truncated local entry');
  const aes=extra(p+46+nl,el,0x9901),laes=extra(local+30+lnl,lel,0x9901);let encryption=null;
  if(flags&0x40||flags&0x2000)fail('strong or masked-header encryption is unsupported');
  if(u16(local+6)!==flags||u16(local+8)!==method)fail('local flags or method disagree');
  if(flags&1){
   if(method===99){
   if(!aes||!laes||aes.size!==7||laes.size!==7)fail('invalid AES metadata');
   const a=bytes.subarray(aes.start,aes.start+7),b=bytes.subarray(laes.start,laes.start+7);if(!a.every((v,i)=>v===b[i]))fail('local and central AES metadata disagree');
   const version=u16(aes.start),strength=bytes[aes.start+4],actual=u16(aes.start+5);if(![1,2].includes(version)||a[2]!==65||a[3]!==69||![1,2,3].includes(strength)||![0,8].includes(actual))fail('unsupported AES variant or compression');
   if(version===2&&u32(p+16)!==0)fail('AE-2 CRC must be zero');
   encryption={type:'aes',authenticated:true,version,strength,method:actual,salt:[0,8,12,16][strength]};
   }else{
    if(aes||laes)fail('AES metadata conflicts with legacy encryption');
    if(![0,8].includes(method))fail('unsupported legacy compression');
    // With descriptors the header password byte comes from DOS modification time.
    if(u16(local+10)!==u16(p+12))fail('local and central encryption timestamps disagree');
    encryption={type:'zipcrypto',authenticated:false,method};
   }
   // Reuse the mature structural ZIP validator on a private metadata-only view.
   // No plaintext or forged compressed data from this view is ever read.
   vv.setUint16(p+8,flags&~1,true);vv.setUint16(local+6,u16(local+6)&~1,true);vv.setUint16(p+10,8,true);vv.setUint16(local+8,8,true);
  }else if(aes||laes||method===99)fail('AES metadata without encryption flag');
  records.push({local,encryption});p=next;
 }
 const parsed=archiveCore.parseArchive(validation),files=[...parsed.entries.values()].filter(e=>!e.implicit);if(files.length!==records.length)fail('entry inventory mismatch');
 // Match by physical header rather than trusting library filename normalization.
 const byStart=new Map(records.map(r=>[r.local+30+u16(r.local+26)+u16(r.local+28),r]));let encrypted=false;
 for(const entry of files){const r=byStart.get(entry.start);if(!r)fail('entry boundary mismatch');if(r.encryption){encrypted=true;const overhead=r.encryption.type==='zipcrypto'?12:r.encryption.salt+12;if(entry.compressed<overhead||r.encryption.method===0&&entry.compressed-overhead!==entry.size)fail('invalid encrypted ciphertext size');entry.encryption=Object.freeze(r.encryption);}Object.freeze(entry);}
 if(!encrypted)fail('archive contains no encrypted entries');const entries=new Map([...parsed.entries].map(([k,v])=>[k,Object.freeze({...v})]));return {entries,totalBytes:parsed.totalBytes};
}
/** Read-only encrypted ZIP adapter. AES authenticates entry contents; legacy CRC does not. */
export async function openAesArchive(input,{password,signal}={}){
 if(!(input instanceof Uint8Array))fail('expected archive bytes');const bytes=input.slice(),parsed=inspect(bytes),controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const check=()=>{if(controller.signal.aborted)throw Object.assign(Error('Encrypted ZIP cancelled.'),{name:'AbortError'});};
 let disposed=false,busy=false;const options={checkAuthenticationCode:true,checkCrc32:true,strictness:'strict',checkOverlappingEntry:true,useWebWorkers:false};let reader;
 try{check();reader=new ZipReader(new Uint8ArrayReader(bytes),options);const loaded=await reader.getEntries();check();const library=new Map();for(const item of loaded){const name=item.filename.replace(/\/$/,'');if(library.has(name))fail('duplicate library entry');const expected=parsed.entries.get(name);if(!expected||expected.implicit||expected.size!==item.uncompressedSize||expected.compressed!==item.compressedSize||Boolean(expected.encryption)!==item.encrypted)fail('reader inventory disagrees');library.set(name,item);}if(library.size!==[...parsed.entries.values()].filter(e=>!e.implicit).length)fail('reader inventory incomplete');
  return {entries:new Map(parsed.entries),list(parent=''){return [...parsed.entries.values()].filter(e=>(e.path.includes('/')?e.path.slice(0,e.path.lastIndexOf('/')):'')===parent).sort((a,b)=>Number(b.kind==='directory')-Number(a.kind==='directory')||a.name.localeCompare(b.name));},totalBytes:parsed.totalBytes,readOnly:true,encrypted:true,
   async read(name,{password:entryPassword,signal:readSignal}={}){check();if(disposed)fail('reader is closed');if(busy)fail('wait for the current entry');const entry=parsed.entries.get(name),item=library.get(name);if(!entry||entry.kind!=='file'||!item)fail('choose an archive file');busy=true;let chunks=[],length=0,secret,rawPassword;const readController=new AbortController(),cancelRead=()=>readController.abort();controller.signal.addEventListener('abort',cancelRead,{once:true});readSignal?.addEventListener('abort',cancelRead,{once:true});if(readSignal?.aborted)cancelRead();const checkRead=()=>{check();if(readController.signal.aborted)throw Object.assign(Error('Encrypted ZIP read cancelled.'),{name:'AbortError'});};
    try{secret=entry.encryption?(entryPassword!==undefined?entryPassword:typeof password==='function'?await password({path:name,encryption:entry.encryption}):password):undefined;checkRead();if(entry.encryption&&(typeof secret!=='string'||secret.length>4096))fail('password required (maximum 4096 characters)');
     // Traditional ZIP has no password encoding marker. Use explicit UTF-8 bytes,
     // not zip.js's legacy charCodeAt conversion; never guess locale encodings.
     if(entry.encryption?.type==='zipcrypto')rawPassword=new TextEncoder().encode(secret);
     await item.getData(new WritableStream({write(chunk){checkRead();length+=chunk.length;if(length>entry.size||length>MAX_TOTAL)fail('expanded entry exceeds its size limit');chunks.push(chunk.slice());}}),{...options,password:secret,rawPassword,signal:readController.signal});checkRead();if(length!==entry.size)throw Error(ERR_INVALID_UNCOMPRESSED_SIZE);const output=new Uint8Array(length);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}if(entry.encryption?.type==='zipcrypto'&&archiveCore.crc32(output)!==entry.crc){output.fill(0);throw Error(ERR_INVALID_CRC32);}return output;
    }catch(error){checkRead();if(error?.message===ERR_INVALID_PASSWORD)error.code='ARCHIVE_PASSWORD';else if(entry.encryption?.type==='zipcrypto'&&[ERR_INVALID_CRC32,ERR_INVALID_COMPRESSED_DATA].includes(error?.message))error.code='ARCHIVE_PASSWORD_OR_CORRUPTION';throw error;}finally{controller.signal.removeEventListener('abort',cancelRead);readSignal?.removeEventListener('abort',cancelRead);secret=undefined;rawPassword?.fill(0);rawPassword=undefined;for(const chunk of chunks)chunk.fill(0);chunks=[];busy=false;}
   },async dispose(){if(disposed)return;disposed=true;password=undefined;controller.abort();signal?.removeEventListener('abort',abort);await reader.close();bytes.fill(0);}};
 }catch(error){password=undefined;controller.abort();signal?.removeEventListener('abort',abort);await reader?.close().catch(()=>{});bytes.fill(0);throw error;}
}
