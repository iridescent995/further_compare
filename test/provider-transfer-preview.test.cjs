'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {prepareProviderCopy,revalidateProviderCopy,revokeProviderCopy}=require('../desktop/provider-transfer-preview.cjs');
function fixture(label,files={}){
 const state={entries:new Map(),closed:0,opened:0,requests:[],writes:0,onRead:null,onInspect:null,root:{path:'root:'+label,identity:'root-identity:'+label,stamp:'root-stamp'}};
 for(const [relative,value]of Object.entries(files)){
  state.entries.set(relative,value===null?{kind:'directory',identity:label+':'+relative,stamp:'directory-stamp',size:null}:{kind:'file',identity:label+':'+relative,stamp:'file-stamp',size:Buffer.byteLength(value),bytes:Buffer.from(value)});
 }
 const info=relative=>{const entry=state.entries.get(relative);if(!entry)return null;const {bytes,...metadata}=entry;return {path:relative,...metadata};};
 const provider={
  inspectRoot:async()=>({...state.root}),
  inspectEntry:async relative=>{state.onInspect?.(relative);return info(relative);},
  openFileReader:async relative=>{const entry=state.entries.get(relative);assert.equal(entry?.kind,'file');state.opened++;let offset=0;return {metadata:info(relative),read:async max=>{state.requests.push({relative,max});await state.onRead?.(relative,offset);if(offset>=entry.bytes.length)return null;const chunk=entry.bytes.subarray(offset,offset+Math.min(max,3));offset+=chunk.length;return chunk;},validate:async()=>info(relative),close:async()=>{state.closed++;}};},
  write:async()=>{state.writes++;throw Error('Preview attempted a write');},unlink:async()=>{state.writes++;throw Error('Preview attempted a delete');}
 };
 const mutate=(relative,content,{metadata=false}={})=>{const entry=state.entries.get(relative);entry.bytes=Buffer.from(content);entry.size=entry.bytes.length;if(metadata)entry.stamp+='changed';};
 return {provider,state,mutate};
}
const mapping=(source,target=source)=>({source,target});
function unchanged(...fixtures){for(const f of fixtures){assert.equal(f.state.writes,0);assert.equal(f.state.closed,f.state.opened);}}
test('previews create, replace and identical skip with mapped destination names',async()=>{
 const source=fixture('source',{'new.txt':'new','old.txt':'updated','same.txt':'same'}),destination=fixture('destination',{'folder':null,'folder/replaced.txt':'old','same.txt':'same'});
 const plan=await prepareProviderCopy(source.provider,destination.provider,[mapping('new.txt'),mapping('old.txt','folder/replaced.txt'),mapping('same.txt')]);
 assert.equal(typeof plan.id,'string');assert.ok(plan.id.length);assert.equal(plan.operations.length,3);
 assert.deepEqual(plan.operations.map(({source,target,action,bytes})=>({source,target,action,bytes})),[{source:'new.txt',target:'new.txt',action:'create',bytes:3},{source:'old.txt',target:'folder/replaced.txt',action:'replace',bytes:7},{source:'same.txt',target:'same.txt',action:'skip',bytes:4}]);
 assert.equal(plan.totalBytes,10);await revalidateProviderCopy(plan);unchanged(source,destination);
});
test('public plan contains only review data and no provider, bytes or private observations',async()=>{
 const source=fixture('s',{'a.txt':'private-source-content'}),destination=fixture('d');const plan=await prepareProviderCopy(source.provider,destination.provider,[mapping('a.txt')]);
 assert.deepEqual(Object.keys(plan).sort(),['id','operations','totalBytes']);
 assert.deepEqual(Object.keys(plan.operations[0]).sort(),['action','bytes','source','target']);
 assert.equal(JSON.stringify(plan).includes('private-source-content'),false);assert.equal(JSON.stringify(plan).includes('root-identity'),false);
 assert.equal(Object.values(plan).includes(source.provider),false);assert.equal(Object.values(plan).includes(destination.provider),false);unchanged(source,destination);
});
test('duplicate destinations and self-aliases cannot create a transfer plan',async()=>{
 const source=fixture('s',{'a.txt':'a','b.txt':'b'}),destination=fixture('d');await assert.rejects(prepareProviderCopy(source.provider,destination.provider,[mapping('a.txt','same.txt'),mapping('b.txt','same.txt')]));
 await assert.rejects(prepareProviderCopy(source.provider,source.provider,[mapping('a.txt')]));
 const alias=fixture('s',{'alias.txt':'a'});alias.state.entries.get('alias.txt').identity=source.state.entries.get('a.txt').identity;
 await assert.rejects(prepareProviderCopy(source.provider,alias.provider,[mapping('a.txt','alias.txt')]));unchanged(source,destination,alias);
});
test('missing parent, non-directory parent and destination directory conflicts are rejected',async()=>{
 for(const entries of [{},{parent:'file'},{parent:null,'parent/a.txt':null}]){const source=fixture('s',{'a.txt':'a'}),destination=fixture('d',entries);await assert.rejects(prepareProviderCopy(source.provider,destination.provider,[mapping('a.txt','parent/a.txt')]));unchanged(source,destination);}
});
test('missing or non-file source and invalid mappings are rejected without writes',async()=>{
 const source=fixture('s',{'directory':null,'a.txt':'a'}),destination=fixture('d');
 for(const mappings of [[],[mapping('missing')],[mapping('directory')],[mapping('../outside')],[mapping('a.txt','/absolute')],[mapping('a.txt','nested/../outside')]])await assert.rejects(prepareProviderCopy(source.provider,destination.provider,mappings));unchanged(source,destination);
});
test('same-size same-metadata source edits after review invalidate the plan',async()=>{
 const source=fixture('s',{'a.txt':'AAAA'}),destination=fixture('d');const plan=await prepareProviderCopy(source.provider,destination.provider,[mapping('a.txt')]);source.mutate('a.txt','BBBB');await assert.rejects(revalidateProviderCopy(plan));unchanged(source,destination);
});
test('same-size same-metadata destination edits invalidate replace and skip plans',async()=>{
 for(const initial of ['AAAA','ZZZZ']){const source=fixture('s',{'a.txt':'AAAA'}),destination=fixture('d',{'a.txt':initial});const plan=await prepareProviderCopy(source.provider,destination.provider,[mapping('a.txt')]);destination.mutate('a.txt','BBBB');await assert.rejects(revalidateProviderCopy(plan));unchanged(source,destination);}
});
test('new destination files appearing after create review are never silently overwritten',async()=>{
 const source=fixture('s',{'a.txt':'AAAA'}),destination=fixture('d');const plan=await prepareProviderCopy(source.provider,destination.provider,[mapping('a.txt')]);destination.state.entries.set('a.txt',{kind:'file',identity:'new-file',stamp:'new',size:4,bytes:Buffer.from('user')});await assert.rejects(revalidateProviderCopy(plan));unchanged(source,destination);
});
test('root replacement and parent replacement after preview invalidate the plan',async()=>{
 for(const change of ['root','parent']){const source=fixture('s',{'a.txt':'a'}),destination=fixture('d',{'parent':null});const plan=await prepareProviderCopy(source.provider,destination.provider,[mapping('a.txt','parent/a.txt')]);if(change==='root')destination.state.root.identity='replacement-root';else destination.state.entries.get('parent').identity='replacement-parent';await assert.rejects(revalidateProviderCopy(plan));unchanged(source,destination);}
});
test('revoked and copied public plans cannot regain native authority',async()=>{
 const source=fixture('s',{'a.txt':'a'}),destination=fixture('d');const plan=await prepareProviderCopy(source.provider,destination.provider,[mapping('a.txt')]);await assert.rejects(revalidateProviderCopy(JSON.parse(JSON.stringify(plan))));revokeProviderCopy(plan);await assert.rejects(revalidateProviderCopy(plan));unchanged(source,destination);
});
test('abort while reading closes retained handles and publishes no partial plan',async()=>{
 const source=fixture('s',{'a.txt':'several chunks'}),destination=fixture('d'),controller=new AbortController();source.state.onRead=()=>controller.abort();await assert.rejects(prepareProviderCopy(source.provider,destination.provider,[mapping('a.txt')],{signal:controller.signal}),{code:'ABORT_ERR'});assert.equal(source.state.opened,1);unchanged(source,destination);
});
test('abort during revalidation closes readers and leaves originals unchanged',async()=>{
 const source=fixture('s',{'a.txt':'several chunks'}),destination=fixture('d'),plan=await prepareProviderCopy(source.provider,destination.provider,[mapping('a.txt')]),controller=new AbortController();source.state.onRead=()=>controller.abort();await assert.rejects(revalidateProviderCopy(plan,{signal:controller.signal}),{code:'ABORT_ERR'});unchanged(source,destination);
});
test('preview rechecks an earlier source when a later file read mutates it without metadata change',async()=>{
 const source=fixture('s',{'a.txt':'AAAA','b.txt':'BBBB'}),destination=fixture('d');source.state.onRead=relative=>{if(relative==='b.txt')source.mutate('a.txt','XXXX');};await assert.rejects(prepareProviderCopy(source.provider,destination.provider,[mapping('a.txt'),mapping('b.txt')]));unchanged(source,destination);
});
test('preview rechecks an earlier destination when a later file changes it',async()=>{
 const source=fixture('s',{'a.txt':'AAAA','b.txt':'BBBB'}),destination=fixture('d',{'a.txt':'ZZZZ'});source.state.onRead=relative=>{if(relative==='b.txt')destination.mutate('a.txt','XXXX');};await assert.rejects(prepareProviderCopy(source.provider,destination.provider,[mapping('a.txt'),mapping('b.txt')]));unchanged(source,destination);
});
test('overlapping cross-mapping sources and destinations are rejected before a destructive plan exists',async()=>{
 const shared=fixture('shared',{'a.txt':'A','b.txt':'B','c.txt':'C'});
 await assert.rejects(prepareProviderCopy(shared.provider,shared.provider,[mapping('a.txt','b.txt'),mapping('b.txt','c.txt')]));unchanged(shared);
});
test('equal native file identities across distinct root authorities still reject self-aliases',async()=>{
 const source=fixture('left',{'a.txt':'A'}),destination=fixture('right',{'alias.txt':'A'});
 destination.state.entries.get('alias.txt').identity=source.state.entries.get('a.txt').identity;
 source.state.entries.get('a.txt').strongRevision=true;destination.state.entries.get('alias.txt').strongRevision=true;
 await assert.rejects(prepareProviderCopy(source.provider,destination.provider,[mapping('a.txt','alias.txt')]));unchanged(source,destination);
});
test('revocation during an awaited revalidation read prevents successful authorization',async()=>{
 const source=fixture('s',{'a.txt':'AAAA'}),destination=fixture('d'),plan=await prepareProviderCopy(source.provider,destination.provider,[mapping('a.txt')]);
 let release,reached;const entered=new Promise(resolve=>{reached=resolve;});let first=true;
 source.state.onRead=async()=>{if(first){first=false;reached();await new Promise(resolve=>{release=resolve;});}};
 const pending=revalidateProviderCopy(plan);const rejected=assert.rejects(pending);
 await entered;revokeProviderCopy(plan);release();await rejected;unchanged(source,destination);
});
test('same remote connection and canonical target path reject aliases across provider namespaces',async()=>{
 const source=fixture('source-provider',{'a.txt':'A'}),destination=fixture('destination-provider',{'folder':null,'folder/a.txt':'A'}),connection={};
 source.provider.connection=connection;destination.provider.connection=connection;source.provider.root='/folder';destination.provider.root='/';
 await assert.rejects(prepareProviderCopy(source.provider,destination.provider,[mapping('a.txt','folder/a.txt')]));unchanged(source,destination);
});
test('review data is immutable and unrelated root timestamp changes do not invalidate a plan',async()=>{
 const source=fixture('s',{'a.txt':'a'}),destination=fixture('d'),plan=await prepareProviderCopy(source.provider,destination.provider,[mapping('a.txt')]);
 assert.equal(Object.isFrozen(plan),true);assert.equal(Object.isFrozen(plan.operations),true);assert.equal(Object.isFrozen(plan.operations[0]),true);
 assert.throws(()=>{plan.operations[0].target='elsewhere';},TypeError);
 source.state.root.stamp='new unrelated root stamp';destination.state.root.stamp='new unrelated root stamp';await revalidateProviderCopy(plan);unchanged(source,destination);
});
