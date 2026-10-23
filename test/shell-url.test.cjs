'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {parseShellURL,MAX_SHELL_URL_BYTES}=require('../desktop/shell-url.cjs');
const {ShellRequests}=require('../desktop/shell-requests.cjs');
const wire=json=>'furthercompare://shell/v1?payload='+Buffer.from(json).toString('base64url');
const url=(command,files)=>wire(JSON.stringify({command,files}));
test('shell URL preserves literal reserved characters, Unicode and path spelling',()=>{
  const files=[path.resolve('space # ? % & + \' " $ ü 😀.txt'),path.resolve('second.txt')];
  for(const command of ['--fc-set-left','--fc-compare-left','--fc-compare-selected']){
    const selected=command==='--fc-compare-selected'?files:files.slice(0,1);
    assert.deepEqual(parseShellURL(url(command,selected)),{command,files:selected});
  }
  assert.deepEqual(parseShellURL(wire('{ "files": ["/tmp/a"], "command": "--fc-set-left" }')),{command:'--fc-set-left',files:['/tmp/a']});
});
test('shell URL rejects alternate authorities, routes, parameters and encodings',()=>{
  const valid=url('--fc-set-left',['/tmp/a']);
  for(const bad of [null,42,'',valid+'\n',valid+'#x',valid+'&x=1',valid+'&payload=x',valid+'=',valid.replace('shell/','user@shell/'),valid.replace('shell/','shell:1/'),valid.replace('shell/','SHELL/'),valid.replace('/v1','/%761'),valid.replace('/v1','/x/../v1'),valid.replace('furthercompare:','https:'),' '+valid,valid.replace('payload=','payload=%'),valid+'a'.repeat(MAX_SHELL_URL_BYTES)]) assert.throws(()=>parseShellURL(bad));
  assert.throws(()=>parseShellURL('furthercompare://shell/v1?payload=_w')); // invalid UTF-8
  assert.throws(()=>parseShellURL('furthercompare://shell/v1?payload=Zh')); // noncanonical padding bits
  assert.throws(()=>parseShellURL(wire('\uFEFF'+JSON.stringify({command:'--fc-set-left',files:['/tmp/a']}))));
});
test('shell URL validates exact JSON schema, duplicate keys and absolute paths',()=>{
  for(const value of [null,[],{}, {command:'--fc-clear-left',files:[]},{command:'--fc-compare',files:['/a','/b']},{command:'--fc-set-left',files:['/a'],extra:true},{command:'--fc-set-left',files:[]},{command:'--fc-set-left',files:['/a','/b']},{command:'--fc-compare-selected',files:['/a']},{command:'--fc-set-left',files:['relative']},{command:'--fc-set-left',files:[7]},{command:'--fc-set-left',files:['/a\0b']},{command:'--fc-set-left',files:['/\ud800']},{command:'--fc-set-left',files:['/'+'x'.repeat(32768)]}]) assert.throws(()=>parseShellURL(wire(JSON.stringify(value))));
  for(const text of ['{"command":"--fc-set-left","command":"--fc-set-left","files":["/a"]}','{"command":"--fc-set-left","files":["/a"],"f\\u0069les":["/b"]}','{"__proto__":{},"command":"--fc-set-left","files":["/a"]}']) assert.throws(()=>parseShellURL(wire(text)));
  assert.equal(parseShellURL(url('--fc-set-left',['/'+'x'.repeat(32767)])).files[0].length,32768);
});
test('URL review precedes every filesystem operation and requires exact true',async()=>{
  const service=new ShellRequests('/state');
  const methods=['realpath','lstat','open','readFile','writeFile','mkdir','rename','rm'];
  const originals=new Map(methods.map(name=>[name,fs[name]]));
  let touches=0;
  try {
    for(const name of methods) fs[name]=async()=>{touches++;throw new Error('unexpected filesystem');};
    for(const command of ['--fc-set-left','--fc-compare-left','--fc-compare-selected']) {
      const files=command==='--fc-compare-selected'?['/a','/b']:['/a'];
      for(const decision of [false,undefined,null,'true',1,{}]) {
        service.enqueueURL(url(command,files));
        assert.deepEqual(await service.take({reviewURL:descriptor=>{assert.equal(touches,0);assert.deepEqual(descriptor,{command,files:files.map(file=>({name:path.basename(file),path:file}))});return decision;}}),{action:'cancelled'});
      }
      service.enqueueURL(url(command,files));await assert.rejects(service.take(),/Review the external/);
      service.enqueueURL(url(command,files));await assert.rejects(service.take({reviewURL:()=>{throw new Error('dialog closed');}}),/dialog closed/);
    }
    assert.equal(touches,0);
  } finally {for(const [name,original] of originals)fs[name]=original;}
});
test('approved URLs use existing comparison review and cancelled URLs preserve selection and queued requests',async()=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-url-')));
  try {
    const a=path.join(root,'a.txt'),b=path.join(root,'b.txt'),state=path.join(root,'state.json');
    await fs.writeFile(a,'A');await fs.writeFile(b,'B');const service=new ShellRequests(state);
    service.enqueueURL(url('--fc-set-left',[a]));assert.equal((await service.take({reviewURL:()=>true})).action,'set-left');
    const before=await fs.readFile(state);
    service.enqueueURL(url('--fc-set-left',[b]));service.enqueueURL(url('--fc-compare-left',[b]));
    assert.deepEqual(await service.take({reviewURL:()=>false}),{action:'cancelled'});
    assert.deepEqual(await fs.readFile(state),before);assert.equal(service.queue.length,1);
    assert.equal((await service.take({reviewURL:()=>true})).b.content,'B');
    service.enqueueURL(url('--fc-compare-selected',[a,b]));await assert.rejects(service.take({reviewURL:()=>true}),/Review the left and right/);
    service.enqueueURL(url('--fc-compare-selected',[a,b]));
    const order=[];const result=await service.take({reviewURL:()=>{order.push('url');return true;},reviewSelection:()=>{order.push('pair');return 'swap';}});
    assert.deepEqual(order,['url','pair']);assert.equal(result.a.content,'B');assert.equal(result.b.content,'A');assert.deepEqual(await fs.readFile(state),before);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('URL queue shares the existing bounded FIFO and consumes invalid requests once',async()=>{
  const service=new ShellRequests('/state');service.enqueueURL('invalid');
  await assert.rejects(service.take(),/Invalid.*URL/);assert.equal(await service.take(),null);
  for(let i=0;i<150;i++)service.enqueueURL(url('--fc-set-left',['/a']));
  assert.equal(service.queue.length,100);service.enqueue(['--fc-clear-left']);assert.equal(service.queue.length,100);
  for(let i=0;i<100;i++)assert.deepEqual(await service.take({reviewURL:()=>false}),{action:'cancelled'});
  assert.equal(await service.take(),null);
});
