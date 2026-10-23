'use strict';
const path=require('node:path'),fs=require('node:fs/promises'),{spawn}=require('node:child_process');
function run(executable,args,input){return new Promise((resolve,reject)=>{const child=spawn(executable,args,{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',error='',settled=false;const timer=setTimeout(()=>{child.kill();finish(new Error('Directory rename helper timed out. Refresh the folder before retrying.'));},30000);function finish(reason){if(settled)return;settled=true;clearTimeout(timer);reason?reject(reason):resolve();}child.stdout.on('data',chunk=>{output=(output+chunk).slice(-8192);});child.stderr.on('data',chunk=>{error=(error+chunk).slice(-8192);});child.on('error',finish);child.on('close',code=>finish(code===0&&output.trim()==='ok'?null:new Error(error.trim()||'Directory rename helper failed.')));child.stdin.on('error',()=>{});child.stdin.end(input||'');});}
async function renameExclusive(root,relative,name,sourceStat,kind){
 const rootStat=await fs.lstat(root,{bigint:true});
 if(process.platform==='darwin'){
  const executable=process.resourcesPath&&__dirname.includes('app.asar')?path.join(process.resourcesPath,'native','rename-directory'):path.join(__dirname,'..','build','native','rename-directory');
  await run(executable,[root,relative,name,String(rootStat.dev),String(rootStat.ino),String(sourceStat.dev),String(sourceStat.ino),...(kind==='file'?['file']:[])]);
 }else if(process.platform==='win32'){
  const script=process.resourcesPath&&__dirname.includes('app.asar')?path.join(process.resourcesPath,'native','rename-directory.ps1'):path.join(__dirname,'native','rename-directory.ps1');
  const windows=process.env.SystemRoot||process.env.WINDIR;if(!windows)throw Error('Windows system directory is unavailable.');
  await run(path.join(windows,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],JSON.stringify({root,relative,name,kind,rootInode:String(rootStat.ino),sourceInode:String(sourceStat.ino)}).replace(/[\u007f-\uffff]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0')));
 }else throw Error('Safe directory rename is currently supported on macOS and Windows.');
}
const renameDirectory=(root,relative,name,sourceStat)=>renameExclusive(root,relative,name,sourceStat,'directory');
const renameFileExclusive=(root,relative,name,sourceStat)=>renameExclusive(root,relative,name,sourceStat,'file');
module.exports={renameDirectory,renameFileExclusive};
