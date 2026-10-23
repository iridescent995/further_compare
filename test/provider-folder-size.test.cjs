'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {readProviderFolderSize}=require('../desktop/provider-folder-size.cjs');
function fixture(entries={'dir':'directory','dir/empty':'directory','dir/a':5,'dir/empty/b':7}){
 const calls=[],root={path:'/root',identity:'root',stamp:'root1',kind:'directory'};
 const metadata=path=>{const value=entries[path];return value===undefined?null:{path,identity:path,stamp:path+':1',kind:typeof value==='number'?'file':value,size:typeof value==='number'?value:null};};
 const provider={async inspectRoot(){calls.push('root');return {...root};},async inspectEntry(path){calls.push(path);return metadata(path);},async *enumerateDirectory(path){calls.push('list:'+path);for(const key of Object.keys(entries)){const tail=key.slice(path?path.length+1:0);if((!path||key.startsWith(path+'/'))&&tail&&!tail.includes('/'))yield {name:tail,kind:metadata(key).kind};}},openFileReader(){throw Error('Contents must never be read');}};
 return {provider,calls,root,entries};
}
test('metadata-only recursive totals include empty directories and exact bigint sum',async()=>{
 const {provider}=fixture({'dir':'directory','dir/empty':'directory','dir/a':Number.MAX_SAFE_INTEGER,'dir/b':Number.MAX_SAFE_INTEGER});
 assert.deepEqual(await readProviderFolderSize(provider,'dir'),{sizeBytes:'18014398509481982',files:2,folders:1,skipped:0,limited:false,timedOut:false,complete:true});
});
test('links and special entries are skipped without inspecting or following them',async()=>{
 const {provider,calls}=fixture({'dir':'directory','dir/loop':'symlink','dir/pipe':'other','dir/a':3});
 assert.deepEqual(await readProviderFolderSize(provider,'dir'),{sizeBytes:'3',files:1,folders:0,skipped:2,limited:false,timedOut:false,complete:false});assert.ok(!calls.includes('dir/loop'));assert.ok(!calls.includes('dir/pipe'));
});
test('entry, node and depth limits return honest partial totals',async()=>{
 for(const options of [{maxEntries:1},{maxNodes:1},{maxDepth:1}]){
  const {provider}=fixture({'dir':'directory','dir/a':2,'dir/deep':'directory','dir/deep/more':'directory','dir/deep/more/b':9});const result=await readProviderFolderSize(provider,'dir',options);assert.equal(result.complete,false);assert.equal(result.limited,true);assert.equal(result.timedOut,false);assert.ok(BigInt(result.sizeBytes)<11n);
 }
});
test('deadline bounds held metadata IO and supplies aborted child signal',async()=>{
 const {provider}=fixture();let observed;
 provider.inspectEntry=(_path,{signal})=>{observed=signal;return new Promise(()=>{});};
 const before=Date.now(),result=await readProviderFolderSize(provider,'dir',{maxDurationMs:20});assert.equal(result.limited,true);assert.equal(result.timedOut,true);assert.equal(result.complete,false);assert.equal(observed.aborted,true);assert.ok(Date.now()-before<1000);
});
test('deadline closes held enumeration and retains already counted lower bound',async()=>{
 const {provider}=fixture();let closed=false,signal;
 provider.enumerateDirectory=(_path,options)=>{signal=options.signal;let count=0;return {[Symbol.asyncIterator](){return this;},next(){return ++count===1?Promise.resolve({value:{name:'a',kind:'file'},done:false}):new Promise(()=>{});},return(){closed=true;return Promise.resolve({done:true});}};};
 const result=await readProviderFolderSize(provider,'dir',{maxDurationMs:20});assert.equal(result.sizeBytes,'5');assert.equal(result.limited,true);assert.equal(result.timedOut,true);assert.equal(closed,true);assert.equal(signal.aborted,true);
});
test('user cancellation rejects before and during held IO',async()=>{
 const {provider,calls}=fixture(),early=new AbortController();early.abort();await assert.rejects(readProviderFolderSize(provider,'dir',{signal:early.signal}),{code:'ABORT_ERR'});assert.equal(calls.length,0);
 const active=new AbortController();provider.inspectEntry=()=>{active.abort();return new Promise(()=>{});};await assert.rejects(readProviderFolderSize(provider,'dir',{signal:active.signal}),{code:'ABORT_ERR'});
});
test('changed selected folder, root and file evidence rejects instead of reporting totals',async()=>{
 for(const target of ['dir','dir/a','root']){const {provider}=fixture();const method=target==='root'?'inspectRoot':'inspectEntry',original=provider[method];let count=0;provider[method]=async(...args)=>{const info=await original(...args);if((target==='root'||args[0]===target)&&++count>1)info.stamp+='changed';return info;};await assert.rejects(readProviderFolderSize(provider,'dir'),{code:'STALE_SOURCE'});}
});
test('invalid paths, options, files and duplicate enumeration fail closed',async()=>{
 const {provider}=fixture();for(const path of ['../escape','/abs','dir//x','dir\\x'])await assert.rejects(readProviderFolderSize(provider,path));
 for(const opts of [{maxEntries:0},{maxNodes:50001},{maxDepth:1025},{maxDurationMs:0}])await assert.rejects(readProviderFolderSize(provider,'dir',opts));
 await assert.rejects(readProviderFolderSize(provider,'dir/a'),/regular folder/);
 provider.enumerateDirectory=async function*(){yield {name:'a',kind:'file'};yield {name:'a',kind:'file'};};await assert.rejects(readProviderFolderSize(provider,'dir'),{code:'STALE_SOURCE'});
});
