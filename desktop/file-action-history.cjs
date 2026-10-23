'use strict';
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const MAX_HISTORY_BYTES=48*1024*1024;
function object(v,keys){if(!v||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k))||Reflect.ownKeys(v).some(k=>!keys.includes(k)))throw Error('Invalid file action history fields.');}
function text(v){if(typeof v!=='string'||v.length>8192)throw Error('Invalid file action history text.');return v;}
function list(v,max){if(!Array.isArray(v)||v.length>max||Reflect.ownKeys(v).length!==v.length+1||Array.from({length:v.length},(_,i)=>i).some(i=>!Object.hasOwn(v,i)))throw Error('Invalid file action history list.');}
function validateEntry(v){
 object(v,['id','session','description','total','paths','time','status','completed','backupPath','cleanupWarning','error']);
 if(typeof v.id!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v.id))throw Error('Invalid file action history ID.');
 if(typeof v.time!=='string'||!Number.isFinite(Date.parse(v.time))||new Date(v.time).toISOString()!==v.time)throw Error('Invalid file action history time.');
 if(!['Failed','Cancelled','Completed'].includes(v.status)||!Number.isSafeInteger(v.total)||v.total<0||!(v.completed===null||Number.isSafeInteger(v.completed)&&v.completed>=0))throw Error('Invalid file action history outcome.');
 list(v.paths,100);const paths=v.paths.map(text);if(paths.length>v.total||paths.reduce((n,p)=>n+p.length,0)>32768)throw Error('Invalid file action history paths.');
 return {id:v.id.toLowerCase(),session:text(v.session),description:text(v.description),total:v.total,paths,time:v.time,status:v.status,completed:v.completed,backupPath:text(v.backupPath),cleanupWarning:text(v.cleanupWarning),error:text(v.error)};
}
function entries(v){list(v,100);const out=v.map(validateEntry);if(new Set(out.map(e=>e.id)).size!==out.length)throw Error('Duplicate file action history ID.');return out;}
function validateStore(v){object(v,['version','enabled','entries']);if(v.version!==1||typeof v.enabled!=='boolean')throw Error('Invalid file action history store.');const clean=entries(v.entries);if(!v.enabled&&clean.length)throw Error('Disabled file action history contains entries.');return {enabled:v.enabled,entries:clean};}
const queues=new Map();
const identity=s=>`${s.dev}:${s.ino}`;
const stamp=s=>`${identity(s)}:${s.mode}:${s.nlink}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
async function location(file){
 if(typeof file!=='string'||!path.isAbsolute(file)||file.includes('\0'))throw Error('File action history require an absolute file path.');
 const parent=await fs.realpath(path.dirname(file)),s=await fs.lstat(parent,{bigint:true});
 if(!s.isDirectory())throw Error('Invalid file action history directory.');
 return {file:path.join(parent,path.basename(file)),parent,identity:identity(s)};
}
async function checkParent(t){const s=await fs.lstat(t.parent,{bigint:true});if(!s.isDirectory()||identity(s)!==t.identity||await fs.realpath(t.parent)!==t.parent)throw Error('File action history directory changed.');}
async function snapshot(t){
 await checkParent(t);let before;try{before=await fs.lstat(t.file,{bigint:true});}catch(e){if(e.code==='ENOENT')return {enabled:false,entries:[],stamp:null};throw e;}
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n)throw Error('File action history must be a regular, unlinked file.');
 if(before.size>BigInt(MAX_HISTORY_BYTES))throw Error('File action history is too large.');
 const handle=await fs.open(t.file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  if(stamp(before)!==stamp(await handle.stat({bigint:true})))throw Error('File action history changed.');
  const buffer=Buffer.alloc(Number(before.size)+1);let count=0;
  while(count<buffer.length){const {bytesRead}=await handle.read(buffer,count,buffer.length-count,null);if(!bytesRead)break;count+=bytesRead;}
  if(count>MAX_HISTORY_BYTES)throw Error('File action history is too large.');
  const after=await handle.stat({bigint:true}),named=await fs.lstat(t.file,{bigint:true});await checkParent(t);
  if(stamp(before)!==stamp(after)||stamp(after)!==stamp(named)||count!==Number(before.size))throw Error('File action history changed.');
  return {...validateStore(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,count)))),stamp:stamp(after)};
 }finally{await handle.close();}
}

function merge(current,added){const byId=new Map(current.map(e=>[e.id,e]));for(const e of added){if(byId.has(e.id)&&JSON.stringify(byId.get(e.id))!==JSON.stringify(e))throw Error('File action history ID already exists with different content.');byId.set(e.id,e);}const addedIds=new Set(added.map(e=>e.id));return [...added,...current.filter(e=>!addedIds.has(e.id))].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)).slice(0,100);}
class FileActionHistory {
 constructor(file){this.file=file;}
 async get(){return this.#run(async t=>{const {enabled,entries}=await snapshot(t);return {enabled,entries};});}
 async setEnabled(enabled,current=[]){if(typeof enabled!=='boolean')throw Error('Invalid file action history setting.');const clean=entries(current);if(!enabled&&clean.length)throw Error('Cannot save history while disabling it.');return this.#mutate(state=>({enabled,entries:enabled?merge(state.entries,clean):[]}));}
 async append(entry){const clean=validateEntry(entry);return this.#mutate(state=>state.enabled?{enabled:true,entries:merge(state.entries,[clean])}:state);}
 async clear(){return this.#mutate(state=>({enabled:state.enabled,entries:[]}));}
 async #run(fn){const t=await location(this.file),key=t.file.normalize('NFC').toLowerCase(),prior=queues.get(key)||Promise.resolve();const operation=prior.catch(()=>{}).then(()=>fn(t));queues.set(key,operation);try{return await operation;}finally{if(queues.get(key)===operation)queues.delete(key);}}
 async #mutate(change){return this.#run(async t=>{
  const before=await snapshot(t),state=validateStore({version:1,...change({enabled:before.enabled,entries:before.entries})});
  if(state.enabled===before.enabled&&JSON.stringify(state.entries)===JSON.stringify(before.entries))return state;
  const content=JSON.stringify({version:1,...state})+'\n';if(Buffer.byteLength(content)>MAX_HISTORY_BYTES)throw Error('File action history is too large.');
  const temp=path.join(t.parent,`.${path.basename(t.file)}.${randomUUID()}.tmp`);let committed=false;
  try{await checkParent(t);const handle=await fs.open(temp,'wx',0o600);try{await handle.writeFile(content);await handle.sync();}finally{await handle.close();}
   if((await snapshot(t)).stamp!==before.stamp)throw Error('File action history changed.');await checkParent(t);
   if(before.stamp){await fs.rename(temp,t.file);committed=true;}else{await fs.link(temp,t.file);committed=true;await fs.rm(temp,{force:true});}return state;
  }finally{if(!committed)await fs.rm(temp,{force:true});}
 });}
}
module.exports={FileActionHistory,validateEntry,MAX_HISTORY_BYTES};
