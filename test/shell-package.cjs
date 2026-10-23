'use strict';
// Runs the packaged installer and native helper without opening application windows.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
async function main(){
 if(process.argv[2]!=='--child'){
  const executable=process.env.FC_TEST_EXECUTABLE;if(!executable)throw Error('FC_TEST_EXECUTABLE is required.');
  const {spawn}=require('node:child_process');
  const child=spawn(executable,[__filename,'--child',path.resolve(executable,'../../Resources')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:'inherit'});
  await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Packaged shell check exited '+code)));});return;
 }
 const resources=process.argv[3];
 // Electron's node mode does not populate the application resource location.
 // Match the location supplied by the desktop runtime before invoking its helper.
 if(!process.resourcesPath)process.resourcesPath=resources;
 const integration=require(path.join(resources,'app.asar/desktop/shell-integration.cjs'));
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-shell-package-')));
 try{
  const app=path.join(root,'Further Compare.app'),output=path.join(root,'Services'),executable=path.join(app,'Contents/MacOS/Further Compare');
  await fs.mkdir(path.dirname(executable),{recursive:true});await fs.writeFile(executable,'#!/bin/sh\nexit 0\n',{mode:0o755});
  await integration.generate({app,output});assert.deepEqual(await integration.inspectMac(output,app),{installed:true,partial:false,stale:false});
  assert.equal((await fs.readdir(output)).length,3);
  const document=path.join(output,'Further Compare — Set as Left.workflow/Contents/document.wflow');await fs.writeFile(document,'damaged');
  assert.equal((await integration.inspectMac(output,app)).stale,true);await integration.generate({app,output});assert.equal((await integration.inspectMac(output,app)).installed,true);
  await fs.unlink(executable);assert.deepEqual(await integration.inspectMac(output,app),{installed:false,partial:true,stale:true});
  await integration.generate({output,uninstall:true});assert.deepEqual(await fs.readdir(output),[]);
  console.log('Packaged shell checks passed: exclusive staging, metadata repair, missing target status, scoped removal.');
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
