'use strict';
const {validateTextGrammar}=require('../src/text-grammar.cjs');
const {validateTextProfile,validateTextProfileMappings}=require('../src/text-profile.cjs');

const {validateIgnoredTextPatterns}=require('../src/ignored-text-rules.cjs');
const {WHITESPACE_SCOPES}=require('../src/text-whitespace.cjs');
const {validateFolderNameRules}=require('./folder-name-matching.cjs');
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {FOLDER_FILTER_IDS}=require('./folder-display.cjs');
const {validateRefreshInterval}=require('../src/folder-refresh.cjs');
const {validateFolderRules}=require('./folder-rules.cjs');
const MAX_DEFAULTS_BYTES=128*1024;
const DEFAULT_TYPES=Object.freeze(['text-compare','text-merge','folder-compare','folder-merge','folder-sync','binary-compare','table-compare','picture-compare','audio-compare','registry-compare']);
const textKeys=['textGrammar','textProfileMappings','textProfile','syntaxAlignment','showMovedBlocks','ignoreWhitespace','ignoreCase','ignoreBlankLines','ignoredTextPatterns','whitespaceScope','showMinor','filter','textTools'];
const folderKeys=['direction','filter','folderInclude','folderExclude','folderView','folderRules','folderNameRules'];
const advancedKeys={
 'binary-compare':['binaryAlignment'],
 'table-compare':['delimiter','keys','headers','onlyDifferences','workbookMode','compareFormatting','compareLayout','compareConditionalRules','compareNumberFormats'],
 'picture-compare':['threshold','view','opacity','zoom'],
 'audio-compare':['offset','tolerance'],
 'registry-compare':['filter']
};
function record(v,keys){if(!v||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).some(k=>!keys.includes(k)))throw Error('Invalid session default fields.');}
function choice(v,values){if(!values.includes(v))throw Error('Invalid session default value.');return v;}
function bool(v){if(typeof v!=='boolean')throw Error('Invalid session default boolean.');return v;}
function number(v,min,max){if(!Number.isFinite(v)||v<min||v>max)throw Error('Invalid session default number.');return v;}
function string(v,max=4096){if(typeof v!=='string'||v.length>max||v.includes('\0'))throw Error('Invalid session default text.');return v;}
function pick(v,keys){const out={};for(const k of keys)if(v&&Object.hasOwn(v,k))out[k]=v[k];return out;}
function keysFor(type){return type.startsWith('text-')?textKeys:type.startsWith('folder-')?[...folderKeys,...(type==='folder-sync'?['folderSyncMode']:[])]:[];}
function textTools(v){
 record(v,['wrap','whitespace','matchCase','regex','query','replacement','bookmarks','side']);
 const out={};for(const k of ['wrap','whitespace','matchCase','regex'])if(Object.hasOwn(v,k))out[k]=bool(v[k]);
 if(Object.hasOwn(v,'query')&&v.query!=='')throw Error('Search text cannot be a default.');
 if(Object.hasOwn(v,'replacement')&&v.replacement!=='')throw Error('Replacement text cannot be a default.');
 if(Object.hasOwn(v,'side')&&v.side!=='a')throw Error('Selected side cannot be a default.');
 if(Object.hasOwn(v,'bookmarks')){record(v.bookmarks,['a','b']);for(const side of ['a','b'])if(!Array.isArray(v.bookmarks[side])||v.bookmarks[side].length)throw Error('Bookmarks cannot be defaults.');}
 return {...out,query:'',replacement:'',side:'a',bookmarks:{a:[],b:[]}};
}
function validateDefaultProfile(value){
 record(value,['type','options','advancedOptions']);choice(value.type,DEFAULT_TYPES);
 const type=value.type,allowed=keysFor(type);record(value.options,allowed);const options={};
 for(const [k,v]of Object.entries(value.options)){
  if(['ignoreWhitespace','ignoreCase','ignoreBlankLines','syntaxAlignment','showMovedBlocks','showMinor'].includes(k))options[k]=bool(v);
  else if(k==='textGrammar')options[k]=validateTextGrammar(v);
  else if(k==='textProfileMappings')options[k]=validateTextProfileMappings(v);
  else if(k==='textProfile')options[k]=validateTextProfile(v);
  else if(k==='ignoredTextPatterns'){const patterns=validateIgnoredTextPatterns(v);if(patterns.length)options[k]=patterns;}
  else if(k==='whitespaceScope')options[k]=choice(v,WHITESPACE_SCOPES);
  else if(k==='filter')options[k]=choice(v,['all','diff','same','context',...(type.startsWith('folder-')?FOLDER_FILTER_IDS:[])]);
  else if(k==='direction')options[k]=choice(v,['a-to-b','b-to-a']);
  else if(k==='folderSyncMode')options[k]=choice(v,['mirror','update','update-both']);
  else if(k==='folderInclude'||k==='folderExclude')options[k]=string(v);
  else if(k==='folderNameRules')options[k]=validateFolderNameRules(v);
  else if(k==='folderRules')options[k]=validateFolderRules(v);
  else if(k==='textTools')options[k]=textTools(v);
  else if(k==='folderView'){
   record(v,['mode','sort','descending','alwaysShowFolders','hideLegend','refreshIntervalMs']);
   const view={mode:choice(v.mode,['tree','flat','recursive','filename']),sort:choice(v.sort,['name','path','size-left','size-right','modified-left','modified-right']),descending:bool(v.descending)};
   for(const key of ['alwaysShowFolders','hideLegend'])if(Object.hasOwn(v,key))view[key]=bool(v[key]);if(Object.hasOwn(v,'refreshIntervalMs'))view.refreshIntervalMs=validateRefreshInterval(v.refreshIntervalMs);options[k]=view;
  }
 }
 const result={type,options};
 if(Object.hasOwn(value,'advancedOptions')){
  if(!advancedKeys[type])throw Error('This session type has no advanced defaults.');
  record(value.advancedOptions,advancedKeys[type]);const advanced={};
  for(const [k,v]of Object.entries(value.advancedOptions)){
   if(['headers','onlyDifferences','compareFormatting','compareLayout','compareConditionalRules','compareNumberFormats'].includes(k))advanced[k]=bool(v);
   else if(k==='binaryAlignment')advanced[k]=choice(v,['offset','aligned']);
   else if(k==='delimiter')advanced[k]=choice(v,['auto',',','\t',';']);
   else if(k==='keys'){string(v);if(v.trim()&&!/^\s*[1-9]\d*\s*(,\s*[1-9]\d*\s*)*$/.test(v))throw Error('Invalid table key columns.');if(v.trim()&&v.split(',').some(n=>!Number.isSafeInteger(Number(n))||Number(n)>512))throw Error('Table key columns exceed the column limit.');advanced[k]=v;}
   else if(k==='workbookMode')advanced[k]=choice(v,['values','formulas']);
   else if(k==='threshold'){number(v,0,255);if(!Number.isInteger(v))throw Error('Invalid pixel tolerance.');advanced[k]=v;}
   else if(k==='view')advanced[k]=choice(v,['split','difference','overlay']);
   else if(k==='opacity')advanced[k]=number(v,0,1);
   else if(k==='zoom')advanced[k]=choice(v,['fit','0.5','1','2']);
   else if(k==='offset')advanced[k]=number(v,-3600,3600);
   else if(k==='tolerance')advanced[k]=number(v,0,2);
   else if(k==='filter')advanced[k]=choice(v,['all','changed','equal']);
  }
  result.advancedOptions=advanced;
 }
 if(Buffer.byteLength(JSON.stringify(result))>MAX_DEFAULTS_BYTES)throw Error('Session defaults are too large.');
 return result;
}
function captureSessionDefaults(session){
 if(['archive-compare','text-merge3','folder-merge3'].includes(session?.type))throw Error('This comparison type has no reusable session defaults.');
 const type=choice(session?.type,DEFAULT_TYPES),options=pick(session.options,keysFor(type));
 if(options.textTools)options.textTools=pick(options.textTools,['wrap','whitespace','matchCase','regex']);
 const profile={type,options};if(advancedKeys[type])profile.advancedOptions=pick(session.advanced?.options,advancedKeys[type]);
 return validateDefaultProfile(profile);
}
const queues=new Map();
const identity=s=>`${s.dev}:${s.ino}`;
const stamp=s=>`${identity(s)}:${s.mode}:${s.nlink}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
async function location(file){
 if(typeof file!=='string'||!path.isAbsolute(file)||file.includes('\0'))throw Error('Session defaults require an absolute file path.');
 const parent=await fs.realpath(path.dirname(file)),s=await fs.lstat(parent,{bigint:true});
 if(!s.isDirectory())throw Error('Invalid session defaults directory.');
 return {file:path.join(parent,path.basename(file)),parent,identity:identity(s)};
}
async function checkParent(t){const s=await fs.lstat(t.parent,{bigint:true});if(!s.isDirectory()||identity(s)!==t.identity||await fs.realpath(t.parent)!==t.parent)throw Error('Session defaults directory changed.');}
function validateDefaultProfiles(value){
 if(!Array.isArray(value)||value.length>DEFAULT_TYPES.length||Reflect.ownKeys(value).some(k=>k!=='length'&&(typeof k!=='string'||!/^(0|[1-9]\d*)$/.test(k)||Number(k)>=value.length)))throw Error('Invalid session defaults list.');
 const profiles=Array.from(value,validateDefaultProfile);
 if(new Set(profiles.map(p=>p.type)).size!==profiles.length)throw Error('Duplicate session default type.');
 if(Buffer.byteLength(JSON.stringify({version:1,profiles},null,2)+'\n')>MAX_DEFAULTS_BYTES)throw Error('Session defaults are too large.');
 return profiles;
}
function validateStore(v){
 record(v,['version','profiles']);if(v.version!==1)throw Error('Invalid session defaults store.');
 return validateDefaultProfiles(v.profiles);
}
async function snapshot(t){
 await checkParent(t);let before;try{before=await fs.lstat(t.file,{bigint:true});}catch(e){if(e.code==='ENOENT')return {profiles:[],stamp:null};throw e;}
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n)throw Error('Session defaults must be a regular, unlinked file.');
 if(before.size>BigInt(MAX_DEFAULTS_BYTES))throw Error('Session defaults are too large.');
 const handle=await fs.open(t.file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  if(stamp(before)!==stamp(await handle.stat({bigint:true})))throw Error('Session defaults changed.');
  const buffer=Buffer.alloc(MAX_DEFAULTS_BYTES+1);let count=0;
  while(count<buffer.length){const {bytesRead}=await handle.read(buffer,count,buffer.length-count,null);if(!bytesRead)break;count+=bytesRead;}
  if(count>MAX_DEFAULTS_BYTES)throw Error('Session defaults are too large.');
  const after=await handle.stat({bigint:true}),named=await fs.lstat(t.file,{bigint:true});await checkParent(t);
  if(stamp(before)!==stamp(after)||stamp(after)!==stamp(named)||count!==Number(before.size))throw Error('Session defaults changed.');
  return {profiles:validateStore(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,count)))),stamp:stamp(after)};
 }finally{await handle.close();}
}
function stable(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(stable).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';}
function checkExpected(list,type,expected){if(expected!==undefined&&stable(list.find(p=>p.type===type)||null)!==stable(expected))throw Error('Session defaults changed since review. Review them again.');}
class SessionDefaults{
 constructor(file){this.file=file;}
 async all(){return (await snapshot(await location(this.file))).profiles;}
 async get(type){if(['archive-compare','text-merge3','folder-merge3'].includes(type))return null;choice(type,DEFAULT_TYPES);return (await this.all()).find(p=>p.type===type)||null;}
 async save(profile,expectedProfile){const clean=validateDefaultProfile(profile),expected=expectedProfile===undefined?undefined:expectedProfile===null?null:validateDefaultProfile(expectedProfile);await this.#mutate(list=>{checkExpected(list,clean.type,expected);return [...list.filter(p=>p.type!==clean.type),clean];});return clean;}
 async remove(type,expectedProfile){choice(type,DEFAULT_TYPES);const expected=expectedProfile===undefined?undefined:expectedProfile===null?null:validateDefaultProfile(expectedProfile);return this.#mutate(list=>{checkExpected(list,type,expected);return list.filter(p=>p.type!==type);});}
 async replaceAll(profiles,expectedProfiles){
  const clean=validateDefaultProfiles(profiles),expected=validateDefaultProfiles(expectedProfiles);
  const signature=list=>stable([...list].sort((a,b)=>a.type.localeCompare(b.type)));
  return this.#mutate(current=>{if(signature(current)!==signature(expected))throw Error('Session defaults changed since review. Review them again.');return clean;});
 }
 async #mutate(change){
  const t=await location(this.file),key=t.file.normalize('NFC').toLowerCase(),prior=queues.get(key)||Promise.resolve();
  const operation=prior.catch(()=>{}).then(async()=>{
   const before=await snapshot(t),profiles=validateDefaultProfiles(change(before.profiles)),content=JSON.stringify({version:1,profiles},null,2)+'\n';
   if(Buffer.byteLength(content)>MAX_DEFAULTS_BYTES)throw Error('Session defaults are too large.');
   const temp=path.join(t.parent,`.${path.basename(t.file)}.${randomUUID()}.tmp`);let committed=false;
   try{
    await checkParent(t);await fs.writeFile(temp,content,{flag:'wx',mode:0o600});
    if((await snapshot(t)).stamp!==before.stamp)throw Error('Session defaults changed.');await checkParent(t);
    if(before.stamp){await fs.rename(temp,t.file);committed=true;}else{await fs.link(temp,t.file);await fs.rm(temp,{force:true});committed=true;}
    return profiles;
   }finally{if(!committed)await fs.rm(temp,{force:true});}
  });
  queues.set(key,operation);try{return await operation;}finally{if(queues.get(key)===operation)queues.delete(key);}
 }
}
module.exports={DEFAULT_TYPES,MAX_DEFAULTS_BYTES,captureSessionDefaults,validateDefaultProfile,validateDefaultProfiles,SessionDefaults};
