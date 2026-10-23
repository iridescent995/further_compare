'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{decodeFlac}=require('../src/flac.cjs'),{flac}=require('./flac-fixture.cjs');
function decoder(samples,bits,channels,{detach=false}={}){
 return rate=>{let calls=0;return {sampleRate:rate,decodeAudioData:async buffer=>{
  if(calls++===0){const bytes=new Uint8Array(buffer),values=[];for(let i=0;i<16;i++){let n=0;for(let b=0;b<bits/8;b++)n=n*256+bytes[51+i*bits/8+b];if(n>=2**(bits-1))n-=2**bits;values.push(n/2**(bits-1));}return {sampleRate:rate,numberOfChannels:1,length:16,getChannelData:()=>Float32Array.from(values)};}
  if(detach)structuredClone(buffer,{transfer:[buffer]});
  return {sampleRate:rate,numberOfChannels:channels,length:samples.length/channels,getChannelData:c=>Float32Array.from(samples.filter((_,i)=>i%channels===c),n=>n/2**(bits-1))};
 }};};
}
function digest(samples,bits){const pcm=Buffer.alloc(samples.length*bits/8);samples.forEach((n,i)=>pcm.writeIntLE(n,i*bits/8,bits/8));return createHash('md5').update(pcm).digest();}
for(const bits of [8,16,24])for(const channels of [1,2])test(`FLAC validates signed ${bits}-bit ${channels}-channel interleaved PCM checksum`,async()=>{
 const scale=2**(bits-1),pattern=[-scale,scale-1,-1,1,0,scale/2,-scale/2,7],samples=Array.from({length:4098*channels},(_,i)=>pattern[(i+Math.floor(i/8))%pattern.length]),bytes=flac({samples,bits,channels});digest(samples,bits).copy(bytes,26);
 const result=await decodeFlac(bytes,{createContext:decoder(samples,bits,channels,{detach:true})});assert.equal(result.checksum,'verified');assert.deepEqual(Array.from(result.samples),samples.map(n=>n/scale));
 bytes[26]^=1;await assert.rejects(decodeFlac(bytes,{createContext:decoder(samples,bits,channels)}),/checksum does not match/);
});
test('FLAC accepts unavailable all-zero digest and rejects a claimed digest for different audio',async()=>{
 const samples=Array.from({length:32},(_,i)=>i-16),bytes=flac({samples});assert.equal((await decodeFlac(bytes,{createContext:decoder(samples,16,1)})).checksum,'unavailable');digest(samples,16).copy(bytes,26);const changed=[...samples];changed[12]++;await assert.rejects(decodeFlac(bytes,{createContext:decoder(changed,16,1)}),/checksum does not match/);
});
test('FLAC does not confuse channel-major or unsigned 8-bit samples with required PCM order',async()=>{
 const samples=Array.from({length:64},(_,i)=>i-32),bytes=flac({samples,bits:8,channels:2});
 for(const wrong of [samples.filter((_,i)=>i%2===0).concat(samples.filter((_,i)=>i%2===1)),samples.map(n=>n^128)]){
  const pcm=Buffer.from(wrong.map(n=>n&255));createHash('md5').update(pcm).digest().copy(bytes,26);await assert.rejects(decodeFlac(bytes,{createContext:decoder(samples,8,2)}),/checksum does not match/);
 }
});

test('FLAC decoding preserves caller ArrayBuffer when browser detaches decoder input',async()=>{
 const samples=Array.from({length:32},(_,i)=>i-16),bytes=flac({samples,checksum:true}),input=Uint8Array.from(bytes).buffer;
 assert.equal((await decodeFlac(input,{createContext:decoder(samples,16,1,{detach:true})})).checksum,'verified');assert.deepEqual(Buffer.from(input),bytes);
});
