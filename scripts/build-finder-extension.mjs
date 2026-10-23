// Native build used by Mac packaging and explicit development builds. Never activates Finder.
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, writeFile, rm, rename, lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.includes('--help')){
 console.log('Usage: node scripts/build-finder-extension.mjs [--app-group IDENTIFIER] [--output APPEX_PATH]\nBuilds an ad-hoc signed universal development .appex only. Does not install, register, enable, or package it.');
 process.exit(0);
}
if(process.platform!=='darwin')throw new Error('Finder extension development builds require macOS and the command-line SDK.');
let group, requestedOutput;
for(let index=0;index<args.length;index+=2){
 const flag=args[index],value=args[index+1];
 if(!value)throw new Error('Missing build option value.');
 if(flag==='--app-group'&&!group){
  if(!/^(?:group\.[A-Za-z0-9][A-Za-z0-9.-]*|[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]*)$/.test(value)||value.length>200||value.includes('..')||value.endsWith('.'))throw new Error('Invalid application group identifier.');
  group=value;
 }else if(flag==='--output'&&!requestedOutput){
  if(!path.isAbsolute(value)||path.basename(value)!=='FurtherCompareFinder.appex')throw new Error('Output must be an absolute FurtherCompareFinder.appex path.');
  requestedOutput=value;
 }else throw new Error('Unknown or repeated build option: '+flag);
}
const run=(exe,argv)=>execFileSync(exe,argv,{encoding:'utf8',cwd:root,stdio:['ignore','pipe','pipe']}).trim();
const source=path.join(root,'desktop/native/finder-sync');
const output=requestedOutput??path.join(root,'build/native/FurtherCompareFinder.appex');
const parent=path.dirname(output);
await mkdir(parent,{recursive:true});
const staging=await mkdtemp(path.join(parent,'.finder-extension-'));
const bundle=path.join(staging,'FurtherCompareFinder.appex');
const temp=await mkdtemp(path.join(os.tmpdir(),'fc-finder-build-'));
try{
 const sdk=run('/usr/bin/xcrun',['--show-sdk-path']);
 const clang=run('/usr/bin/xcrun',['--find','clang']);
 const contents=path.join(bundle,'Contents');
 const macos=path.join(contents,'MacOS');
 await mkdir(macos,{recursive:true});
 const info=JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-',path.join(source,'Info.plist')]));
 const entitlements=JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-',path.join(source,'entitlements.plist')]));
 const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
 info.CFBundleShortVersionString=pkg.version;
 info.CFBundleVersion=pkg.version;
 if(group){info.FCAppGroupIdentifier=group;entitlements['com.apple.security.application-groups']=[group];}
 if(info.CFBundleExecutable!=='FurtherCompareFinder'||info.CFBundleIdentifier!=='com.furthercompare.desktop.finder'||info.NSExtension?.NSExtensionPointIdentifier!=='com.apple.FinderSync'||info.NSExtension?.NSExtensionPrincipalClass!=='FCFinderSync'||entitlements['com.apple.security.app-sandbox']!==true)throw new Error('Unexpected native extension manifest.');
 const plist=path.join(contents,'Info.plist'), rights=path.join(temp,'entitlements.plist');
 await writeFile(plist,JSON.stringify(info));await writeFile(rights,JSON.stringify(entitlements));
 run('/usr/bin/plutil',['-convert','xml1',plist]);run('/usr/bin/plutil',['-convert','xml1',rights]);
 const executable=path.join(macos,info.CFBundleExecutable);
 run(clang,['-isysroot',sdk,'-arch','arm64','-arch','x86_64','-fobjc-arc','-fapplication-extension','-Wall','-Wextra','-Werror','-Wno-unused-parameter','-mmacosx-version-min=11.0','-O2','-Wl,-e,_NSExtensionMain','-framework','Foundation','-framework','AppKit','-framework','FinderSync',path.join(source,'FinderSync.m'),path.join(source,'MenuPolicy.m'),'-o',executable]);
 const headers=run('/usr/bin/otool',['-hv',executable]);
 if(!headers.includes('EXECUTE'))throw new Error('Extension must have an executable Mach-O entry point.');
 const archs=run('/usr/bin/lipo',['-archs',executable]).split(/\s+/).sort();
 if(JSON.stringify(archs)!==JSON.stringify(['arm64','x86_64']))throw new Error('Extension is not universal arm64/x86_64.');
 run('/usr/bin/codesign',['--force','--sign','-','--timestamp=none','--entitlements',rights,bundle]);
 run('/usr/bin/codesign',['--verify','--strict',bundle]);
 const linked=run('/usr/bin/otool',['-L',executable]);
 const imports=[...new Set(linked.split('\n').filter(line=>/^\s/.test(line)).map(line=>line.trim().split(' (')[0]))].sort();
 const allowed=/^(?:\/System\/Library\/Frameworks\/(?:Foundation|AppKit|FinderSync|CoreFoundation)\.framework\/Versions\/[AC]\/(?:Foundation|AppKit|FinderSync|CoreFoundation)|\/usr\/lib\/lib(?:objc\.A|System\.B)\.dylib)$/;
 if(imports.some(name=>!allowed.test(name)))throw new Error('Unexpected extension dependency: '+imports.join(', '));
 const manifest={developmentOnly:true,activationVerified:false,signing:'ad-hoc',version:pkg.version,architectures:archs,appGroup:group??null,extensionSafeCompilation:true,imports};
 await writeFile(path.join(staging,'finder-extension-build.json'),JSON.stringify(manifest,null,2)+'\n');
 const old=await lstat(output).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 if(old){if(!old.isDirectory()||old.isSymbolicLink())throw new Error('Refusing to replace a non-directory extension output.');await rm(output,{recursive:true});}
 await rename(bundle,output);
 await rename(path.join(staging,'finder-extension-build.json'),path.join(parent,'finder-extension-build.json'));
 console.log(`Development Finder extension built: ${output}\nUniversal arm64/x86_64; ad-hoc signature verified. NOT installed, registered, enabled, or production signed.`);
}finally{await rm(staging,{recursive:true,force:true});await rm(temp,{recursive:true,force:true});}
