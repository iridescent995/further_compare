'use strict';
const fsDefault=require('node:fs/promises'),path=require('node:path'),{constants}=require('node:fs');
const MIME=Buffer.from('application/vnd.oasis.opendocument.spreadsheet'),CFB=Buffer.from('d0cf11e0a1b11ae1','hex');
const signature=value=>value.signature||`${value.dev}:${value.ino}:${value.size}:${value.mtimeNs}:${value.ctimeNs}`;
const unchanged=(a,b)=>signature(a)===signature(b);
const protectedTableSourceKind=file=>/\.(ods|xls|xlsb)$/i.exec(file)?.[1].toLowerCase()||null;
function assertSource(destination,target,sources,allowNewOds=false){
 const kind=protectedTableSourceKind(destination);
 if(kind&&!(allowNewOds&&kind==='ods'&&!target))throw Error(`Export table values to CSV or a new XLSX file. ${kind.toUpperCase()} documents must remain unchanged.`);
 for(const source of sources){
  if(path.resolve(source.path)===path.resolve(destination)||target&&String(source.dev)===String(target.dev)&&String(source.ino)===String(target.ino))throw Error(`Choose a separate output file; this destination is an ${(source.sourceKind||protectedTableSourceKind(source.path)||'ODS').toUpperCase()} source document.`);
 }
}
async function readAt(handle,length,position){const bytes=Buffer.alloc(length);let offset=0;while(offset<length){const r=await handle.read(bytes,offset,length-offset,position+offset);if(!r.bytesRead)break;offset+=r.bytesRead;}return bytes.subarray(0,offset);}
// No extraction or decompression. Conservatively refuse ZIP destinations except
// recognisable ordinary XLSX packages; unrecognised/ambiguous ZIPs may be XLSB.
async function inspectZipDestination(handle,size){
 const refuse=()=>{throw Error('Choose a separate output file; this ZIP destination may contain an XLSB or another source document.');};
 const tailSize=Math.min(size,65557),tail=await readAt(handle,tailSize,size-tailSize);if(tail.length!==tailSize)refuse();
 let end=-1;for(let p=tail.length-22;p>=0;p--)if(tail.readUInt32LE(p)===0x06054b50&&p+22+tail.readUInt16LE(p+20)===tail.length){end=p;break;}
 if(end<0)refuse();
 const disk=tail.readUInt16LE(end+4),startDisk=tail.readUInt16LE(end+6),count=tail.readUInt16LE(end+10),length=tail.readUInt32LE(end+12),offset=tail.readUInt32LE(end+16),eocd=size-tailSize+end;
 if(disk||startDisk||count!==tail.readUInt16LE(end+8)||count===65535||count>4096||length>4*1024*1024||offset+length!==eocd)refuse();
 const central=await readAt(handle,length,offset);if(central.length!==length)refuse();let p=0,xml=false;const names=new Set();
 for(let i=0;i<count;i++){
  if(p+46>central.length||central.readUInt32LE(p)!==0x02014b50)refuse();
  const n=central.readUInt16LE(p+28),extra=central.readUInt16LE(p+30),comment=central.readUInt16LE(p+32),next=p+46+n+extra+comment;
  if(!n||next>central.length||central.readUInt16LE(p+34)||central.readUInt32LE(p+42)>=offset)refuse();
  const name=central.subarray(p+46,p+46+n).toString('utf8').replace(/\\/g,'/').toLowerCase();if(names.has(name))refuse();names.add(name);
  if(/(^|\/)workbook\.bin$/.test(name))throw Error('Choose a separate output file; this destination contains an XLSB document.');
  if(name==='xl/workbook.xml')xml=true;p=next;
 }
 if(p!==central.length||!xml)refuse();
}
/** Restriction only: source records never grant read/write authority. Saved
 * sessions carry no native identity. Inspect the authorized destination itself
 * to protect renamed ODS/XLS/XLSB aliases, using bounded reads and no inflation.
 */
async function assertTableValueTarget(destination,target,sources=[],fs=fsDefault,allowNewOds=false){
 assertSource(destination,target,sources,allowNewOds);
 if(!target)return;
 let handle;
 try{
  handle=await fs.open(destination,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  const before=await handle.stat({bigint:true});
  if(!before.isFile()||!unchanged(before,target))throw Error('The export destination changed. Choose it again.');
  const prefix=await readAt(handle,30+8+MIME.length,0);let failure;
  try{
   if(prefix.length>=8&&prefix.subarray(0,8).equals(CFB))throw Error('Choose a separate output file; this destination contains an XLS or another compound source document.');
   const zip=prefix.length>=4&&prefix.readUInt32LE(0)===0x04034b50;
   if(zip&&prefix.length===30+8+MIME.length&&prefix.readUInt16LE(8)===0&&prefix.readUInt16LE(26)===8&&prefix.readUInt16LE(28)===0&&prefix.subarray(30,38).equals(Buffer.from('mimetype'))&&prefix.subarray(38).equals(MIME))throw Error('Choose a separate output file; this destination contains an ODS document.');
   if(zip){if(before.size>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Export destination is too large to inspect safely.');await inspectZipDestination(handle,Number(before.size));}
  }catch(error){failure=error;}
  if(!unchanged(before,await handle.stat({bigint:true}))||!unchanged(before,await fs.lstat(destination,{bigint:true})))throw Error('The export destination changed. Choose it again.');
  if(failure)throw failure;
 }finally{await handle?.close();}
}
async function assertOdsCopyTarget(destination,target,sources=[],fs=fsDefault){
 if(!/\.ods$/i.test(destination))throw Error('Save the preserving workbook copy with an .ods filename.');
 if(target)throw Error('Choose a new output file for the ODS workbook copy; existing documents must remain unchanged.');
 return assertTableValueTarget(destination,target,sources,fs,true);
}
module.exports={assertTableValueTarget,assertOdsCopyTarget,protectedTableSourceKind};
