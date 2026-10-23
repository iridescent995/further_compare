'use strict';
// RFC 1321 incremental digest. Used only for the FLAC format's integrity field,
// not authentication. Working storage is independent of input length.
const shifts=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
const constants=Uint32Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*4294967296));
class MD5 {
 constructor(){this.state=new Uint32Array([0x67452301,0xefcdab89,0x98badcfe,0x10325476]);this.block=new Uint8Array(64);this.words=new Uint32Array(16);this.used=0;this.length=0;this.done=false;}
 compress(bytes,offset=0){
  const w=this.words;for(let i=0;i<16;i++){const p=offset+i*4;w[i]=bytes[p]|bytes[p+1]<<8|bytes[p+2]<<16|bytes[p+3]<<24;}
  let [a,b,c,d]=this.state;
  for(let i=0;i<64;i++){
   let f,g;if(i<16){f=(b&c)|(~b&d);g=i;}else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16;}else if(i<48){f=b^c^d;g=(3*i+5)%16;}else{f=c^(b|~d);g=(7*i)%16;}
   const n=(a+f+constants[i]+w[g])|0,s=shifts[(i>>4)*4+i%4],next=(b+((n<<s)|(n>>>(32-s))))|0;
   a=d;d=c;c=b;b=next;
  }
  this.state[0]+=a;this.state[1]+=b;this.state[2]+=c;this.state[3]+=d;
 }
 update(bytes){
  if(this.done)throw Error('MD5 digest is already finalized.');
  if(!(bytes instanceof Uint8Array))throw TypeError('MD5 input must be bytes.');
  if(!Number.isSafeInteger(this.length+bytes.length)||this.length+bytes.length>Number.MAX_SAFE_INTEGER/8)throw Error('MD5 input is too large.');
  this.length+=bytes.length;let offset=0;
  if(this.used){const count=Math.min(64-this.used,bytes.length);this.block.set(bytes.subarray(0,count),this.used);this.used+=count;offset=count;if(this.used===64){this.compress(this.block);this.used=0;}}
  while(offset+64<=bytes.length){this.compress(bytes,offset);offset+=64;}
  if(offset<bytes.length){this.block.set(bytes.subarray(offset));this.used=bytes.length-offset;}
  return this;
 }
 digest(){
  if(this.done)throw Error('MD5 digest is already finalized.');this.done=true;
  this.block[this.used++]=128;
  if(this.used>56){this.block.fill(0,this.used);this.compress(this.block);this.used=0;}
  this.block.fill(0,this.used,56);const view=new DataView(this.block.buffer),bits=this.length*8;
  view.setUint32(56,bits>>>0,true);view.setUint32(60,Math.floor(bits/4294967296),true);this.compress(this.block);
  const result=new Uint8Array(16),out=new DataView(result.buffer);for(let i=0;i<4;i++)out.setUint32(i*4,this.state[i],true);return result;
 }
}
module.exports={MD5};
