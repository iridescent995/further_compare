// Executes staged macOS workflows against a disposable executable; installs no Services.
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process');
const assert=require('node:assert/strict');
const {promisify}=require('node:util');
const execFile=promisify(cp.execFile);
const integration=require('../desktop/shell-integration.cjs');
(async()=>{
 if(process.platform!=='darwin')throw Error('This integration check requires macOS.');
 const root=await fs.mkdtemp('/private/tmp/fc-workflow-');
 try {
  const app=path.join(root,'Further Compare.app'),contents=path.join(app,'Contents'),exe=path.join(contents,'MacOS/Further Compare'),received=path.join(root,'received');
  await fs.mkdir(path.dirname(exe),{recursive:true});
  await fs.writeFile(path.join(contents,'Info.plist'),'<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.furthercompare.workflowtest</string><key>CFBundleExecutable</key><string>Further Compare</string><key>CFBundleName</key><string>Further Compare</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
  // Each launch exits immediately; every action exercises a cold launch with a new process.
  await fs.writeFile(exe,`#!/bin/sh\nprintf '%s\\n' "$@" > '${received}.partial'\nmv '${received}.partial' '${received}'\n`,{mode:0o755});
  const fixtures=[path.join(root,"space ' $(touch NEVER) & file.txt"),path.join(root,"space ' $(touch NEVER) & folder")];
  await fs.writeFile(fixtures[0],'test');await fs.mkdir(fixtures[1]);
  await integration.generate({app,output:root});
  for(const label of ['Set as Left','Compare with Left']){
   const workflow=path.join(root,`Further Compare — ${label}.workflow`);
   const info=JSON.parse((await execFile('/usr/bin/plutil',['-convert','json','-o','-',path.join(workflow,'Contents/Info.plist')])).stdout);
   assert.deepEqual(info.NSServices[0].NSSendFileTypes,['public.data','public.folder']);
   for(const fixture of fixtures){
    await execFile('/usr/bin/automator',['-i',fixture,workflow],{timeout:30000});
    let argv;
    for(let attempt=0;attempt<100;attempt++){
     try{argv=await fs.readFile(received,'utf8');break;}catch(error){if(error.code!=='ENOENT')throw error;}
     await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(argv,`${label==='Set as Left'?'--fc-set-left':'--fc-compare-left'}\n${fixture}\n`);
    await fs.unlink(received);
    console.log(`${label}: ${(await fs.stat(fixture)).isDirectory()?'folder':'file'} arguments verified`);
   }
  }
  const selectedWorkflow=path.join(root,'Further Compare — Compare Selected.workflow');
  for(const fixture of fixtures){
   const peer=fixture+' peer';
   const folder=(await fs.stat(fixture)).isDirectory();
   if(folder)await fs.mkdir(peer);else await fs.writeFile(peer,'peer');
   // Automator treats each stdin line as an individual input item.
   await new Promise((resolve,reject)=>{
    const child=cp.execFile('/usr/bin/automator',['-i','-',selectedWorkflow],{timeout:30000},error=>error?reject(error):resolve());
    child.stdin.end(fixture+'\n'+peer+'\n');
   });
   let argv;
   for(let attempt=0;attempt<100;attempt++){
    try{argv=await fs.readFile(received,'utf8');break;}catch(error){if(error.code!=='ENOENT')throw error;}
    await new Promise(resolve=>setTimeout(resolve,100));
   }
   assert.equal(argv,`--fc-compare-selected\n${fixture}\n${peer}\n`);
   await fs.unlink(received);
   console.log(`Compare Selected: two ${folder?'folders':'files'} arguments verified`);
  }
  await integration.generate({output:root,uninstall:true});
  assert.equal((await integration.inspectMac(root)).installed,false);
 } finally {await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
