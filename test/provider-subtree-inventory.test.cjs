'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {scanProviderSubtrees}=require('../desktop/provider-subtree-inventory.cjs');
function fixture(){
 const data=new Map([['a','directory'],['a/b','directory'],['a/b/c','directory'],['a/b/c/file:名','file'],['empty','directory'],['link','symlink'],['ignore','directory'],['ignore/secret','file']]);
 const stamps=new Map();const calls=[];let hook=()=>{};
 const provider={
  async inspectRoot(){calls.push('root');return {path:'/root',identity:'root',stamp:stamps.get('root')||'1'};},
  async inspectEntry(path){calls.push('stat:'+path);await hook('stat',path);if(!data.has(path))return null;return {path,kind:data.get(path),identity:path,stamp:stamps.get(path)||'1',size:data.get(path)==='file'?7:0,secret:{password:'secret'}};},
  async *enumerateDirectory(path){calls.push('list:'+path);await hook('list',path);const prefix=path?path+'/':'';for(const [name,kind] of data)if(name.startsWith(prefix)&&!name.slice(prefix.length).includes('/'))yield {name:name.slice(prefix.length),kind};},
 };
 return {provider,data,stamps,calls,setHook(fn){hook=fn;}};
}
test('complete collapsed chain with overlap, empty directories, immutable sanitized metadata',async()=>{
 const f=fixture();const result=await scanProviderSubtrees(f.provider,['a','a/b','empty']);
 assert.deepEqual(result.selections,['a','empty']);assert.deepEqual(result.entries.map(x=>x.path),['a','a/b','a/b/c','a/b/c/file:名','empty']);
 assert.equal(result.entries.find(x=>x.path==='a/b').selected,true);assert.equal(result.counts.nodes,4);assert.equal(result.directories.find(x=>x.path==='empty').children.length,0);
 assert.equal(result.entries[0].metadata.secret,undefined);assert.throws(()=>{result.entries[0].metadata.stamp='changed';},TypeError);assert.throws(()=>result.directories[0].children.push({}),TypeError);
 assert.equal(f.calls.filter(x=>x==='list:a').length,2);
});
test('selected file includes authority ancestors but does not enumerate siblings',async()=>{
 const f=fixture();const result=await scanProviderSubtrees(f.provider,['a/b/c/file:名']);
 assert.deepEqual(result.entries.map(x=>[x.path,x.context]),[['a',true],['a/b',true],['a/b/c',true],['a/b/c/file:名',false]]);assert.equal(result.counts.nodes,3);assert.equal(result.directories.length,0);
 assert.equal(f.calls.some(x=>x.startsWith('list:')),false);
 await assert.rejects(scanProviderSubtrees(f.provider,['a/b/c/file:名'],{maxNodes:1}),/folder limit/);
 await assert.rejects(scanProviderSubtrees(f.provider,['a/b/c/file:名'],{maxEntries:3}),/entry limit/);
});
test('ignored and unsupported entries are recorded without following or inspecting them',async()=>{
 const f=fixture();const result=await scanProviderSubtrees(f.provider,[''],{isIgnoredPath:p=>p==='ignore',isExcludedPath:p=>p==='empty'});
 assert.deepEqual(result.exclusions.map(x=>[x.path,x.reason]),[['empty','excluded'],['ignore','ignored'],['link','unsupported']]);
 assert.equal(f.calls.includes('stat:link'),false);assert.equal(f.calls.includes('list:ignore'),false);
 assert.equal(result.directories.find(x=>x.path==='').children.some(x=>x.name==='link'),true);
});
test('an explicit selection below an exclusion cannot bypass it',async()=>{
 const f=fixture();const result=await scanProviderSubtrees(f.provider,['ignore/secret'],{isExcludedPath:p=>p==='ignore'});assert.equal(result.entries.length,0);assert.equal(result.exclusions[0].path,'ignore');assert.equal(f.calls.some(x=>x.startsWith('stat:')),false);
});
test('namespace changes among ignored entries are detected despite stable metadata',async()=>{
 const f=fixture();let count=0;f.setHook((event,path)=>{if(event==='list'&&path===''&&++count===2){f.data.delete('link');f.data.set('other-link','symlink');}});
 await assert.rejects(scanProviderSubtrees(f.provider,[''],{isIgnoredPath:p=>p==='ignore'}),{code:'STALE_SOURCE'});
});
test('final metadata sweep occurs after all namespace rescans',async()=>{
 const f=fixture();let count=0;f.setHook((event,path)=>{if(event==='list'&&path==='a/b/c'&&++count===2)f.stamps.set('a','2');});
 await assert.rejects(scanProviderSubtrees(f.provider,['a']),{code:'STALE_SOURCE'});
});
test('malformed or excessive selection rejected before any provider IO',async()=>{
 for(const selection of [['../a'],['a//b'],['a\\b'],['a\0b'],['x'.repeat(32769)],Array(1001).fill('a')]){const f=fixture();await assert.rejects(scanProviderSubtrees(f.provider,selection));assert.deepEqual(f.calls,[]);}
 const f=fixture();await assert.rejects(scanProviderSubtrees(f.provider,['a/b/c'],{maxDepth:2}),/depth/);assert.deepEqual(f.calls,[]);
});
test('entry/node/depth budgets include descendants and ignored names',async()=>{
 for(const options of [{maxEntries:2},{maxNodes:2},{maxDepth:2}])await assert.rejects(scanProviderSubtrees(fixture().provider,['a'],options),/limit/);
 await assert.rejects(scanProviderSubtrees(fixture().provider,[''],{maxEntries:3,isIgnoredPath:p=>!!p}),/limit/);
});
test('invalid root kind, duplicate listing and kind mismatch fail closed',async()=>{
 const f=fixture();f.provider.inspectRoot=async()=>({path:'/root',identity:'r',stamp:'1',kind:'file'});await assert.rejects(scanProviderSubtrees(f.provider,['a']),{code:'STALE_SOURCE'});
 const g=fixture();g.provider.enumerateDirectory=async function*(){yield {name:'x',kind:'file'};yield {name:'x',kind:'file'};};await assert.rejects(scanProviderSubtrees(g.provider,['a']),/duplicate/);
 const h=fixture();h.provider.enumerateDirectory=async function*(){yield {name:'b',kind:'file'};};await assert.rejects(scanProviderSubtrees(h.provider,['a']),{code:'STALE_SOURCE'});
});
test('abort closes active iterator and returns no partial result',async()=>{
 const f=fixture(),controller=new AbortController();let closed=false;f.provider.enumerateDirectory=async function*(){try{controller.abort();yield {name:'b',kind:'directory'};}finally{closed=true;}};
 await assert.rejects(scanProviderSubtrees(f.provider,['a'],{signal:controller.signal}),/cancel|abort/i);assert.equal(closed,true);
});
