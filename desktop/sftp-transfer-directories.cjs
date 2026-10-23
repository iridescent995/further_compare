'use strict';
const path=require('node:path').posix;
const {checkSignal}=require('./local-folder-reader.cjs');
const preparedStates=new WeakMap(),createdStates=new WeakMap();
const error=(code,message)=>Object.assign(Error(message),{code});
const stale=()=>error('STALE_SOURCE','A reviewed directory, parent or child changed. Review the copy again.');
const validRelative=p=>typeof p==='string'&&p.length>0&&p.length<=32768&&!/[\\\0]/.test(p)&&!p.split('/').some(part=>!part||part==='.'||part==='..');
const sameAuthority=(a,b)=>!!a&&!!b&&a.path===b.path&&a.identity===b.identity;
const sameEnclosing=(a,b)=>sameAuthority(a,b)&&['mode','uid','gid'].every(key=>a[key]===b[key]);
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
function sanitized(info,{relative,root=false}={}){
 if(!info||typeof info.path!=='string'||!info.path&&root||typeof info.identity!=='string'||!info.identity||typeof info.stamp!=='string'||!info.stamp||!root&&(info.path!==relative||info.kind!=='directory')||root&&info.kind!==undefined&&info.kind!=='directory')throw stale();
 for(const key of ['mode','uid','gid'])if(info[key]!==undefined&&info[key]!==null&&(!Number.isSafeInteger(info[key])||info[key]<0||info[key]>0xffffffff))throw stale();
 const result={};for(const name of ['path','kind','identity','stamp','mode','uid','gid','mtime','mtimeNs','strongRevision'])if(['string','number','boolean'].includes(typeof info[name])||info[name]===null)result[name]=info[name];return freeze(result);
}
function providerCheck(destination){
 if(!destination||!['inspectRoot','inspectEntry','enumerateDirectory','request'].every(key=>typeof destination[key]==='function')||!destination.connection||typeof destination.root!=='string'||!destination.root.startsWith('/')||path.normalize(destination.root)!==destination.root||/[\\\0]/.test(destination.root))throw Error('Choose a connected SFTP directory destination.');
 if(destination.connection.closed||destination.revoked)throw error('CONNECTION_CLOSED','The destination connection closed.');
}
async function checkAuthority(state,signal){
 checkSignal(signal);providerCheck(state.destination);if(state.destination.root!==state.canonicalRoot||state.destination.connection!==state.connection)throw stale();
 const actual=sanitized(await state.destination.inspectRoot({signal}),{root:true});if(!sameEnclosing(actual,state.root))throw stale();
 for(const prior of state.parents){checkSignal(signal);const current=sanitized(await state.destination.inspectEntry(prior.path,{signal}),{relative:prior.path});if(!sameEnclosing(prior,current))throw stale();}checkSignal(signal);
}
// Preparation is read-only. The caller must bind it to reviewed recursive-copy
// authority and complete backups before create; parents must already exist.
async function prepareSftpDirectory(destination,relative,{signal}={}){
 checkSignal(signal);providerCheck(destination);if(!validRelative(relative))throw Error('Choose a valid root-relative directory.');
 const canonicalRoot=destination.root,connection=destination.connection;
 const root=sanitized(await destination.inspectRoot({signal}),{root:true}),parents=[];
 let ancestor=path.dirname(relative);while(ancestor!=='.'){checkSignal(signal);parents.push(sanitized(await destination.inspectEntry(ancestor,{signal}),{relative:ancestor}));ancestor=path.dirname(ancestor);}
 const state={destination,connection,canonicalRoot,relative,root,parents,used:false};
 await checkAuthority(state,signal);if(await destination.inspectEntry(relative,{signal})!==null)throw error('DESTINATION_EXISTS','The reviewed new directory already exists.');checkSignal(signal);
 const token=freeze({relative,observation:{root,parents:[...parents],target:null}});preparedStates.set(token,state);return token;
}
function classify(cause,{operation,submitted,acknowledged}){
 const flags={operation,created:operation==='finalize'||acknowledged,metadataSubmitted:operation==='finalize'&&submitted,metadataMayHaveChanged:operation==='finalize'&&submitted,acknowledged};
 if(acknowledged)return Object.assign(error('DIRECTORY_VERIFICATION_FAILED','The server acknowledged the directory '+(operation==='create'?'creation':'metadata update')+', but verification failed. Inspect it before retrying.'),flags);
 if(submitted&&(!Number.isInteger(cause.code)||cause.code===6||cause.code===7)){if(operation==='create')flags.created=null;return Object.assign(error('DIRECTORY_OUTCOME_UNKNOWN','The directory '+(operation==='create'?'creation':'metadata update')+' outcome is unknown. Inspect the destination; do not retry automatically.'),flags);}
 return Object.assign(cause,flags);
}
async function createSftpDirectory(prepared,{signal}={}){
 const state=preparedStates.get(prepared);if(!state||state.used)throw Error('Directory preparation is unknown or already used.');state.used=true;
 let submitted=false,acknowledged=false;
 try{
  await checkAuthority(state,signal);if(await state.destination.inspectEntry(state.relative,{signal})!==null)throw error('DESTINATION_EXISTS','The reviewed new directory already exists.');checkSignal(signal);
  submitted=true;await state.destination.request('mkdir',[path.join(state.canonicalRoot,state.relative),{mode:0o700}],{signal});acknowledged=true;
  await checkAuthority(state,signal);const metadata=sanitized(await state.destination.inspectEntry(state.relative,{signal}),{relative:state.relative});
  if(!Number.isSafeInteger(metadata.mode)||(metadata.mode&0o7777)!==0o700)throw Error('Created directory permissions did not verify.');
  // A compliant exclusive MKDIR cannot adopt an existing directory. Check the
  // initial namespace too, but preserve any unexpected contents on failure.
  for await(const child of state.destination.enumerateDirectory(state.relative,{signal})){void child;throw Error('The created directory is not empty.');}
  const final=sanitized(await state.destination.inspectEntry(state.relative,{signal}),{relative:state.relative});if(!sameAuthority(final,metadata)||final.stamp!==metadata.stamp)throw stale();await checkAuthority(state,signal);
  const token=freeze({relative:state.relative,observation:{root:state.root,metadata:final}});createdStates.set(token,{...state,metadata:final,used:false});return token;
 }catch(cause){throw classify(cause,{operation:'create',submitted,acknowledged});}
}
function childrenInput(children){
 if(!Array.isArray(children)||children.length>50000)throw Error('Supply the complete expected directory namespace.');
 const entries=new Map();for(const child of children){if(!child||typeof child.name!=='string'||!child.name||child.name.length>32768||/[\\/\0]/.test(child.name)||['.','..'].includes(child.name)||!['file','directory'].includes(child.kind)||typeof child.identity!=='string'||!child.identity||typeof child.stamp!=='string'||!child.stamp||entries.has(child.name))throw Error('Invalid expected directory child observation.');entries.set(child.name,Object.freeze({name:child.name,kind:child.kind,identity:child.identity,stamp:child.stamp}));}return entries;
}
async function checkChildren(state,expected,signal){
 const seen=new Set();for await(const child of state.destination.enumerateDirectory(state.relative,{signal})){
  checkSignal(signal);const prior=expected.get(child.name);if(!prior||prior.kind!==child.kind||seen.has(child.name))throw stale();seen.add(child.name);
 }
 if(seen.size!==expected.size)throw stale();
 for(const [name,prior] of expected){checkSignal(signal);const current=await state.destination.inspectEntry(state.relative+'/'+name,{signal});if(!current||current.kind!==prior.kind||current.identity!==prior.identity||current.stamp!==prior.stamp)throw stale();}
 checkSignal(signal);
}
function attributes(source){
 if(!source||source.kind!=='directory')throw Error('Choose the source directory metadata.');const result={};
 if(source.mode!==undefined&&source.mode!==null){if(!Number.isSafeInteger(source.mode)||source.mode<0||source.mode>0xffffffff)throw Error('Invalid source directory permissions.');result.mode=source.mode&0o777;}
 if(source.mtime!==undefined&&source.mtime!==null){if(!Number.isFinite(source.mtime)||source.mtime<0||Math.floor(source.mtime/1000)>0xffffffff)throw Error('Invalid source directory modification time.');result.atime=result.mtime=Math.floor(source.mtime/1000);}
 return result;
}
// Finalize deepest-first after all owned child publications/finalizations. SFTP
// v3 has no inode/CAS guarantee: identical-attribute external replacements and
// the final server-side race cannot be excluded by path observations. No chmod
// or recursive removal of an unacknowledged/externally existing dir is allowed.
async function finalizeSftpDirectory(created,sourceMetadata,expectedChildren,{signal}={}){
 const state=createdStates.get(created);if(!state||state.used)throw Error('Created directory authority is unknown or already used.');state.used=true;
 let submitted=false,acknowledged=false;
 try{
  const expected=childrenInput(expectedChildren),attrs=attributes(sourceMetadata);await checkAuthority(state,signal);
  const before=sanitized(await state.destination.inspectEntry(state.relative,{signal}),{relative:state.relative});
  if(!sameAuthority(before,state.metadata)||['mode','uid','gid'].some(key=>before[key]!==state.metadata[key]))throw stale();
  await checkChildren(state,expected,signal);await checkAuthority(state,signal);
  const checked=sanitized(await state.destination.inspectEntry(state.relative,{signal}),{relative:state.relative});if(!sameAuthority(checked,before)||checked.stamp!==before.stamp)throw stale();checkSignal(signal);
  if(Object.keys(attrs).length){submitted=true;await state.destination.request('setstat',[path.join(state.canonicalRoot,state.relative),attrs],{signal});acknowledged=true;}
  const after=sanitized(await state.destination.inspectEntry(state.relative,{signal}),{relative:state.relative});
  if(!sameAuthority(after,before)||attrs.mode!==undefined&&(after.mode&0o7777)!==attrs.mode||attrs.mtime!==undefined&&after.mtime!==attrs.mtime*1000||['uid','gid'].some(key=>before[key]!==after[key]))throw stale();
  // Do not re-open children after applying restrictive source permissions.
  // Namespace was verified immediately before SETSTAT; afterward only metadata
  // and enclosing authority can be checked without defeating mode preservation.
  await checkAuthority(state,signal);checkSignal(signal);return freeze({observation:{root:state.root,metadata:after}});
 }catch(cause){throw classify(cause,{operation:'finalize',submitted,acknowledged});}
}
module.exports={prepareSftpDirectory,createSftpDirectory,finalizeSftpDirectory};
