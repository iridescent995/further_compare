'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const WINDOWS_EPOCH=-11644473600000;
const revision=stat=>`${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
async function prepareWindowsTimestampRequest(safe,side,paths,modifiedMs){
  if(!Number.isInteger(modifiedMs)||modifiedMs<=WINDOWS_EPOCH||modifiedMs>253402300799999)throw Error('Windows modified times must be after 1 January 1601 and before year 10000.');
  const entries=[];let root=null,rootStat=null;
  const seen=new Set();
  for(const relative of paths){
    const folded=relative.toLowerCase();if(seen.has(folded))throw Error('Select each Windows entry only once.');seen.add(folded);
    const file=await safe(side,relative),stat=await fs.lstat(file,{bigint:true});
    if(!stat.isFile()&&!stat.isDirectory())throw Error('Only regular files and folders can have their modified date changed.');
    let currentRoot=file;for(const component of relative.split('/'))currentRoot=path.dirname(currentRoot);
    if(root===null){root=currentRoot;rootStat=await fs.lstat(root,{bigint:true});if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||await fs.realpath(root)!==root)throw Error('Selected root changed. Select it again.');}
    else if(currentRoot!==root)throw Error('Selected roots changed. Select them again.');
    entries.push({relative,inode:String(stat.ino),device:String(stat.dev),size:String(stat.size),mtimeNs:String(stat.mtimeNs),ctimeNs:String(stat.ctimeNs),directory:stat.isDirectory(),file,stat});
  }
  for(const entry of entries)if(await safe(side,entry.relative)!==entry.file||revision(await fs.lstat(entry.file,{bigint:true}))!==revision(entry.stat))throw Error('A selected entry changed. Refresh and try again.');
  const latest=await fs.lstat(root,{bigint:true});if(latest.dev!==rootStat.dev||latest.ino!==rootStat.ino)throw Error('Selected root changed. Select it again.');
  return {root,rootInode:String(rootStat.ino),rootDevice:String(rootStat.dev),modifiedMs,entries:entries.map(({file,stat,...entry})=>entry)};
}
function runTimestampHelper(executable,args,request,{spawnProcess=spawn,timeoutMs=30000}={}){
  const input=JSON.stringify(request).replace(/[\u007f-\uffff]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
  if(Buffer.byteLength(input)>2000000)return Promise.reject(Error('The selected paths are too large. Choose fewer entries.'));
  return new Promise((resolve,reject)=>{
    const child=spawnProcess(executable,args,{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',errors='',failure=null,finished=false,killTimer;
    const timer=setTimeout(()=>abort('Timestamp helper timed out. Some timestamps may have changed; refresh before retrying.'),timeoutMs);
    function finish(error,result){if(finished)return;finished=true;clearTimeout(timer);clearTimeout(killTimer);error?reject(error):resolve(result);}
    function abort(message){if(finished||failure)return;failure=new Error(message);child.kill();killTimer=setTimeout(()=>finish(failure),5000);}
    child.stdout.on('data',chunk=>{if(failure)return;output+=chunk;if(output.length>65536)abort('Timestamp helper returned too much output. Some timestamps may have changed; refresh before retrying.');});
    child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-16384);});
    child.on('error',error=>finish(error));
    child.on('close',code=>{
      if(failure)return finish(failure);
      if(code!==0)return finish(Error(errors.trim()||'Windows timestamp update failed. Refresh before retrying.'));
      try{const result=JSON.parse(output);if(Object.keys(result).length!==1||!Number.isInteger(result.changed)||result.changed!==request.entries.length)throw Error('Invalid timestamp helper result. Some timestamps may have changed; refresh before retrying.');finish(null,result);}catch{finish(Error('Invalid timestamp helper result. Some timestamps may have changed; refresh before retrying.'));}
    });
    child.stdin.on('error',error=>abort('Could not send the timestamp request: '+error.message+'. Refresh before retrying.'));
    child.stdin.end(input);
  });
}
async function setWindowsFolderModified(safe,side,paths,modifiedMs){
  const request=await prepareWindowsTimestampRequest(safe,side,paths,modifiedMs);
  const script=process.resourcesPath&&__dirname.includes('app.asar')?path.join(process.resourcesPath,'native','folder-timestamps.ps1'):path.join(__dirname,'native','folder-timestamps.ps1');
  const windows=process.env.SystemRoot||process.env.WINDIR;if(!windows)throw Error('Windows system directory is unavailable.');
  return runTimestampHelper(path.join(windows,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],request);
}
module.exports={setWindowsFolderModified,prepareWindowsTimestampRequest,runTimestampHelper};
