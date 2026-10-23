'use strict';
const path=require('node:path');
const {spawn}=require('node:child_process');
const {prepareWindowsTimestampRequest}=require('./windows-folder-timestamps.cjs');
function normalizeChanges(changes){
 if(!changes||typeof changes!=='object'||Array.isArray(changes)||Object.keys(changes).some(k=>!['setMask','clearMask'].includes(k)))throw Error('Invalid Windows attribute changes.');
 const {setMask,clearMask}=changes;if(!Number.isInteger(setMask)||!Number.isInteger(clearMask)||setMask<0||clearMask<0||setMask>39||clearMask>39||(setMask&~39)||(clearMask&~39)||(setMask&clearMask))throw Error('Invalid Windows attribute masks.');
 return {setMask,clearMask};
}
async function prepareWindowsAttributesRequest(safe,side,paths,changes=null,expected=null){
 if(!Array.isArray(paths)||paths.length<1||paths.length>1000||paths.some(p=>typeof p!=='string'||!p||p.split('/').some(c=>!c||c==='.'||c==='..')||/[\\:\x00]/.test(p)))throw Error('Select between 1 and 1000 valid relative paths.');
 const request=await prepareWindowsTimestampRequest(safe,side,paths,0);delete request.modifiedMs;
 if(changes!==null){
  if(!Array.isArray(expected)||expected.length!==paths.length)throw Error('Preview the selected attributes again.');
  for(let i=0;i<paths.length;i++){
   const e=expected[i],r=request.entries[i];if(!e||e.path!==paths[i]||!e.expected||['inode','device','size','mtimeNs','ctimeNs'].some(k=>e.expected[k]!==r[k]))throw Error('A selected entry changed. Preview its attributes again.');
   r.expected=e.expected;
  }
 }
 return {...request,action:changes===null?'read':'write',changes:changes===null?null:normalizeChanges(changes)};
}
function validResult(result,request){
 if(!result||typeof result!=='object'||result.platform!=='win32'||!Array.isArray(result.entries)||result.entries.length!==request.entries.length)return false;
 if(request.action==='write'&&(!Number.isInteger(result.changed)||result.changed<0||result.changed>request.entries.length))return false;
 return result.entries.every((e,i)=>e&&e.path===request.entries[i].relative&&Number.isInteger(e.attributes)&&e.attributes>=0&&e.expected&&['inode','device','size','mtimeNs','ctimeNs','creation','access','write','change','attributes'].every(k=>typeof e.expected[k]==='string'));
}
function runAttributesHelper(executable,args,request,{spawnProcess=spawn,timeoutMs=30000}={}){
  const input=JSON.stringify(request).replace(/[\u007f-\uffff]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
  if(Buffer.byteLength(input)>2000000)return Promise.reject(Error('The selected paths are too large. Choose fewer entries.'));
  return new Promise((resolve,reject)=>{
    const child=spawnProcess(executable,args,{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',errors='',failure=null,finished=false,killTimer;
    const timer=setTimeout(()=>abort('Attribute helper timed out. Some attributes may have changed; refresh before retrying.'),timeoutMs);
    function finish(error,result){if(finished)return;finished=true;clearTimeout(timer);clearTimeout(killTimer);error?reject(error):resolve(result);}
    function abort(message){if(finished||failure)return;failure=new Error(message);child.kill();killTimer=setTimeout(()=>finish(failure),5000);}
    child.stdout.on('data',chunk=>{if(failure)return;output+=chunk;if(output.length>2000000)abort('Attribute helper returned too much output. Some attributes may have changed; refresh before retrying.');});
    child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-16384);});
    child.on('error',error=>finish(error));
    child.on('close',code=>{
      if(failure)return finish(failure);
      if(code!==0)return finish(Error(errors.trim()||'Windows attribute update failed. Refresh before retrying.'));
      try{const result=JSON.parse(output);if(!validResult(result,request))throw Error('Invalid attribute helper result. Some attributes may have changed; refresh before retrying.');finish(null,result);}catch{finish(Error('Invalid attribute helper result. Some attributes may have changed; refresh before retrying.'));}
    });
    child.stdin.on('error',error=>abort('Could not send the attribute request: '+error.message+'. Refresh before retrying.'));
    child.stdin.end(input);
  });
}
function invoke(request){
 const script=process.resourcesPath&&__dirname.includes('app.asar')?path.join(process.resourcesPath,'native','folder-attributes.ps1'):path.join(__dirname,'native','folder-attributes.ps1');
 const windows=process.env.SystemRoot||process.env.WINDIR;if(!windows)throw Error('Windows system directory is unavailable.');
 return runAttributesHelper(path.join(windows,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],request);
}
async function previewWindowsFolderAttributes(safe,side,paths){return invoke(await prepareWindowsAttributesRequest(safe,side,paths));}
async function setWindowsFolderAttributes(safe,side,paths,changes,expected){return invoke(await prepareWindowsAttributesRequest(safe,side,paths,changes,expected));}
module.exports={previewWindowsFolderAttributes,setWindowsFolderAttributes,prepareWindowsAttributesRequest,runAttributesHelper,normalizeChanges};
