'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {stageProviderFolderOpen}=require('../desktop/provider-folder-open.cjs');
const {MAX_DATA_BYTES,MAX_TEXT_BYTES}=require('../desktop/sessions.cjs');
function fixture(content={a:Buffer.from('left'),b:Buffer.from('right')}){
 const paths={a:'nested/left.txt',b:'right.txt'},state={closed:[],opened:[],read:[],versions:{a:1,b:1},mutate:null,invalid:false};
 const info=side=>({path:paths[side],kind:'file',identity:side,stamp:String(state.versions[side]),size:content[side].length,strongRevision:false});
 const service={roots:{a:'opaque:left',b:'opaque:right'},inspectRoot:async side=>({path:service.roots[side],identity:side}),inspectEntry:async side=>info(side),openFileReader:async(side,relative,{signal})=>{
  state.opened.push(side);let offset=0;
  return {metadata:info(side),read:async max=>{state.read.push({side,max});state.mutate?.(side);if(signal?.aborted)throw Object.assign(Error('Cancelled'),{code:'ABORT_ERR'});if(state.invalid)return Buffer.alloc(0);if(offset===content[side].length)return null;const chunk=content[side].subarray(offset,offset+Math.min(2,max));offset+=chunk.length;return chunk;},validate:async()=>info(side),close:async()=>{state.closed.push(side);}};
 }};return {service,state,paths,content};
}
test('stages short reads on both sides, preserves explicit encodings and supplies no save paths',async()=>{
 const f=fixture({a:Buffer.from([0xe9]),b:Buffer.from('é')});const result=await stageProviderFolderOpen(f.service,f.paths,{mode:'text',encoding:{a:'latin1',b:'utf8'}});assert.equal(result.a.content,'é');assert.equal(result.b.content,'é');assert.equal(result.mode,'text-compare');assert.equal(result.a.path,undefined);assert.equal(result.b.path,undefined);assert.deepEqual(f.state.closed,['a','b']);assert.equal(result.observations.a.metadata.strongRevision,false);
 for(const side of ['a','b'])assert.equal(result.observations[side].sha256,require('node:crypto').createHash('sha256').update(f.content[side]).digest('hex'));
 assert.notEqual(result.observations.a.sha256,result.observations.b.sha256,'Equal decoded text must retain distinct source-byte baselines');
 assert.equal(result.a.sha256,undefined,'Native baseline must not leak into renderer input');
});
test('one-sided auto dispatch preserves file type without inventing an absent payload',async()=>{
 const f=fixture();f.paths.a='nested/picture.png';const result=await stageProviderFolderOpen(f.service,{a:f.paths.a,b:null});assert.equal(result.mode,'picture-compare');assert.equal(result.b,null);assert.equal(result.a.data,Buffer.from('left').toString('base64'));assert.deepEqual(f.state.opened,['a']);
});
test('auto undecodable text falls back to binary while explicit text fails and closes readers',async()=>{
 const f=fixture({a:Buffer.from([0,255]),b:Buffer.from('text')});const result=await stageProviderFolderOpen(f.service,f.paths);assert.equal(result.mode,'binary-compare');assert.equal(result.b.content,undefined);await assert.rejects(stageProviderFolderOpen(f.service,f.paths,{mode:'text'}),/UTF|Binary/);assert.equal(f.state.closed.length,4);
});
test('right-side read mutation of already-read left rejects the whole staged pair',async()=>{
 const f=fixture();f.state.mutate=side=>{if(side==='b')f.state.versions.a++;};await assert.rejects(stageProviderFolderOpen(f.service,f.paths),/changed/);assert.deepEqual(f.state.closed,['a','b']);
});
test('final root mutation cannot publish staged bytes',async()=>{
 const f=fixture();f.state.mutate=side=>{if(side==='b')f.service.roots.a='replacement';};await assert.rejects(stageProviderFolderOpen(f.service,f.paths),/root changed/);assert.deepEqual(f.state.closed,['a','b']);
});
test('cancellation while reading the second side closes every started reader',async()=>{
 const f=fixture(),controller=new AbortController();f.state.mutate=side=>{if(side==='b')controller.abort();};await assert.rejects(stageProviderFolderOpen(f.service,f.paths,{signal:controller.signal}),{code:'ABORT_ERR'});assert.deepEqual(f.state.closed,['a','b']);
});
test('metadata limits reject before opening readers and malformed chunks never publish',async()=>{
 for(const [mode,size] of [['text',MAX_TEXT_BYTES+1],['data',MAX_DATA_BYTES+1]]){const f=fixture(),inspect=f.service.inspectEntry;f.service.inspectEntry=async side=>({...await inspect(side),size});await assert.rejects(stageProviderFolderOpen(f.service,f.paths,{mode}),/exceeds/);assert.equal(f.state.opened.length,0);}
 const f=fixture();f.state.invalid=true;await assert.rejects(stageProviderFolderOpen(f.service,f.paths),/chunk/);assert.deepEqual(f.state.closed,['a']);
});
test('relative traversal and empty pairs are rejected before provider access',async()=>{
 const f=fixture();for(const pairs of [{a:'../outside',b:null},{a:'/outside',b:null},{a:'a\\b',b:null},{a:null,b:null}])await assert.rejects(stageProviderFolderOpen(f.service,pairs),/file pair/);assert.equal(f.state.opened.length,0);
});
test('mixed native local reader and opaque remote reader stage one child safely',async t=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {FolderService}=require('../desktop/folders.cjs'),{ProviderFolderService,localFolderEndpoint}=require('../desktop/provider-folder-service.cjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'provider-open-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'local'));await fs.writeFile(path.join(root,'local','local.txt'),'local content');
 const local=new FolderService(path.join(root,'backup'));await local.select('a',path.join(root,'local'));
 const remote=fixture({a:Buffer.from('unused'),b:Buffer.from('remote content')});
 const service=new ProviderFolderService({a:localFolderEndpoint(local,'a'),b:{rootId:'opaque:remote',inspectRoot:()=>remote.service.inspectRoot('b'),inspectEntry:()=>remote.service.inspectEntry('b'),openFileReader:(relative,options)=>remote.service.openFileReader('b',relative,options)}});
 const result=await stageProviderFolderOpen(service,{a:'local.txt',b:remote.paths.b},{mode:'text'});assert.equal(result.a.content,'local content');assert.equal(result.b.content,'remote content');assert.equal(result.a.path,undefined);assert.equal(result.b.path,undefined);assert.equal(result.observations.a.metadata.strongRevision,true);assert.equal(result.observations.b.metadata.strongRevision,false);assert.deepEqual(remote.state.closed,['b']);
});

test('auto text above the text ceiling stages binary and explicit text rejects before opening',async()=>{
 const bytes=Buffer.alloc(MAX_TEXT_BYTES+1,65),info={path:'large.txt',kind:'file',identity:'large',stamp:'1',size:bytes.length};let opened=0,closed=0;
 const service={roots:{a:'opaque'},inspectRoot:async()=>({path:'opaque',identity:'root'}),inspectEntry:async()=>info,openFileReader:async()=>{opened++;let offset=0;return {metadata:info,read:async requested=>{if(offset===bytes.length)return null;const chunk=bytes.subarray(offset,offset+requested);offset+=chunk.length;return chunk;},validate:async()=>info,close:async()=>{closed++;}};}};
 const result=await stageProviderFolderOpen(service,{a:'large.txt',b:null});assert.equal(result.mode,'binary-compare');assert.equal(result.a.content,undefined);assert.equal(Buffer.from(result.a.data,'base64').length,bytes.length);assert.equal(closed,1);await assert.rejects(stageProviderFolderOpen(service,{a:'large.txt',b:null},{mode:'text'}),/10 MB/);assert.equal(opened,1);
});
test('a reader exceeding its final tiny request is rejected and closed',async()=>{
 const info={path:'limit.bin',kind:'file',identity:'limit',stamp:'1',size:MAX_TEXT_BYTES};let remaining=MAX_TEXT_BYTES,closed=false;
 const service={roots:{a:'opaque'},inspectRoot:async()=>({path:'opaque',identity:'root'}),inspectEntry:async()=>info,openFileReader:async()=>({metadata:info,read:async requested=>{if(!remaining){assert.equal(requested,1);return Buffer.alloc(2);}const count=Math.min(requested,remaining);remaining-=count;return Buffer.alloc(count,65);},validate:async()=>info,close:async()=>{closed=true;}})};
 await assert.rejects(stageProviderFolderOpen(service,{a:'limit.bin',b:null},{mode:'text'}),/Invalid provider file chunk/);assert.equal(closed,true);
});
