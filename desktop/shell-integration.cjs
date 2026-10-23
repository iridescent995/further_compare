const fs=require('node:fs/promises');
const path=require('node:path');
const owner='com.furthercompare.finder-services.v1';
const actions=[['Set as Left','--fc-set-left','set-left'],['Compare with Left','--fc-compare-left','compare-left'],['Compare Selected','--fc-compare-selected','compare-selected']];
const quote=s=>`'${s.replaceAll("'", "'\\''")}'`;
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
function value(v){if(Array.isArray(v))return `<array>${v.map(value).join('')}</array>`;if(v&&typeof v==='object')return `<dict>${Object.entries(v).map(([k,v])=>`<key>${xml(k)}</key>${value(v)}`).join('')}</dict>`;if(typeof v==='boolean')return `<${v}/>`;if(typeof v==='number')return `<integer>${v}</integer>`;return `<string>${xml(v)}</string>`;}
const plist=v=>`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${value(v)}</plist>\n`;
function workflow(app,label,flag,id){
 const name=`Further Compare — ${label}`;
 const selected=id==='compare-selected';
 const script=selected?`if [ "$#" -ne 2 ] || ! { { [ -f "$1" ] && [ -f "$2" ]; } || { [ -d "$1" ] && [ -d "$2" ]; }; }; then\n  /usr/bin/osascript -e 'display alert "Further Compare" message "Select exactly two files or two folders."'\n  exit 1\nfi\n/usr/bin/open -n -a ${quote(app)} --args ${flag} "$1" "$2"\n`:`if [ "$#" -ne 1 ] || { [ ! -f "$1" ] && [ ! -d "$1" ]; }; then\n  /usr/bin/osascript -e 'display alert "Further Compare" message "Select exactly one file or folder."'\n  exit 1\nfi\n/usr/bin/open -n -a ${quote(app)} --args ${flag} "$1"\n`;
 const info={CFBundleIdentifier:`com.furthercompare.service.${id}`,CFBundleName:name,CFBundleVersion:'1',FCInstallerOwner:owner,NSServices:[{NSMenuItem:{default:name},NSMessage:'runWorkflowAsService',NSSendFileTypes:['public.data','public.folder'],NSRequiredContext:{NSApplicationIdentifier:'com.apple.finder'}}]};
 const document={AMApplicationBuild:'523',AMApplicationVersion:'2.10',AMDocumentVersion:'2',actions:[{action:{AMAccepts:{Container:'List',Optional:true,Types:['com.apple.cocoa.string']},AMActionVersion:'2.0.3',AMApplication:['Automator'],AMParameterProperties:{},AMProvides:{Container:'List',Types:['com.apple.cocoa.string']},ActionBundlePath:'/System/Library/Automator/Run Shell Script.action',ActionName:'Run Shell Script',ActionParameters:{COMMAND_STRING:script,inputMethod:1,shell:'/bin/sh',source:'',CheckedForUserDefaultShell:true},BundleIdentifier:'com.apple.RunShellScript',CFBundleVersion:'2.0.3',CanShowSelectedItemsWhenRun:false,CanShowWhenRun:true,IsViewVisible:true,UUID:selected?'725D1A34-138B-4D04-A788-52F1A05D4E80':id==='set-left'?'B942F42D-2329-4BCC-A989-7AF2C8980948':'441412E0-63DD-4F4F-9BDF-9C196766B921',UnlocalizedApplications:['Automator']},isViewVisible:true}],connectors:[],workflowMetaData:{serviceApplicationBundleID:'com.apple.finder',serviceApplicationPath:'/System/Library/CoreServices/Finder.app',serviceInputTypeIdentifier:'com.apple.Automator.fileSystemObject',serviceOutputTypeIdentifier:'com.apple.Automator.nothing',serviceProcessesInput:0,workflowTypeIdentifier:'com.apple.Automator.servicesMenu'}};
 return {name,info:plist(info),document:plist(document),script};
}
async function ownedWorkflow(dest) {
 const root=await fs.lstat(dest);
 if(root.isSymbolicLink())throw Error(`Refusing symbolic link: ${dest}`);
 if(!root.isDirectory())throw Error(`Unowned workflow: ${dest}`);
 const contents=path.join(dest,'Contents'),directory=await fs.lstat(contents);
 if(!directory.isDirectory()||directory.isSymbolicLink())throw Error(`Refusing symbolic link or invalid Contents: ${dest}`);
 for(const leaf of ['Info.plist','document.wflow']){
  const file=path.join(contents,leaf),stat=await fs.lstat(file).catch(error=>{if(error.code==='ENOENT'&&leaf==='document.wflow')return null;throw error;});
  if(stat&&(!stat.isFile()||stat.isSymbolicLink()))throw Error(`Refusing symbolic link or invalid workflow file: ${file}`);
 }
 const marker=await fs.readFile(path.join(contents,'Info.plist'),'utf8');
 if(!marker.includes(`<string>${owner}</string>`))throw Error(`Unowned workflow: ${dest}`);
 return {root:`${root.dev}:${root.ino}`,contents:`${directory.dev}:${directory.ino}`,canonical:await fs.realpath(contents)};
}
// Build new services under a hidden name. Only a fully written owned workflow is
// promoted; a failed build must never leave an unowned visible service blocking repair.
async function stageWorkflow(output,dest,w){
 const canonical=await fs.realpath(output);
 const stage=await fs.mkdtemp(path.join(canonical,'.further-compare-workflow-'));
 const identity=await fs.lstat(stage,{bigint:true});
 try{
  const contents=path.join(stage,'Contents');await fs.mkdir(contents);
  for(const [leaf,data] of [['Info.plist',w.info],['document.wflow',w.document]]){
   const handle=await fs.open(path.join(contents,leaf),'wx',0o644);
   try{await handle.writeFile(data);await handle.sync();}finally{await handle.close();}
  }
  await fs.chmod(stage,0o755);
  const owned=await ownedWorkflow(stage);
  if(owned.root!==`${identity.dev}:${identity.ino}`)throw Error('Staged workflow changed during installation.');
  for(const [leaf,data] of [['Info.plist',w.info],['document.wflow',w.document]])if(await fs.readFile(path.join(contents,leaf),'utf8')!==data)throw Error('Staged workflow changed during installation.');
  // The helper refuses to replace even an empty destination and verifies source
  // directory identity. Packaged apps ship it; development CLI needs build:native.
  await require('./rename-directory.cjs').renameDirectory(canonical,path.basename(stage),path.basename(dest),identity);
 }catch(error){
  // Do not recursively delete an uncertain tree: another process may have added
  // or replaced entries. Hidden failed stages are inert and do not block retries.
  throw new Error(`Could not install Finder workflow. A hidden staging folder may remain at ${stage}. ${error.code==='ENOENT'?'The native rename helper or staging path is unavailable; for source CLI use npm run build:native. ':''}${error.message}`,{cause:error});
 }
}
async function generate({app,output,uninstall=false}){
 if(!path.isAbsolute(output))throw Error('Output must be an absolute directory.');
 if(!uninstall){if(!path.isAbsolute(app||'')||!app.endsWith('.app'))throw Error('Use an absolute installed .app path.');const executable=path.join(app,'Contents/MacOS/Further Compare');if(!(await fs.stat(executable)).isFile())throw Error('Further Compare executable was not found.');await fs.access(executable,fs.constants.X_OK);}
 // Preflight every workflow and nested component before modifying any service.
 const originals=new Map();
 for(const [label] of actions){const dest=path.join(output,`Further Compare — ${label}.workflow`);try{originals.set(dest,await ownedWorkflow(dest));}catch(e){if(e.code!=='ENOENT')throw e;if(await fs.lstat(dest).catch(()=>null))throw Error(`Unowned workflow: ${dest}`);}}
 if(!uninstall)await fs.mkdir(output,{recursive:true});
 for(const [label,flag,id] of actions){
  const dest=path.join(output,`Further Compare — ${label}.workflow`),original=originals.get(dest);
  if(original){const current=await ownedWorkflow(dest);if(JSON.stringify(current)!==JSON.stringify(original))throw Error('Workflow changed during installation. Try again.');}
  else if(await fs.lstat(dest).catch(()=>null))throw Error(`Workflow appeared during installation: ${dest}`);
  if(uninstall){if(original)await fs.rm(dest,{recursive:true,force:true});continue;}
  const w=workflow(app,label,flag,id);
  if(!original){await stageWorkflow(output,dest,w);continue;}
  const contents=path.join(dest,'Contents'),root=await fs.lstat(dest),directory=await fs.lstat(contents),canonical=await fs.realpath(contents);
  if(original&&(original.root!==`${root.dev}:${root.ino}`||original.contents!==`${directory.dev}:${directory.ino}`||original.canonical!==canonical))throw Error('Workflow changed during installation. Try again.');
  async function guard(){const a=await fs.lstat(dest),b=await fs.lstat(contents);if(!a.isDirectory()||!b.isDirectory()||a.dev!==root.dev||a.ino!==root.ino||b.dev!==directory.dev||b.ino!==directory.ino||await fs.realpath(contents)!==canonical)throw Error('Workflow changed during installation. Try again.');}
  for(const [leaf,data] of [['Info.plist',w.info],['document.wflow',w.document]]){
   await guard();const temporary=path.join(contents,`.${leaf}.${require('node:crypto').randomUUID()}.tmp`);
   try{await fs.writeFile(temporary,data,{flag:'wx',mode:0o644});await guard();await fs.rename(temporary,path.join(contents,leaf));await guard();}
   finally{await guard();await fs.rm(temporary,{force:true});}
  }
 }
 return output;
}

// These are generated, owned artifacts rather than user-editable workflows. Check
// the complete generated documents so broken Services metadata or action settings
// cannot be mistaken for a working installation merely because a command remains.
function workflowApp(document,label,flag,id){
 const marker='/__further_compare_installed_app__.app';
 const [before,after]=workflow(marker,label,flag,id).document.split(xml(quote(marker)));
 if(!document.startsWith(before)||!document.endsWith(after)||document.length<before.length+after.length)return null;
 const encoded=document.slice(before.length,document.length-after.length);
 const token=encoded.replaceAll('&apos;',"'").replaceAll('&quot;','"').replaceAll('&gt;','>').replaceAll('&lt;','<').replaceAll('&amp;','&');
 if(!token.startsWith("'")||!token.endsWith("'"))return null;
 const app=token.slice(1,-1).split("'\\''").join("'");
 if(!path.isAbsolute(app)||!app.endsWith('.app')||app.includes('\0')||encoded!==xml(quote(app)))return null;
 return document===workflow(app,label,flag,id).document?app:null;
}
async function inspectMac(output,app){
 let count=0,owned=0,stale=false,installedApp=app;
 for(const [label,flag,id] of actions){
  let isOwned=false;
  try{
   const dest=path.join(output,`Further Compare — ${label}.workflow`);
   if((await fs.lstat(dest)).isSymbolicLink())continue;
   const info=await fs.readFile(path.join(dest,'Contents/Info.plist'),'utf8');
   if(!info.includes(`<string>${owner}</string>`))continue;
   owned++;isOwned=true;
   await ownedWorkflow(dest);
   const document=await fs.readFile(path.join(dest,'Contents/document.wflow'),'utf8');
   const target=workflowApp(document,label,flag,id);
   if(!target||installedApp&&target!==installedApp||info!==workflow(target,label,flag,id).info){stale=true;continue;}
   installedApp=target;
   const executable=path.join(target,'Contents/MacOS/Further Compare');
   if(!(await fs.stat(executable)).isFile()){stale=true;continue;}
   await fs.access(executable,fs.constants.X_OK);
   count++;
  }catch{if(isOwned)stale=true;}
 }
 return {installed:count===actions.length,partial:owned>0&&count<actions.length,stale};
}
module.exports={generate,workflow,inspectMac};
