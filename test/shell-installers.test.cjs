const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
// Linux can exercise installer contracts but has no packaged directory helper.
// The real exclusive promotion path is exercised on macOS/Windows, never claimed here.
if(!['darwin','win32'].includes(process.platform)){
 require('../desktop/rename-directory.cjs').renameDirectory=async(root,relative,name,identity)=>{
  const source=path.join(root,relative),dest=path.join(root,name),stat=await fs.lstat(source,{bigint:true});
  assert.equal(stat.dev,identity.dev);assert.equal(stat.ino,identity.ino);
  await assert.rejects(fs.lstat(dest),{code:'ENOENT'});await fs.rename(source,dest);
 };
}
const modulePromise=import('../scripts/shell-macos.mjs');
test('Finder workflow passes exactly one filename as an argument and safely quotes installed app',async()=>{
 const {workflow}=await modulePromise;
 const w=workflow("/Applications/A'$(touch NEVER)&<.app",'Set as Left','--fc-set-left','set-left');
 assert.match(w.script,/open -n -a/);assert.match(w.script,/--fc-set-left "\$1"/);assert.match(w.script,/"\$#" -ne 1/);assert.match(w.script,/'\\''/);assert.ok(w.document.includes('&amp;&lt;.app'));
 execFileSync('/bin/sh',['-n'],{input:w.script});
});
test('Finder workflow staging, XML validation, idempotence and scoped uninstall',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-services-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const app=path.join(root,'Further Compare.app'),output=path.join(root,'services');await fs.mkdir(path.join(app,'Contents/MacOS'),{recursive:true});await fs.writeFile(path.join(app,'Contents/MacOS/Further Compare'),'stub',{mode:0o755});
 const {generate}=await modulePromise;const {inspectMac}=require('../desktop/shell-integration.cjs');assert.equal((await inspectMac(output)).installed,false);await generate({app,output});assert.equal((await inspectMac(output)).installed,true);assert.equal((await inspectMac(output,app)).installed,true);assert.deepEqual(await inspectMac(output,path.join(root,'Moved.app')),{installed:false,partial:true,stale:true});await generate({app,output});
 assert.equal((await fs.readdir(output)).length,3);
 for(const name of await fs.readdir(output)){for(const file of ['Info.plist','document.wflow']){const filename=path.join(output,name,'Contents',file);if(process.platform==='darwin')execFileSync('/usr/bin/plutil',['-lint',filename]);assert.match(await fs.readFile(filename,'utf8'),/plist version="1.0"/);}}
 await fs.writeFile(path.join(output,'unrelated.txt'),'keep');await generate({output,uninstall:true});assert.deepEqual(await fs.readdir(output),['unrelated.txt']);
 await assert.rejects(generate({app:'relative.app',output}),/absolute/);
});
test('Finder installer refuses to replace unowned or symbolic-link workflows',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-services-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const dest=path.join(root,'Further Compare — Set as Left.workflow');await fs.mkdir(dest);const {generate}=await modulePromise;
 await assert.rejects(generate({output:root,uninstall:true}),/Unowned/);await fs.rmdir(dest);await fs.symlink('/tmp',dest);await assert.rejects(generate({output:root,uninstall:true}),/symbolic link/);
});
test('Windows installer has scoped ownership, literal wildcard paths and no elevation',async()=>{
 const script=await fs.readFile(path.join(__dirname,'../desktop/native/shell-menu.ps1'),'utf8');assert.match(script,/HKCU:\\Software\\Classes\\\*\\shell\\FurtherCompare/);assert.match(script,/FCInstallerOwner/);assert.match(script,/Remove-Item -LiteralPath \$Root/);assert.match(script,/MultiSelectModel', 'Single'/);for(const flag of ['--fc-set-left','--fc-compare-left','--fc-clear-left'])assert.ok(script.includes(flag));assert.doesNotMatch(script,/HKEY_LOCAL_MACHINE|RunAs|ExecutionPolicy/);
});
test('Finder accepts one regular file or directory and rejects missing and multiple items',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-shell-input-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const file=path.join(root,'file $ literal.txt'),folder=path.join(root,'folder with spaces');await fs.writeFile(file,'test');await fs.mkdir(folder);
 const {workflow}=await modulePromise;const w=workflow('/Applications/Further Compare.app','Set as Left','--fc-set-left','set-left');
 assert.match(w.info,/<string>public.folder<\/string>/);
 // Exercise the generated input gate, replacing only OS side effects.
 const script=w.script.replace(/\/usr\/bin\/osascript[^\n]*/,':').replace(/\/usr\/bin\/open[^\n]*/,'printf \'%s\' "$1"');
 for(const input of [file,folder])assert.equal(execFileSync('/bin/sh',['-c',script,'workflow',input],{encoding:'utf8'}),input);
 for(const args of [[],[path.join(root,'missing')],[file,folder]])assert.throws(()=>execFileSync('/bin/sh',['-c',script,'workflow',...args],{stdio:'pipe'}));
});
test('Finder detects and repairs owned file-only workflows; preflights both destinations',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-shell-upgrade-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const app=path.join(root,'Further Compare.app'),output=path.join(root,'services');await fs.mkdir(path.join(app,'Contents/MacOS'),{recursive:true});await fs.writeFile(path.join(app,'Contents/MacOS/Further Compare'),'stub',{mode:0o755});
 const {generate,inspectMac}=require('../desktop/shell-integration.cjs');await generate({app,output});
 const first=path.join(output,'Further Compare — Set as Left.workflow/Contents/Info.plist'),second=path.join(output,'Further Compare — Compare with Left.workflow/Contents/Info.plist');
 await fs.writeFile(first,(await fs.readFile(first,'utf8')).replace('<string>public.folder</string>',''));
 assert.deepEqual(await inspectMac(output,app),{installed:false,partial:true,stale:true});await generate({app,output});assert.equal((await inspectMac(output,app)).installed,true);
 const original=await fs.readFile(first,'utf8');await fs.writeFile(second,'unrelated service');
 for(const uninstall of [false,true]){await assert.rejects(generate({app,output,uninstall}),/Unowned/);assert.equal(await fs.readFile(first,'utf8'),original);assert.equal(await fs.readFile(second,'utf8'),'unrelated service');}
});
test('Explorer preflights both file and folder roots before any mutation',async()=>{
 const script=await fs.readFile(path.join(__dirname,'../desktop/native/shell-menu.ps1'),'utf8');
 assert.ok(script.includes('HKCU:\\Software\\Classes\\Directory\\shell\\FurtherCompare'));
 const preflight=script.indexOf('# Preflight ALL destinations');
 assert.ok(preflight>0&&preflight<script.indexOf('if ($Uninstall)'));
 assert.ok(script.indexOf('Refusing to modify an unowned',preflight)<script.indexOf('Remove-Item'));
 assert.ok(script.indexOf('Refusing to modify an unowned',preflight)<script.indexOf('CreateSubKey'));
 assert.match(script,/\$OwnedCount -gt 0 -and -not \$Installed/);
});
test('Compare Selected accepts exactly two same-kind paths and old installations are partial',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-selected-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const app=path.join(root,'Further Compare.app'),output=path.join(root,'services');await fs.mkdir(path.join(app,'Contents/MacOS'),{recursive:true});await fs.writeFile(path.join(app,'Contents/MacOS/Further Compare'),'stub',{mode:0o755});
 const files=[path.join(root,"a ' $(literal).txt"),path.join(root,'b & file')],folders=[path.join(root,'folder one'),path.join(root,'folder two')];for(const f of files)await fs.writeFile(f,'x');for(const f of folders)await fs.mkdir(f);
 const {workflow,generate,inspectMac}=require('../desktop/shell-integration.cjs');const w=workflow(app,'Compare Selected','--fc-compare-selected','compare-selected');
 execFileSync('/bin/sh',['-n'],{input:w.script});assert.match(w.script,/--fc-compare-selected "\$1" "\$2"/);
 const script=w.script.replace(/\/usr\/bin\/osascript[^\n]*/,':').replace(/\/usr\/bin\/open[^\n]*/,'printf \'%s\\n\' "$1" "$2"');
 for(const inputs of [files,folders])assert.equal(execFileSync('/bin/sh',['-c',script,'workflow',...inputs],{encoding:'utf8'}),inputs.join('\n')+'\n');
 for(const inputs of [[],[files[0]],files.concat(folders[0]),[files[0],folders[0]],[files[0],path.join(root,'missing')]])assert.throws(()=>execFileSync('/bin/sh',['-c',script,'workflow',...inputs],{stdio:'pipe'}));
 await generate({app,output});await fs.rm(path.join(output,'Further Compare — Compare Selected.workflow'),{recursive:true});assert.deepEqual(await inspectMac(output,app),{installed:false,partial:true,stale:false});await generate({app,output});assert.equal((await inspectMac(output,app)).installed,true);
 const first=path.join(output,'Further Compare — Set as Left.workflow/Contents/Info.plist'),third=path.join(output,'Further Compare — Compare Selected.workflow/Contents/Info.plist'),original=await fs.readFile(first,'utf8');await fs.writeFile(third,'unowned');
 for(const uninstall of [false,true]){await assert.rejects(generate({app,output,uninstall}),/Unowned/);assert.equal(await fs.readFile(first,'utf8'),original);}
});

test('Finder preflight refuses nested symlinks without modifying any workflow or unrelated target',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-nested-services-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const app=path.join(root,'Further Compare.app'),output=path.join(root,'services');await fs.mkdir(path.join(app,'Contents/MacOS'),{recursive:true});await fs.writeFile(path.join(app,'Contents/MacOS/Further Compare'),'stub',{mode:0o755});
 const {generate,inspectMac}=require('../desktop/shell-integration.cjs');
 for(const component of ['Contents','Contents/Info.plist','Contents/document.wflow']){
  await fs.rm(output,{recursive:true,force:true});await generate({app,output});
  const first=path.join(output,'Further Compare — Set as Left.workflow/Contents/Info.plist'),dest=path.join(output,'Further Compare — Compare Selected.workflow',component),target=path.join(root,'outside-'+component.replaceAll('/','-'));
  await fs.rename(dest,target);await fs.symlink(target,dest);
  const before=await fs.readFile(first,'utf8'),targetFile=component==='Contents'?path.join(target,'document.wflow'):target,untouched=await fs.readFile(targetFile,'utf8');
  for(const uninstall of [false,true])await assert.rejects(generate({app,output,uninstall}),/symbolic link/);
  assert.equal(await fs.readFile(first,'utf8'),before);assert.equal(await fs.readFile(targetFile,'utf8'),untouched);
  assert.equal((await inspectMac(output,app)).installed,false);
 }
});

test('Finder status rejects broken owned service metadata and action settings and repair restores them',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-service-status-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const app=path.join(root,"Further ' & < > \" $() Compare.app"),output=path.join(root,'services');await fs.mkdir(path.join(app,'Contents/MacOS'),{recursive:true});await fs.writeFile(path.join(app,'Contents/MacOS/Further Compare'),'stub',{mode:0o755});
 const {generate,inspectMac}=require('../desktop/shell-integration.cjs');await generate({app,output});
 const contents=path.join(output,'Further Compare — Set as Left.workflow/Contents');
 const cases=[
  ['Info.plist','runWorkflowAsService','brokenWorkflowService'],
  ['Info.plist','com.apple.finder','com.example.not-finder'],
  ['Info.plist','public.data','public.text'],
  ['Info.plist','com.furthercompare.service.set-left','com.example.other-service'],
  ['Info.plist','</plist>',''],
  ['document.wflow','<key>inputMethod</key><integer>1</integer>','<key>inputMethod</key><integer>0</integer>'],
  ['document.wflow','<string>/bin/sh</string>','<string>/bin/false</string>'],
  ['document.wflow','com.apple.RunShellScript','com.example.OtherAction'],
  ['document.wflow','/System/Library/Automator/Run Shell Script.action','/tmp/Other.action'],
  ['document.wflow','&quot;$#&quot; -ne 1','&quot;$#&quot; -ne 2'],
  ['document.wflow','--fc-set-left &quot;$1&quot;','--fc-set-left &quot;$2&quot;'],
  ['document.wflow','</plist>',''],
 ];
 for(const [leaf,from,to] of cases){
  const file=path.join(contents,leaf),original=await fs.readFile(file,'utf8');assert.ok(original.includes(from),from);await fs.writeFile(file,original.replace(from,to));
  for(const expectedApp of [app,undefined])assert.deepEqual(await inspectMac(output,expectedApp),{installed:false,partial:true,stale:true},`${leaf}: ${from}`);
  await generate({app,output});assert.equal(await fs.readFile(file,'utf8'),original);
  for(const expectedApp of [app,undefined])assert.deepEqual(await inspectMac(output,expectedApp),{installed:true,partial:false,stale:false});
 }
});

test('Finder status detects missing workflow files without taking ownership of unverifiable services',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-service-missing-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const app=path.join(root,'Further Compare.app'),output=path.join(root,'services');await fs.mkdir(path.join(app,'Contents/MacOS'),{recursive:true});await fs.writeFile(path.join(app,'Contents/MacOS/Further Compare'),'stub',{mode:0o755});
 const {generate,inspectMac}=require('../desktop/shell-integration.cjs');await generate({app,output});
 const contents=path.join(output,'Further Compare — Set as Left.workflow/Contents');
 await fs.rm(path.join(contents,'document.wflow'));
 for(const expectedApp of [app,undefined])assert.deepEqual(await inspectMac(output,expectedApp),{installed:false,partial:true,stale:true});
 await generate({app,output});assert.equal((await inspectMac(output,app)).installed,true);
 const document=await fs.readFile(path.join(contents,'document.wflow'),'utf8');await fs.rm(path.join(contents,'Info.plist'));
 for(const expectedApp of [app,undefined])assert.deepEqual(await inspectMac(output,expectedApp),{installed:false,partial:true,stale:false});
 await assert.rejects(generate({app,output}),/Unowned/);assert.equal(await fs.readFile(path.join(contents,'document.wflow'),'utf8'),document);
});

test('Finder status without an expected app still rejects inconsistent app paths and malformed quoting',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-service-target-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const app=path.join(root,'Further Compare.app'),output=path.join(root,'services');await fs.mkdir(path.join(app,'Contents/MacOS'),{recursive:true});await fs.writeFile(path.join(app,'Contents/MacOS/Further Compare'),'stub',{mode:0o755});
 const {generate,inspectMac,workflow}=require('../desktop/shell-integration.cjs');await generate({app,output});
 const file=path.join(output,'Further Compare — Compare Selected.workflow/Contents/document.wflow');
 await fs.writeFile(file,workflow(path.join(root,'Moved.app'),'Compare Selected','--fc-compare-selected','compare-selected').document);
 assert.deepEqual(await inspectMac(output),{installed:false,partial:true,stale:true});
 await generate({app,output});
 const original=await fs.readFile(file,'utf8');await fs.writeFile(file,original.replace('/usr/bin/open -n -a &apos;','/usr/bin/open -n -a '));
 assert.deepEqual(await inspectMac(output),{installed:false,partial:true,stale:true});
 await generate({app,output});assert.deepEqual(await inspectMac(output),{installed:true,partial:false,stale:false});
});

test('Finder status verifies its executable still exists and is executable, while allowing legitimate symlink targets',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-service-executable-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const app=path.join(root,'Further Compare.app'),output=path.join(root,'services'),executable=path.join(app,'Contents/MacOS/Further Compare');
 await fs.mkdir(path.dirname(executable),{recursive:true});await fs.writeFile(executable,'stub',{mode:0o755});
 const {generate,inspectMac}=require('../desktop/shell-integration.cjs');await generate({app,output});
 const stale={installed:false,partial:true,stale:true};
 await fs.unlink(executable);for(const expected of [app,undefined])assert.deepEqual(await inspectMac(output,expected),stale);
 await fs.mkdir(executable);assert.deepEqual(await inspectMac(output,app),stale);await fs.rmdir(executable);
 await fs.writeFile(executable,'stub',{mode:0o644});if(process.platform!=='win32')assert.deepEqual(await inspectMac(output,app),stale);
 await fs.chmod(executable,0o755);assert.equal((await inspectMac(output,app)).installed,true);
 if(process.platform!=='win32'){const real=path.join(root,'actual-executable');await fs.rename(executable,real);await fs.symlink(real,executable);assert.equal((await inspectMac(output,app)).installed,true);}
});

test('Explorer status checks owned menu metadata and target availability without mutating registry',async()=>{
 const script=await fs.readFile(path.join(__dirname,'../desktop/native/shell-menu.ps1'),'utf8');
 const status=script.slice(script.indexOf('if ($Status)'),script.indexOf('# Preflight ALL destinations'));
 for(const required of ['$Properties.MUIVerb -cne',"$Properties.SubCommands -cne ''",'$Properties.Icon -cne','$Child.MUIVerb -cne',"$Child.MultiSelectModel -cne 'Single'",'$Actual -cne $Expected','Test-Path -LiteralPath $Target -PathType Leaf','[IO.Path]::GetFileName($Target)'])assert.ok(status.includes(required),required);
 assert.doesNotMatch(status,/SetValue|CreateSubKey|Remove-Item/);
 assert.match(status,/\$Target = \$Matches\[1\]/);
});


test('failed new Finder staging leaves no visible orphan and preserves foreign concurrent stage content',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-service-fault-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const app=path.join(root,'Further Compare.app'),output=path.join(root,'services');await fs.mkdir(path.join(app,'Contents/MacOS'),{recursive:true});await fs.writeFile(path.join(app,'Contents/MacOS/Further Compare'),'stub',{mode:0o755});
 const {generate,inspectMac}=require('../desktop/shell-integration.cjs'),open=fs.open;
 let foreign;
 fs.open=async(file,...args)=>{if(String(file).includes('.further-compare-workflow-')&&path.basename(file)==='document.wflow'){foreign=path.join(path.dirname(file),'foreign.txt');await fs.writeFile(foreign,'concurrent data');throw Object.assign(Error('injected full disk'),{code:'ENOSPC'});}return open(file,...args);};
 try{await assert.rejects(generate({app,output}),/injected full disk/);}finally{fs.open=open;}
 assert.equal(await fs.readFile(foreign,'utf8'),'concurrent data');assert.ok((await fs.readdir(output)).every(name=>name.startsWith('.further-compare-workflow-')));assert.equal((await inspectMac(output,app)).installed,false);
 await generate({app,output});assert.equal((await inspectMac(output,app)).installed,true);assert.equal(await fs.readFile(foreign,'utf8'),'concurrent data');
});

test('Finder staging promotion refuses a concurrent destination without deleting it',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-service-collision-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const app=path.join(root,'Further Compare.app'),output=path.join(root,'services');await fs.mkdir(path.join(app,'Contents/MacOS'),{recursive:true});await fs.writeFile(path.join(app,'Contents/MacOS/Further Compare'),'stub',{mode:0o755});
 const {generate}=require('../desktop/shell-integration.cjs'),helper=require('../desktop/rename-directory.cjs'),rename=helper.renameDirectory;let destination;
 helper.renameDirectory=async(canonical,relative,name,identity)=>{destination=path.join(canonical,name);await fs.mkdir(destination);await fs.writeFile(path.join(destination,'foreign.txt'),'keep');return rename(canonical,relative,name,identity);};
 try{await assert.rejects(generate({app,output}),/Could not install Finder workflow/);}finally{helper.renameDirectory=rename;}
 assert.deepEqual(await fs.readdir(destination),['foreign.txt']);assert.equal(await fs.readFile(path.join(destination,'foreign.txt'),'utf8'),'keep');await assert.rejects(generate({app,output}),/Unowned/);
});

test('interrupted owned Finder repair retains prior document and remains repairable',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-service-repair-fault-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const app=path.join(root,'Further Compare.app'),output=path.join(root,'services');await fs.mkdir(path.join(app,'Contents/MacOS'),{recursive:true});await fs.writeFile(path.join(app,'Contents/MacOS/Further Compare'),'stub',{mode:0o755});
 const {generate,inspectMac}=require('../desktop/shell-integration.cjs');await generate({app,output});const document=path.join(output,'Further Compare — Set as Left.workflow/Contents/document.wflow'),before=await fs.readFile(document,'utf8'),rename=fs.rename;
 fs.rename=async(from,to)=>{if(to===document)throw Error('injected rename failure');return rename(from,to);};
 try{await assert.rejects(generate({app,output}),/injected rename failure/);}finally{fs.rename=rename;}
 assert.equal(await fs.readFile(document,'utf8'),before);await generate({app,output});assert.equal((await inspectMac(output,app)).installed,true);
});
