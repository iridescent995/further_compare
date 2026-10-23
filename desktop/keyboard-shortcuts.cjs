'use strict';
const fs=require('node:fs/promises'),{constants}=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const MAX_SHORTCUT_BYTES=32*1024,MAX_SHORTCUTS=200;
const MODIFIERS=['CmdOrCtrl','Command','Ctrl','Alt','Shift'];
const KEYS=['Up','Down','Left','Right','Enter','Backspace','Delete','Home','End','PageUp','PageDown','Tab',',','.','/',';','[',']','-','=','Space'];
function record(v){if(!v||![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw Error('Invalid keyboard shortcuts.');}
function platformCheck(platform){if(!['darwin','win32','linux'].includes(platform))throw Error('Unsupported shortcut platform.');}
function normalizeAccelerator(value,platform=process.platform){
 platformCheck(platform);if(typeof value!=='string'||value.length>100)throw Error('Invalid keyboard shortcut.');
 if(value==='')return '';
 const parts=value.split('+').map(part=>part.trim());if(parts.some(part=>!part))throw Error('Invalid keyboard shortcut.');
 const raw=parts.pop(),key=/^[a-z0-9]$/i.test(raw)?raw.toUpperCase():/^F([1-9]|1\d|2[0-4])$/i.test(raw)?raw.toUpperCase():KEYS.find(key=>key.toLowerCase()===raw.toLowerCase());
 const mods=parts.map(part=>MODIFIERS.find(mod=>mod.toLowerCase()===part.toLowerCase()));
 if(platform!=='darwin'&&mods.includes('Command'))throw Error('Command shortcuts are available only on macOS.');
 if(!key||mods.some(mod=>!mod)||new Set(mods).size!==mods.length)throw Error('Invalid keyboard shortcut.');
 if(!mods.some(mod=>['CmdOrCtrl','Command','Ctrl','Alt'].includes(mod))&&!/^F\d+$/.test(key))throw Error('Shortcuts need Control, Command or Alt.');
 if(key==='F2'&&mods.length===0)throw Error('F2 is reserved for renaming.');
 if(mods.includes('CmdOrCtrl')&&mods.includes(platform==='darwin'?'Command':'Ctrl'))throw Error('Duplicate platform shortcut modifier.');
 return [...MODIFIERS.filter(mod=>mods.includes(mod)),key].join('+');
}
function effective(accelerator,platform){if(!accelerator)return '';return accelerator.split('+').map(p=>p==='CmdOrCtrl'?(platform==='darwin'?'Command':'Ctrl'):p).sort((a,b)=>{
 const ai=MODIFIERS.indexOf(a),bi=MODIFIERS.indexOf(b);return (ai<0?99:ai)-(bi<0?99:bi);
 }).join('+');}
function reserved(accelerator,platform){
 const key=effective(accelerator,platform),primary=platform==='darwin'?'Command':'Ctrl';
 const blocked=[...['A','C','V','X','Z','Y','Q','W','H','M','-','=','0'].map(k=>primary+'+'+k),primary+'+Shift+Z',primary+'+Shift+=',primary+'+Shift+-','Shift+F10','Alt+F4','Ctrl+Alt+Delete','Command+Space','Command+Tab','Command+Shift+Tab','Ctrl+Tab','Ctrl+Shift+Tab','Alt+Tab','Alt+Shift+Tab','Command+Alt+Escape'];
 if(platform==='darwin')blocked.push('Command+Ctrl+F','Command+Alt+H');else blocked.push('F11');
 return blocked.includes(key);
}
function catalogEntries(catalog,platform){
 if(!Array.isArray(catalog)||catalog.length>MAX_SHORTCUTS)throw Error('Invalid shortcut catalog.');
 const entries=new Map();for(const item of catalog){if(!item||typeof item.id!=='string'||!item.id||item.id.length>128||['__proto__','constructor','prototype'].includes(item.id)||entries.has(item.id)||typeof item.label!=='string'||typeof item.accelerator!=='string')throw Error('Invalid shortcut catalog.');entries.set(item.id,normalizeAccelerator(item.accelerator,platform));}return entries;
}
function validateShortcuts(overrides,catalog,platform=process.platform){
 platformCheck(platform);record(overrides);const keys=Reflect.ownKeys(overrides);if(keys.length>MAX_SHORTCUTS)throw Error('Too many keyboard shortcuts.');const entries=catalogEntries(catalog,platform),result={};
 for(const id of keys){if(typeof id!=='string'||!entries.has(id))throw Error('Unknown keyboard shortcut command.');const value=normalizeAccelerator(overrides[id],platform);if(value&&reserved(value,platform))throw Error('This shortcut is reserved by the system or text editor.');result[id]=value;}
 const seen=new Map();for(const [id,fallback]of entries){const value=Object.hasOwn(result,id)?result[id]:fallback,key=effective(value,platform);if(!key)continue;if(seen.has(key))throw Error('Keyboard shortcut conflicts with '+(catalog.find(item=>item.id===seen.get(key))?.label||seen.get(key))+'.');seen.set(key,id);}
 if(Buffer.byteLength(JSON.stringify({version:1,overrides:result},null,2)+'\n')>MAX_SHORTCUT_BYTES)throw Error('Keyboard shortcuts are too large.');return result;
}
const queues=new Map(),identity=s=>`${s.dev}:${s.ino}`,stamp=s=>`${identity(s)}:${s.mode}:${s.nlink}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
function canonical(v){return JSON.stringify(Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))));}
async function location(file){if(typeof file!=='string'||!path.isAbsolute(file)||file.includes('\0'))throw Error('Choose an absolute shortcuts path.');const parent=await fs.realpath(path.dirname(file)),stat=await fs.lstat(parent,{bigint:true});if(!stat.isDirectory())throw Error('Invalid shortcuts directory.');return {file:path.join(parent,path.basename(file)),parent,identity:identity(stat)};}
async function checkParent(t){const stat=await fs.lstat(t.parent,{bigint:true});if(!stat.isDirectory()||identity(stat)!==t.identity||await fs.realpath(t.parent)!==t.parent)throw Error('Shortcuts directory changed.');}
class KeyboardShortcuts{
 constructor(file,catalog,platform=process.platform){platformCheck(platform);catalogEntries(catalog,platform);this.file=file;this.catalog=catalog.map(item=>({...item}));this.platform=platform;}
 async snapshot(t){
  await checkParent(t);let before;try{before=await fs.lstat(t.file,{bigint:true});}catch(e){if(e.code==='ENOENT')return {overrides:{},stamp:null};throw e;}
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n)throw Error('Shortcuts must be a regular file without symbolic or hard links.');if(before.size>BigInt(MAX_SHORTCUT_BYTES))throw Error('Keyboard shortcuts are too large.');
  const handle=await fs.open(t.file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));try{
   if(stamp(before)!==stamp(await handle.stat({bigint:true})))throw Error('Shortcuts changed while reading.');
   const buffer=Buffer.alloc(MAX_SHORTCUT_BYTES+1);let count=0;while(count<buffer.length){const {bytesRead}=await handle.read(buffer,count,buffer.length-count,null);if(!bytesRead)break;count+=bytesRead;}
   const after=await handle.stat({bigint:true}),named=await fs.lstat(t.file,{bigint:true});await checkParent(t);if(count>MAX_SHORTCUT_BYTES)throw Error('Keyboard shortcuts are too large.');if(count!==Number(before.size)||stamp(before)!==stamp(after)||stamp(after)!==stamp(named))throw Error('Shortcuts changed while reading.');
   const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,count)));record(value);if(value.version!==1||Reflect.ownKeys(value).some(k=>!['version','overrides'].includes(k)))throw Error('Invalid keyboard shortcuts file.');return {overrides:validateShortcuts(value.overrides,this.catalog,this.platform),stamp:stamp(after)};
  }finally{await handle.close();}
 }
 async get(){return (await this.snapshot(await location(this.file))).overrides;}
 async save(overrides,expected){
  const clean=validateShortcuts(overrides,this.catalog,this.platform),previous=validateShortcuts(expected,this.catalog,this.platform),t=await location(this.file),key=t.file.normalize('NFC').toLowerCase(),prior=queues.get(key)||Promise.resolve();
  const operation=prior.catch(()=>{}).then(async()=>{const before=await this.snapshot(t);if(canonical(before.overrides)!==canonical(previous))throw Error('Keyboard shortcuts changed since review. Review them again.');const content=JSON.stringify({version:1,overrides:clean},null,2)+'\n',temp=path.join(t.parent,`.${path.basename(t.file)}.${randomUUID()}.tmp`);let committed=false;try{
   await checkParent(t);await fs.writeFile(temp,content,{flag:'wx',mode:0o600});if((await this.snapshot(t)).stamp!==before.stamp)throw Error('Shortcuts changed while saving.');await checkParent(t);if(before.stamp){await fs.rename(temp,t.file);committed=true;}else{await fs.link(temp,t.file);await fs.rm(temp,{force:true});committed=true;}return clean;
  }finally{if(!committed)await fs.rm(temp,{force:true});}});queues.set(key,operation);try{return await operation;}finally{if(queues.get(key)===operation)queues.delete(key);}
 }
}
module.exports={normalizeAccelerator,validateShortcuts,KeyboardShortcuts,MAX_SHORTCUT_BYTES};
