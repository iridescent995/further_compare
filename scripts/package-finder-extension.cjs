'use strict';
// electron-builder afterPack hook. Only Mac bundles are changed; no registration.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const MACHO=new Set(['cffaedfe','cefaedfe','feedfacf','feedface','cafebabe','bebafeca','cafebabf','bfbafeca']);
function run(command,args){return execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function plist(file){return JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-',file]));}
async function signInsideOut(host,extension){
 const binaries=[],bundles=[];
 async function visit(dir){
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
   const file=path.join(dir,entry.name);
   if(entry.isSymbolicLink()||file===extension)continue;
   if(entry.isDirectory()){
    await visit(file);
    if(/\.(?:app|framework|xpc|appex)$/.test(entry.name))bundles.push(file);
   }else if(entry.isFile()){
    const handle=await fs.open(file,'r');
    try{const buffer=Buffer.alloc(4);const {bytesRead}=await handle.read(buffer,0,4,0);if(bytesRead===4&&MACHO.has(buffer.toString('hex')))binaries.push(file);}
    finally{await handle.close();}
   }
  }
 }
 await visit(host);
 // Preserve the shipped Electron entitlements and flags, if present.
 const sign=file=>run('/usr/bin/codesign',['--force','--sign','-','--timestamp=none','--preserve-metadata=entitlements,flags',file]);
 // Framework main binaries can trigger nested-code validation themselves.
 // Sign deeper helpers/libraries before their containing framework executable,
 // independent of alphabetical directory traversal order.
 const deepestFirst=(a,b)=>b.split(path.sep).length-a.split(path.sep).length||a.localeCompare(b);
 for(const binary of binaries.sort(deepestFirst))sign(binary);
 for(const bundle of bundles.sort(deepestFirst))sign(bundle);
 run('/usr/bin/codesign',['--verify','--strict',extension]);
 sign(host);
 run('/usr/bin/codesign',['--verify','--deep','--strict',host]);
 return {binaries:binaries.length,bundles:bundles.length};
}
async function packageFinderExtension(context){
 if(context.electronPlatformName!=='darwin')return;
 if(process.platform!=='darwin')throw new Error('Mac Finder packaging requires macOS command-line tools.');
 const config=context.packager.config;
 if(config.mac?.identity!==null)throw new Error('Finder packaging currently supports explicitly configured ad-hoc local distributions (mac.identity:null). Configure and verify Developer ID extension signing before changing this.');
 if(config.electronFuses)throw new Error('Finder afterPack signing must move after fuse mutation before enabling electronFuses.');
 const root=context.packager.projectDir;
 const version=context.packager.appInfo.version;
 const host=path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app');
 const hostInfo=plist(path.join(host,'Contents/Info.plist'));
 if(hostInfo.CFBundleIdentifier!=='com.furthercompare.desktop'||hostInfo.CFBundleShortVersionString!==version)throw new Error('Unexpected Finder containing host identity/version.');
 const extension=path.join(host,'Contents/PlugIns/FurtherCompareFinder.appex');
 const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'fc-finder-package-'));
 try{
  const compiled=path.join(scratch,'FurtherCompareFinder.appex');
  run(process.execPath,[path.join(root,'scripts/build-finder-extension.mjs'),'--output',compiled]);
  const info=plist(path.join(compiled,'Contents/Info.plist'));
  if(info.CFBundleIdentifier!=='com.furthercompare.desktop.finder'||info.CFBundleShortVersionString!==version||info.CFBundleVersion!==version)throw new Error('Finder extension identity/version does not match host.');
  const existing=await fs.lstat(extension).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(existing)throw new Error('Refusing to overwrite an existing packaged Finder extension.');
  await fs.mkdir(path.dirname(extension),{recursive:true});
  await fs.cp(compiled,extension,{recursive:true,errorOnExist:true,force:false});
  const counts=await signInsideOut(host,extension);
  const rights=run('/usr/bin/codesign',['-d','--entitlements','-','--xml',extension]);
  if(!/<key>com.apple.security.app-sandbox<\/key>\s*<true\/>/.test(rights))throw new Error('Finder sandbox entitlement is missing after packaging.');
  console.log(`Embedded universal Finder extension and verified ad-hoc host signing (${counts.binaries} code files, ${counts.bundles} nested bundles). No Finder activation performed.`);
 }finally{await fs.rm(scratch,{recursive:true,force:true});}
}
module.exports=packageFinderExtension;
