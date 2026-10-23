'use strict';
const path=require('node:path'),{createHash}=require('node:crypto');
const KEY='HKCU\\Software\\FurtherCompare\\Explorer';
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
function local(value,leaf){if(typeof value!=='string'||! /^[A-Za-z]:\\/.test(value)||/[\x00-\x1f"<>|?*/]/.test(value)||value.slice(2).includes(':')||path.win32.normalize(value)!==value||leaf&&!same(path.win32.basename(value),leaf))throw Error('Invalid installation path.');return value;}
function text(value){if(typeof value!=='string'||!value||value.length>512||/[\x00-\x1f]/.test(value))throw Error('Invalid verified package identity.');return value;}
function identity(value){if(!value||value.verified!==true)throw Error('Package identity must be independently verified.');for(const key of ['name','publisher','familyName','fullName'])text(value[key]);if(!/^\d+\.\d+\.\d+\.\d+$/.test(value.version)||value.version.split('.').some(n=>Number(n)>65535)||!['x64','arm64'].includes(value.architecture))throw Error('Invalid package version or architecture.');return value;}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
function snapshotDigest(value){return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
/** Pure policy only. Evidence must come from a fresh, trusted Windows inspection adapter. */
function planWindowsExplorerLifecycle(action,snapshot){
 if(!['status','install','repair','uninstall'].includes(action))throw Error('Unknown Explorer lifecycle action.');
 if(!snapshot||!snapshot.expected||!snapshot.observed)throw Error('Missing lifecycle snapshot.');
 const e=snapshot.expected,o=snapshot.observed,id=identity(e.identity),exe=local(e.executable,'Further Compare.exe'),dll=local(e.dll,'FurtherCompareExplorer.dll');
 if(!same(path.win32.dirname(exe),path.win32.dirname(dll)))throw Error('Explorer DLL must be beside its host.');
 if(!Array.isArray(o.packages)||!Array.isArray(o.conflicts)||typeof o.config?.exists!=='boolean')throw Error('Incomplete observed lifecycle state.');
 const plan={action,snapshotDigest:snapshotDigest(snapshot),allowed:false,steps:[],blockers:[],registered:false,activation:'unknown',location:'current-user',state:'absent'};
 const block=reason=>{plan.blockers.push(reason);return plan;};
 if(o.conflicts.length)return block('conflicting-explorer-registration');
 const config=o.config,values=config.values||{},get=(name,type)=>values[name]?.type===type?values[name].value:undefined;
 const owner=config.exists&&get('OwnerVersion','DWORD')===1,configured=get('Executable','REG_SZ'),family=get('PackageFamilyName','REG_SZ'),full=get('PackageFullName','REG_SZ');
 if(config.exists&&(!owner||typeof configured!=='string'))return block('foreign-or-malformed-config');
 if(owner){try{local(configured,'Further Compare.exe');}catch{return block('foreign-or-malformed-config');}}
 const bound=owner&&family===id.familyName&&typeof full==='string';
 if(owner&&family!==undefined&&family!==id.familyName)return block('different-package-owner');
 for(const pkg of o.packages){if(!pkg||typeof pkg.familyName!=='string'||typeof pkg.fullName!=='string')throw Error('Invalid observed package record.');}
 const matches=o.packages.filter(pkg=>pkg.familyName===id.familyName);
 if(matches.length>1)return block('ambiguous-package-registration');
 const pkg=matches[0];
 if(pkg&&(!bound||full!==pkg.fullName))return block('unowned-package-registration');
 if(pkg&&(pkg.verified!==true||pkg.publisher!==id.publisher||pkg.architecture!==id.architecture||!same(pkg.externalLocation,path.win32.dirname(configured))))return block('package-identity-or-location-conflict');
 const moved=owner&&!same(configured,exe),current=!!pkg&&pkg.fullName===id.fullName&&!moved;
 plan.registered=!!pkg;plan.state=moved?'moved':current?'registered':owner?'partial':'absent';
 const assetIssues=[];for(const [kind,expectedPath]of [['executable',exe],['dll',dll],['package',e.packagePath]]){const asset=e.assets?.[kind];if(!asset||asset.exists!==true||asset.signatureValid!==true||asset.publisher!==id.publisher||asset.path!==expectedPath||!/^[a-f0-9]{64}$/i.test(asset.sha256||''))assetIssues.push('missing-or-unverified-'+kind);}
 plan.assetIssues=assetIssues;if(current&&assetIssues.length)plan.state='damaged';
 const oldGuard=owner?{key:KEY,OwnerVersion:1,Executable:configured,...(family===undefined?{}:{PackageFamilyName:family}),...(full===undefined?{}:{PackageFullName:full})}:null;
 const removePackage=()=>({kind:'remove-package',fullName:pkg.fullName,familyName:pkg.familyName,externalLocation:pkg.externalLocation,requireOwnedConfig:oldGuard});
 if(action==='status'){plan.allowed=true;return plan;}
 if(action==='uninstall'){
  if(!owner){plan.allowed=true;return plan;}
  if(!bound&&(family!==undefined||full!==undefined))return block('incomplete-package-ownership');
  if(pkg)plan.steps.push(removePackage());
  plan.steps.push({kind:'remove-owned-config-values',key:KEY,requireOwnedConfig:oldGuard,names:['LeftHint','PackageFullName','PackageFamilyName','Executable','OwnerVersion'],preserveUnknownValues:true},{kind:'verify-absent',familyName:id.familyName,key:KEY});plan.allowed=true;return plan;
 }
 if(moved&&action!=='repair')return block('application-moved-repair-required');
 if(owner&&!bound&&(family!==undefined||full!==undefined))return block('incomplete-package-ownership');
 if(o.platform!=='win32'||!Number.isInteger(o.build)||o.build<22000||o.architecture!==id.architecture)return block('unsupported-windows-host');
 if(assetIssues.length)return block(assetIssues[0]);
 local(e.packagePath);
 if(pkg&&!current){
  plan.recovery={atomic:false,journalRequired:true,journalBeforeFirstMutation:{snapshotDigest:plan.snapshotDigest,oldPackage:{...pkg},oldOwnedValues:JSON.parse(JSON.stringify(valuesForBinding(values))),newIdentity:{...id}},phaseRules:[
   {after:'remove-package',onFailure:'reinspect; old config remains owned partial; do not claim rollback'},
   {after:'write-owned-config-values',onFailure:'reinspect; new ownership intent permits repair; never continue registration after a config failure'},
   {after:'register-sparse-package',onFailure:'reinspect even if registration reported failure; verify exact identity/location before deciding repair or rollback'}
  ],rollback:{available:false,reason:'old verified deployment assets unavailable',requiresFreshInspection:true}};
  const prior=e.previousDeployment;
  if(prior){
   try{
    const old=identity(prior.identity);local(prior.executable,'Further Compare.exe');local(prior.dll,'FurtherCompareExplorer.dll');local(prior.packagePath);
    const safe=old.fullName===pkg.fullName&&old.familyName===id.familyName&&old.publisher===id.publisher&&old.architecture===id.architecture&&same(prior.executable,configured)&&same(path.win32.dirname(prior.dll),pkg.externalLocation)&&['executable','dll','package'].every(kind=>{const asset=prior.assets?.[kind];return asset?.exists===true&&asset.signatureValid===true&&asset.publisher===id.publisher&&asset.path===(kind==='package'?prior.packagePath:prior[kind])&&/^[a-f0-9]{64}$/i.test(asset.sha256||'');});
    if(safe)plan.recovery.rollback={available:true,requiresFreshInspection:true,requireOperationJournal:true,requireNoForeignRegistration:true,steps:[{kind:'remove-new-package-if-exact-owned',identity:{...id},externalLocation:path.win32.dirname(exe)},{kind:'restore-owned-config-values',key:KEY,values:JSON.parse(JSON.stringify(valuesForBinding(values))),preserveUnknownValues:true},{kind:'register-sparse-package',packagePath:prior.packagePath,externalLocation:pkg.externalLocation,identity:{...old},sha256:prior.assets.package.sha256},{kind:'verify-registration',identity:{...old},externalLocation:pkg.externalLocation}]};
   }catch{/* Missing/invalid old evidence never permits speculative rollback. */}
  }
  plan.steps.push(removePackage());
 }

 const desired={OwnerVersion:{type:'DWORD',value:1},Executable:{type:'REG_SZ',value:exe},PackageFamilyName:{type:'REG_SZ',value:id.familyName},PackageFullName:{type:'REG_SZ',value:id.fullName}};
 // Persist ownership intent first: interruption after registration stays repairable.
 // These values alone never imply that package registration/activation succeeded.
 if(JSON.stringify(canonical(valuesForBinding(values)))!==JSON.stringify(canonical(desired)))plan.steps.push({kind:'write-owned-config-values',key:KEY,requireOwnedConfig:oldGuard,requireAbsent:!owner,values:desired,clearHint:moved});
 if(!current)plan.steps.push({kind:'register-sparse-package',packagePath:e.packagePath,externalLocation:path.win32.dirname(exe),identity:{...id},sha256:e.assets.package.sha256,requireConfig:desired});
 plan.steps.push({kind:'verify-registration',identity:{...id},externalLocation:path.win32.dirname(exe)});
 plan.steps.push({kind:'verify-config',key:KEY,values:desired});plan.allowed=true;return plan;
}
function valuesForBinding(values){return Object.fromEntries(['OwnerVersion','Executable','PackageFamilyName','PackageFullName'].map(k=>[k,values[k]]));}
module.exports={planWindowsExplorerLifecycle,snapshotDigest};
