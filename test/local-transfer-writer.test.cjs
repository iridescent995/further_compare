'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {FolderService}=require('../desktop/folders.cjs');
const {localFolderEndpoint}=require('../desktop/provider-folder-service.cjs');
const {snapshotProviderFile}=require('../desktop/provider-file-snapshot.cjs');
const {transferFileToLocal}=require('../desktop/local-transfer-writer.cjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function sourceFixture(bytes){
 const state={bytes:Buffer.from(bytes),opened:0,closed:0,read:null,mode:0o100640,mtime:1700000000123};
 const metadata=()=>({path:'input.bin',kind:'file',identity:'source-file',stamp:'same-weak-metadata',size:state.bytes.length,mode:state.mode,mtime:state.mtime});
 const provider={inspectRoot:async()=>({path:'source-root',identity:'source-root-id'}),inspectEntry:async relative=>{assert.equal(relative,'input.bin');return metadata();},openFileReader:async relative=>{assert.equal(relative,'input.bin');state.opened++;const bytes=Buffer.from(state.bytes);let offset=0;return {metadata:metadata(),read:async max=>{await state.read?.(offset);const chunk=bytes.subarray(offset,offset+max);offset+=chunk.length;return chunk.length?new Uint8Array(chunk):null;},validate:async()=>metadata(),close:async()=>{state.closed++;}};}};
 return {provider,state};
}
async function setup(t,bytes=Buffer.from('new'),replace=true){
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-local-transfer-')));t.after(()=>fs.rm(base,{recursive:true,force:true}));const root=path.join(base,'target');await fs.mkdir(root);const service=new FolderService(path.join(base,'backups'));await service.select('b',root);const source=sourceFixture(bytes),sourceObservation=await snapshotProviderFile(source.provider,'input.bin');const target=path.join(root,'output.bin');if(replace)await fs.writeFile(target,'old');const endpoint=localFolderEndpoint(service,'b'),targetObservation=replace?await snapshotProviderFile(endpoint,'output.bin'):null;
 return {base,root,target,service,source,sourceObservation,targetObservation,endpoint};
}
const transfer=(f,options)=>transferFileToLocal(f.source.provider,'input.bin',f.sourceObservation,f.service,'b','output.bin',f.targetObservation,options);
const stages=async f=>(await fs.readdir(f.root)).filter(name=>name.startsWith('.further-transfer-'));
const closed=f=>assert.equal(f.source.state.opened,f.source.state.closed);
test('exact large binary create and replace stream Uint8Array source without text limits',async t=>{
 const bytes=Buffer.alloc(10*1024*1024+17,0xab);bytes[0]=0;bytes[5]=255;
 for(const replace of [false,true]){const f=await setup(t,bytes,replace),result=await transfer(f);assert.deepEqual(await fs.readFile(f.target),bytes);assert.equal(result.sha256,hash(bytes));assert.equal(result.byteLength,bytes.length);assert.equal(result.observation.sha256,result.sha256);assert.deepEqual(await stages(f),[]);closed(f);}
});
test('empty files create and replace exactly and preserve source mode and modification time',async t=>{
 for(const replace of [false,true]){const f=await setup(t,Buffer.alloc(0),replace),result=await transfer(f);assert.equal((await fs.stat(f.target)).size,0);assert.equal(result.sha256,hash(Buffer.alloc(0)));const stat=await fs.stat(f.target);if(process.platform!=='win32')assert.equal(stat.mode&0o777,0o640);assert.ok(Math.abs(stat.mtimeMs-f.source.state.mtime)<1);assert.deepEqual(await stages(f),[]);closed(f);}
});
test('same-size source mutation after review preserves the destination',async t=>{
 const f=await setup(t);f.source.state.bytes=Buffer.from('BAD');await assert.rejects(transfer(f),{code:'STALE_SOURCE'});assert.equal(await fs.readFile(f.target,'utf8'),'old');assert.deepEqual(await stages(f),[]);closed(f);
});
test('same-size destination mutation after review cannot overwrite user changes',async t=>{
 const f=await setup(t),before=await fs.stat(f.target);await fs.writeFile(f.target,'BAD');await fs.utimes(f.target,before.atime,before.mtime);await assert.rejects(transfer(f));assert.equal(await fs.readFile(f.target,'utf8'),'BAD');assert.deepEqual(await stages(f),[]);closed(f);
});
test('source mutation during streaming rejects publication and cleans the private stage',async t=>{
 const f=await setup(t);let changed=false;f.source.state.read=async()=>{if(!changed&&(await stages(f)).length){f.source.state.bytes=Buffer.from('BAD');changed=true;}};
 await assert.rejects(transfer(f),{code:'STALE_SOURCE'});assert.equal(changed,true);assert.equal(await fs.readFile(f.target,'utf8'),'old');assert.deepEqual(await stages(f),[]);closed(f);
});
test('new destination appearing during final source validation is preserved',async t=>{
 const f=await setup(t,Buffer.from('new'),false);let appeared=false;
 f.source.state.read=async()=>{if(appeared)return;for(const name of await stages(f)){if((await fs.stat(path.join(f.root,name))).size===3){await fs.writeFile(f.target,'external new file',{flag:'wx'});appeared=true;break;}}};
 await assert.rejects(transfer(f));assert.equal(appeared,true);assert.equal(await fs.readFile(f.target,'utf8'),'external new file');assert.deepEqual(await stages(f),[]);closed(f);
});
test('stage corruption during final source reread is rejected before replacing target',async t=>{
 const f=await setup(t);let corrupted=false;
 f.source.state.read=async()=>{if(corrupted)return;for(const name of await stages(f)){const stage=path.join(f.root,name);if((await fs.stat(stage)).size===3){await fs.writeFile(stage,'BAD');corrupted=true;break;}}};
 await assert.rejects(transfer(f));assert.equal(corrupted,true);assert.equal(await fs.readFile(f.target,'utf8'),'old');closed(f);
});
test('pre-abort and cancellation during source reads preserve original and clean stages',async t=>{
 for(const during of [false,true]){const f=await setup(t),controller=new AbortController();if(during)f.source.state.read=async()=>{if((await stages(f)).length)controller.abort();};else controller.abort();await assert.rejects(transfer(f,{signal:controller.signal}),{code:'ABORT_ERR'});assert.equal(await fs.readFile(f.target,'utf8'),'old');assert.deepEqual(await stages(f),[]);closed(f);}
});
test('source read failure after opening stage preserves original and releases handles',async t=>{
 const f=await setup(t);f.source.state.read=async()=>{if((await stages(f)).length)throw Error('source unavailable');};await assert.rejects(transfer(f),/source unavailable/);assert.equal(await fs.readFile(f.target,'utf8'),'old');assert.deepEqual(await stages(f),[]);closed(f);
});
test('symlink destination and symlink parent are not followed',async t=>{
 const f=await setup(t,Buffer.from('new'),false),outside=path.join(f.base,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'kept.bin'),'keep');await fs.symlink(path.join(outside,'kept.bin'),f.target);await assert.rejects(transfer(f));assert.equal(await fs.readFile(path.join(outside,'kept.bin'),'utf8'),'keep');await fs.unlink(f.target);await fs.symlink(outside,path.join(f.root,'linked'));
 await assert.rejects(transferFileToLocal(f.source.provider,'input.bin',f.sourceObservation,f.service,'b','linked/new.bin',null));assert.deepEqual(await fs.readdir(outside),['kept.bin']);assert.deepEqual(await stages(f),[]);closed(f);
});
test('case and Unicode-normalization aliases reject apparent new targets',async t=>{
 for(const [existing,target]of [['Report.bin','report.bin'],['café.bin','cafe\u0301.bin']]){const f=await setup(t,Buffer.from('new'),false);await fs.writeFile(path.join(f.root,existing),'keep');await assert.rejects(transferFileToLocal(f.source.provider,'input.bin',f.sourceObservation,f.service,'b',target,null));assert.equal(await fs.readFile(path.join(f.root,existing),'utf8'),'keep');assert.deepEqual(await stages(f),[]);closed(f);}
});
test('a local source hardlinked to the target cannot be copied over itself',async t=>{
 const f=await setup(t),sourcePath=path.join(f.root,'source.bin');await fs.link(f.target,sourcePath);const observation=await snapshotProviderFile(f.endpoint,'source.bin');await assert.rejects(transferFileToLocal(f.endpoint,'source.bin',observation,f.service,'b','output.bin',f.targetObservation));assert.equal(await fs.readFile(f.target,'utf8'),'old');assert.equal(await fs.readFile(sourcePath,'utf8'),'old');assert.deepEqual(await stages(f),[]);
});
test('Windows path validator rejects reserved components, streams and ambiguous spellings on any host',()=>{
 const {validateLocalTransferPath}=require('../desktop/local-transfer-writer.cjs');
 for(const value of ['CON','nested/NUL.txt','aux','PRN.log','COM1.bin','LPT9','COM¹.txt','LPT²','nested/file:stream','trailing.','trailing ','a<b','a>b','a"b','a|b','a?b','a*b','control\u0001.bin'])assert.throws(()=>validateLocalTransferPath(value,'win32'),/Windows/);
 for(const value of ['folder/file.txt','café #1.bin','COM10.txt','console.txt','auxiliary.txt'])assert.equal(validateLocalTransferPath(value,'win32'),value);
});
test('relative-path rules apply on every platform while POSIX permits literal colon filenames',()=>{
 const {validateLocalTransferPath}=require('../desktop/local-transfer-writer.cjs');
 for(const platform of ['win32','darwin','linux'])for(const value of ['',null,'/absolute','../outside','a/../b','a//b','a/./b','a\\b','a\0b'])assert.throws(()=>validateLocalTransferPath(value,platform));
 for(const platform of ['darwin','linux'])assert.equal(validateLocalTransferPath('résumé:notes.bin',platform),'résumé:notes.bin');
});
