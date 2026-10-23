'use strict';
const LIMIT=64*1024*1024,decoder=new TextDecoder('utf-8',{fatal:true});
function field(bytes,start,length){const part=bytes.subarray(start,start+length),zero=part.indexOf(0);return decoder.decode(zero<0?part:part.subarray(0,zero));}
function number(bytes,start,length){const part=bytes.subarray(start,start+length);let value;if(part[0]&128){let n=BigInt(part[0]&127);for(let i=1;i<part.length;i++)n=(n<<8n)|BigInt(part[i]);if(part[0]&64)n-=1n<<BigInt(length*8-1);value=Number(n);}else{const text=field(bytes,start,length).trim();if(text&&!/^[0-7]+$/.test(text))throw Error('Invalid TAR numeric field.');value=text?parseInt(text,8):0;}if(!Number.isSafeInteger(value))throw Error('TAR numeric field is out of range.');return value;}
function checksum(bytes,p){let unsigned=0,signed=0;for(let i=0;i<512;i++){const value=i>=148&&i<156?32:bytes[p+i];unsigned+=value;signed+=value>127?value-256:value;}const expected=number(bytes,p+148,8);return expected===unsigned||expected===signed;}
function looksLikeTar(bytes){if(bytes.length<512)return false;try{return field(bytes,257,5)==='ustar'||bytes.subarray(0,512).every(b=>b===0)||checksum(bytes,0);}catch{return false;}}
function pax(bytes){
 if(bytes.length>1024*1024)throw Error('TAR extended metadata exceeds 1 MB.');const values=new Map();let p=0;
 while(p<bytes.length){let space=p;while(space<bytes.length&&bytes[space]!==32&&space-p<20)space++;const digits=decoder.decode(bytes.subarray(p,space));if(!/^[1-9][0-9]*$/.test(digits))throw Error('Invalid PAX record length.');const length=Number(digits),end=p+length;if(!Number.isSafeInteger(length)||end>bytes.length||end<=space+2||bytes[end-1]!==10)throw Error('Truncated PAX record.');const text=decoder.decode(bytes.subarray(space+1,end-1)),equal=text.indexOf('=');if(equal<1)throw Error('Invalid PAX record.');const key=text.slice(0,equal),value=text.slice(equal+1);if(!/^[!-~]+$/.test(key))throw Error('Invalid PAX key.');if(key.startsWith('GNU.sparse')||key==='SCHILY.realsize'||key==='SCHILY.filetype'&&value==='sparse')throw Error('Sparse TAR files are unsupported.');if(key==='hdrcharset'&&value&&value!=='ISO-IR 10646 2000 UTF-8')throw Error('TAR names must use UTF-8.');if(['path','size','mtime'].includes(key))values.set(key,value);p=end;}
 return values;
}
function parseTar(input,safeName){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length<1024||bytes.length>LIMIT||bytes.length%512)throw Error('Choose a complete TAR archive within the 64 MB expanded limit.');
 const entries=new Map(),explicit=new Set();let global=new Map(),local=new Map(),longName=null,p=0,total=0,headers=0,ended=false,pendingLocal=false;
 while(p+512<=bytes.length){
  if(bytes.subarray(p,p+512).every(b=>b===0)){if(p+1024>bytes.length||bytes.subarray(p).some(b=>b!==0))throw Error('Invalid TAR end records.');ended=true;break;}
  if(++headers>100000)throw Error('TAR has too many headers.');if(!checksum(bytes,p))throw Error('TAR header checksum failed.');
  const magic=field(bytes,p+257,6),posix=magic==='ustar',gnu=magic==='ustar ';if(magic&&!posix&&!gnu)throw Error('Unsupported TAR header format.');
  const type=String.fromCharCode(bytes[p+156]||48),metadata=['x','g','L'].includes(type);if(!metadata&&!['0','5','7'].includes(type))throw Error('TAR links, sparse files and special entries are unsupported.');
  const attrs=new Map(global);for(const [key,value]of local)value===''?attrs.delete(key):attrs.set(key,value);
  let size;if(!metadata&&attrs.has('size')){const raw=attrs.get('size');if(!/^[0-9]+$/.test(raw))throw Error('Invalid PAX size.');size=Number(raw);}else size=number(bytes,p+124,12);
  if(!Number.isSafeInteger(size)||size<0||size>LIMIT)throw Error('TAR entry exceeds the content limit.');const start=p+512,next=start+Math.ceil(size/512)*512;if(next>bytes.length)throw Error('Truncated TAR entry.');
  if(metadata){const data=bytes.subarray(start,start+size);if(type==='L'){if(size>32769)throw Error('TAR filename is too long.');longName=field(data,0,data.length);}else{const values=pax(data);if(type==='g'){for(const [key,value]of values)value===''?global.delete(key):global.set(key,value);}else{pendingLocal=true;for(const [key,value]of values)local.set(key,value);}}p=next;continue;}
  let rawName=attrs.get('path')??longName;if(rawName===null||rawName===undefined){const prefix=posix?field(bytes,p+345,155):'';rawName=(prefix?prefix+'/':'')+field(bytes,p,100);}
  const directory=type==='5'||type==='0'&&rawName.endsWith('/');while(rawName.startsWith('./'))rawName=rawName.slice(2);
  const storedMode=number(bytes,p+100,8);if(storedMode<0||storedMode>0xffffffff)throw Error('Invalid TAR permission mode.');
  const permissions=bytes.subarray(p+100,p+108).some(value=>value!==0&&value!==32)?storedMode&0o777:undefined;
  let time;if(attrs.has('mtime')){const raw=attrs.get('mtime');if(!/^-?[0-9]+(?:\.[0-9]+)?$/.test(raw))throw Error('Invalid PAX timestamp.');time=Number(raw);}else time=number(bytes,p+136,12);
  if(!Number.isFinite(time))throw Error('Invalid TAR timestamp.');const date=new Date(time*1000),modified=Number.isNaN(date.getTime())?null:date.toISOString().replace('T',' ').replace('Z',' UTC');
  local.clear();pendingLocal=false;longName=null;p=next;
  if(directory&&size)throw Error('TAR directories with data are unsupported.');if(directory&&(rawName===''||rawName==='.'))continue;
  const name=safeName(rawName);if(explicit.has(name)||entries.has(name)&&!directory)throw Error('Duplicate or conflicting archive entry.');explicit.add(name);
  let parent=name.includes('/')?name.slice(0,name.lastIndexOf('/')):'';
  while(parent){const prior=entries.get(parent);if(prior&&prior.kind!=='directory')throw Error('Archive file used as a parent directory.');if(!prior)entries.set(parent,{path:parent,name:parent.split('/').pop(),kind:'directory',size:0,modified:null,implicit:true});parent=parent.includes('/')?parent.slice(0,parent.lastIndexOf('/')):'';}
  entries.set(name,{path:name,name:name.split('/').pop(),kind:directory?'directory':'file',size,start,modified,...(permissions===undefined?{}:{permissions})});total+=size;if(total>LIMIT||entries.size>50000)throw Error('TAR exceeds the content or entry limit.');
 }
 if(!ended||pendingLocal||longName!==null)throw Error('Incomplete TAR archive.');
 return {entries,totalBytes:total,format:'TAR',list(parent=''){if(parent)safeName(parent);return [...entries.values()].filter(e=>(e.path.includes('/')?e.path.slice(0,e.path.lastIndexOf('/')):'')===parent).sort((a,b)=>Number(b.kind==='directory')-Number(a.kind==='directory')||a.name.localeCompare(b.name));},async read(name){const entry=entries.get(safeName(name));if(!entry||entry.kind!=='file')throw Error('Choose an archive file.');return bytes.slice(entry.start,entry.start+entry.size);}};
}
module.exports={looksLikeTar,parseTar};
