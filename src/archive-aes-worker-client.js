const INPUT_LIMIT=32*1024*1024,OUTPUT_LIMIT=64*1024*1024,MAX_WORKERS=4,MAX_QUEUE=32;
let liveWorkers=0;
const error=(message,code='ARCHIVE_READ_FAILED')=>Object.assign(new Error(message),{code});
const cancelled=()=>error('Archive reading cancelled.','ARCHIVE_CANCELLED');
/** A reader owns one terminable worker. Passwords and plaintext are never persisted. */
export async function openEncryptedArchiveInWorker(input,{signal,onPassword,workerFactory=()=>new Worker('archive-aes-worker.js'),timeoutMs=30000}={}){
 if(!(input instanceof Uint8Array)||input.byteLength>INPUT_LIMIT)throw error('Archive exceeds the 32 MiB input limit.','ARCHIVE_INPUT_LIMIT');
 if(signal?.aborted)throw cancelled();
 if(onPassword!==undefined&&typeof onPassword!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw error('Invalid archive reader options.');
 if(liveWorkers>=MAX_WORKERS)throw error('Close an archive before opening another encrypted archive.','ARCHIVE_BUSY');
 let worker,closed=false,active=null,sequence=0,queued=0,tail=Promise.resolve(),rejectTermination;
 const termination=new Promise((resolve,reject)=>rejectTermination=reject);termination.catch(()=>{});
 const finish=(failure,value)=>{if(!active)return;const request=active;active=null;clearTimeout(request.timer);failure?request.reject(failure):request.resolve(value);};
 const dispose=(reason=error('Archive reader is closed.','ARCHIVE_CLOSED'))=>{if(closed)return;closed=true;onPassword=undefined;signal?.removeEventListener('abort',abort);worker?.terminate();liveWorkers--;rejectTermination(reason);finish(reason);};
 const abort=()=>dispose(cancelled());
 liveWorkers++;
 try{worker=workerFactory();}catch(e){liveWorkers--;throw e;}
 worker.onmessage=({data})=>{
  if(!active||data?.id!==active.id){dispose(error('Invalid archive worker response.'));return;}
  if(data.error){finish(error(typeof data.error.message==='string'?data.error.message:'Archive reading failed.',data.error.code));return;}
  finish(null,data.result);
 };
 worker.onerror=()=>dispose(error('Archive worker stopped unexpectedly.'));
 worker.onmessageerror=()=>dispose(error('Archive worker returned invalid data.'));
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const request=(operation,payload)=>new Promise((resolve,reject)=>{
  if(closed){reject(error('Archive reader is closed.','ARCHIVE_CLOSED'));return;}
  const id=++sequence,timer=setTimeout(()=>dispose(error('Archive reading took too long.','ARCHIVE_TIMEOUT')),timeoutMs);
  active={id,timer,resolve,reject};
  try{worker.postMessage({id,operation,...payload});}catch(e){dispose(e);}
 });
 let info;
 try{info=await request('open',{bytes:input.slice()});}catch(e){dispose(e);throw e;}
 const entries=new Map();
 try{
  if(!info||!Array.isArray(info.entries)||info.entries.length>50000||!Number.isSafeInteger(info.totalBytes)||info.totalBytes<0||info.totalBytes>OUTPUT_LIMIT)throw error('Invalid archive metadata.');
  for(const entry of info.entries){if(!entry||typeof entry.path!=='string'||!entry.path||entries.has(entry.path)||!['file','directory'].includes(entry.kind)||!Number.isSafeInteger(entry.size)||entry.size<0||entry.size>OUTPUT_LIMIT)throw error('Invalid archive entry.');entries.set(entry.path,Object.freeze({...entry}));}
 }catch(e){dispose(e);throw e;}
 function read(path,{password,signal:readSignal}={}){
  if(closed)return Promise.reject(error('Archive reader is closed.','ARCHIVE_CLOSED'));
  const entry=entries.get(path);if(!entry||entry.kind!=='file')return Promise.reject(error('Choose an archive file.'));
  if(queued>=MAX_QUEUE)return Promise.reject(error('Too many pending archive reads.','ARCHIVE_BUSY'));
  if(readSignal?.aborted)return Promise.reject(cancelled());
  queued++;
  const abortRead=()=>dispose(cancelled());readSignal?.addEventListener('abort',abortRead,{once:true});
  const operation=tail.then(async()=>{
   if(closed||readSignal?.aborted)throw cancelled();
   let credential=password;
   try{
    if(entry.encrypted&&credential===undefined&&onPassword)credential=await Promise.race([onPassword({path:entry.path,name:entry.name,encryptionType:entry.encryptionType}),termination]);
    if(closed||readSignal?.aborted)throw cancelled();
    if(credential!==undefined&&(typeof credential!=='string'||credential.length>4096))throw error('Invalid archive password.');
    const bytes=await request('read',{path,password:credential});
    if(!(bytes instanceof Uint8Array)||bytes.length!==entry.size||bytes.length>OUTPUT_LIMIT){dispose(error('Archive output size does not match.'));throw error('Archive output size does not match.');}
    return bytes;
   }finally{credential=null;password=null;}
  });
  tail=operation.catch(()=>{});
  return operation.finally(()=>{queued--;readSignal?.removeEventListener('abort',abortRead);});
 }
 // The public map cannot change the authoritative entries used by read/list.
 return Object.freeze({entries:new Map(entries),totalBytes:info.totalBytes,encrypted:!!info.encrypted,readOnly:true,list(parent=''){return [...entries.values()].filter(e=>(e.path.includes('/')?e.path.slice(0,e.path.lastIndexOf('/')):'')===parent).sort((a,b)=>Number(b.kind==='directory')-Number(a.kind==='directory')||a.name.localeCompare(b.name));},read,dispose});
}
