'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createFinderIntegration,parseRegistrations}=require('../desktop/finder-integration.cjs');
const id='com.furthercompare.desktop.finder';
const line=(file,election='+')=>`${election}    ${id}(2.186.0)\t12345678-1234-1234-1234-123456789ABC\t2026-10-22 09:02:54 +0000\t${file}\n`;
const mutations=calls=>calls.filter(([exe,args])=>exe.endsWith('lsregister')||exe.endsWith('pluginkit')&&args[0]!=='-m');
async function fixture(run){
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-finder-integration-'))),appPath=path.join(root,'Further Compare.app'),extension=path.join(appPath,'Contents/PlugIns/FurtherCompareFinder.appex');
  const host={CFBundleIdentifier:'com.furthercompare.desktop',CFBundleExecutable:'Further Compare',CFBundleVersion:'2.186.0',CFBundleURLTypes:[{CFBundleURLSchemes:['furthercompare']}]};
  const plugin={CFBundleIdentifier:id,CFBundleExecutable:'FurtherCompareFinder',CFBundleVersion:'2.186.0',NSExtension:{NSExtensionPointIdentifier:'com.apple.FinderSync',NSExtensionPrincipalClass:'FCFinderSync'}};
  await fs.mkdir(path.join(appPath,'Contents/MacOS'),{recursive:true});await fs.mkdir(path.join(extension,'Contents/MacOS'),{recursive:true});
  await fs.writeFile(path.join(appPath,'Contents/Info.plist'),JSON.stringify(host));await fs.writeFile(path.join(extension,'Contents/Info.plist'),JSON.stringify(plugin));
  await fs.writeFile(path.join(appPath,'Contents/MacOS/Further Compare'),'host');await fs.writeFile(path.join(extension,'Contents/MacOS/FurtherCompareFinder'),'extension');
  const calls=[],model={entries:[],queries:0,addCalls:0,removeCalls:0,addAfter:1,remove:true};
  const execute=async(exe,args,options)=>{
    calls.push([exe,[...args]]);assert.equal(options.timeout,5000);assert.equal(options.maxBuffer,1024*1024);
    const override=await model.before?.(exe,args);if(override!==undefined)return {stdout:override};
    if(exe==='/usr/bin/plutil')return {stdout:await fs.readFile(args.at(-1),'utf8')};
    if(exe==='/usr/bin/codesign')return {stdout:''};
    if(exe.endsWith('lsregister'))return {stdout:''};
    assert.equal(exe,'/usr/bin/pluginkit');
    if(args[0]==='-m'){model.queries++;return {stdout:model.entries.map(entry=>line(entry.path,entry.election)).join('')||'  (no matches)\n'};}
    if(args[0]==='-a'){model.addCalls++;if(model.addCalls>=model.addAfter&&!model.entries.some(entry=>entry.path===args[1]))model.entries.push({path:args[1],election:''});}
    if(args[0]==='-e')for(const entry of model.entries)entry.election=args[1]==='use'?'+':'-';
    if(args[0]==='-r'){model.removeCalls++;if(model.remove)model.entries=model.entries.filter(entry=>entry.path!==args[1]);}
    return {stdout:''};
  };
  const make=options=>createFinderIntegration({appPath,platform:'darwin',execFile:execute,delay:async()=>{},...options});
  try{await run({root,appPath,extension,host,plugin,calls,model,make});}finally{await fs.rm(root,{recursive:true,force:true});}
}
test('Finder registry parser recognizes exact instances and fails closed on ambiguous output',()=>{
  assert.deepEqual(parseRegistrations('  (no matches)\n'),[]);
  assert.equal(parseRegistrations(line('/Applications/Further Compare.app/Contents/PlugIns/FurtherCompareFinder.appex')+' (1 plug-in)\n')[0].election,'+');
  assert.equal(parseRegistrations(line('/a',''))[0].election,'default');
  for(const output of ['unexpected',line('/a')+'error\n',line('/a\tb'),line('/a').replace(id,'other.identifier')])assert.throws(()=>parseRegistrations(output));
});
test('Finder status is read-only and distinguishes bundled, enabled, disabled and default election',()=>fixture(async({make,model,extension,calls})=>{
  const integration=make();let state=await integration.run('status');assert.equal(state.status,'bundled');assert.equal(state.verified,true);
  for(const [election,status]of [['+','enabled'],['-','disabled'],['','registered'],['?','registered'],['!','registered'],['=','registered']]){model.entries=[{path:extension,election}];state=await integration.run('status');assert.equal(state.status,status);assert.equal(state.enabled,election==='+');}
  assert.deepEqual(mutations(calls),[]);
}));
test('Finder installation retries asynchronous discovery then verifies enable election',()=>fixture(async({make,model,extension,calls,appPath})=>{
  model.addAfter=3;const state=await make().run('install');assert.equal(state.enabled,true);assert.equal(state.verified,true);assert.equal(model.addCalls,3);
  const changes=mutations(calls);assert.deepEqual(changes[0][1],['-f',appPath]);assert.ok(changes.filter(([,args])=>args[0]==='-a').every(([,args])=>args[1]===extension));assert.deepEqual(changes.at(-1)[1],['-e','use','-i',id]);
}));
test('Finder registration that never appears remains pending, not enabled',()=>fixture(async({make,model})=>{
  model.addAfter=100;const state=await make().run('install');assert.equal(state.status,'pending');assert.equal(state.enabled,false);assert.equal(state.partial,true);assert.equal(model.addCalls,4);
}));
test('Finder duplicate registrations prevent identifier-wide election and all mutations',()=>fixture(async({make,model,extension,calls})=>{
  model.entries=[{path:extension,election:'+'},{path:'/Applications/Other Copy.app/Contents/PlugIns/FurtherCompareFinder.appex',election:'+'}];
  for(const action of ['status','install','uninstall']){const state=await make().run(action);assert.equal(state.status,'conflict');assert.equal(state.conflict,true);}
  assert.deepEqual(mutations(calls),[]);
}));
test('Finder conflicts discovered during host registration stop before election',()=>fixture(async({make,model,calls})=>{
  model.before=async(exe)=>{if(exe.endsWith('lsregister'))model.entries.push({path:'/other/FurtherCompareFinder.appex',election:''});};
  const state=await make().run('install');assert.equal(state.conflict,true);assert.equal(state.partial,true);assert.equal(mutations(calls).length,1);
}));
test('Finder uninstall disables first and unregisters only the exact owned extension',()=>fixture(async({make,model,extension,calls})=>{
  model.entries=[{path:extension,election:'+'}];const state=await make().run('uninstall');assert.equal(state.registered,false);assert.equal(state.enabled,false);assert.equal(state.disabled,true);
  assert.deepEqual(mutations(calls).map(([,args])=>args),[['-e','ignore','-i',id],['-r',extension]]);
}));
test('Finder disable followed by automatic unregister succeeds without redundant removal',()=>fixture(async({make,model,extension,calls})=>{
  model.entries=[{path:extension,election:'+'}];model.before=async(exe,args)=>{if(exe.endsWith('pluginkit')&&args[0]==='-e'){model.entries=[];return '';}};
  const state=await make().run('uninstall');assert.equal(state.registered,false);assert.equal(state.disabled,true);assert.equal(state.partial,false);assert.equal(model.removeCalls,0);
}));
test('Finder automatic rediscovery is reported as registered but disabled',()=>fixture(async({make,model,extension})=>{
  model.entries=[{path:extension,election:'+'}];model.remove=false;const state=await make().run('uninstall');assert.equal(state.registered,true);assert.equal(state.disabled,true);assert.equal(state.partial,false);assert.match(state.reason,/rediscovered/);
}));
test('Finder verification failures clear previously observed enabled and registered flags',()=>fixture(async({make,model,extension})=>{
  model.entries=[{path:extension,election:'+'}];model.before=async(exe,args)=>{if(exe.endsWith('pluginkit')&&args[0]==='-e')throw Object.assign(Error('timed out'),{code:'ETIMEDOUT'});};
  const state=await make().run('uninstall');assert.equal(state.verified,false);assert.equal(state.enabled,false);assert.equal(state.registered,false);assert.equal(state.partial,true);assert.equal(state.status,'unavailable');assert.match(state.reason,/timed out/);
}));
test('Finder validates ownership, versions and signatures before mutations',()=>fixture(async({make,model,extension,calls,plugin})=>{
  const metadata=path.join(extension,'Contents/Info.plist');
  for(const broken of [{...plugin,CFBundleIdentifier:'other'},{...plugin,CFBundleVersion:'other'},{...plugin,NSExtension:{}}]){await fs.writeFile(metadata,JSON.stringify(broken));assert.equal((await make().run('install')).status,'unavailable');}
  await fs.writeFile(metadata,JSON.stringify(plugin));model.before=async(exe)=>{if(exe.endsWith('codesign'))throw Error('invalid signature');};assert.match((await make().run('install')).reason,/invalid signature/);assert.deepEqual(mutations(calls),[]);
}));
test('Finder refuses symlinked metadata, extension roots and ancestor aliases',()=>fixture(async({make,root,appPath,extension,calls})=>{
  const metadata=path.join(extension,'Contents/Info.plist'),saved=metadata+'.saved';await fs.rename(metadata,saved);await fs.symlink(saved,metadata);
  assert.equal((await make().run('install')).bundled,false);await fs.rm(metadata);await fs.rename(saved,metadata);
  const moved=extension+'.saved';await fs.rename(extension,moved);await fs.symlink(moved,extension);assert.equal((await make().run('uninstall')).status,'unavailable');await fs.rm(extension);await fs.rename(moved,extension);
  const alias=path.join(root,'Alias.app');await fs.symlink(appPath,alias);assert.equal((await make({appPath:alias}).run('install')).status,'unavailable');assert.deepEqual(mutations(calls),[]);
}));
test('Finder reports absent bundle and unsupported platforms without native mutations',()=>fixture(async({make,root,calls})=>{
  assert.equal((await make({platform:'win32'}).run('status')).supported,false);assert.equal(calls.length,0);
  const state=await make({appPath:path.join(root,'Missing.app')}).run('install');assert.equal(state.bundled,false);assert.equal(state.partial,false);assert.deepEqual(mutations(calls),[]);
  await assert.rejects(make().run('delete'),/Invalid Finder/);
}));
test('Finder serializes status and mutations from concurrent windows',()=>fixture(async({make,model,calls})=>{
  let release,entered;const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);let held=true;
  model.before=async(exe)=>{if(exe.endsWith('lsregister')&&held){held=false;entered();await gate;}};
  const integration=make(),install=integration.run('install');await started;const count=calls.length,status=integration.run('status');await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,count);release();assert.equal((await install).enabled,true);assert.equal((await status).enabled,true);
}));
