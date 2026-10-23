const test=require('node:test'),assert=require('node:assert/strict');
const {parseWav,compareAudio}=require('../src/audio-diff.cjs');
function wav(values,{bits=16,channels=1,rate=8000,float=false}={}){
 const size=values.length*bits/8,pad=size%2,b=Buffer.alloc(44+size+pad);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(float?3:1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*channels*bits/8,28);b.writeUInt16LE(channels*bits/8,32);b.writeUInt16LE(bits,34);b.write('data',36);b.writeUInt32LE(size,40);
 values.forEach((v,i)=>{const p=44+i*bits/8;if(float)b.writeFloatLE(v,p);else if(bits===8)b.writeUInt8(v,p);else b.writeIntLE(v,p,bits/8);});return b;
}
test('WAV parser supports PCM widths and stereo float with exact sample differences',()=>{
 for(const bits of [8,16,24,32]){const a=parseWav(wav([bits===8?128:0,1],{bits})),b=parseWav(wav([bits===8?128:0,2],{bits}));assert.equal(a.frames,2);assert.equal(compareAudio(a,b).differentSamples,1);}
 const stereo=parseWav(wav([.25,-.5,.75,0],{bits:32,float:true,channels:2}));assert.equal(stereo.channels,2);assert.equal(stereo.frames,2);assert.equal(stereo.samples[1],-.5);
 assert.equal(compareAudio(parseWav(wav([2147483646],{bits:32})),parseWav(wav([2147483647],{bits:32}))).differentSamples,1);
});
test('audio comparison handles offsets, tolerance, missing frames and incompatible formats',()=>{
 const a=parseWav(wav([0,100,200])),b=parseWav(wav([100,200]));const shifted=compareAudio(a,b,{offset:1/8000});assert.equal(shifted.missingSamples,1);assert.equal(shifted.differentSamples,1);assert.equal(shifted.maxDifference,0);
 assert.equal(compareAudio(a,parseWav(wav([0,101,200])),{tolerance:.001}).equal,true);
 assert.throws(()=>compareAudio(a,parseWav(wav([0],{rate:16000}))),/must match/);
 assert.throws(()=>compareAudio(a,b,{offset:Infinity}),/settings/);
 const disjoint=compareAudio(a,b,{offset:10/8000});assert.equal(disjoint.missingSamples,5);assert.equal(disjoint.comparedSamples,5);
});
test('WAV parser rejects malformed chunks, unsupported channels and non-finite samples',()=>{
 assert.throws(()=>parseWav(Buffer.from('not audio')),/valid/);
 const truncated=wav([0]);truncated.writeUInt32LE(9999,40);assert.throws(()=>parseWav(truncated),/Truncated/);
 assert.throws(()=>parseWav(wav([0,0,0],{channels:3})),/mono/);
 assert.throws(()=>parseWav(wav([NaN],{bits:32,float:true})),/non-finite/);
});
module.exports={wav};
