'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {prepareWindowsTimestampRequest,runTimestampHelper}=require('../desktop/windows-folder-timestamps.cjs');
function processStub(reply){
 let captured;
 const spawnProcess=(executable,args,options)=>{
  const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
  child.kill=()=>{queueMicrotask(()=>child.emit('close',null));return true;};
  let input='';child.stdin.on('data',chunk=>input+=chunk);child.stdin.on('finish',()=>{captured={executable,args,options,input};reply(child,input);});
  return child;
 };
 return {spawnProcess,captured:()=>captured};
}
test('Windows helper transports literal Unicode and shell punctuation as stdin data',async()=>{
 const request={entries:[{relative:"café & $(literal) 'file.txt"}]};
 const stub=processStub(child=>{child.stdout.end('{"changed":1}');child.emit('close',0);});
 assert.deepEqual(await runTimestampHelper('powershell.exe',['-File','fixed.ps1'],request,stub),{changed:1});
 const sent=stub.captured();assert.equal(sent.options.shell,false);assert.deepEqual(JSON.parse(sent.input),request);assert.match(sent.input,/\\u00e9/);assert.deepEqual(sent.args,['-File','fixed.ps1']);
});
test('Windows helper rejects malformed, mismatched and failed responses',async()=>{
 for(const output of ['not JSON','null','{"changed":2}','{"changed":1,"other":true}']){
  const stub=processStub(child=>{child.stdout.end(output);child.emit('close',0);});
  await assert.rejects(runTimestampHelper('x',[],{entries:[{}]},stub),/Invalid timestamp helper result/);
 }
 const stub=processStub(child=>{child.stderr.end('Rollback: 1 restored, 0 not restored');child.emit('close',1);});
 await assert.rejects(runTimestampHelper('x',[],{entries:[{}]},stub),/1 restored/);
 let killed=false;const late=processStub(child=>{child.kill=()=>{killed=true;return true;};child.stdout.end('{"changed":1}');child.emit('close',0);child.stdin.emit('error',new Error('late pipe close'));});
 assert.deepEqual(await runTimestampHelper('x',[],{entries:[{}]},late),{changed:1});assert.equal(killed,false);
});
test('Windows helper timeout and excessive output report uncertain mutation outcomes',async()=>{
 const hung=processStub(()=>{});
 await assert.rejects(runTimestampHelper('x',[],{entries:[{}]},{...hung,timeoutMs:10}),/Some timestamps may have changed/);
 const verbose=processStub(child=>child.stdout.write('x'.repeat(65537)));
 await assert.rejects(runTimestampHelper('x',[],{entries:[{}]},verbose),/too much output/);
});
test('Windows timestamp request preserves exact identity and rejects changed entries or aliases',async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-win-time-request-'))),file=path.join(root,'café.txt'),date=1700000000123;
 try{
  await fs.writeFile(file,'hello');
  const safe=async(side,relative)=>path.join(root,relative);
  const request=await prepareWindowsTimestampRequest(safe,'a',['café.txt'],date),stat=await fs.lstat(file,{bigint:true});
  assert.equal(request.root,root);assert.equal(request.entries[0].inode,String(stat.ino));assert.equal(request.entries[0].mtimeNs,String(stat.mtimeNs));assert.equal(request.entries[0].ctimeNs,String(stat.ctimeNs));assert.equal(request.entries[0].directory,false);
  await assert.rejects(prepareWindowsTimestampRequest(safe,'a',['café.txt','CAFÉ.txt'],date),/only once/);
  await assert.rejects(prepareWindowsTimestampRequest(safe,'a',['café.txt'],-11644473600000),/1601/);
  let calls=0;await assert.rejects(prepareWindowsTimestampRequest(async(side,relative)=>{if(++calls===2)await fs.appendFile(file,'changed');return safe(side,relative);},'a',['café.txt'],date),/changed/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
