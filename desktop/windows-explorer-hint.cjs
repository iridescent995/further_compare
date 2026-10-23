'use strict';
const path=require('node:path'),nativeFS=require('node:fs/promises');
const nativeExec=require('node:util').promisify(require('node:child_process').execFile);
const {createLeftHintPublisher}=require('./explorer-left-hint.cjs');
const SCRIPT=path.join(__dirname,'native','explorer-hint.ps1');
function localPath(value){return typeof value==='string'&&/^[A-Za-z]:\\/.test(value)&&!/["\x00-\x1f]/.test(value)&&!value.includes('/')&&path.win32.normalize(value)===value;}
function validatePayload(bytes){if(!Buffer.isBuffer(bytes)||bytes.length<10||bytes.length>202||bytes.length%2||bytes.toString('ascii',0,4)!=='FCLH'||bytes.readUInt16LE(4)!==1||bytes[6]>2||bytes[7]>1||bytes.readUInt16LE(8)*2+10!==bytes.length||(!bytes[6]&&(bytes[7]||bytes.length!==10)))throw Error('Invalid Explorer hint payload.');}
function createWindowsExplorerHint({appPath,tempRoot,systemRoot='C:\\Windows',platform=process.platform,fs=nativeFS,execFile=nativeExec}){
 const publish=createLeftHintPublisher(async bytes=>{
  validatePayload(bytes);
  if(platform!=='win32')return {written:false,skipped:true,reason:'unsupported-platform'};
  if(!localPath(appPath)||path.win32.basename(appPath)!=='Further Compare.exe')throw Error('Explorer hint requires the packaged Further Compare executable.');
  if(!localPath(systemRoot))throw Error('Invalid Windows system directory.');
  if(!localPath(tempRoot))throw Error('Invalid Windows temporary directory.');
  const temporary=await fs.mkdtemp(path.win32.join(tempRoot,'further-explorer-hint-'));
  try{
   if(!localPath(temporary)||path.win32.dirname(temporary)!==tempRoot)throw Error('Invalid hint staging directory.');
   const script=path.win32.join(temporary,'explorer-hint.ps1');await fs.copyFile(SCRIPT,script);
   const executable=path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
   const result=await execFile(executable,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-AppPath',appPath,'-HintBase64',bytes.toString('base64')],{timeout:10000,windowsHide:true,maxBuffer:8192});
   let value;try{value=JSON.parse(result.stdout.trim());}catch{throw Error('Could not verify Explorer hint publication.');}
   if(!value||Array.isArray(value)||typeof value.written!=='boolean'||typeof value.skipped!=='boolean'||value.written===value.skipped||!['published','unowned-config'].includes(value.reason)||value.written!==(value.reason==='published'))throw Error('Invalid Explorer hint publication status.');
   return {written:value.written,skipped:value.skipped,reason:value.reason};
  }finally{await fs.rm(temporary,{recursive:true,force:true});}
 });
 return {publish};
}
module.exports={createWindowsExplorerHint};
