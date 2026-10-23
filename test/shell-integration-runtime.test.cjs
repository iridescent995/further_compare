'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// Execute the actual registration block with isolated OS dependencies; never touch user Services.
const source=fs.readFileSync(path.join(__dirname,'../desktop/window-runtime.cjs'),'utf8');
const block=source.slice(source.indexOf("  let shellRefreshWarning ="),source.indexOf("  handle('shell:state'"));
test('Mac refresh failures survive later status calls and clear only on successful refresh',async()=>{
 let handler,installed=false,fail=true,refreshes=0;
 vm.runInNewContext(block,{handle:(name,fn)=>{assert.equal(name,'shell:integration');handler=fn;},process:{platform:'darwin',execPath:'/Applications/Further Compare.app/Contents/MacOS/Further Compare'},path,app:{isPackaged:true,getPath:()=>'/isolated/home'},shellIntegration:{generate:async({uninstall})=>{installed=!uninstall;},inspectMac:async()=>({installed,partial:false,stale:false})},execFileAsync:async(file,args)=>{assert.equal(file,'/System/Library/CoreServices/pbs');assert.equal(args[0],'-update');refreshes++;if(fail)throw Error('unavailable');}});
 assert.equal((await handler('status')).refreshWarning,undefined);
 for(const action of ['install','uninstall']){
  fail=true;let state=await handler(action);assert.equal(state.installed,action==='install');assert.equal(state.refreshAction,action);assert.match(state.refreshWarning,/could not refresh/);
  const attempts=refreshes;state=await handler('status');assert.equal(state.refreshAction,action);assert.match(state.refreshWarning,/could not refresh/);assert.equal(refreshes,attempts);
  fail=false;state=await handler(action);assert.equal(state.refreshWarning,undefined);assert.equal((await handler('status')).refreshWarning,undefined);
 }
});

test('Windows integration status preserves stale and partial flags from the installer',async()=>{
 let handler;
 vm.runInNewContext(block,{handle:(name,fn)=>{handler=fn;},shared:{},require:name=>require(path.join(__dirname,'../desktop',name)),process:{platform:'win32',execPath:'C:\\Apps\\Further Compare.exe',env:{SystemRoot:'C:\\Windows'}},path,app:{isPackaged:true,getPath:()=>'/isolated/temp'},fs:{mkdtemp:async()=>'/isolated/temp/shell',copyFile:async()=>{},rm:async()=>{}},__dirname:'/app/desktop',execFileAsync:async()=>({stdout:JSON.stringify({installed:false,partial:true,stale:true})})});
 const result=await handler('status');assert.equal(result.installed,false);assert.equal(result.partial,true);assert.equal(result.stale,true);
});
