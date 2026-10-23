'use strict';
const {checkSignal}=require('./local-folder-reader.cjs');
const same=(a,b)=>!!a&&a.path===b.path&&a.identity===b.identity&&a.stamp===b.stamp;
function authority(info){
 if(!info||typeof info.path!=='string'||typeof info.identity!=='string'||!info.identity||typeof info.stamp!=='string'||!info.stamp)throw Error('Invalid folder metadata.');
 return {...info};
}
function metadata(info,relative){
 const copy=authority(info);
 if(copy.path!==relative||!['file','directory'].includes(copy.kind))throw Error('Properties are available only for regular files and folders.');
 if(!['mode','uid','gid'].every(key=>Number.isSafeInteger(copy[key])&&copy[key]>=0&&copy[key]<=0xffffffff)||
    copy.kind==='file'&&(!Number.isSafeInteger(copy.size)||copy.size<0)||
    !Number.isFinite(copy.mtime)||Math.abs(copy.mtime)>8640000000000000)throw Error('Invalid folder metadata.');
 return copy;
}
function permissions(mode){
 const bits=mode&0o7777,chars=[...'---------'];
 for(let i=0;i<9;i++)if(bits&(1<<(8-i)))chars[i]='rwx'[i%3];
 if(bits&0o4000)chars[2]=bits&0o100?'s':'S';
 if(bits&0o2000)chars[5]=bits&0o010?'s':'S';
 if(bits&0o1000)chars[8]=bits&0o001?'t':'T';
 return chars.join('');
}
async function readProviderFolderProperties(service,side,relatives,{displayPath,signal}={}){
 checkSignal(signal);
 if(!['a','b'].includes(side))throw Error('Invalid folder side.');
 if(!Array.isArray(relatives)||!relatives.length||relatives.length>1000||new Set(relatives).size!==relatives.length)throw Error('Select between 1 and 1000 unique files or folders.');
 if(relatives.some(relative=>typeof relative!=='string'||!relative||relative.length>32768||/[\\\0]/.test(relative)||relative.split('/').some(part=>!part||part==='.'||part==='..')))throw Error('Invalid relative path.');
 if(!service||typeof service.inspectRoot!=='function'||typeof service.inspectEntry!=='function'||typeof displayPath!=='function')throw Error('Choose a folder service and display path.');
 const requested=[...relatives],rootId=service.roots?.[side],options={signal};
 const root=authority(await service.inspectRoot(side,options));checkSignal(signal);
 const observations=[];
 for(const relative of requested){
  checkSignal(signal);
  observations.push(metadata(await service.inspectEntry(side,relative,options),relative));
 }
 // Recheck every selected entry after the last read, so a later request cannot
 // invalidate an earlier entry unnoticed. Never enumerate a selected directory.
 for(const prior of observations){
  checkSignal(signal);
  const current=metadata(await service.inspectEntry(side,prior.path,options),prior.path);
  if(!same(current,prior)||current.kind!==prior.kind)throw Error('A folder entry changed. Refresh and try again.');
 }
 checkSignal(signal);
 if(!same(authority(await service.inspectRoot(side,options)),root)||service.roots?.[side]!==rootId)throw Error('A selected root changed. Refresh and try again.');
 checkSignal(signal);
 let total=0n,files=0,folders=0;
 const entries=observations.map(info=>{
  const file=info.kind==='file',absolutePath=displayPath(info.path);
  if(typeof absolutePath!=='string'||!absolutePath||absolutePath.includes('\0'))throw Error('Invalid display path.');
  if(file){files++;total+=BigInt(info.size);}else folders++;
  return {path:info.path,absolutePath,name:info.path.split('/').at(-1),kind:info.kind,sizeBytes:file?String(info.size):null,modifiedMs:info.mtime,accessedMs:null,createdMs:null,permissions:permissions(info.mode),mode:(info.mode&0o7777).toString(8).padStart(4,'0'),ownerId:String(info.uid),groupId:String(info.gid)};
 });
 checkSignal(signal);
 return {side,entries,totalFileBytes:String(total),files,folders};
}
module.exports={readProviderFolderProperties};
