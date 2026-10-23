'use strict';
// Minimal native FLAC: one verbatim frame, independent channels, optional PCM MD5.
function crc(bytes,width,poly){let v=0;for(const b of bytes){v^=b<<(width-8);for(let k=0;k<8;k++)v=((v<<1)^((v&(1<<(width-1)))?poly:0))&((1<<width)-1);}return v;}
function flac({samples,rate=44100,channels=1,bits=16,constant=false,checksum=false}){
 if(![8,16,24].includes(bits)||samples.length%channels)throw Error('Invalid fixture layout');const frames=samples.length/channels;if(frames<16||frames>65535)throw Error('Fixture needs 16–65535 frames');
 const info=Buffer.alloc(42);info.write('fLaC');info[4]=128;info[7]=34;info.writeUInt16BE(frames,8);info.writeUInt16BE(frames,10);
 const packed=(BigInt(rate)<<44n)|(BigInt(channels-1)<<41n)|(BigInt(bits-1)<<36n)|BigInt(frames);info.writeBigUInt64BE(packed,18);
 if(checksum){const pcm=Buffer.alloc(samples.length*bits/8);samples.forEach((value,i)=>pcm.writeIntLE(value,i*bits/8,bits/8));require('node:crypto').createHash('md5').update(pcm).digest().copy(info,26);}
 const header=Buffer.from([255,248,112,((channels-1)<<4)|({8:1,16:4,24:6}[bits]<<1),0,(frames-1)>>8,(frames-1)&255]);
 const body=Buffer.alloc(channels*(1+(constant?1:frames)*bits/8));let p=0;for(let c=0;c<channels;c++){if(constant&&samples.some((value,i)=>i%channels===c&&value!==samples[c]))throw Error('Constant fixture requires constant channels');body[p++]=constant?0:2;for(let i=0;i<(constant?1:frames);i++){body.writeIntBE(samples[i*channels+c],p,bits/8);p+=bits/8;}}
 const frame=Buffer.concat([header,Buffer.from([crc(header,8,7)]),body]),footer=Buffer.alloc(2);footer.writeUInt16BE(crc(frame,16,0x8005));return Buffer.concat([info,frame,footer]);
}
module.exports={flac};
