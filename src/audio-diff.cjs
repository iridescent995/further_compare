'use strict';
const MAX_BYTES=32*1024*1024,MAX_SAMPLES=8*1024*1024;
function parseWav(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.byteLength>MAX_BYTES||bytes.byteLength<44)throw Error('Choose a valid WAV file up to 32 MB.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tag=o=>String.fromCharCode(...bytes.subarray(o,o+4));
 if(tag(0)!=='RIFF'||tag(8)!=='WAVE'||view.getUint32(4,true)+8!==bytes.length)throw Error('Only complete RIFF WAVE files are supported.');
 let fmt=null,data=null,offset=12;
 for(;offset+8<=bytes.length;){const size=view.getUint32(offset+4,true),start=offset+8,end=start+size;if(end>bytes.length)throw Error('Truncated WAV chunk.');
  if(tag(offset)==='fmt '){if(fmt||size<16)throw Error('Invalid WAV format chunk.');fmt={format:view.getUint16(start,true),channels:view.getUint16(start+2,true),rate:view.getUint32(start+4,true),byteRate:view.getUint32(start+8,true),align:view.getUint16(start+12,true),bits:view.getUint16(start+14,true)};}
  if(tag(offset)==='data'){if(data)throw Error('Multiple WAV data chunks are unsupported.');data={start,size};}offset=end+(size%2);if(offset>bytes.length)throw Error('Missing WAV chunk padding.');
 }
 if(offset!==bytes.length)throw Error('Truncated WAV chunk header.');
 if(!fmt||!data||![1,2].includes(fmt.channels)||fmt.rate<1||fmt.rate>384000||!((fmt.format===1&&[8,16,24,32].includes(fmt.bits))||(fmt.format===3&&fmt.bits===32)))throw Error('Supported WAV: mono/stereo PCM 8/16/24/32-bit or 32-bit float.');
 const width=fmt.bits/8;if(fmt.align!==width*fmt.channels||fmt.byteRate!==fmt.rate*fmt.align||data.size%fmt.align)throw Error('Invalid WAV sample layout.');
 const count=data.size/width;if(count>MAX_SAMPLES)throw Error('WAV exceeds the 8 million sample limit.');
 const samples=new Float64Array(count);
 for(let i=0;i<count;i++){const p=data.start+i*width;let value;if(fmt.format===3)value=view.getFloat32(p,true);else if(fmt.bits===8)value=(view.getUint8(p)-128)/128;else if(fmt.bits===16)value=view.getInt16(p,true)/32768;else if(fmt.bits===24){let n=view.getUint8(p)|(view.getUint8(p+1)<<8)|(view.getUint8(p+2)<<16);if(n&0x800000)n-=0x1000000;value=n/8388608;}else value=view.getInt32(p,true)/2147483648;if(!Number.isFinite(value))throw Error('WAV contains non-finite samples.');samples[i]=value;}
 return {samples,sampleRate:fmt.rate,channels:fmt.channels,bits:fmt.bits,format:fmt.format===3?'Float':'PCM',frames:count/fmt.channels,duration:count/fmt.channels/fmt.rate};
}
function compareAudio(a,b,{offset=0,tolerance=0}={}){
 if(a.sampleRate!==b.sampleRate||a.channels!==b.channels)throw Error('Sample rates and channel counts must match; resampling is not performed.');
 if(!Number.isFinite(offset)||Math.abs(offset)>3600||!Number.isFinite(tolerance)||tolerance<0||tolerance>2)throw Error('Invalid audio comparison settings.');
 const shift=Math.round(offset*a.sampleRate),start=Math.min(0,shift),end=Math.max(a.frames,b.frames+shift);
 if(end-start>MAX_SAMPLES)throw Error('The time offset produces an excessive comparison range.');
 let differentSamples=0,missingSamples=0,maxDifference=0,squared=0,total=0;
 for(let frame=start;frame<end;frame++)for(let c=0;c<a.channels;c++){const left=frame>=0&&frame<a.frames,right=frame-shift>=0&&frame-shift<b.frames;if(!left&&!right)continue;if(!left||!right){missingSamples++;differentSamples++;total++;continue;}const delta=Math.abs(a.samples[frame*a.channels+c]-b.samples[(frame-shift)*b.channels+c]);maxDifference=Math.max(maxDifference,delta);squared+=delta*delta;if(delta>tolerance)differentSamples++;total++;}
 return {equal:differentSamples===0,differentSamples,missingSamples,comparedSamples:total,maxDifference,rmsDifference:Math.sqrt(squared/Math.max(1,total-missingSamples)),offsetSeconds:shift/a.sampleRate,tolerance};
}
module.exports={parseWav,compareAudio};

function parseAudio(input){const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length>=12&&String.fromCharCode(...bytes.subarray(0,4))==='FORM')return require('./aiff.cjs').parseAiff(bytes);return {...parseWav(bytes),container:'WAV'};}
module.exports.parseAudio=parseAudio;
