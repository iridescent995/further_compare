'use strict';
const path=require('node:path');
const {planWindowsExplorerLifecycle}=require('./windows-explorer-lifecycle.cjs');
const LIMIT='attestation-runtime-acceptance-pending';
const {createWindowsExplorerAttestation}=require('./windows-explorer-attestation.cjs');
const fail=()=>{throw Error('Invalid or inconsistent Explorer attestation evidence.');};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const local=value=>typeof value==='string'&&value.length<=30000&&/^[A-Za-z]:\\/.test(value)&&!/[\x00-\x1f"<>|?*/]/.test(value)&&!value.slice(2).includes(':')&&path.win32.normalize(value)===value;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const sameFields=(a,b,keys)=>keys.every(key=>a?.[key]===b?.[key]);
/** Normalize the read-only attestation report, never issuing mutation authority.
 * This is evidence interpretation, not a replacement for signatures/SDK checks.
 * There is deliberately no caller flag to bypass the Windows acceptance gate.
 */
function normalizeWindowsExplorerEvidence(report){
 if(!report||report.inspectionOnly!==true||report.verified!==false)fail();
 if(report.supported===false)return freeze({assessment:null,mutationAuthority:false,capabilities:{status:false,install:false,repair:false,uninstall:false,activationVerified:false},supported:false,inspectionOnly:true,verified:false,activation:'unknown',reason:typeof report.reason==='string'?report.reason:'inspection-unavailable',limitations:Array.isArray(report.limitations)?structuredClone(report.limitations):[]});
 if(report.version!==1||report.supported!==true||report.activation!=='unknown'||!Array.isArray(report.limitations))fail();
 const evidence=structuredClone(report.evidence),collector=evidence?.collector,pkg=evidence?.package,id=pkg?.identity,registrations=evidence?.registrations;
 if(!collector||collector.supported!==true||collector.inspectionOnly!==true||collector.verified!==false||!pkg||pkg.version!==1||pkg.kind!=='package'||pkg.verified!==true||pkg.signatureVerified!==true||pkg.manifestValidated!==true||pkg.blockMapValidated!==true||pkg.productManifestValidated!==true||!Number.isInteger(pkg.validatedFiles)||pkg.validatedFiles<1||pkg.validatedFiles>512||!id||id.verified!==true)fail();
 if(!sameFields(collector.trustedIdentity,id,['name','publisher'])||!sameFields(collector.identityCandidate,id,['name','publisher','version','architecture']))fail();
 const installation=collector.installation,assets=collector.assets;if(!installation||!assets||!local(installation.executable)||path.win32.basename(installation.executable)!=='Further Compare.exe')fail();const directory=path.win32.dirname(installation.executable);
 for(const [kind,name]of Object.entries({executable:'Further Compare.exe',dll:'FurtherCompareExplorer.dll',package:'Explorer.msix'})){
  const asset=assets[kind],expected=path.win32.join(directory,name);if(installation[kind==='package'?'packagePath':kind]!==expected||asset?.path!==expected||asset.exists!==true||asset.signatureValid!==true||asset.signatureStatus!=='Valid'||asset.publisher!==id.publisher||!hash(asset.sha256))fail();
 }
 if(pkg.path!==assets.package.path||pkg.sha256!==assets.package.sha256)fail();
 const observed=collector.observed;if(!observed||observed.platform!=='win32'||!Number.isInteger(observed.build)||observed.architecture!==id.architecture||!Array.isArray(observed.packages)||observed.packages.length>2048||!Array.isArray(observed.conflicts)||observed.conflicts.length>4096||typeof observed.config?.exists!=='boolean')fail();
 const values=observed.config.values;if(values!==undefined&&(!values||typeof values!=='object'||Array.isArray(values))||observed.config.exists&&values===undefined||!observed.config.exists&&Object.keys(values||{}).length)fail();
 if(!Array.isArray(registrations)||registrations.length>1||!Array.isArray(evidence.helperInvocations)||evidence.helperInvocations.length!==1+registrations.length)fail();
 for(const helper of evidence.helperInvocations){if(helper?.path!==path.win32.join(directory,'FurtherComparePackageInspection.exe')||!hash(helper.sha256)||helper.sha256!==evidence.helperInvocations[0].sha256||helper.publisher!==id.publisher||helper.signatureValid!==true||!['invocation','injected-lease'].includes(helper.lockScope)||helper.lockScope==='injected-lease'&&helper.locked!==true)fail();}
 // Retain every unmatched registration and every conflict, including unknown fields.
 // Matching location evidence never makes old/different packages authoritative.
 const packages=observed.packages.map(record=>{if(!record||typeof record.fullName!=='string'||typeof record.familyName!=='string'||record.verified!==false)fail();return {...record};});
 const matches=packages.filter(record=>record.fullName===id.fullName);if(matches.length>1||matches.length!==registrations.length)fail();
 for(const registration of registrations){const record=matches[0];if(!record||!sameFields(record,id,['name','publisher','familyName','fullName','architecture','version'])||record.status!=='Ok'||record.externalLocation!==null||!sameFields(registration,record,['name','publisher','familyName','fullName','architecture','version','status','verified'])||registration.identityMatchesAttestedPackage!==true||registration.locationVerified!==true||!local(registration.externalLocation))fail();
  record.externalLocation=registration.externalLocation;record.verified=true;
 }
 const snapshot={expected:{identity:{...id},executable:installation.executable,dll:installation.dll,packagePath:installation.packagePath,assets:structuredClone(assets)},observed:{...observed,config:structuredClone(observed.config),packages,conflicts:[...observed.conflicts]}};
 // Validate planner-facing schema without filtering out conflict evidence.
 const assessment=planWindowsExplorerLifecycle('status',snapshot);
 // Never expose the normalized expected/observed pair as runner input.
 return freeze({assessment,supported:true,inspectionOnly:true,verified:false,mutationAuthority:false,capabilities:{status:true,install:false,repair:false,uninstall:false,activationVerified:false},activation:'unknown',reason:LIMIT,limitations:[...report.limitations],evidence});
}
function createWindowsExplorerEvidenceAdapter({collect,attestationOptions,attest}={}){
 if(attest!==undefined&&(typeof attest!=='function'||collect!==undefined||attestationOptions!==undefined))throw Error('Invalid Explorer evidence dependencies.');
 const inspect=attest||createWindowsExplorerAttestation({...attestationOptions,collect}).inspect;let tail=Promise.resolve();
 return Object.freeze({inspect(){const next=tail.then(async()=>normalizeWindowsExplorerEvidence(await inspect()));tail=next.catch(()=>{});return next;}});
}
module.exports={normalizeWindowsExplorerEvidence,createWindowsExplorerEvidenceAdapter};
