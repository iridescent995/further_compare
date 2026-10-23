'use strict';
const {checkSignal}=require('./local-folder-reader.cjs');
const validPath=value=>typeof value==='string'&&value.length<=32768&&!/[\\\0]/.test(value)&&(value===''||!value.split('/').some(part=>!part||part==='.'||part==='..'));
const changed=()=>Object.assign(Error('Folder changed while calculating size. Refresh and try again.'),{code:'STALE_SOURCE'});
const same=(a,b)=>a&&b&&a.path===b.path&&a.identity===b.identity&&a.stamp===b.stamp&&a.kind===b.kind&&a.size===b.size;
const valid=info=>info&&typeof info.path==='string'&&typeof info.identity==='string'&&info.identity&&typeof info.stamp==='string'&&info.stamp;
// A bounded metadata estimate, not a content snapshot. Partial totals exclude
// unvisited entries; a deadline may prevent final authority revalidation.
async function readProviderFolderSize(provider,relative,{signal,maxEntries=50000,maxDurationMs=10000,maxNodes=5000,maxDepth=256}={}){
 checkSignal(signal);
 if(!provider||!['inspectRoot','inspectEntry','enumerateDirectory'].every(key=>typeof provider[key]==='function')||!validPath(relative))throw Error('Choose a valid folder provider and path.');
 if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>50000||!Number.isSafeInteger(maxDurationMs)||maxDurationMs<1||maxDurationMs>60000||!Number.isSafeInteger(maxNodes)||maxNodes<1||maxNodes>50000||!Number.isSafeInteger(maxDepth)||maxDepth<1||maxDepth>1024)throw Error('Invalid folder size limits.');
 let bytes=0n,files=0,folders=0,skipped=0,visited=0,nodes=0,limited=false,timedOut=false;
 const controller=new AbortController(),options={signal:controller.signal},deadlineError=Error('Folder size deadline reached.');
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},maxDurationMs);
 // Race even a non-cooperative provider; its promise remains observed and its
 // iterator return is requested below. SFTP closes its transport on abort.
 async function io(fn){
  checkSignal(signal);if(timedOut)throw deadlineError;checkSignal(controller.signal);
  let listener;const stopped=new Promise((_,reject)=>{listener=()=>reject(timedOut?deadlineError:Object.assign(Error('Folder size calculation cancelled.'),{code:'ABORT_ERR'}));controller.signal.addEventListener('abort',listener,{once:true});});
  try{return await Promise.race([Promise.resolve().then(fn),stopped]);}finally{controller.signal.removeEventListener('abort',listener);}
 }
 const inspect=async path=>{const info=await io(()=>provider.inspectEntry(path,options));if(!valid(info)||info.path!==path||!['file','directory'].includes(info.kind))throw changed();return {...info};};
 let root,selected;
 try{
  root=await io(()=>provider.inspectRoot(options));if(!valid(root)||root.kind!==undefined&&root.kind!=='directory')throw changed();root={...root};
  selected=await inspect(relative);if(selected.kind!=='directory')throw Error('Choose a regular folder to calculate its size.');
  const queue=[{path:relative,depth:0,info:selected}];
  for(let index=0;index<queue.length&&!limited;index++){
   const current=queue[index];if(++nodes>maxNodes){limited=true;break;}
   if(!same(current.info,await inspect(current.path)))throw changed();
   const iterator=provider.enumerateDirectory(current.path,options)[Symbol.asyncIterator](),seen=new Set();let exhausted=false;
   try{while(true){
    const next=await io(()=>iterator.next());if(next.done){exhausted=true;break;}
    if(visited>=maxEntries){limited=true;break;}visited++;
    if(visited%32===0)await io(()=>new Promise(resolve=>setImmediate(resolve)));
    const item=next.value;if(!item||typeof item.name!=='string'||!item.name||item.name==='.'||item.name==='..'||/[\\/\0]/.test(item.name)||seen.has(item.name)||!['file','directory','symlink','other'].includes(item.kind))throw changed();seen.add(item.name);
    if(!['file','directory'].includes(item.kind)){skipped++;continue;}
    const child=current.path?current.path+'/'+item.name:item.name;if(!validPath(child))throw changed();
    const before=await inspect(child);if(before.kind!==item.kind)throw changed();
    if(item.kind==='directory'){
     if(current.depth+1>maxDepth||queue.length>=maxNodes){limited=true;break;}
     folders++;queue.push({path:child,depth:current.depth+1,info:before});
    }else{
     if(!Number.isSafeInteger(before.size)||before.size<0)throw Error('Invalid file size metadata.');
     if(!same(before,await inspect(child)))throw changed();bytes+=BigInt(before.size);files++;
    }
   }}finally{if(!exhausted&&iterator.return){const closing=Promise.resolve().then(()=>iterator.return());if(controller.signal.aborted)void closing.catch(()=>{});else await io(()=>closing);}}
   if(!same(current.info,await inspect(current.path)))throw changed();
  }
  if(!same(selected,await inspect(relative))||!same(root,await io(()=>provider.inspectRoot(options))))throw changed();
 }catch(error){checkSignal(signal);if(!timedOut)throw error;limited=true;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 return {sizeBytes:String(bytes),files,folders,skipped,limited,timedOut,complete:!limited&&!skipped};
}
module.exports={readProviderFolderSize};
