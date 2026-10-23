'use strict';
const {MD5}=require('./md5.cjs');
// Native FLAC metadata layout: RFC 9639, section 8.2.
const MAX_BYTES=32*1024*1024,MAX_SAMPLES=8*1024*1024;
function inspectFlac(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.length>MAX_BYTES||bytes.length<42||String.fromCharCode(...bytes.subarray(0,4))!=='fLaC')throw Error('Choose a complete native FLAC file up to 32 MB.');
 let offset=4,info=null,last=false;
 while(!last){
  if(offset+4>bytes.length)throw Error('Truncated FLAC metadata.');
  const type=bytes[offset]&127;last=!!(bytes[offset]&128);const size=(bytes[offset+1]<<16)|(bytes[offset+2]<<8)|bytes[offset+3];offset+=4;
  if(offset+size>bytes.length||type===127)throw Error('Invalid FLAC metadata.');
  if(!info&&type!==0)throw Error('FLAC must begin with STREAMINFO.');
  if(type===0){
   if(info||size!==34)throw Error('Invalid FLAC STREAMINFO.');
   const v=new DataView(bytes.buffer,bytes.byteOffset+offset,size),minBlock=v.getUint16(0),maxBlock=v.getUint16(2),sampleRate=(bytes[offset+10]<<12)|(bytes[offset+11]<<4)|(bytes[offset+12]>>4),channels=((bytes[offset+12]>>1)&7)+1,bits=(((bytes[offset+12]&1)<<4)|(bytes[offset+13]>>4))+1,frames=(bytes[offset+13]&15)*4294967296+v.getUint32(14);
   if(minBlock<16||maxBlock<minBlock||sampleRate<1||sampleRate>384000)throw Error('Invalid FLAC stream parameters.');
   if(channels>2)throw Error('FLAC comparison supports mono or stereo audio.');
   if(![8,16,24].includes(bits))throw Error('FLAC comparison supports 8-, 16- and 24-bit samples.');
   if(!frames||frames*channels>MAX_SAMPLES)throw Error('FLAC requires a known length within the 8 million sample limit.');
   info={container:'FLAC',sampleRate,channels,bits,frames,duration:frames/sampleRate,format:'PCM'};
  }
  offset+=size;
 }
 if(offset>=bytes.length)throw Error('FLAC audio frames are missing.');
 return info;
}
async function decodeFlac(input,{createContext}={}){
 // Copy before yielding: callers may release or reuse the source buffer.
 const bytes=input instanceof ArrayBuffer?new Uint8Array(input.slice(0)):new Uint8Array(input),info=inspectFlac(bytes);
 // STREAMINFO is required first. Retain its digest before decodeAudioData detaches bytes.
 const expected=bytes.slice(26,42),hasChecksum=expected.some(value=>value!==0);
 const factory=createContext||((rate)=>new globalThis.OfflineAudioContext(1,1,rate));
 let context,audio,normalization;
 try{context=factory(info.sampleRate);if(context.sampleRate!==info.sampleRate)throw Error('The audio decoder cannot preserve this FLAC sample rate.');normalization=await calibrate(context,info);audio=await context.decodeAudioData(bytes.buffer);}
 catch(error){throw Error('Unable to decode FLAC audio: '+error.message);}
 if(audio.sampleRate!==info.sampleRate||audio.numberOfChannels!==info.channels||audio.length!==info.frames)throw Error('Decoded FLAC layout does not match its stream metadata.');
 const samples=new Float64Array(info.frames*info.channels),scale=2**(info.bits-1);
 for(let c=0;c<info.channels;c++){
  const channel=audio.getChannelData(c);if(channel.length!==info.frames)throw Error('Decoded FLAC channel is incomplete.');
  for(let i=0;i<info.frames;i++){const value=channel[i],integer=Math.round(value*scale*(value>0?normalization.gain:1));if(!Number.isFinite(value)||integer< -scale||integer>=scale||normalization.forward(integer)!==value)throw Error('Decoded FLAC samples cannot be represented exactly at the source precision.');samples[i*info.channels+c]=integer/scale;}
 }
 if(hasChecksum){
  // RFC 9639 section 8.2: signed little-endian PCM, interleaved by frame.
  // Reuse a small chunk instead of allocating another full PCM buffer.
  const hash=new MD5(),chunk=new Uint8Array(4096);let used=0;
  for(const sample of samples){const integer=sample*scale;for(let shift=0;shift<info.bits;shift+=8){chunk[used++]=(integer>>shift)&255;if(used===chunk.length){hash.update(chunk);used=0;}}}
  if(used)hash.update(chunk.subarray(0,used));
  const actual=hash.digest();if(!actual.every((value,i)=>value===expected[i]))throw Error('FLAC audio MD5 checksum does not match its stream metadata. The file may be damaged.');
 }
 return {...info,samples,checksum:hasChecksum?'verified':'unavailable'};
}

function isFlac(bytes){return bytes?.length>=4&&bytes[0]===102&&bytes[1]===76&&bytes[2]===97&&bytes[3]===67;}
function crc(bytes,width,poly){let value=0;for(const byte of bytes){value^=byte<<(width-8);for(let bit=0;bit<8;bit++)value=((value<<1)^((value&(1<<(width-1)))?poly:0))&((1<<width)-1);}return value;}
function probe(rate,bits){
 const scale=2**(bits-1),pattern=[0,-scale,scale-1,1,-1,scale/2,-scale/2,(bits===16?1026:Math.floor(scale/3))],values=Array.from({length:16},(_,i)=>pattern[i%pattern.length]),bytes=new Uint8Array(42+8+1+16*bits/8+2),view=new DataView(bytes.buffer);
 bytes.set([102,76,97,67,128,0,0,34]);view.setUint16(8,16);view.setUint16(10,16);view.setBigUint64(18,(BigInt(rate)<<44n)|(BigInt(bits-1)<<36n)|16n);
 bytes.set([255,248,112,({8:1,16:4,24:6}[bits]<<1),0,0,15],42);bytes[49]=crc(bytes.subarray(42,49),8,7);bytes[50]=2;let offset=51;for(const value of values){for(let shift=bits-8;shift>=0;shift-=8)bytes[offset++]=(value>>shift)&255;}view.setUint16(offset,crc(bytes.subarray(42,offset),16,0x8005));return {bytes,values};
}
async function calibrate(context,info){
 // Chromium may map positive signed 16-bit PCM to +1 while mapping negative
 // PCM by 32768. Probe the actual decoder, rather than assuming its convention.
 const {bytes,values}=probe(info.sampleRate,info.bits),audio=await context.decodeAudioData(bytes.buffer);
 if(audio.sampleRate!==info.sampleRate||audio.numberOfChannels!==1||audio.length!==values.length)throw Error('The FLAC decoder failed its precision check.');
 const channel=audio.getChannelData(0),scale=2**(info.bits-1),mappings=[{gain:1,forward:n=>Math.fround(n/scale)}];
 if(info.bits<=16)mappings.push({gain:32767/32768,forward:n=>Math.fround(n>0?n*(32768/scale)*Math.fround(1/32767):n/scale)},{gain:32767/32768,forward:n=>Math.fround(n/scale/(n>0?32767/32768:1))});
 const mapping=mappings.find(m=>values.every((value,i)=>m.forward(value)===channel[i]));
 if(!mapping)throw Error('The FLAC decoder does not preserve supported sample precision.');return mapping;
}
module.exports={inspectFlac,decodeFlac,isFlac};

