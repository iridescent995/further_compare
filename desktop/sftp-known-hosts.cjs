'use strict';
const fs=require('node:fs/promises');
const syncFs=require('node:fs');
const path=require('node:path');
const {isIP}=require('node:net');
const {domainToASCII}=require('node:url');
const snapshots=require('./local-file-snapshot.cjs');
const {createLocalTextSaver}=require('./local-text-save.cjs');
const queues=new Map(),LIMIT=512*1024;
const messages={KNOWN_HOST_INVALID:'Invalid remembered SSH host key.',KNOWN_HOST_STORE_INVALID:'Remembered SSH host keys are damaged, unsupported, or not stored privately.',KNOWN_HOST_STORE_IO:'Could not access remembered SSH host keys.',KNOWN_HOST_CHANGED:'Remembered SSH host keys changed. Probe and review the host key again.',KNOWN_HOST_LIMIT:'You can remember up to 1000 SSH hosts.'};
const fail=code=>Object.assign(new Error(messages[code]),{code});
const fingerprintValid=value=>typeof value==='string'&&/^SHA256:[A-Za-z0-9+/]{43}$/.test(value);
const signature=s=>`${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
function endpoint(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['host','port'].includes(k)))throw fail('KNOWN_HOST_INVALID');
 let host=value.host;const port=value.port??22;
 if(typeof host!=='string')throw fail('KNOWN_HOST_INVALID');
 host=host.trim().toLowerCase();if(/[\s\x00-\x1f\x7f/\\@?#]/.test(host))throw fail('KNOWN_HOST_INVALID');
 if(host.startsWith('[')&&host.endsWith(']'))host=host.slice(1,-1);
 if(!isIP(host)){host=domainToASCII(host.replace(/\.$/,''));if(!host||!host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))throw fail('KNOWN_HOST_INVALID');}
 if(!host||host.length>253||!Number.isInteger(port)||port<1||port>65535)throw fail('KNOWN_HOST_INVALID');
 return {host,port};
}
const key=e=>JSON.stringify([e.host,e.port]);
async function read(file){
 let stat;try{stat=await fs.lstat(file,{bigint:true});}catch(error){if(error.code==='ENOENT')return {hosts:[],snapshot:null};throw error;}
 if(!stat.isFile()||stat.size>BigInt(LIMIT)||process.platform!=='win32'&&(stat.mode&0o777n)!==0o600n)throw fail('KNOWN_HOST_STORE_INVALID');
 const {bytes,snapshot}=await snapshots.read(file,LIMIT);
 if(snapshot.signature!==signature(stat))throw fail('KNOWN_HOST_CHANGED');
 try{
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!data||typeof data!=='object'||Object.keys(data).sort().join(',')!=='hosts,version'||data.version!==1||!Array.isArray(data.hosts)||data.hosts.length>1000)throw Error();
  const keys=new Set();
  for(const item of data.hosts){
   if(!item||Object.keys(item).sort().join(',')!=='fingerprint,host,port'||!fingerprintValid(item.fingerprint))throw Error();
   const normalized=endpoint({host:item.host,port:item.port});
   if(normalized.host!==item.host||normalized.port!==item.port||keys.has(key(item)))throw Error();keys.add(key(item));
  }
  return {hosts:data.hosts,snapshot};
 }catch{throw fail('KNOWN_HOST_STORE_INVALID');}
}
/** Native-only fingerprints, never credentials. All instances serialize by canonical
 * parent path. Snapshot checks reject observed external edits, but OS replacement
 * retains the shared saver's narrow validation-to-rename race (not cross-process CAS).
 * The parent directory must already exist, normally Electron's userData directory. */
class SftpKnownHosts{
 #file;
 constructor(file){if(typeof file!=='string'||!path.isAbsolute(file)||file.includes('\0'))throw fail('KNOWN_HOST_INVALID');this.#file=path.resolve(file);}
 async #run(work){
  let file;try{file=path.join(await fs.realpath(path.dirname(this.#file)),path.basename(this.#file));}catch{throw fail('KNOWN_HOST_STORE_IO');}
  const previous=queues.get(file)||Promise.resolve(),result=previous.then(()=>work(file));
  const tail=result.catch(()=>{});queues.set(file,tail);tail.then(()=>{if(queues.get(file)===tail)queues.delete(file);});return result;
 }
 async lookup(value){const target=endpoint(value);return this.#run(async file=>{try{const state=await read(file);return state.hosts.find(item=>key(item)===key(target))?.fingerprint??null;}catch(error){throw messages[error?.code]?error:fail('KNOWN_HOST_STORE_IO');}});}
 async #change(value,fingerprint,expectedPrevious,{current=()=>{}}={}){
  const target=endpoint(value);
  if(fingerprint!==null&&!fingerprintValid(fingerprint)||expectedPrevious!==null&&!fingerprintValid(expectedPrevious)||typeof current!=='function')throw fail('KNOWN_HOST_INVALID');
  return this.#run(async file=>{
   let guardError;
   const guard=()=>{try{current();}catch(error){guardError=error;throw error;}};
   try{
    guard();const state=await read(file),index=state.hosts.findIndex(item=>key(item)===key(target));
    const previous=index<0?null:state.hosts[index].fingerprint;
    if(previous!==expectedPrevious)throw fail('KNOWN_HOST_CHANGED');
    if(previous===fingerprint){guard();return fingerprint===null?false:fingerprint;}
    if(fingerprint===null)state.hosts.splice(index,1);
    else if(index>=0)state.hosts[index]={...target,fingerprint};
    else {if(state.hosts.length>=1000)throw fail('KNOWN_HOST_LIMIT');state.hosts.push({...target,fingerprint});}
    const bytes=Buffer.from(JSON.stringify({version:1,hosts:state.hosts})+'\n');
    const check=()=>{
     guard();let now;try{now=syncFs.lstatSync(file,{bigint:true});}catch(error){if(error.code!=='ENOENT')throw error;}
     if(state.snapshot?!now||!now.isFile()||signature(now)!==state.snapshot.signature:!!now)throw fail('KNOWN_HOST_CHANGED');
    };
    const save=createLocalTextSaver({snapshots:{...snapshots,capture:async targetFile=>{
     const captured=await snapshots.capture(targetFile);
     if(!state.snapshot||captured.signature!==state.snapshot.signature)throw fail('KNOWN_HOST_CHANGED');return captured;
    }}});
    if(state.snapshot)await snapshots.validate(state.snapshot);
    check();const written=await save(file,bytes,{current:check});
    const published=await snapshots.read(file,LIMIT);
    if(published.snapshot.dev!==written.dev||published.snapshot.ino!==written.ino||!Buffer.from(published.bytes).equals(bytes))throw fail('KNOWN_HOST_CHANGED');
    return fingerprint===null?true:fingerprint;
   }catch(error){if(error===guardError)throw error;throw messages[error?.code]?error:fail('KNOWN_HOST_STORE_IO');}
  });
 }
 remember(value,fingerprint,expectedPrevious,options){if(!fingerprintValid(fingerprint))return Promise.reject(fail('KNOWN_HOST_INVALID'));return this.#change(value,fingerprint,expectedPrevious,options);}
 forget(value,expectedPrevious,options){return this.#change(value,null,expectedPrevious,options);}
}
module.exports={SftpKnownHosts};
