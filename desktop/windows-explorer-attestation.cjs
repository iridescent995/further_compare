'use strict';
const path=require('node:path');
const execDefault=require('node:util').promisify(require('node:child_process').execFile);
const {createHash}=require('node:crypto');
const SCRIPT=path.join(__dirname,'native','explorer-attestation.ps1');
const HELPER='FurtherComparePackageInspection.exe',MAX_OUTPUT=65536;
function local(v){return typeof v==='string'&&v.length<=30000&&/^[A-Za-z]:\\/.test(v)&&!/[\x00-\x1f"<>|?*/]/.test(v)&&!v.slice(2).includes(':')&&path.win32.normalize(v)===v;}
function hash(v){return typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);}
function digest(v){return createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function clone(v){return structuredClone(v);}
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function parse(stdout){if(Buffer.isBuffer(stdout)){if(stdout.length>MAX_OUTPUT)throw Error('Invalid attestation output size.');stdout=new TextDecoder('utf-8',{fatal:true}).decode(stdout);}if(typeof stdout!=='string'||Buffer.byteLength(stdout)>MAX_OUTPUT)throw Error('Invalid attestation output size.');let v;try{v=JSON.parse(stdout);}catch{throw Error('Invalid attestation JSON.');}if(!v||Array.isArray(v)||v.version!==1)throw Error('Invalid attestation schema.');return v;}
function identity(v,configuration){if(!v||v.verified!==true||v.name!==configuration.packageName||v.publisher!==configuration.publisher||!['x64','arm64'].includes(v.architecture)||!/^\d+\.\d+\.\d+\.\d+$/.test(v.version)||v.version.split('.').some(n=>Number(n)>65535)||['fullName','familyName'].some(k=>typeof v[k]!=='string'||!v[k]||v[k].length>512||/[\\/\x00-\x20]/.test(v[k])))throw Error('Invalid package identity evidence.');return clone(v);}
function collection(v,c){
 if(!v||v.supported!==true||v.inspectionOnly!==true||v.verified!==false||v.trustedIdentity?.name!==c.packageName||v.trustedIdentity?.publisher!==c.publisher)throw Error('Invalid inspection collector binding.');
 for(const [key,name]of Object.entries({executable:'Further Compare.exe',dll:'FurtherCompareExplorer.dll',package:'Explorer.msix'})){
  const a=v.assets?.[key],p=path.win32.join(c.installDirectory,name);
  if(!a||a.path!==p||v.installation?.[key==='package'?'packagePath':key]!==p||a.exists!==true||a.signatureValid!==true||a.signatureStatus!=='Valid'||a.publisher!==c.publisher||!hash(a.sha256))throw Error('Missing or untrusted installation asset.');
 }
 const o=v.observed;if(!o||o.platform!=='win32'||!Number.isInteger(o.build)||!['x64','arm64'].includes(o.architecture)||typeof o.config?.exists!=='boolean'||(o.config.exists&&(typeof o.config.values!=='object'||o.config.values===null))||(o.config.values!==undefined&&(typeof o.config.values!=='object'||o.config.values===null||Array.isArray(o.config.values)))||!o.config.exists&&Object.keys(o.config.values||{}).length||!Array.isArray(o.packages)||o.packages.length>2048||!Array.isArray(o.conflicts)||o.conflicts.length>4096)throw Error('Malformed observed installation state.');
 return v;
}
/** Source-only adapter: output is intentionally NOT a lifecycle-runner snapshot. */
function createWindowsExplorerAttestation({installDirectory,packageName,publisher,helperSha256,collect,withVerifiedHelper,execFile=execDefault,systemRoot='C:\\Windows',platform=process.platform}){
 if(!local(systemRoot)||!local(installDirectory)||! /^[A-Za-z0-9][A-Za-z0-9.-]{2,49}$/.test(packageName||'')||typeof publisher!=='string'||!publisher||publisher.length>512||/[\x00-\x1f]/.test(publisher)||!hash(helperSha256)||typeof collect!=='function')throw Error('Invalid trusted attestation configuration.');
 const injectedLease=withVerifiedHelper;
 const config=freeze({installDirectory,packageName,publisher}),helperPath=path.win32.join(installDirectory,HELPER),expected=freeze({path:helperPath,publisher,sha256:helperSha256});let tail=Promise.resolve();
 async function inspect(){
  if(platform!=='win32')return freeze({supported:false,inspectionOnly:true,verified:false,reason:platform!=='win32'?'unsupported-platform':'verified-helper-transport-unavailable'});
  const before=clone(collection(await collect(),config));let called=false;
  const work=async helper=>{
   if(called)throw Error('Repeated helper lease.');called=true;
   if(injectedLease&&(!helper||helper.path!==helperPath||helper.sha256!==helperSha256||helper.publisher!==publisher||helper.signatureValid!==true||helper.locked!==true))throw Error('Untrusted attestation helper.');
   const helperInvocations=[];
   async function run(args){const executable=injectedLease?helperPath:path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');const parameters=injectedLease?args:['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',SCRIPT,'-Helper',helperPath,'-Sha256',helperSha256,'-Publisher',publisher,'-Request',JSON.stringify(args)];const {stdout}=await execFile(executable,parameters,{windowsHide:true,timeout:40000,maxBuffer:MAX_OUTPUT,encoding:null});const parsed=parse(stdout);if(injectedLease){helperInvocations.push({...clone(helper),lockScope:'injected-lease'});return parsed;}const proof=parsed.helper;if(parsed.kind!=='helper-invocation'||!proof||proof.path!==helperPath||proof.sha256!==helperSha256||proof.publisher!==publisher||proof.signatureValid!==true||proof.lockScope!=='invocation')throw Error('Untrusted helper transport envelope.');helperInvocations.push(clone(proof));return parse(JSON.stringify(parsed.result));}
   const pkg=await run(['package',before.installation.packagePath,packageName,publisher]);
   if(pkg.kind!=='package'||pkg.verified!==true||pkg.signatureVerified!==true||pkg.manifestValidated!==true||pkg.blockMapValidated!==true||pkg.productManifestValidated!==true||pkg.path!==before.assets.package.path||pkg.sha256!==before.assets.package.sha256||!Number.isInteger(pkg.validatedFiles)||pkg.validatedFiles<1||pkg.validatedFiles>512)throw Error('Unbound package attestation.');
   const id=identity(pkg.identity,config);if(id.architecture!==before.observed.architecture)throw Error('Package architecture mismatch.');
   const candidate=before.identityCandidate;if(!candidate||['name','publisher','version','architecture'].some(k=>candidate[k]!==id[k]))throw Error('Package candidate changed.');
   const matches=before.observed.packages.filter(p=>p.fullName===id.fullName);if(matches.length>1)throw Error('Ambiguous registered package.');
   const registrations=[];
   for(const p of matches){if(p.name!==id.name||p.publisher!==id.publisher||p.familyName!==id.familyName||p.architecture!==id.architecture||p.verified!==false||p.externalLocation!==null||p.status!=='Ok')throw Error('Inconsistent registered package identity.');
    const location=await run(['external-location',id.fullName]);if(location.kind!=='registered-location'||location.locationVerified!==true||location.packageIdentityVerified!==false||location.fullName!==id.fullName||!local(location.externalLocation))throw Error('Invalid external location evidence.');
    registrations.push({...clone(p),externalLocation:location.externalLocation,identityMatchesAttestedPackage:true,locationVerified:true});
   }
   const after=clone(collection(await collect(),config));if(digest(before)!==digest(after))throw Error('Explorer inspection changed during attestation.');
   return {helperInvocations,package:pkg,registrations,collector:after};
  };
  const evidence=injectedLease?await withVerifiedHelper(helperPath,expected,work):await work(null);
  if(!called||!evidence?.package)throw Error('Attestation lease did not execute.');
  // The SDK bridge and lease verifier have not passed Windows acceptance.
  // Combined evidence is inspectable, never implicit install/repair authority.
  return freeze({version:1,supported:true,inspectionOnly:true,verified:false,activation:'unknown',evidence,limitations:['Windows SDK bridge and helper lease verifier require compiled/runtime acceptance.','Location evidence does not attest unmatched or older registered packages.','No lifecycle mutation or activation authority is issued.']});
 }
 return Object.freeze({inspect(){const p=tail.then(inspect);tail=p.catch(()=>{});return p;}});
}
module.exports={createWindowsExplorerAttestation};
