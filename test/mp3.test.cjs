'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspectMp3,decodeMp3,isMp3}=require('../src/mp3.cjs');
function frame({version=3,index=9,rate=0,mono=false,padding=0,crc=false}={}){
 const kbps=(version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[index],hz=[44100,48000,32000][rate]/(version===3?1:version===2?2:4),size=Math.floor((version===3?144000:72000)*kbps/hz)+padding;
 const bytes=new Uint8Array(size);bytes.set([255,224|(version<<3)|2|(crc?0:1),(index<<4)|(rate<<2)|(padding<<1),mono?192:0]);return bytes;
}
const join=(...items)=>{const bytes=new Uint8Array(items.reduce((n,item)=>n+item.length,0));let at=0;for(const item of items){bytes.set(item,at);at+=item.length;}return bytes;};
const infoAudio=(info,length=info.frames,value=0.25)=>({sampleRate:info.sampleRate,numberOfChannels:info.channels,length,getChannelData(c){return new Float32Array(length).fill(c?-value:value);}});
test('all standard Layer III bitrates/rates and mono/stereo layouts preflight',()=>{
 for(const version of [3,2,0])for(let index=1;index<=14;index++)for(let rate=0;rate<3;rate++)for(const mono of [false,true]){
 const bytes=frame({version,index,rate,mono,padding:index%2,crc:index%3===0}),info=inspectMp3(bytes);assert.equal(info.channels,mono?1:2);assert.equal(info.sampleRate,[44100,48000,32000][rate]/(version===3?1:version===2?2:4));assert.equal(info.frames,version===3?1152:576);assert.equal(info.bits,null);assert.equal(info.lossy,true);assert.equal(isMp3(bytes),true);
 }
 assert.equal(inspectMp3(join(frame(),frame({index:10}))).variableBitrate,true);
});
test('reserved fields, free format, mixed layouts, truncation and trailing garbage reject',()=>{
 const base=frame();for(const [byte,mask,value]of [[1,0x18,0x08],[1,0x06,0x04],[2,0xf0,0xf0],[2,0xf0,0],[2,0x0c,0x0c],[3,0x03,2]]){const bytes=base.slice();bytes[byte]=(bytes[byte]&~mask)|value;assert.throws(()=>inspectMp3(bytes));}
 for(const bytes of [base.slice(0,-1),join(base,new Uint8Array([0])),join(base,frame({mono:true})),join(base,frame({rate:1})),join(base,frame({version:2}))])assert.throws(()=>inspectMp3(bytes));
 assert.equal(isMp3(new Uint8Array([1,2,3])),false);
});
function id3(version=4,size=3,footer=false){const bytes=new Uint8Array(10+size+(footer?10:0));bytes.set([73,68,51,version,0,footer?16:0,(size>>>21)&127,(size>>>14)&127,(size>>>7)&127,size&127]);if(footer){bytes.set([51,68,73],10+size);bytes.set(bytes.subarray(3,10),13+size);}return bytes;}
test('validated ID3 version headers, footer and ID3v1 trailer skip only bounded metadata',()=>{
 const audio=frame(),trailer=new Uint8Array(128);trailer.set([84,65,71]);for(const version of [2,3,4])assert.equal(inspectMp3(join(id3(version),audio,trailer)).mpegFrames,1);
 assert.equal(inspectMp3(join(id3(4,3,true),audio)).mpegFrames,1);assert.throws(()=>inspectMp3(id3()));
 for(const change of [bytes=>bytes[3]=5,bytes=>bytes[4]=255,bytes=>bytes[5]=1,bytes=>bytes[6]=128]){const bytes=id3();change(bytes);assert.throws(()=>inspectMp3(join(bytes,audio)),/ID3/);}
 const footer=id3(4,3,true);footer[footer.length-1]^=1;assert.throws(()=>inspectMp3(join(footer,audio)),/footer/);
 assert.throws(()=>inspectMp3(join(id3(4,4*1024*1024),audio)),/oversized/);
});
test('encoded sample and input bounds reject before native decoder construction',async()=>{
 let called=false;const one=frame({version:0,index:1,rate:2,mono:true}),count=Math.floor((8*1024*1024)/576)+1,bytes=new Uint8Array(one.length*count);for(let i=0;i<count;i++)bytes.set(one,i*one.length);
 await assert.rejects(()=>decodeMp3(bytes,{createContext:()=>{called=true;}}),/sample limit/);assert.equal(called,false);
 assert.throws(()=>inspectMp3(new Uint8Array(32*1024*1024+1)),/32 MB/);
});
test('decoder preserves source bytes and original rate, permits gapless trim and finite overshoot',async()=>{
 const input=join(frame(),frame()),original=input.slice(),info=inspectMp3(input);let requested;
 const result=await decodeMp3(input,{createContext:rate=>({sampleRate:requested=rate,async decodeAudioData(buffer){const first=new Uint8Array(buffer)[0];structuredClone(buffer,{transfer:[buffer]});assert.equal(first,255);return infoAudio(info,info.frames-400,1.125);}})});
 assert.equal(requested,44100);assert.deepEqual(input,original);assert.equal(result.frames,info.frames-400);assert.equal(result.gaplessTrimmedFrames,400);assert.equal(result.samples[0],1.125);assert.equal(result.samples[1],-1.125);assert.ok(result.samples instanceof Float64Array);assert.equal(result.bits,null);
});
test('decoder mismatches, incomplete and nonfinite buffers reject before successful publication',async()=>{
 const bytes=frame(),info=inspectMp3(bytes);
 for(const patch of [{sampleRate:48000},{numberOfChannels:1},{length:0},{length:info.frames+1},{getChannelData:()=>new Float32Array(1)},{getChannelData:()=>new Float32Array(info.frames).fill(NaN)}])await assert.rejects(()=>decodeMp3(bytes,{createContext:rate=>({sampleRate:rate,decodeAudioData:async()=>({...infoAudio(info),...patch})})}));
 await assert.rejects(()=>decodeMp3(bytes,{createContext:()=>({sampleRate:48000})}),/preserve/);
});
test('watchdog rejects pending native decode and discards late output without reading samples',async()=>{
 const bytes=frame();let resolve,reads=0,closed=0;const pending=decodeMp3(bytes,{timeoutMs:10,createContext:rate=>({sampleRate:rate,decodeAudioData:()=>new Promise(done=>resolve=done),close:async()=>{closed++;}})});
 await assert.rejects(pending,/too long/);resolve({getChannelData(){reads++;throw Error('late');}});await new Promise(done=>setTimeout(done,0));assert.equal(reads,0);assert.equal(closed,1);
});

test('Buffer subviews decode from an isolated exact buffer without detaching the slab',async()=>{
 const audio=frame(),slab=Buffer.alloc(audio.length+32,0x55);Buffer.from(audio).copy(slab,17);const input=slab.subarray(17,17+audio.length),before=Buffer.from(slab),info=inspectMp3(input);
 await decodeMp3(input,{createContext:rate=>({sampleRate:rate,async decodeAudioData(buffer){assert.equal(buffer.byteLength,audio.length);assert.deepEqual(new Uint8Array(buffer),audio);structuredClone(buffer,{transfer:[buffer]});return infoAudio(info);}})});assert.deepEqual(slab,before);
});
