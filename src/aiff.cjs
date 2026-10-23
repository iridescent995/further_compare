'use strict';
// Apple Audio Interchange File Format 1.3, COMM and SSND chunks.
function parseAiff(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.length<12||bytes.length>32*1024*1024)throw Error('Choose a valid AIFF file up to 32 MB.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tag=p=>String.fromCharCode(...bytes.subarray(p,p+4));
 if(tag(8)==='AIFC')throw Error('AIFF-C files are not supported yet. Choose PCM AIFF or WAV.');
 if(tag(0)!=='FORM'||tag(8)!=='AIFF'||view.getUint32(4)+8!==bytes.length)throw Error('Only complete FORM AIFF files are supported.');
 let common=null,sound=null,p=12;
 for(;p+8<=bytes.length;){const size=view.getUint32(p+4),start=p+8,end=start+size;if(end>bytes.length)throw Error('Truncated AIFF chunk.');
  if(tag(p)==='COMM'){if(common||size!==18)throw Error('Invalid AIFF common chunk.');common={channels:view.getInt16(start),frames:view.getUint32(start+2),bits:view.getInt16(start+6),rateAt:start+8};}
  if(tag(p)==='SSND'){if(sound||size<8)throw Error('Invalid AIFF sound chunk.');const offset=view.getUint32(start);if(offset>size-8)throw Error('Invalid AIFF sound offset.');sound={start:start+8+offset,size:size-8-offset};}
  p=end+(size%2);if(p>bytes.length)throw Error('Missing AIFF chunk padding.');
 }
 if(p!==bytes.length)throw Error('Truncated AIFF chunk header.');
 if(!common||![1,2].includes(common.channels)||common.bits<1||common.bits>32)throw Error('Supported AIFF: mono/stereo PCM with 1–32-bit samples.');
 const exponent=view.getUint16(common.rateAt),high=view.getUint32(common.rateAt+2),low=view.getUint32(common.rateAt+6),power=(exponent&32767)-16383;
 if(exponent&32768||!(high&0x80000000)||power<0||power>18)throw Error('Choose AIFF with an integer sample rate from 1 to 384000 Hz.');
 const mantissa=(BigInt(high)<<32n)|BigInt(low),shift=BigInt(63-power);
 if(mantissa&((1n<<shift)-1n))throw Error('Fractional AIFF sample rates are not supported.');
 const rate=Number(mantissa>>shift);if(rate>384000)throw Error('AIFF sample rate exceeds 384000 Hz.');
 const count=common.frames*common.channels,width=Math.ceil(common.bits/8),padding=width*8-common.bits;
 if(count>8*1024*1024)throw Error('AIFF exceeds the 8 million sample limit.');
 if((count&&!sound)||(sound&&count*width>sound.size))throw Error('Truncated AIFF sample data.');
 const samples=new Float64Array(count);
 for(let i=0;i<count;i++){const at=sound.start+i*width;let value=0;for(let b=0;b<width;b++)value=value*256+bytes[at+b];if(value>=2**(width*8-1))value-=2**(width*8);if(value%2**padding!==0)throw Error('Invalid AIFF sample padding bits.');samples[i]=value/2**(width*8-1);}
 return {samples,sampleRate:rate,channels:common.channels,bits:common.bits,format:'PCM',container:'AIFF',frames:common.frames,duration:common.frames/rate};
}
// Playback uses a lossless PCM byte-order conversion; comparison keeps the
// original normalized samples and sessions retain the original AIFF bytes.
function aiffPlaybackWav(audio){
 const width=Math.ceil(audio.bits/8),size=audio.samples.length*width,bytes=new Uint8Array(44+size+size%2),view=new DataView(bytes.buffer);
 const tag=(p,s)=>{for(let i=0;i<s.length;i++)bytes[p+i]=s.charCodeAt(i);};tag(0,'RIFF');view.setUint32(4,bytes.length-8,true);tag(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,audio.channels,true);view.setUint32(24,audio.sampleRate,true);view.setUint32(28,audio.sampleRate*audio.channels*width,true);view.setUint16(32,audio.channels*width,true);view.setUint16(34,width*8,true);tag(36,'data');view.setUint32(40,size,true);
 for(let i=0;i<audio.samples.length;i++){let value=audio.samples[i]*2**(width*8-1);if(width===1)value+=128;else if(value<0)value+=2**(width*8);for(let b=0;b<width;b++){bytes[44+i*width+b]=value%256;value=Math.floor(value/256);}}
 return bytes;
}
module.exports={parseAiff,aiffPlaybackWav};
