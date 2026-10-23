'use strict';
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {validateSettings}=require('./external-editor.cjs');
const {validateDefaultProfiles}=require('./session-defaults.cjs');
const {validateShortcuts}=require('./keyboard-shortcuts.cjs');
const MAX_SETTINGS_BYTES=256*1024;
const platforms=['darwin','win32','linux'];
const queues=new Map();
const identity=s=>`${s.dev}:${s.ino}`;
const stamp=s=>`${identity(s)}:${s.mode}:${s.nlink}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
function record(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).some(key=>!keys.includes(key)))throw Error('Invalid settings fields.');}
function normalizeSettingsTransfer(value,catalog){
 record(value,['kind','version','platform','display','folderColumns','externalEditor','sessionDefaults','keyboardShortcuts']);
 if(value.kind!=='further-compare-settings'||value.version!==1||!platforms.includes(value.platform))throw Error('Unsupported settings format, version or platform.');
 record(value.display,['theme','density','fontSize']);
 const {theme,density,fontSize}=value.display;
 if(!['light','dark','system'].includes(theme)||!['compact','comfortable'].includes(density)||![12,13,14,15].includes(fontSize))throw Error('Invalid display settings.');
 record(value.folderColumns,['size','modified']);
 const folderColumns={};
 for(const [key,min,max] of [['size',48,240],['modified',80,320]])if(Object.hasOwn(value.folderColumns,key)){
  const width=value.folderColumns[key];if(!Number.isInteger(width)||width<min||width>max)throw Error('Invalid folder column width.');folderColumns[key]=width;
 }
 const settings={kind:value.kind,version:1,platform:value.platform,display:{theme,density,fontSize},folderColumns};
 if(Object.hasOwn(value,'keyboardShortcuts')){
  if(!Array.isArray(catalog))throw Error('A trusted command catalog is required for keyboard shortcuts.');
  settings.keyboardShortcuts=validateShortcuts(value.keyboardShortcuts,catalog,value.platform);
 }
 if(Object.hasOwn(value,'sessionDefaults'))settings.sessionDefaults=validateDefaultProfiles(value.sessionDefaults);
 if(Object.hasOwn(value,'externalEditor'))settings.externalEditor=validateSettings(value.externalEditor,value.platform);
 if(Buffer.byteLength(JSON.stringify(settings))>MAX_SETTINGS_BYTES)throw Error('Settings file is too large.');
 return settings;
}
function inspectSettingsTransfer(value,targetPlatform=process.platform,catalog){
 if(!platforms.includes(targetPlatform))throw Error('Unsupported target platform.');
 const settings=normalizeSettingsTransfer(value,catalog);
 let editorCompatible=true,editorError=null;
 if(settings.externalEditor)try{validateSettings(settings.externalEditor,targetPlatform);}catch(error){editorCompatible=false;editorError=error.message;}
 let shortcutsCompatible=true,shortcutsError=null;
 if(Object.hasOwn(settings,'keyboardShortcuts'))try{validateShortcuts(settings.keyboardShortcuts,catalog,targetPlatform);}catch(error){shortcutsCompatible=false;shortcutsError=error.message;}
 return {settings,editorCompatible,editorError,shortcutsCompatible,shortcutsError};
}
async function location(file){
 if(typeof file!=='string'||!path.isAbsolute(file)||file.includes('\0'))throw Error('Choose an absolute settings file path.');
 const parent=await fs.realpath(path.dirname(file)),stat=await fs.lstat(parent,{bigint:true});
 if(!stat.isDirectory())throw Error('Settings parent is not a directory.');
 return {path:path.join(parent,path.basename(file)),parent,identity:identity(stat)};
}
async function checkParent(target){
 const stat=await fs.lstat(target.parent,{bigint:true});
 if(!stat.isDirectory()||identity(stat)!==target.identity||await fs.realpath(target.parent)!==target.parent)throw Error('Settings directory changed. Try again.');
}
async function snapshot(target,allowMissing=false){
 await checkParent(target);
 let before;try{before=await fs.lstat(target.path,{bigint:true});}catch(error){if(allowMissing&&error.code==='ENOENT')return null;throw error;}
 if(before.isSymbolicLink()||!before.isFile())throw Error('Choose a regular non-symbolic-link settings file.');
 if(before.size>BigInt(MAX_SETTINGS_BYTES))throw Error('Settings file is too large.');
 const handle=await fs.open(target.path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const opened=await handle.stat({bigint:true});if(stamp(before)!==stamp(opened))throw Error('Settings file changed while reading.');
  const buffer=Buffer.alloc(MAX_SETTINGS_BYTES+1);let count=0;
  while(count<buffer.length){const result=await handle.read(buffer,count,buffer.length-count,null);if(!result.bytesRead)break;count+=result.bytesRead;}
  if(count>MAX_SETTINGS_BYTES)throw Error('Settings file is too large.');
  const after=await handle.stat({bigint:true}),named=await fs.lstat(target.path,{bigint:true});await checkParent(target);
  if(stamp(before)!==stamp(after)||stamp(after)!==stamp(named))throw Error('Settings file changed while reading.');
  return {content:buffer.subarray(0,count).toString('utf8'),stamp:stamp(after),links:after.nlink};
 }finally{await handle.close();}
}
async function readSettingsTransfer(file,targetPlatform=process.platform,catalog){const target=await location(file),saved=await snapshot(target);return inspectSettingsTransfer(JSON.parse(saved.content),targetPlatform,catalog);}
async function writeSettingsTransfer(file,value,catalog){
 const settings=normalizeSettingsTransfer(value,catalog),content=JSON.stringify(settings,null,2)+'\n';
 if(Buffer.byteLength(content)>MAX_SETTINGS_BYTES)throw Error('Settings file is too large.');
 const target=await location(file),key=target.path.normalize('NFC').toLowerCase(),previous=queues.get(key)||Promise.resolve();
 const operation=previous.catch(()=>{}).then(async()=>{
  const expected=await snapshot(target,true);if(expected&&expected.links!==1n)throw Error('Hard-linked settings files cannot be overwritten.');
  const temporary=path.join(target.parent,`.${path.basename(target.path)}.${randomUUID()}.tmp`);
  try{
   await checkParent(target);await fs.writeFile(temporary,content,{encoding:'utf8',flag:'wx',mode:0o600});
   const current=await snapshot(target,true);
   if(current?.stamp!==expected?.stamp)throw Error('Settings destination changed. Try again.');
   if(current&&current.links!==1n)throw Error('Hard-linked settings files cannot be overwritten.');
   await checkParent(target);
   if(expected)await fs.rename(temporary,target.path);else await fs.link(temporary,target.path);
   await fs.rm(temporary,{force:true});return {path:target.path,settings};
  }finally{await fs.rm(temporary,{force:true});}
 });
 queues.set(key,operation);try{return await operation;}finally{if(queues.get(key)===operation)queues.delete(key);}
}
module.exports={MAX_SETTINGS_BYTES,normalizeSettingsTransfer,inspectSettingsTransfer,readSettingsTransfer,writeSettingsTransfer};
