'use strict';
const nativeFS=require('node:fs/promises');
const path=require('node:path');
const {promisify}=require('node:util');
const nativeExec=promisify(require('node:child_process').execFile);
const IDENTIFIER='com.furthercompare.desktop.finder';
const PK='/usr/bin/pluginkit',LS='/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
function parseRegistrations(output){
  const entries=[];
  for(const line of output.split('\n')){
    if(!line.trim()||/^\s*\((?:no matches|\d+ plug-ins?)\)\s*$/.test(line))continue;
    const match=/^\s*([+!=?-]?)\s*com\.furthercompare\.desktop\.finder\(([^()\t\r\n]+)\)\t([A-Fa-f0-9-]{36})\t([^\t\r\n]+)\t(\/[^\r\n]+)$/.exec(line);
    if(!match||/[\x00-\x1f\x7f]/.test(match[5]))throw Error('macOS returned an unrecognized Finder extension registration. No changes were made to other copies.');
    entries.push({election:match[1]||'default',version:match[2],uuid:match[3],path:match[5]});
  }
  return entries;
}
function createFinderIntegration({appPath,platform=process.platform,fs=nativeFS,execFile=nativeExec,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  let tail=Promise.resolve();
  const extension=typeof appPath==='string'?path.join(appPath,'Contents/PlugIns/FurtherCompareFinder.appex'):null;
  const base=()=>({supported:platform==='darwin',verified:false,bundled:false,registered:false,enabled:false,disabled:false,partial:false,conflict:false,status:'unavailable',reason:''});
  async function command(exe,args){const result=await execFile(exe,args,{encoding:'utf8',timeout:5000,maxBuffer:1024*1024,windowsHide:true});return typeof result==='string'?result:result.stdout;}
  async function checkedEntry(file,kind){const stat=await fs.lstat(file,{bigint:true});if(stat.isSymbolicLink()||!(kind==='file'?stat.isFile():stat.isDirectory()))throw Error('The bundled Finder extension contains an unexpected file or symbolic link.');return kind==='directory'?`${stat.dev}:${stat.ino}`:`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;}
  async function bundle(){
    if(typeof appPath!=='string'||!path.isAbsolute(appPath)||path.normalize(appPath)!==appPath||!appPath.endsWith('.app')||/[\x00-\x1f\x7f]/.test(appPath))throw Error('Finder integration requires the exact installed application path.');
    const stamps=new Map();
    let component=path.parse(appPath).root;
    for(const part of appPath.slice(component.length).split(path.sep)){component=path.join(component,part);stamps.set(component,await checkedEntry(component,'directory'));}
    for(const relative of ['Contents','Contents/MacOS','Contents/PlugIns','Contents/PlugIns/FurtherCompareFinder.appex','Contents/PlugIns/FurtherCompareFinder.appex/Contents','Contents/PlugIns/FurtherCompareFinder.appex/Contents/MacOS']){
      const file=path.join(appPath,relative);stamps.set(file,await checkedEntry(file,'directory'));
    }
    const hostInfo=path.join(appPath,'Contents/Info.plist'),pluginInfo=path.join(extension,'Contents/Info.plist');
    for(const file of [hostInfo,pluginInfo,path.join(appPath,'Contents/MacOS/Further Compare'),path.join(extension,'Contents/MacOS/FurtherCompareFinder')]){
      stamps.set(file,await checkedEntry(file,'file'));
      if(file.endsWith('.plist')&&(await fs.lstat(file)).size>65536)throw Error('Finder extension metadata exceeds the supported size.');
    }
    const host=JSON.parse(await command('/usr/bin/plutil',['-convert','json','-o','-',hostInfo]));
    const plugin=JSON.parse(await command('/usr/bin/plutil',['-convert','json','-o','-',pluginInfo]));
    if(host.CFBundleIdentifier!=='com.furthercompare.desktop'||host.CFBundleExecutable!=='Further Compare'||plugin.CFBundleIdentifier!==IDENTIFIER||plugin.CFBundleExecutable!=='FurtherCompareFinder'||plugin.NSExtension?.NSExtensionPointIdentifier!=='com.apple.FinderSync'||plugin.NSExtension?.NSExtensionPrincipalClass!=='FCFinderSync'||typeof host.CFBundleVersion!=='string'||host.CFBundleVersion!==plugin.CFBundleVersion||!host.CFBundleURLTypes?.some(item=>Array.isArray(item.CFBundleURLSchemes)&&item.CFBundleURLSchemes.includes('furthercompare')))throw Error('The bundled Finder extension does not match this application.');
    await command('/usr/bin/codesign',['--verify','--strict',extension]);
    await command('/usr/bin/codesign',['--verify','--strict',appPath]);
    // Recheck identities after native inspection and before every mutation.
    for(const [file,stamp]of stamps)if(await checkedEntry(file,file.endsWith('.plist')||file===path.join(appPath,'Contents/MacOS/Further Compare')||file===path.join(extension,'Contents/MacOS/FurtherCompareFinder')?'file':'directory')!==stamp)throw Error('The application changed while checking Finder integration. Try again.');
    return true;
  }
  const registrations=async()=>parseRegistrations(await command(PK,['-m','-A','-D','-v','-i',IDENTIFIER]));
  function describe(entries){
    const own=entries.filter(entry=>entry.path===extension),foreign=entries.filter(entry=>entry.path!==extension);
    const state={...base(),verified:true,bundled:true,registered:own.length>0,enabled:own.length===1&&own[0].election==='+',disabled:own.length===1&&own[0].election==='-',conflict:foreign.length>0||own.length>1};
    state.status=state.conflict?'conflict':state.enabled?'enabled':state.disabled?'disabled':state.registered?'registered':'bundled';
    if(state.conflict)state.reason='Another copy of the Finder extension is registered. Resolve duplicate app copies in macOS before changing integration; no other copy will be changed.';
    else if(state.enabled)state.reason='Enabled in macOS. Finder controls when the extension loads and displays its menus.';
    else if(state.disabled)state.reason='Disabled in macOS.';
    else if(state.registered)state.reason='Registered with macOS; explicit enablement has not been verified.';
    else state.reason='Bundled with this app; not registered with macOS.';
    return state;
  }
  async function inspect(){await bundle();return describe(await registrations());}
  async function exclusive(){const state=await inspect();if(state.conflict){const error=Error(state.reason);error.state=state;throw error;}return state;}
  async function perform(action){
    if(!['status','install','uninstall'].includes(action))throw Error('Invalid Finder integration action.');
    let state=base(),mutated=false;
    if(platform!=='darwin')return {...state,reason:'Native Finder integration is available on macOS only.'};
    try{
      state=await inspect();if(action==='status'||state.conflict)return state;
      if(action==='install'){
        if(state.enabled)return state;
        await exclusive();mutated=true;await command(LS,['-f',appPath]);
        for(let attempt=0;attempt<4;attempt++){
          state=await exclusive();
          if(state.registered)break;
          await command(PK,['-a',extension]);
          await delay([150,300,600,1000][attempt]);
        }
        state=await exclusive();
        if(!state.registered)return {...state,status:'pending',partial:true,reason:'macOS has not confirmed registration yet. Refresh the status before trying again.'};
        // Elections are identifier-wide according to pluginkit(8). Rechecking
        // all duplicates immediately before and after avoids known conflicts;
        // the OS offers no atomic conditional election transaction.
        await exclusive();await command(PK,['-e','use','-i',IDENTIFIER]);
        for(let attempt=0;attempt<4;attempt++){
          state=await exclusive();if(state.enabled)return state;
          await delay([150,300,600,1000][attempt]);
        }
        return {...state,status:'pending',partial:true,reason:'Registration succeeded, but macOS has not confirmed enablement. Refresh the status or enable the extension in System Settings.'};
      }
      if(!state.registered)return state;
      await exclusive();mutated=true;await command(PK,['-e','ignore','-i',IDENTIFIER]);
      for(let attempt=0;attempt<4;attempt++){
        state=await exclusive();if(state.disabled||!state.registered)break;
        await delay([150,300,600,1000][attempt]);
      }
      if(state.registered&&!state.disabled)return {...state,status:'pending',partial:true,reason:'macOS has not confirmed that the extension is disabled. Refresh the status before trying again.'};
      state=await exclusive();
      if(!state.registered)return {...state,disabled:true,status:'disabled',reason:'Disabled and unregistered. macOS may rediscover the bundled extension; its disabled election is retained.'};
      await command(PK,['-r',extension]);
      for(let attempt=0;attempt<4;attempt++){
        state=await exclusive();if(!state.registered)return {...state,disabled:true,status:'disabled',reason:'Disabled and unregistered. macOS may rediscover the bundled extension; its disabled election is retained.'};
        await delay([150,300,600,1000][attempt]);
      }
      return {...state,partial:!state.disabled,reason:state.disabled?'Disabled in macOS. The bundled extension is still registered or was automatically rediscovered.':'macOS has not confirmed removal. Refresh the status before trying again.'};
    }catch(error){if(error.state)return {...error.state,partial:mutated};return {...state,verified:false,registered:false,enabled:false,disabled:false,status:'unavailable',partial:mutated,reason:`Finder integration could not be verified${mutated?' after the requested change':''}: ${error.code==='ENOENT'?'The extension or a required system utility is unavailable.':error.message}`};}
  }
  return {run(action){const result=tail.then(()=>perform(action));tail=result.catch(()=>{});return result;}};
}
module.exports={createFinderIntegration,parseRegistrations};
