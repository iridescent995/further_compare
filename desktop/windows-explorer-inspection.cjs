'use strict';
const path=require('node:path'),nativeFS=require('node:fs/promises'),nativeExec=require('node:util').promisify(require('node:child_process').execFile);
const SCRIPT=path.join(__dirname,'native','explorer-inspection.ps1');
function local(value){return typeof value==='string'&&value.length<=30000&&/^[A-Za-z]:\\/.test(value)&&!/[\x00-\x1f"<>|?*/]/.test(value)&&!value.slice(2).includes(':')&&path.win32.normalize(value)===value;}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function parseReport(stdout,configuration){
 if(typeof stdout!=='string'||Buffer.byteLength(stdout)>1024*1024)throw Error('Oversized Explorer inspection output.');let report;try{report=JSON.parse(stdout.trim());}catch{throw Error('Invalid Explorer inspection output.');}
 const names={executable:'Further Compare.exe',dll:'FurtherCompareExplorer.dll',package:'Explorer.msix'};
 if(!report||report.version!==1||report.supported!==true||report.inspectionOnly!==true||report.verified!==false||report.trustedIdentity?.name!==configuration.packageName||report.trustedIdentity?.publisher!==configuration.publisher||!Array.isArray(report.limitations)||report.limitations.length>4096)throw Error('Invalid Explorer inspection authority.');
 for(const [kind,leaf]of Object.entries(names)){const asset=report.assets?.[kind],expected=path.win32.join(configuration.installDirectory,leaf),installationKey=kind==='package'?'packagePath':kind;if(!asset||asset.path!==expected||report.installation?.[installationKey]!==expected||typeof asset.exists!=='boolean'||typeof asset.signatureValid!=='boolean'||asset.sha256!==null&&!/^[a-f0-9]{64}$/.test(asset.sha256||''))throw Error('Invalid inspected asset.');if(asset.signatureValid&&(!asset.exists||asset.signatureStatus!=='Valid'||asset.publisher!==configuration.publisher||!asset.sha256))throw Error('Inconsistent asset signature evidence.');}
 if(report.identityCandidate!=null&&(report.identityCandidate.verified!==false||['name','publisher','version','architecture'].some(k=>typeof report.identityCandidate[k]!=='string'||report.identityCandidate[k].length>512)))throw Error('Unverified package candidate cannot authorize lifecycle changes.');
 const o=report.observed;if(!o||o.platform!=='win32'||!Number.isInteger(o.build)||!['x64','arm64','unknown'].includes(o.architecture)||typeof o.config?.exists!=='boolean'||!Array.isArray(o.packages)||o.packages.length>2048||!Array.isArray(o.conflicts)||o.conflicts.length>4096||o.packages.some(p=>p.verified!==false||p.externalLocation!==null||['name','publisher','familyName','fullName','architecture','signatureKind','status','installedLocation'].some(k=>typeof p[k]!=='string'||p[k].length>32768)))throw Error('Invalid observed Explorer state.');
 return freeze(report);
}
/** Read-only evidence collector, deliberately not a verified runner snapshot yet. */
function createWindowsExplorerInspection({installDirectory,packageName,publisher,tempRoot,systemRoot='C:\\Windows',platform=process.platform,fs=nativeFS,execFile=nativeExec}){
 if(!local(installDirectory)||!local(tempRoot)||!local(systemRoot)||typeof packageName!=='string'||! /^[A-Za-z0-9][A-Za-z0-9.-]{2,49}$/.test(packageName)||typeof publisher!=='string'||publisher.length<1||publisher.length>512||/[\x00-\x1f]/.test(publisher))throw Error('Invalid trusted Explorer inspection configuration.');
 const configuration=Object.freeze({installDirectory,packageName,publisher});let tail=Promise.resolve();
 async function inspect(){
  if(platform!=='win32')return Object.freeze({supported:false,inspectionOnly:true,verified:false,reason:'unsupported-platform'});
  const temporary=await fs.mkdtemp(path.win32.join(tempRoot,'further-explorer-inspect-'));
  if(!local(temporary)||path.win32.dirname(temporary)!==tempRoot)throw Error('Invalid inspection staging directory.');
  try{const script=path.win32.join(temporary,'explorer-inspection.ps1');await fs.copyFile(SCRIPT,script);const powershell=path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');const {stdout}=await execFile(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-InstallDirectory',installDirectory,'-PackageName',packageName,'-Publisher',publisher],{windowsHide:true,timeout:60000,maxBuffer:1024*1024});return parseReport(stdout,configuration);}finally{await fs.rm(temporary,{recursive:true,force:true});}
 }
 return {inspect(){const current=tail.then(inspect);tail=current.catch(()=>{});return current;}};
}
module.exports={createWindowsExplorerInspection};
