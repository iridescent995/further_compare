'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{MD5}=require('../src/md5.cjs');
const hex=bytes=>Buffer.from(bytes).toString('hex');
test('incremental MD5 matches standard vectors',()=>{
 for(const [input,expected] of [['','d41d8cd98f00b204e9800998ecf8427e'],['a','0cc175b9c0f1b6a831c399e269772661'],['abc','900150983cd24fb0d6963f7d28e17f72'],['message digest','f96b697d7cb7938d525a2f31aaf161d0']])assert.equal(hex(new MD5().update(Buffer.from(input)).digest()),expected);
});
test('MD5 agrees with Node crypto across padding, block and chunk boundaries',()=>{
 for(const size of [1,7,55,56,57,63,64,65,119,120,127,128,129,4095,4096,4097,65539]){
  const input=Buffer.from(Array.from({length:size},(_,i)=>(i*37+19)&255)),expected=createHash('md5').update(input).digest('hex');
  for(const step of [1,3,55,64,65,4096,size]){const hash=new MD5();for(let i=0;i<size;i+=step)hash.update(input.subarray(i,i+step));hash.update(new Uint8Array());assert.equal(hex(hash.digest()),expected,`size ${size}, chunk ${step}`);}
 }
});
test('MD5 consumes supplied bytes synchronously and rejects updates after finalization',()=>{
 const input=Buffer.from('abc'),hash=new MD5().update(input);input.fill(0);assert.equal(hex(hash.digest()),'900150983cd24fb0d6963f7d28e17f72');assert.throws(()=>hash.update(input),/finalized/);assert.throws(()=>hash.digest(),/finalized/);assert.throws(()=>new MD5().update('abc'),/bytes/);
});
