'use strict';
const path=require('node:path'),fs=require('node:fs/promises');
const {createWindowsExplorerInspection}=require('./windows-explorer-inspection.cjs');
const {createWindowsExplorerEvidenceAdapter}=require('./windows-explorer-evidence.cjs');
const {createWindowsExplorerJournal}=require('./windows-explorer-journal.cjs');
const {createWindowsExplorerLifecycleService}=require('./windows-explorer-lifecycle-service.cjs');
const instances=new WeakMap();
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
// Release-owned configuration is inside app.asar, never preferences or IPC data.
async function loadConfiguration(){let handle;try{handle=await fs.open(path.join(__dirname,'explorer-release.json'),'r');const stat=await handle.stat();if(!stat.isFile()||stat.size>4096)throw Error('Invalid release configuration');const bytes=Buffer.alloc(4097);const {bytesRead}=await handle.read(bytes,0,bytes.length,0);if(bytesRead>4096)throw Error('Invalid release configuration');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,bytesRead)));}catch(error){if(error.code==='ENOENT')return null;throw error;}finally{await handle?.close();}}
function validateConfiguration(c){if(!c||Object.keys(c).sort().join(',')!=='helperSha256,packageName,publisher,version'||c.version!==1||!/^[A-Za-z0-9][A-Za-z0-9.-]{2,49}$/.test(c.packageName||'')||typeof c.publisher!=='string'||!c.publisher||c.publisher.length>512||/[\x00-\x1f]/.test(c.publisher)||!/^[a-f0-9]{64}$/.test(c.helperSha256||''))throw Error('Invalid packaged Explorer configuration');return freeze(structuredClone(c));}
function createWindowsExplorerIntegration({app,platform=process.platform,appPath=process.execPath,systemRoot=process.env.SystemRoot||'C:\\Windows',loadRelease=loadConfiguration,inspectFactory=createWindowsExplorerInspection,evidenceFactory=createWindowsExplorerEvidenceAdapter,journalFactory=createWindowsExplorerJournal,filesystem=fs,authorityFactory=null}={}){
 // No production authoritative adapter exists yet. This dependency can only be
 // supplied by trusted host code, never release JSON, preferences, or IPC.
 if(authorityFactory!==null&&typeof authorityFactory!=='function')throw Error('Invalid Explorer authority provider.');
 let tail=Promise.resolve(),lifecycle=null,binding=null;const tokens=new Map(),owners=new Map();
 function revokeOwner(owner){owners.set(owner,(owners.get(owner)||0)+1);for(const [token,value]of tokens)if(value.owner===owner)tokens.delete(token);}
 function clearAuthority(){lifecycle?.dispose();lifecycle=null;binding=null;tokens.clear();}
 async function authoritative(config){
  if(!authorityFactory)return null;
  const next=JSON.stringify([config,appPath]);if(binding!==next){clearAuthority();const dependencies=await authorityFactory({config,appPath,systemRoot,platform});if(!dependencies||typeof dependencies.inspect!=='function'||typeof dependencies.execute!=='function')throw Error('Authoritative inspection unavailable.');const inspect=async()=>{const value=await dependencies.inspect(),expected=value?.expected,directory=path.win32.dirname(appPath);if(expected?.identity?.name!==config.packageName||expected?.identity?.publisher!==config.publisher||expected?.executable?.toLowerCase()!==appPath.toLowerCase()||expected?.dll?.toLowerCase()!==path.win32.join(directory,'FurtherCompareExplorer.dll').toLowerCase()||expected?.packagePath?.toLowerCase()!==path.win32.join(directory,'Explorer.msix').toLowerCase())throw Error('Authoritative installation binding changed.');return value;};lifecycle=createWindowsExplorerLifecycleService({...dependencies,inspect,journal:journalFactory({directory:path.join(app.getPath('userData'),'explorer-recovery'),platform})});binding=next;}
  return lifecycle;
 }

 async function status(){
  const result={supported:platform==='win32'&&!!app.isPackaged,inspectionOnly:true,verified:false,mutationAuthority:false,activation:'unknown',capabilities:{status:true,install:false,repair:false,uninstall:false},status:'unavailable',reason:'Modern Explorer menus are available only in packaged Windows builds.',recovery:{status:'unavailable',operationCount:0,unresolvedOperations:0}};
  const done=()=>freeze(result);
  if(!result.supported){clearAuthority();return done();}
  try{const history=await journalFactory({directory:path.join(app.getPath('userData'),'explorer-recovery'),platform}).discover();result.recovery={status:'inspected',operationCount:history.operations.length,unresolvedOperations:history.unresolvedOperations};}catch{result.recovery={status:'failed',operationCount:null,unresolvedOperations:null};}
  let config;try{const candidate=await loadRelease();if(candidate===null){clearAuthority();result.reason='This build does not include the signed modern Explorer extension. Use the classic Explorer integration below (Show more options on Windows 11).';return done();}config=validateConfiguration(candidate);}catch{clearAuthority();result.status='configuration-error';result.reason='The packaged modern Explorer configuration is invalid. Install a complete release; classic integration remains available.';return done();}
  const installDirectory=path.win32.dirname(appPath);
  try{for(const name of ['Further Compare.exe','FurtherCompareExplorer.dll','Explorer.msix','FurtherComparePackageInspection.exe']){const stat=await filesystem.lstat(path.win32.join(installDirectory,name));if(!stat.isFile()||stat.isSymbolicLink())throw Error('Missing asset');}}catch{clearAuthority();result.status='assets-missing';result.reason='Modern Explorer components are missing or incomplete. Install a complete release in a permanent location; classic integration remains available.';return done();}
  try{
   const collector=inspectFactory({installDirectory,packageName:config.packageName,publisher:config.publisher,tempRoot:app.getPath('temp'),systemRoot,platform});
   const adapter=evidenceFactory({collect:()=>collector.inspect(),attestationOptions:{installDirectory,packageName:config.packageName,publisher:config.publisher,helperSha256:config.helperSha256,systemRoot,platform}});
   const evidence=await adapter.inspect();if(evidence.inspectionOnly!==true||evidence.verified!==false||evidence.mutationAuthority!==false||!evidence.assessment)throw Error('Invalid assessment');
   const assessment=evidence.assessment;result.status=assessment.state;result.conflict=assessment.allowed!==true;
   result.reason=assessment.state==='damaged'?'Modern Explorer registration exists, but its installation components are damaged or unverified. No changes were made; install a complete release and use classic integration until repair is available.':result.conflict?'Modern Explorer registration conflicts with this installation. No changes were made. Keep using classic integration until a supported repair is available.':assessment.state==='registered'?'Modern Explorer registration was inspected. Menu activation is unverified; enable, repair and removal are not available in this build.':assessment.state==='moved'?'Modern Explorer registration points to another location. No changes were made; use classic integration until repair is available.':assessment.state==='partial'?'Modern Explorer setup is incomplete. No changes were made; use classic integration until repair is available.':'Modern Explorer registration was not found. This build supports inspection only; use classic integration below.';
   const service=await authoritative(config);if(service){const current=await service.status();Object.assign(result,current,{supported:true,activation:'unknown',reason:current.verified?'Registration was inspected. Review a change below; Explorer menu activation must be checked separately.':'Authoritative Explorer status is unavailable. Refresh to retry; no changes were made.'});if(!current.mutationAuthority)tokens.clear();}
  }catch{clearAuthority();result.status='inspection-failed';result.reason='Could not verify modern Explorer components or registration. Refresh to retry. No changes were made; classic integration remains available.';}
  return done();
 }
 function request(value){
  if(value==='status')return {action:'status'};
  if(!value||Object.getPrototypeOf(value)!==Object.prototype)throw Error('Modern Explorer integration supports status inspection only without a structured request.');
  const keys=Object.keys(value).sort().join(',');
  if(value.action==='status'&&keys==='action')return {action:'status'};
  if(value.action==='review'&&keys==='action,operation'&&['install','repair','uninstall'].includes(value.operation))return {...value};
  if(value.action==='execute'&&keys==='action,token'&&typeof value.token==='string'&&/^[a-f0-9]{64}$/.test(value.token))return {...value};
  throw Error('Invalid Explorer integration request.');
 }
 return Object.freeze({revokeOwner,run(value,context={}){
  let input;try{input=request(value);}catch(error){return Promise.reject(error);}
  const owner=context.owner,epoch=owners.get(owner)||0;
  if(input.action!=='status'&&(!Number.isSafeInteger(owner)||owner<1))return Promise.reject(Error('Explorer review requires its originating window.'));
  let reviewed;if(input.action==='execute'){reviewed=tokens.get(input.token);if(!reviewed||reviewed.owner!==owner||reviewed.epoch!==epoch)return Promise.reject(Error('Explorer review is expired or belongs to another window.'));tokens.delete(input.token);}
  const next=tail.then(async()=>{
   const current=await status();if(input.action==='status')return current;
   if((owners.get(owner)||0)!==epoch)throw Error('The Explorer review window closed.');
   if(!lifecycle||!current.mutationAuthority){if(input.action==='execute')throw Error('Modern Explorer changes are unavailable in this release.');return freeze({available:false,operation:input.operation,summary:'Modern Explorer changes are unavailable.',steps:[],reason:current.reason});}
   if(input.action==='review'){
    for(const [token,item]of tokens)if(item.owner===owner||item.expiresAt<=Date.now())tokens.delete(token);
    if(tokens.size>=32)throw Error('Too many pending Explorer reviews.');
    const review=await lifecycle.review(input.operation);
    if((owners.get(owner)||0)!==epoch)throw Error('The Explorer review window closed.');
    if(review.available)tokens.set(review.token,{owner,epoch,expiresAt:review.expiresAt,binding});return review;
   }
   if(reviewed.binding!==binding)throw Error('The Explorer installation changed. Review it again.');
   return lifecycle.executeReview(input.token);
  });tail=next.catch(()=>{});return next;
 }});

}
function getWindowsExplorerIntegration(app,options={}){if(!instances.has(app))instances.set(app,createWindowsExplorerIntegration({...options,app}));return instances.get(app);}
module.exports={createWindowsExplorerIntegration,getWindowsExplorerIntegration};
