'use strict';
// Layer III framing follows ISO MPEG audio header fields and the frame-length
// relationships documented by FFmpeg's primary mpegaudiodecheader implementation.
// ID3 framing: https://id3.org/id3v2.4.0-structure (also versions 2.2/2.3).
const MAX_BYTES=32*1024*1024,MAX_SAMPLES=8*1024*1024,MAX_TAG_BYTES=4*1024*1024;
const BITRATES_1=[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320];
const BITRATES_LOW=[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
function bytesFor(input){if(input instanceof Uint8Array)return input;if(input instanceof ArrayBuffer)return new Uint8Array(input);throw Error('MP3 input must be bytes.');}
function signature(bytes,offset,text){return [...text].every((char,i)=>bytes[offset+i]===char.charCodeAt(0));}
function isMp3(input){let bytes;try{bytes=bytesFor(input);}catch{return false;}return signature(bytes,0,'ID3')||bytes.length>=4&&bytes[0]===255&&(bytes[1]&0xe0)===0xe0&&((bytes[1]>>1)&3)===1;}
function inspectMp3(input){
 const bytes=bytesFor(input);if(bytes.length>MAX_BYTES||bytes.length<4)throw Error('Choose a complete MP3 file up to 32 MB.');
 let start=0,end=bytes.length,tags=0,tagCount=0;
 while(signature(bytes,start,'ID3')){
  if(start+10>end||++tagCount>16)throw Error('Invalid or excessive MP3 ID3 metadata.');
  const major=bytes[start+3],revision=bytes[start+4],flags=bytes[start+5],mask=major===2?0x3f:major===3?0x1f:0x0f;
  if(![2,3,4].includes(major)||revision===255||(flags&mask)||bytes.subarray(start+6,start+10).some(value=>value&128))throw Error('Invalid MP3 ID3 header.');
  const size=bytes[start+6]*2097152+bytes[start+7]*16384+bytes[start+8]*128+bytes[start+9],footer=major===4&&(flags&16)?10:0,total=10+size+footer;
  tags+=total;if(tags>MAX_TAG_BYTES||start+total>end)throw Error('Truncated or oversized MP3 ID3 metadata.');
  if(footer){const at=start+10+size;if(!signature(bytes,at,'3DI')||!bytes.subarray(start+3,start+10).every((value,i)=>value===bytes[at+3+i]))throw Error('Invalid MP3 ID3 footer.');}
  start+=total;
 }
 if(end-start>=128&&signature(bytes,end-128,'TAG'))end-=128;
 let offset=start,info=null,mpegFrames=0,frames=0,firstBitrate=null,variableBitrate=false;
 while(offset<end){
  if(offset+4>end)throw Error('Truncated MP3 frame header.');
  const a=bytes[offset],b=bytes[offset+1],c=bytes[offset+2],d=bytes[offset+3],versionBits=(b>>3)&3,layer=(b>>1)&3,bitrateIndex=c>>4,rateIndex=(c>>2)&3;
  if(a!==255||(b&0xe0)!==0xe0||versionBits===1||layer!==1||bitrateIndex===15||rateIndex===3||(d&3)===2)throw Error('Invalid or unsupported MPEG Layer III frame header.');
  if(bitrateIndex===0)throw Error('Free-format MP3 streams are not supported.');
  const mpegVersion=versionBits===3?'1':versionBits===2?'2':'2.5',low=versionBits!==3,sampleRate=[44100,48000,32000][rateIndex]/(versionBits===3?1:versionBits===2?2:4),channels=(d>>6)===3?1:2,bitrate=(low?BITRATES_LOW:BITRATES_1)[bitrateIndex];
  const length=Math.floor((low?72000:144000)*bitrate/sampleRate)+((c>>1)&1),crc=(b&1)?0:2,sideInfo=low?(channels===1?9:17):(channels===1?17:32);
  if(length<4+crc+sideInfo||offset+length>end)throw Error('Truncated MP3 audio frame.');
  if(info&&(info.sampleRate!==sampleRate||info.channels!==channels||info.mpegVersion!==mpegVersion))throw Error('Mixed MP3 stream layouts are not supported.');
  info??={container:'MP3',format:'MPEG Layer III',lossy:true,bits:null,sampleRate,channels,mpegVersion};
  firstBitrate??=bitrate;if(bitrate!==firstBitrate)variableBitrate=true;
  frames+=low?576:1152;mpegFrames++;if(frames*channels>MAX_SAMPLES)throw Error('MP3 decoded audio exceeds the 8 million sample limit.');offset+=length;
 }
 if(!info||!mpegFrames)throw Error('MP3 audio frames are missing.');
 return {...info,frames,encodedFrames:frames,mpegFrames,duration:frames/info.sampleRate,variableBitrate};
}
async function decodeMp3(input,{createContext,timeoutMs=15000}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw Error('Invalid MP3 decoder timeout.');
 const source=bytesFor(input),info=inspectMp3(source),bytes=new Uint8Array(source),factory=createContext||((rate)=>new globalThis.OfflineAudioContext(1,1,rate));
 let context,timer,finished=false;
 try{
  context=factory(info.sampleRate);if(!context||context.sampleRate!==info.sampleRate)throw Error('The audio decoder cannot preserve this MP3 sample rate.');
  const audio=await new Promise((resolve,reject)=>{
   const done=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(value);};
   timer=setTimeout(()=>done(Error('MP3 decoding took too long. Choose a shorter file.')),timeoutMs);
   try{Promise.resolve(context.decodeAudioData(bytes.buffer)).then(value=>done(null,value),error=>done(error));}catch(error){done(error);}
  });
  if(!audio||audio.sampleRate!==info.sampleRate||audio.numberOfChannels!==info.channels||!Number.isInteger(audio.length)||audio.length<1||audio.length>info.encodedFrames||audio.length*info.channels>MAX_SAMPLES)throw Error('Decoded MP3 layout does not match its bounded stream metadata.');
  const samples=new Float64Array(audio.length*info.channels);
  for(let c=0;c<info.channels;c++){const channel=audio.getChannelData(c);if(!channel||channel.length!==audio.length)throw Error('Decoded MP3 channel is incomplete.');for(let i=0;i<audio.length;i++){const value=channel[i];if(!Number.isFinite(value))throw Error('Decoded MP3 contains nonfinite samples.');samples[i*info.channels+c]=value;}}
  return {...info,frames:audio.length,duration:audio.length/info.sampleRate,gaplessTrimmedFrames:info.encodedFrames-audio.length,samples};
 }catch(error){throw Error('Unable to decode MP3 audio: '+(error?.message||String(error)));}
 finally{finished=true;clearTimeout(timer);try{const closing=context?.close?.();closing?.catch?.(()=>{});}catch{}}
}
module.exports={isMp3,inspectMp3,decodeMp3};
