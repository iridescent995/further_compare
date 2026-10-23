'use strict';
// Internal writer: callers must pass the portable entries checked by archive-edit.
const encoder=new TextEncoder(),MAX_OUTPUT=32*1024*1024,MAX_EXPANDED=64*1024*1024;
const padded=n=>Math.ceil(n/512)*512;
function mtime(value){
 const m=typeof value==='string'&&/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?: UTC|Z)?$/.exec(value);
 if(!m)return 0;
 const [,year,month,day,hour,minute,second]=m.map(Number),date=new Date(0);date.setUTCFullYear(year,month-1,day);date.setUTCHours(hour,minute,second,0);
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||hour>23||minute>59||second>59)return 0;
 return date.getTime()/1000;
}
function paxRecord(key,value){const body=encoder.encode(key+'='+value+'\n');let length=body.length+2;while(String(length).length+1+body.length!==length)length=String(length).length+1+body.length;return encoder.encode(length+' '+key+'='+value+'\n');}
function header(name,size,time,type,permissions){
 const out=new Uint8Array(512),text=(at,value)=>out.set(encoder.encode(value),at),octal=(at,width,value)=>text(at,value.toString(8).padStart(width-1,'0')+'\0');
 text(0,name);octal(100,8,permissions??(type==='5'?0o755:0o644));octal(108,8,0);octal(116,8,0);octal(124,12,size);octal(136,12,time);out.fill(32,148,156);text(156,type);text(257,'ustar\0');text(263,'00');let sum=0;for(const b of out)sum+=b;text(148,sum.toString(8).padStart(6,'0')+'\0 ');return out;
}
function tarBytes(entries,limit){
 const records=[];let length=1024,index=0;
 for(const entry of entries){const name=entry.path+(entry.kind==='directory'?'/':''),time=mtime(entry.modified),attrs=[];
  const extendedPath=encoder.encode(name).length>100||/[^\x20-\x7e]/.test(name);if(extendedPath)attrs.push(paxRecord('path',name));
  if(time<0||time>8589934591)attrs.push(paxRecord('mtime',String(time)));
  let pax=null;if(attrs.length){pax=new Uint8Array(attrs.reduce((n,a)=>n+a.length,0));let p=0;for(const a of attrs){pax.set(a,p);p+=a.length;}length+=512+padded(pax.length);}
  length+=512+padded(entry.data.length);if(length>limit)throw Error(limit===MAX_OUTPUT?'TAR output exceeds 32 MB.':'TAR.GZ expanded archive exceeds 64 MB including headers.');
  records.push({entry,name:extendedPath?'entry-'+index:name,time:time<0||time>8589934591?0:time,pax,index:index++});
 }
 const output=new Uint8Array(length);let cursor=0;
 for(const {entry,name,time,pax,index}of records){if(pax){output.set(header('PaxHeaders/'+index,pax.length,0,'x'),cursor);cursor+=512;output.set(pax,cursor);cursor+=padded(pax.length);}output.set(header(name,entry.data.length,time,entry.kind==='directory'?'5':'0',entry.permissions),cursor);cursor+=512;output.set(entry.data,cursor);cursor+=padded(entry.data.length);}
 return output;
}
function writeValidatedTar(entries){return tarBytes(entries,MAX_OUTPUT);}
async function writeValidatedTarGzip(entries){
 // Construct the immutable payload before awaiting compression.
 const payload=tarBytes(entries,MAX_EXPANDED);
 if(typeof CompressionStream!=='function')throw Error('Gzip compression is unavailable in this runtime.');
 let stream;try{stream=new CompressionStream('gzip');}catch{throw Error('Gzip compression is unavailable in this runtime.');}
 const reader=new Blob([payload]).stream().pipeThrough(stream).getReader(),chunks=[];let length=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>MAX_OUTPUT){await reader.cancel();throw Error('TAR.GZ output exceeds 32 MB.');}chunks.push(value);}const output=new Uint8Array(length);let cursor=0;for(const chunk of chunks){output.set(chunk,cursor);cursor+=chunk.length;}return output;}finally{reader.releaseLock();}
}
module.exports={writeValidatedTar,writeValidatedTarGzip};
