'use strict';
// Encoding tables and conversion come from iconv-lite, not platform-dependent
// TextDecoder aliases. Preserve valid byte aliases and reject replacement loss.
const {Buffer}=require('buffer/');
const ENCODINGS=Object.freeze({
 'shift-jis':{codec:'shift_jis',label:'Shift-JIS'},
 'euc-jp':{codec:'euc-jp',label:'EUC-JP'},
 gb18030:{codec:'gb18030',label:'GB18030'},
 big5:{codec:'big5',label:'Big5'},
 'euc-kr':{codec:'euc-kr',label:'EUC-KR'},
});
function encodingOptions(encoding){
 if(!Object.hasOwn(ENCODINGS,encoding))throw Error('Unsupported multibyte text encoding.');
 return ENCODINGS[encoding];
}
function sameBytes(left,right){
 if(left.length!==right.length)return false;
 for(let i=0;i<left.length;i++)if(left[i]!==right[i])return false;
 return true;
}
function strictDecode(bytes,encoding){
 const {codec,label}=encodingOptions(encoding),iconv=require('iconv-lite');
 if(encoding==='gb18030'){
  // Structural pointer bounds from the Encoding Standard, not mapping tables:
  // https://encoding.spec.whatwg.org/#index-gb18030-ranges-code-point
  // iconv-lite 0.7.2 extrapolates these unassigned ranges instead of rejecting.
  for(let i=0;i<bytes.length;i++){
   if(bytes[i]>=0x81&&bytes[i]<=0xfe){
    if(bytes[i+1]>=0x30&&bytes[i+1]<=0x39&&bytes[i+2]>=0x81&&bytes[i+2]<=0xfe&&bytes[i+3]>=0x30&&bytes[i+3]<=0x39){
     const pointer=(bytes[i]-0x81)*12600+(bytes[i+1]-0x30)*1260+(bytes[i+2]-0x81)*10+bytes[i+3]-0x30;
     if(pointer>39419&&pointer<189000||pointer>1237575)throw Error(`Invalid ${label} text: unassigned four-byte sequence.`);
     i+=3;
    }else if(bytes[i+1]>=0x40&&bytes[i+1]<=0xfe&&bytes[i+1]!==0x7f)i++;
   }
  }
 }
 const input=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const decodeWith=sentinel=>{
  const decoder=iconv.getDecoder(codec,{stripBOM:false});
  // Mutate only this decoder instance, never shared codecs or library defaults.
  if(!Object.hasOwn(decoder,'defaultCharUnicode'))throw Error('Strict multibyte decoder is unavailable.');
  decoder.defaultCharUnicode=sentinel;
  return decoder.write(input)+(decoder.end()||'');
 };
 const content=decodeWith('\ufffd');
 if(content!==decodeWith('\ufffe'))throw Error(`Invalid ${label} text. Reopen using the correct encoding; undecodable bytes are not replaced.`);
 return content;
}
function decodeMultibyte(bytes,encoding){
 const {codec}=encodingOptions(encoding),iconv=require('iconv-lite'),content=strictDecode(bytes,encoding);
 const canonical=iconv.encode(content,codec,{addBOM:false});
 return {content,...(!sameBytes(bytes,canonical)?{legacyBytes:Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength).toString('base64')}:{})};
}
function parseLegacyBytes(value,maxBytes){
 if(typeof value!=='string'||value.length>Math.ceil(maxBytes/3)*4||value.length%4||! /^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Invalid original legacy byte data.');
 const bytes=Buffer.from(value,'base64');
 if(bytes.length>maxBytes||bytes.toString('base64')!==value)throw Error('Invalid original legacy byte data.');
 return bytes;
}
function encodeMultibyte(text,encoding){
 const {codec,label}=encodingOptions(encoding),iconv=require('iconv-lite');
 const bytes=iconv.encode(text,codec,{addBOM:false});
 if(strictDecode(bytes,encoding)!==text)throw Error(`Text cannot be represented in ${label} without data loss.`);
 return new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);
}
module.exports={MULTIBYTE_ENCODINGS:Object.keys(ENCODINGS),decodeMultibyte,encodeMultibyte,parseLegacyBytes};
