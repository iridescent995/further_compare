'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {snapshotProviderFile}=require('../desktop/provider-file-snapshot.cjs');
const {transferFileToSftp}=require('../desktop/sftp-transfer-writer.cjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function endpoint(label,initial={}){
 const files=new Map(Object.entries(initial).map(([name,bytes])=>[name,{bytes:Buffer.from(bytes),mode:0o100640}])),calls=[],handles=new Map(),controls={};let serial=0,readers=0,closedReaders=0;
 const root={path:'root:'+label,identity:'root-identity:'+label,stamp:'root-stamp'};
 const metadata=(relative,item)=>({path:relative,kind:'file',size:item.bytes.length,mode:item.mode,identity:label+':'+relative,stamp:[label,relative,item.bytes.length,item.mode].join(':'),mtime:1700000000000,uid:1,gid:1});
 const provider={root:'/'+label,connection:{capabilities:{atomicRename:true,fsync:true},closed:false},
  async inspectRoot(){return {...root};},
  async inspectEntry(relative){controls.inspect?.(relative);const item=files.get(relative);return item?metadata(relative,item):null;},
  metadata(relative,attrs){return {...attrs,path:relative};},
  async openFileReader(relative){const item=files.get(relative);if(!item)throw Error('Missing file');readers++;const before=metadata(relative,item),bytes=Buffer.from(item.bytes);let offset=0;return {metadata:before,async read(length){await controls.read?.(relative,offset);const chunk=bytes.subarray(offset,offset+length);offset+=chunk.length;return chunk.length?(controls.uint8Array?new Uint8Array(chunk):chunk):null;},async validate(){return provider.inspectEntry(relative);},async close(){closedReaders++;}};},
  async closeHandle(handle){return provider.request('close',[handle]);},
  async request(method,args){calls.push([method,...args]);await controls.before?.(method,args);if(controls.fail===method)throw Object.assign(Error('Server rejected '+method),{code:4});
   const relative=value=>value.slice(provider.root.length+1),item=()=>files.get(handles.get(args[0].toString()));
   if(method==='open'){assert.equal(args[1],'wx');assert.equal(args[2],0o600);const name=relative(args[0]);if(files.has(name))throw Object.assign(Error('Exists'),{code:4});files.set(name,{bytes:Buffer.alloc(0),mode:0o100600});const handle=Buffer.from(String(++serial));handles.set(handle.toString(),name);return [handle];}
   if(method==='write'){const target=item(),[,buffer,offset,length,position]=args;assert.ok(length>0&&length<=65536);assert.equal(offset,0);assert.equal(Buffer.isBuffer(buffer),true,'ssh2 writes require Buffer chunks');const bytes=Buffer.alloc(Math.max(target.bytes.length,position+length));target.bytes.copy(bytes);buffer.copy(bytes,position,offset,offset+length);target.bytes=bytes;if(controls.corruptStage)target.bytes[0]^=0xff;return [];}
   if(method==='fstat')return [metadata(handles.get(args[0].toString()),item())];
   if(method==='fsetstat'){if(args[1].mode!==undefined)item().mode=0o100000|args[1].mode;return [];}
   if(method==='ext_openssh_fsync')return [];
   if(method==='close'){handles.delete(args[0].toString());return [];}
   if(method==='unlink'){assert.ok(relative(args[0]).includes('.further-transfer-'),'Only owned stages may be deleted');files.delete(relative(args[0]));return [];}
   if(method==='rename'||method==='ext_openssh_rename'){const from=relative(args[0]),to=relative(args[1]);if(method==='rename'&&files.has(to))throw Object.assign(Error('Target already exists'),{code:4});files.set(to,files.get(from));files.delete(from);if(controls.loseRenameAck){provider.connection.closed=true;throw Object.assign(Error('Connection lost'),{code:'CONNECTION_CLOSED'});}if(controls.mutateAfterRename)files.get(to).bytes=Buffer.from('tampered');return [];}
   throw Error('Unexpected method '+method);
  }
 };
 return {provider,files,calls,handles,controls,get readers(){return readers;},get closedReaders(){return closedReaders;}};
}
async function setup(bytes=Buffer.from('new'),replace=true){const source=endpoint('source',{'input.bin':bytes}),destination=endpoint('destination',replace?{'output.bin':Buffer.from('old')}:{}) ;return {source,destination,sourceObservation:await snapshotProviderFile(source.provider,'input.bin'),targetObservation:replace?await snapshotProviderFile(destination.provider,'output.bin'):null};}
const transfer=(f,options)=>transferFileToSftp(f.source.provider,'input.bin',f.sourceObservation,f.destination.provider,'output.bin',f.targetObservation,options);
function closed(f){assert.equal(f.source.readers,f.source.closedReaders);assert.equal(f.destination.readers,f.destination.closedReaders);assert.equal(f.destination.handles.size,0);assert.equal(f.source.calls.length,0,'Source endpoint must remain read-only');}
test('streams exact binary above 10 MiB in bounded writes for create and replace',async()=>{
 const bytes=Buffer.alloc(10*1024*1024+31,0xab);bytes[7]=0;bytes[11]=255;
 for(const replace of [false,true]){const f=await setup(bytes,replace),result=await transfer(f);assert.deepEqual(f.destination.files.get('output.bin').bytes,bytes);assert.equal(result.sha256,hash(bytes));assert.equal(result.observation.sha256,result.sha256);assert.equal(result.byteLength,bytes.length);assert.equal(f.destination.files.size,1);assert.equal(f.destination.calls.filter(call=>call[0]===(replace?'ext_openssh_rename':'rename')).length,1);assert.ok(f.destination.calls.filter(call=>call[0]==='write').every(call=>call[4]<=65536));closed(f);}
});
test('empty create and replace verify without issuing a write',async()=>{
 for(const replace of [false,true]){const f=await setup(Buffer.alloc(0),replace),result=await transfer(f);assert.equal(result.sha256,hash(Buffer.alloc(0)));assert.equal(result.byteLength,0);assert.equal(f.destination.files.get('output.bin').bytes.length,0);assert.equal(f.destination.calls.some(call=>call[0]==='write'),false);closed(f);}
});
test('replacement requires atomic rename but create works without extension or fsync',async()=>{
 const f=await setup();f.destination.provider.connection.capabilities.atomicRename=false;await assert.rejects(transfer(f),{code:'ATOMIC_RENAME_UNAVAILABLE'});assert.equal(f.destination.calls.length,0);closed(f);
 const g=await setup(Buffer.from('new'),false);g.destination.provider.connection.capabilities={atomicRename:false,fsync:false};await transfer(g);assert.equal(g.destination.calls.some(call=>call[0]==='ext_openssh_fsync'),false);assert.ok(g.destination.calls.some(call=>call[0]==='rename'));closed(g);
});
test('same-size same-metadata source or destination edits after review prevent staging',async()=>{
 for(const side of ['source','destination']){const f=await setup();f[side].files.get(side==='source'?'input.bin':'output.bin').bytes=Buffer.from('BAD');await assert.rejects(transfer(f),{code:'STALE_SOURCE'});assert.equal(f.destination.calls.length,0);assert.equal(f.destination.files.get('output.bin').bytes.toString(),side==='destination'?'BAD':'old');closed(f);}
});
test('source or target mutation during staging prevents publication and cleans stage',async()=>{
 for(const side of ['source','destination']){const f=await setup();f.destination.controls.before=method=>{if(method==='write')f[side].files.get(side==='source'?'input.bin':'output.bin').bytes=Buffer.from('BAD');};await assert.rejects(transfer(f),{code:'STALE_SOURCE'});assert.equal(f.destination.files.size,1);assert.equal(f.destination.files.get('output.bin').bytes.toString(),side==='destination'?'BAD':'old');assert.equal(f.destination.calls.some(call=>/rename/.test(call[0])),false);closed(f);}
});
test('new target arriving immediately before no-overwrite rename is preserved',async()=>{
 const f=await setup(Buffer.from('new'),false);f.destination.controls.before=method=>{if(method==='rename')f.destination.files.set('output.bin',{bytes:Buffer.from('someone else'),mode:0o100644});};await assert.rejects(transfer(f),{code:4});assert.equal(f.destination.files.get('output.bin').bytes.toString(),'someone else');assert.equal(f.destination.files.size,1);closed(f);
});
test('corrupt staged bytes cannot replace the approved target',async()=>{
 const f=await setup();f.destination.controls.corruptStage=true;await assert.rejects(transfer(f));assert.equal(f.destination.files.get('output.bin').bytes.toString(),'old');assert.equal(f.destination.files.size,1);assert.equal(f.destination.calls.some(call=>/rename/.test(call[0])),false);closed(f);
});
test('write and server rename failures clean stages and preserve original',async()=>{
 for(const method of ['write','ext_openssh_rename']){const f=await setup();f.destination.controls.fail=method;await assert.rejects(transfer(f),{code:4});assert.equal(f.destination.files.get('output.bin').bytes.toString(),'old');assert.equal(f.destination.files.size,1);closed(f);}
});
test('lost acknowledgement is unknown outcome and never automatically retried',async()=>{
 const f=await setup();f.destination.controls.loseRenameAck=true;await assert.rejects(transfer(f),{code:'TRANSFER_OUTCOME_UNKNOWN'});assert.equal(f.destination.files.get('output.bin').bytes.toString(),'new');assert.equal(f.destination.calls.filter(call=>/rename/.test(call[0])).length,1);assert.equal(f.destination.calls.some(call=>call[0]==='unlink'),false);closed(f);
});
test('acknowledged publication with failed verification is separately reported',async()=>{
 const f=await setup();f.destination.controls.mutateAfterRename=true;await assert.rejects(transfer(f),{code:'TRANSFER_VERIFICATION_FAILED'});assert.equal(f.destination.files.get('output.bin').bytes.toString(),'tampered');assert.equal(f.destination.calls.some(call=>call[0]==='unlink'),false);closed(f);
});
test('pre-abort writes nothing and cancellation during write closes and cleans stage',async()=>{
 for(const during of [false,true]){const f=await setup(),controller=new AbortController();if(during)f.destination.controls.before=method=>{if(method==='write')controller.abort();};else controller.abort();await assert.rejects(transfer(f,{signal:controller.signal}),{code:'ABORT_ERR'});assert.equal(f.destination.files.get('output.bin').bytes.toString(),'old');assert.equal(f.destination.files.size,1);if(!during)assert.equal(f.destination.calls.length,0);closed(f);}
});
test('Uint8Array source chunks are converted to the native SSH Buffer write contract',async()=>{
 const f=await setup(Buffer.from([0,255,128,2]));f.source.controls.uint8Array=true;await transfer(f);assert.deepEqual(f.destination.files.get('output.bin').bytes,Buffer.from([0,255,128,2]));closed(f);
});
test('stage corruption during final source reread is rejected before publication',async()=>{
 const f=await setup();let corrupted=false;
 f.source.controls.read=()=>{if(!corrupted&&f.destination.calls.some(call=>call[0]==='close')){const stage=[...f.destination.files.keys()].find(name=>name!=='output.bin');if(stage){f.destination.files.get(stage).bytes=Buffer.from('BAD');corrupted=true;}}};
 await assert.rejects(transfer(f));assert.equal(corrupted,true);assert.equal(f.destination.calls.some(call=>/rename/.test(call[0])),false);assert.equal(f.destination.files.get('output.bin').bytes.toString(),'old');closed(f);
});
test('source mode and modification time are applied, and permission or fsync failures prevent publication',async()=>{
 const f=await setup();await transfer(f);const attributes=f.destination.calls.find(call=>call[0]==='fsetstat')[2];assert.deepEqual(attributes,{mode:0o640,atime:1700000000,mtime:1700000000});assert.equal(f.destination.files.get('output.bin').mode,0o100640);closed(f);
 for(const method of ['fsetstat','ext_openssh_fsync']){const g=await setup();g.destination.controls.fail=method;await assert.rejects(transfer(g),{code:4});assert.equal(g.destination.files.get('output.bin').bytes.toString(),'old');assert.equal(g.destination.files.size,1);assert.equal(g.destination.calls.some(call=>/rename/.test(call[0])),false);closed(g);}
});
test('a visibly replaced temporary entry is never unlinked during cleanup',async()=>{
 const f=await setup(),inspect=f.destination.provider.inspectEntry;f.destination.controls.fail='ext_openssh_rename';let replaced=false;
 f.destination.provider.inspectEntry=async relative=>{const current=await inspect(relative);if(relative!=='output.bin'&&f.destination.calls.some(call=>call[0]==='ext_openssh_rename')){replaced=true;return {...current,identity:'external-replacement',stamp:'external-replacement'};}return current;};
 await assert.rejects(transfer(f));assert.equal(replaced,true);assert.equal(f.destination.calls.some(call=>call[0]==='unlink'),false);assert.equal(f.destination.files.get('output.bin').bytes.toString(),'old');closed(f);
});
test('numeric no-connection and connection-lost rename responses remain unknown outcomes without retry',async()=>{
 for(const code of [6,7])for(const acknowledgedOnServer of [false,true]){
  const f=await setup(),request=f.destination.provider.request;
  f.destination.provider.request=async(method,args,...rest)=>{
   if(method!=='ext_openssh_rename')return request(method,args,...rest);
   if(acknowledgedOnServer)await request(method,args,...rest);else f.destination.calls.push([method,...args]);
   throw Object.assign(Error('SFTP connection status'),{code});
  };
  await assert.rejects(transfer(f),{code:'TRANSFER_OUTCOME_UNKNOWN'});
  assert.equal(f.destination.calls.filter(call=>call[0]==='ext_openssh_rename').length,1);
  assert.equal(f.destination.files.get('output.bin').bytes.toString(),acknowledgedOnServer?'new':'old');
  closed(f);
 }
});
