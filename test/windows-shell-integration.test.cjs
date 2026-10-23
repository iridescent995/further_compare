'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createWindowsShellIntegration,getWindowsShellIntegration,parseStatus}=require('../desktop/windows-shell-integration.cjs');
const good={installed:true,partial:false,stale:false},absent={installed:false,partial:false,stale:false};
function fixture(replies){
 const calls=[],clean=[];let serial=0;
 const service=createWindowsShellIntegration({appPath:'C:\\Apps\\Further Compare.exe',systemRoot:'C:\\Windows',tempRoot:'/tmp',scriptPath:'/app/shell-menu.ps1',fs:{mkdtemp:async()=>'/tmp/shell-'+(++serial),copyFile:async()=>{},rm:async(dir,options)=>clean.push({dir,options})},execFile:async(exe,args,options)=>{calls.push({exe,args,options});const reply=replies.shift();if(reply instanceof Error)throw reply;if(typeof reply==='function')return reply();return {stdout:typeof reply==='string'?reply:JSON.stringify(reply)};}});
 return {service,calls,clean};
}
test('Windows mutations return observed registry state, not command exit success',async()=>{
 const f=fixture(['installed', {installed:false,partial:true,stale:true},'removed',good,'installed',good,'removed',absent]);
 const partial=await f.service.run('install');assert.equal(partial.installed,false);assert.equal(partial.partial,true);
 assert.equal((await f.service.run('uninstall')).installed,true);
 assert.equal((await f.service.run('install')).installed,true);
 assert.equal((await f.service.run('uninstall')).installed,false);
 assert.equal(f.calls.length,8);for(let i=1;i<8;i+=2)assert(f.calls[i].args.includes('-Status'));
 assert.equal(f.clean.length,4);assert.equal(f.calls[0].exe,'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');assert.equal(f.calls[0].options.windowsHide,true);
});
test('Windows failed mutation is inspected but never reported successful; queue recovers',async()=>{
 const f=fixture([new Error('partial mutation'),good,absent]);await assert.rejects(f.service.run('install'),/could not complete/);assert(f.calls[1].args.includes('-Status'));assert.equal(f.clean.length,1);assert.equal((await f.service.run('status')).installed,false);
});
test('Windows malformed or failed verification fails closed and cleans staging',async()=>{
 for(const response of ['not JSON',{installed:'true',partial:false,stale:false},{installed:true,partial:true,stale:false},{installed:false},new Error('timeout')]){
  const f=fixture(['successful command',response]);await assert.rejects(f.service.run('install'),/Could not verify/);assert.equal(f.clean.length,1);
 }
 assert.throws(()=>parseStatus('null'),/verify/);
});
test('Windows operations serialize entire mutation, verification and cleanup across requests',async()=>{
 let release;const hold=new Promise(resolve=>release=resolve);
 const f=fixture([async()=>{await hold;return {stdout:'installed'};},good,absent]);
 const first=f.service.run('install'),second=f.service.run('status');await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.length,1);assert.equal(f.clean.length,0);
 release();await first;await second;assert.equal(f.calls.length,3);assert(f.calls[1].args.includes('-Status'));assert(f.calls[2].args.includes('-Status'));assert.equal(f.clean.length,2);
});
test('Windows invalid actions do not touch filesystem or execute commands',async()=>{
 const f=fixture([]);await assert.rejects(f.service.run('repair'),/Unknown/);assert.equal(f.calls.length,0);assert.equal(f.clean.length,0);
});

test('Windows runtimes with separate dependency objects share one application service',()=>{
 const app={},options={appPath:'C:\\Apps\\Further Compare.exe'};
 const first=getWindowsShellIntegration(app,options);
 assert.equal(getWindowsShellIntegration(app,{...options}),first);
 assert.notEqual(getWindowsShellIntegration({},options),first);
});
