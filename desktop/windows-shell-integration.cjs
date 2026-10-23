'use strict';
const nativeFS=require('node:fs/promises');
const path=require('node:path');
const nativeExec=require('node:util').promisify(require('node:child_process').execFile);
function parseStatus(output){
  let state;try{state=JSON.parse(output.trim());}catch{throw Error('Could not verify Explorer integration status.');}
  if(!state||Array.isArray(state)||['installed','partial','stale'].some(key=>typeof state[key]!=='boolean'))throw Error('Could not verify Explorer integration status.');
  if(state.installed&&(state.partial||state.stale))throw Error('Explorer integration returned inconsistent status.');
  return {supported:true,installed:state.installed,partial:state.partial,stale:state.stale,location:'Current user Explorer context menu'};
}
function createWindowsShellIntegration({appPath,tempRoot,scriptPath,systemRoot='C:\\Windows',fs=nativeFS,execFile=nativeExec}){
  let tail=Promise.resolve();
  async function execute(action){
    if(!['status','install','uninstall'].includes(action))throw Error('Unknown shell integration action.');
    if(typeof appPath!=='string'||!path.win32.isAbsolute(appPath)||path.win32.basename(appPath)!=='Further Compare.exe'||/["\r\n\0]/.test(appPath))throw Error('Explorer integration requires the installed Further Compare executable.');
    if(typeof systemRoot!=='string'||!path.win32.isAbsolute(systemRoot)||/["\r\n\0]/.test(systemRoot))throw Error('Invalid Windows system directory.');
    const temporary=await fs.mkdtemp(path.join(tempRoot,'further-shell-'));
    try{
      const script=path.join(temporary,'shell-menu.ps1');await fs.copyFile(scriptPath,script);
      const powershell=path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
      const base=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script];
      const command=extra=>execFile(powershell,[...base,...extra],{timeout:30000,windowsHide:true,maxBuffer:1024*1024});
      let mutationError;
      if(action!=='status')try{await command(action==='uninstall'?['-Uninstall']:['-AppPath',appPath]);}catch(error){mutationError=error;}
      // A successful PowerShell exit does not prove the registry reached the
      // requested state. Inspect after every mutation, including failed ones.
      let state;
      try{state=parseStatus((await command(['-Status','-AppPath',appPath])).stdout);}
      catch{throw Error('Could not verify Explorer integration status. Refresh before retrying.');}
      if(mutationError)throw Error('Explorer integration could not complete the requested change. Refresh its status before retrying.');
      return state;
    }finally{await fs.rm(temporary,{recursive:true,force:true});}
  }
  return {run(action){const current=tail.then(()=>execute(action));tail=current.catch(()=>{});return current;}};
}
const applicationServices=new WeakMap();
function getWindowsShellIntegration(app,options){
  let service=applicationServices.get(app);
  if(!service){service=createWindowsShellIntegration(options);applicationServices.set(app,service);}
  return service;
}
module.exports={createWindowsShellIntegration,getWindowsShellIntegration,parseStatus};
