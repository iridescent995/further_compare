'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../desktop/window-runtime.cjs'),'utf8');
const begin=source.indexOf("  handle('shell:finder-integration'");
assert.ok(begin>=0);
const block=source.slice(begin,source.indexOf("  let shellRefreshWarning =",begin));
function runtime({platform='darwin',packaged=true,service}={}){
 let handler;
 vm.runInNewContext(block,{handle:(name,fn)=>{assert.equal(name,'shell:finder-integration');handler=fn;},app:{isPackaged:packaged},process:{platform},shared:{finderIntegration:service}});
 return handler;
}
test('Finder lifecycle bridge rejects arbitrary actions and delegates only packaged Mac operations',async()=>{
 const calls=[],state={supported:true,bundled:true,registered:true,enabled:true};
 const handler=runtime({service:{run:async action=>{calls.push(action);return state;}}});
 for(const action of ['status','install','uninstall'])assert.equal(await handler(action),state);
 for(const action of [null,{},'register-other-copy','INSTALL'])await assert.rejects(handler(action),/Unknown Finder/);
 assert.deepEqual(calls,['status','install','uninstall']);
});
test('Finder lifecycle bridge cannot mutate from Windows or unpackaged development',async()=>{
 const service={run:()=>{throw Error('Must not reach native lifecycle');}};
 for(const options of [{platform:'win32',service},{platform:'linux',service},{packaged:false,service},{}]){
  const handler=runtime(options);
  for(const action of ['status','install','uninstall']){
   const result=await handler(action);assert.equal(result.supported,false);assert.equal(result.enabled,false);assert.equal(result.status,'unavailable');
  }
 }
});
