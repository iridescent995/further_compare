'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {createWindowsExplorerIntegration}=require('../desktop/windows-explorer-integration.cjs');
test('preload defaults to structured status and preserves native fail-closed request validation',async()=>{
 const service=createWindowsExplorerIntegration({app:{isPackaged:false},platform:'win32'}),calls=[];let desktop;
 const electron={contextBridge:{exposeInMainWorld:(name,value)=>{assert.equal(name,'desktop');desktop=value;}},ipcRenderer:{invoke:async(channel,value)=>{assert.equal(channel,'shell:explorer-integration');const request=structuredClone(value);calls.push(request);return service.run(request,{owner:73});}},webUtils:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../desktop/preload.cjs'),'utf8'),{require:name=>{assert.equal(name,'electron');return electron;},process:{platform:'win32'}});
 const state=await desktop.explorerIntegration();assert.equal(state.mutationAuthority,false);assert.deepEqual(calls[0],{action:'status'});const review=await desktop.explorerIntegration({action:'review',operation:'install'});assert.equal(review.available,false);assert.equal(review.token,undefined);
 await assert.rejects(desktop.explorerIntegration({action:'execute',token:'a'.repeat(64)}),/expired|another window/);
 await assert.rejects(desktop.explorerIntegration({action:'status',mutationAuthority:true}),/Invalid/);
 await assert.rejects(desktop.explorerIntegration({action:'review',operation:'install',owner:1}),/Invalid/);
 await assert.rejects(desktop.explorerIntegration({action:'execute',token:'a'.repeat(64),command:'anything'}),/Invalid/);
 assert.equal(desktop.invoke,undefined);assert.equal(desktop.ipcRenderer,undefined);assert(Object.isFrozen(desktop));service.revokeOwner(73);
});
test('complete window runtime construction and disposal revoke only its initialized Explorer owner',async()=>{
 const path=require('node:path'),{EventEmitter}=require('node:events'),directory=path.resolve(__dirname,'../desktop'),calls=[];let initializations=0;
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(directory,'window-runtime.cjs'),'utf8'),{module,exports:module.exports,require:id=>id==='./windows-explorer-integration.cjs'?{getWindowsExplorerIntegration:()=>{initializations++;return {run:async(request,context)=>{calls.push({request,context});return {status:'unavailable'};},revokeOwner:owner=>calls.push({revoked:owner})};}}:id.startsWith('./')?require(path.join(directory,id)):require(id),console,Buffer,TextDecoder,AbortController,AbortSignal,setTimeout,clearTimeout,process});
 class Folders{constructor(){this.plans=new Map();this.hashCache=new Map();this.roots={};}}
 const shared={process:{platform:'win32',execPath:'C:\\Further Compare.exe'},app:{getPath:()=>'/private/tmp'},fs:require('node:fs/promises'),path,FolderService:Folders,BatchService:class{},ThreeWayRecovery:class{}};
 const window=id=>Object.assign(new EventEmitter(),{webContents:{id}});
 const first=module.exports.createWindowRuntime(window(71),shared);await first.dispose();assert.equal(initializations,0);
 const second=module.exports.createWindowRuntime(window(72),shared),request={action:'review',operation:'install'};await second.handlers.get('shell:explorer-integration')(request);assert.equal(initializations,1);assert.equal(calls[0].request,request);assert.equal(calls[0].context.owner,72);await second.dispose();assert.deepEqual(calls[1],{revoked:72});await assert.rejects(second.handlers.get('shell:explorer-integration')({action:'status'}),/closed/);assert.equal(calls.length,2);
});
