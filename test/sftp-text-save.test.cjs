'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {prepareSftpTextSave:prepare,commitSftpTextSave:commit}=require('../desktop/sftp-text-save.cjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(){
 const files=new Map([['file.txt',{bytes:Buffer.from('old'),mode:0o100640}]]),calls=[],handles=new Map(),controls={};let serial=0;
 const root={path:'root-id',identity:'root-identity',stamp:'root-stamp'};
 const metadata=(relative,item)=>({path:relative,kind:'file',size:item.bytes.length,mode:item.mode,identity:relative,stamp:[relative,item.bytes.length,item.mode].join(':'),mtime:0,uid:1,gid:1});
 const provider={root:'/root',connection:{capabilities:{atomicRename:true,fsync:true},closed:false},
  async inspectRoot(){return {...root};},
  async inspectEntry(relative){const item=files.get(relative);return item?metadata(relative,item):null;},
  metadata(relative,attrs){return {...attrs,path:relative};},
  async openFileReader(relative){const item=files.get(relative);if(!item)throw Error('Missing');const before=metadata(relative,item),bytes=Buffer.from(item.bytes);let offset=0;return {metadata:before,async read(length){const chunk=bytes.subarray(offset,offset+length);offset+=chunk.length;return chunk.length?chunk:null;},async validate(){return provider.inspectEntry(relative);},async close(){}};},
  async closeHandle(handle){return provider.request('close',[handle]);},
  async request(method,args){calls.push([method,...args]);controls.before?.(method,args);if(controls.fail===method)throw Object.assign(Error('Failed'),{code:4});
   const relative=value=>value.slice('/root/'.length),item=()=>files.get(handles.get(args[0].toString()));
   if(method==='open'){assert.equal(args[1],'wx');assert.equal(args[2],0o600);const name=relative(args[0]);assert(!files.has(name));files.set(name,{bytes:Buffer.alloc(0),mode:0o100600});const handle=Buffer.from(String(++serial));handles.set(handle.toString(),name);return [handle];}
   if(method==='write'){const target=item(),[,buffer,offset,length,position]=args;const bytes=Buffer.alloc(Math.max(target.bytes.length,position+length));target.bytes.copy(bytes);buffer.copy(bytes,position,offset,offset+length);target.bytes=bytes;return [];}
   if(method==='fstat')return [metadata(handles.get(args[0].toString()),item())];
   if(method==='fsetstat'){item().mode=0o100000|args[1].mode;return [];}
   if(method==='ext_openssh_fsync')return [];
   if(method==='close'){handles.delete(args[0].toString());return [];}
   if(method==='unlink'){assert.notEqual(relative(args[0]),'file.txt');files.delete(relative(args[0]));return [];}
   if(method==='ext_openssh_rename'){files.set(relative(args[1]),files.get(relative(args[0])));files.delete(relative(args[0]));if(controls.loseRenameAck){provider.connection.closed=true;throw Object.assign(Error('Closed'),{code:controls.lostAckCode??'CONNECTION_CLOSED'});}if(controls.mutateAfterRename)files.get('file.txt').bytes=Buffer.from('tampered');return [];}
   throw Error('Unexpected method '+method);
  }};
 const origin={provider,relative:'file.txt',observation:{root:{...root},metadata:metadata('file.txt',files.get('file.txt')),sha256:hash(Buffer.from('old'))}};
 return {provider,origin,files,calls,controls,handles};
}
test('prepare writes nothing; commit exact bounded bytes, preserves mode and returns refreshed digest',async()=>{
 const f=fixture(),bytes=Buffer.alloc(140000,0xab),plan=await prepare(f.origin,bytes);bytes.fill(0);
 assert.equal(f.calls.length,0);const saved=await commit(plan);
 assert.deepEqual(f.files.get('file.txt').bytes,Buffer.alloc(140000,0xab));assert.equal(f.files.size,1);assert.equal(f.files.get('file.txt').mode,0o100640);
 assert.equal(saved.sha256,hash(f.files.get('file.txt').bytes));assert.equal(saved.observation.sha256,saved.sha256);assert.equal(f.handles.size,0);
 assert.deepEqual(f.calls.filter(c=>c[0]==='write').map(c=>c[4]),[65536,65536,8928]);
 await assert.rejects(commit(plan),{code:'INVALID_SAVE_PLAN'});
 const again=await prepare({...f.origin,observation:saved.observation},Buffer.from('again'));await commit(again);assert.equal(f.files.get('file.txt').bytes.toString(),'again');
});
test('same-size mutation with identical metadata is rejected in prepare and after review',async()=>{
 for(const phase of ['prepare','commit']){const f=fixture();let plan;if(phase==='commit')plan=await prepare(f.origin,Buffer.from('new'));f.files.get('file.txt').bytes=Buffer.from('BAD');await assert.rejects(phase==='prepare'?prepare(f.origin,Buffer.from('new')):commit(plan),{code:'STALE_SOURCE'});assert.equal(f.files.get('file.txt').bytes.toString(),'BAD');assert.equal(f.calls.length,0);}
});
test('unsupported atomic replacement is rejected before staging',async()=>{
 const f=fixture();f.provider.connection.capabilities.atomicRename=false;await assert.rejects(prepare(f.origin,Buffer.from('new')),{code:'ATOMIC_RENAME_UNAVAILABLE'});assert.equal(f.calls.length,0);
});
test('write, permissions, fsync and close failures never replace original',async()=>{
 for(const method of ['write','fsetstat','ext_openssh_fsync','close']){const f=fixture(),plan=await prepare(f.origin,Buffer.from('new'));f.controls.fail=method;await assert.rejects(commit(plan));assert.equal(f.files.get('file.txt').bytes.toString(),'old');assert(!f.calls.some(c=>c[0]==='ext_openssh_rename'));assert.equal(f.files.size,1);}
});
test('original mutation during staging rejects publication and cleans stage',async()=>{
 const f=fixture(),plan=await prepare(f.origin,Buffer.from('new'));f.controls.before=method=>{if(method==='write')f.files.get('file.txt').bytes=Buffer.from('BAD');};
 await assert.rejects(commit(plan),{code:'STALE_SOURCE'});assert.equal(f.files.get('file.txt').bytes.toString(),'BAD');assert.equal(f.files.size,1);
});
test('server rename rejection preserves original and cleans stage',async()=>{
 const f=fixture(),plan=await prepare(f.origin,Buffer.from('new'));f.controls.fail='ext_openssh_rename';await assert.rejects(commit(plan),{code:4});assert.equal(f.files.get('file.txt').bytes.toString(),'old');assert.equal(f.files.size,1);
});
test('lost rename acknowledgement reports unknown outcome and never retries',async()=>{
 const f=fixture(),plan=await prepare(f.origin,Buffer.from('new'));f.controls.loseRenameAck=true;await assert.rejects(commit(plan),{code:'SAVE_OUTCOME_UNKNOWN'});assert.equal(f.files.get('file.txt').bytes.toString(),'new');assert.equal(f.calls.filter(c=>c[0]==='ext_openssh_rename').length,1);
});
test('acknowledged save with failed verification is distinct from prepublish failure',async()=>{
 const f=fixture(),plan=await prepare(f.origin,Buffer.from('new'));f.controls.mutateAfterRename=true;await assert.rejects(commit(plan),{code:'SAVE_VERIFICATION_FAILED'});assert.equal(f.files.get('file.txt').bytes.toString(),'tampered');assert(!f.calls.some(c=>c[0]==='unlink'));
});
test('cancel before commit performs no writes; absent fsync capability is supported',async()=>{
 const f=fixture(),plan=await prepare(f.origin,Buffer.from('new')),controller=new AbortController();controller.abort();await assert.rejects(commit(plan,{signal:controller.signal}),{code:'ABORT_ERR'});assert.equal(f.calls.length,0);
 const g=fixture();g.provider.connection.capabilities.fsync=false;await commit(await prepare(g.origin,Buffer.from('new')));assert(!g.calls.some(c=>c[0]==='ext_openssh_fsync'));
});
test('different stage on cleanup is never unlinked',async()=>{
 const f=fixture(),plan=await prepare(f.origin,Buffer.from('new'));const original=f.provider.inspectEntry;let replaced=false;
 f.provider.inspectEntry=async relative=>{if(f.controls.fail==='ext_openssh_rename'&&f.calls.some(c=>c[0]==='ext_openssh_rename')&&relative!=='file.txt'){replaced=true;return {...await original(relative),stamp:'replacement'};}return original(relative);};
 f.controls.fail='ext_openssh_rename';await assert.rejects(commit(plan));assert(replaced);assert(!f.calls.some(c=>c[0]==='unlink'));assert.equal(f.files.get('file.txt').bytes.toString(),'old');
});
test('corrupt stage fails verification without replacing source',async()=>{
 const f=fixture(),plan=await prepare(f.origin,Buffer.from('new')),original=f.provider.request;
 f.provider.request=async(method,args,...rest)=>{const result=await original(method,args,...rest);if(method==='write'){const relative=[...f.files.keys()].find(name=>name!=='file.txt');f.files.get(relative).bytes=Buffer.from('BAD');}return result;};
 await assert.rejects(commit(plan),/did not verify/);assert.equal(f.files.get('file.txt').bytes.toString(),'old');assert.equal(f.files.size,1);assert(!f.calls.some(c=>c[0]==='ext_openssh_rename'));
});
test('empty output saves and verifies without a write request',async()=>{
 const f=fixture();const out=await commit(await prepare(f.origin,Buffer.alloc(0)));assert.equal(f.files.get('file.txt').bytes.length,0);assert.equal(out.sha256,hash(Buffer.alloc(0)));assert(!f.calls.some(c=>c[0]==='write'));
});

test('numeric SFTP connection-loss statuses after rename report unknown save outcome',async()=>{
 for(const code of [6,7]){const f=fixture(),plan=await prepare(f.origin,Buffer.from('new'));f.controls.loseRenameAck=true;f.controls.lostAckCode=code;await assert.rejects(commit(plan),{code:'SAVE_OUTCOME_UNKNOWN'});assert.equal(f.files.get('file.txt').bytes.toString(),'new');assert.equal(f.calls.filter(c=>c[0]==='ext_openssh_rename').length,1);}
});
