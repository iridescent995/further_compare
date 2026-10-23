'use strict';
const {SINGLE_BYTE_LABELS,SINGLE_BYTE_ENCODINGS,decodeSingleByte,encodeSingleByte}=require('./single-byte-text-codec.cjs');
const {WINDOWS_CODEPAGES}=require('./windows-codepages.cjs');
const {MULTIBYTE_ENCODINGS,decodeMultibyte,encodeMultibyte,parseLegacyBytes}=require('./multibyte-text-codec.cjs');
const WINDOWS_ENCODERS=Object.fromEntries(Object.entries(WINDOWS_CODEPAGES).map(([encoding,points])=>[encoding,new Map(points.flatMap((point,index)=>point===null?[]:[[point,index+128]]))]));
const MAX_BYTES=10*1024*1024;
const ENCODINGS=['utf8','utf16le','utf16be','utf32le','utf32be','windows1252','windows1251',...Object.keys(WINDOWS_CODEPAGES),'latin1',...SINGLE_BYTE_ENCODINGS,...MULTIBYTE_ENCODINGS];
const WINDOWS_1252=[0x20ac,0x81,0x201a,0x192,0x201e,0x2026,0x2020,0x2021,0x2c6,0x2030,0x160,0x2039,0x152,0x8d,0x17d,0x8f,0x90,0x2018,0x2019,0x201c,0x201d,0x2022,0x2013,0x2014,0x2dc,0x2122,0x161,0x203a,0x153,0x9d,0x17e,0x178];
// Mapping: https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP1251.TXT
// Byte 0x98 is undefined and must not be silently replaced.
const WINDOWS_1251=[1026,1027,8218,1107,8222,8230,8224,8225,8364,8240,1033,8249,1034,1036,1035,1039,1106,8216,8217,8220,8221,8226,8211,8212,null,8482,1113,8250,1114,1116,1115,1119,160,1038,1118,1032,164,1168,166,167,1025,169,1028,171,172,173,174,1031,176,177,1030,1110,1169,181,182,183,1105,8470,1108,187,1112,1029,1109,1111,1040,1041,1042,1043,1044,1045,1046,1047,1048,1049,1050,1051,1052,1053,1054,1055,1056,1057,1058,1059,1060,1061,1062,1063,1064,1065,1066,1067,1068,1069,1070,1071,1072,1073,1074,1075,1076,1077,1078,1079,1080,1081,1082,1083,1084,1085,1086,1087,1088,1089,1090,1091,1092,1093,1094,1095,1096,1097,1098,1099,1100,1101,1102,1103];
const WINDOWS_1251_ENCODE=new Map(WINDOWS_1251.flatMap((point,index)=>point===null?[]:[[point,index+128]]));
function validateFormat(format){
 if(!format||typeof format!=='object'||!ENCODINGS.includes(format.encoding)||typeof format.bom!=='boolean'||!['lf','crlf','cr','mixed','none'].includes(format.lineEnding))throw Error('Invalid text encoding or line-ending format.');
 if(format.bom&&!['utf8','utf16le','utf16be','utf32le','utf32be'].includes(format.encoding))throw Error('This encoding does not support a BOM.');
 const result={encoding:format.encoding,bom:format.bom,lineEnding:format.lineEnding};
 if(format.legacyBytes!==undefined||format.normalizeLegacy!==undefined){
  if(!MULTIBYTE_ENCODINGS.includes(format.encoding))throw Error('Original legacy bytes require a supported multibyte encoding.');
  if(format.normalizeLegacy!==undefined){if(typeof format.normalizeLegacy!=='boolean')throw Error('Invalid legacy normalization choice.');result.normalizeLegacy=format.normalizeLegacy;}
  if(format.legacyBytes!==undefined){
   const original=decodeText(parseLegacyBytes(format.legacyBytes,MAX_BYTES),format.encoding);
   if(!original.format.legacyBytes)throw Error('Original legacy bytes must contain a noncanonical byte alias.');
   result.legacyBytes=format.legacyBytes;
  }
 }
 return result;
}
function detectLineEnding(text){const found=new Set();for(const match of text.matchAll(/\r\n|\r|\n/g))found.add(match[0]);return found.size>1?'mixed':found.has('\r\n')?'crlf':found.has('\r')?'cr':found.has('\n')?'lf':'none';}
function validUnicode(text){for(let i=0;i<text.length;i++){const n=text.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const next=text.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw Error('Text contains an unpaired Unicode surrogate.');}else if(n>=0xdc00&&n<=0xdfff)throw Error('Text contains an unpaired Unicode surrogate.');}}
function detectBom(bytes){return bytes[0]===0xff&&bytes[1]===0xfe&&bytes[2]===0&&bytes[3]===0?'utf32le':bytes[0]===0&&bytes[1]===0&&bytes[2]===0xfe&&bytes[3]===0xff?'utf32be':bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf?'utf8':bytes[0]===0xff&&bytes[1]===0xfe?'utf16le':bytes[0]===0xfe&&bytes[1]===0xff?'utf16be':null;}
function decodeText(input,encoding='auto'){
 if(encoding!=='auto'&&!ENCODINGS.includes(encoding))throw Error('Choose a supported text encoding.');const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length>MAX_BYTES)throw Error('Text file exceeds 10 MB.');
 const detected=encoding==='auto'||encoding.startsWith('utf')?detectBom(bytes):null;
 if(detected&&encoding!=='auto'&&encoding!==detected)throw Error(`The file BOM indicates ${detected}. Choose that encoding or Auto.`);
 const selected=detected||(encoding==='auto'?'utf8':encoding),bom=Boolean(detected),body=bytes.subarray(bom?(selected==='utf8'?3:selected.startsWith('utf32')?4:2):0);let content='',legacyBytes;
 if(selected==='windows1251'&&body.includes(0x98))throw Error('Invalid Windows-1251 text: byte 0x98 is undefined.');
 if(SINGLE_BYTE_ENCODINGS.includes(selected))content=decodeSingleByte(body,selected);
 else if(MULTIBYTE_ENCODINGS.includes(selected))({content,legacyBytes}=decodeMultibyte(body,selected));
 else if(Object.hasOwn(WINDOWS_CODEPAGES,selected)){const mapping=WINDOWS_CODEPAGES[selected],chunks=[];for(let start=0;start<body.length;start+=8192){const values=[];for(const byte of body.subarray(start,start+8192)){const point=byte<128?byte:mapping[byte-128];if(point===null)throw Error(`Invalid Windows-${selected.slice(7)} text: byte 0x${byte.toString(16).padStart(2,'0')} is undefined.`);values.push(point);}chunks.push(String.fromCharCode(...values));}content=chunks.join('');}
 else if(selected==='latin1'||selected==='windows1252'||selected==='windows1251'){const chunks=[];for(let start=0;start<body.length;start+=8192){const values=[];for(const byte of body.subarray(start,start+8192))values.push(selected==='windows1251'&&byte>=128?WINDOWS_1251[byte-128]:selected==='windows1252'&&byte>=128&&byte<160?WINDOWS_1252[byte-128]:byte);chunks.push(String.fromCharCode(...values));}content=chunks.join('');}
 else if(selected==='utf32le'||selected==='utf32be'){if(body.length%4)throw Error('Invalid UTF-32 text: incomplete code unit.');const view=new DataView(body.buffer,body.byteOffset,body.byteLength),chunks=[];for(let start=0;start<body.length;start+=32768){const points=[];for(let offset=start;offset<Math.min(start+32768,body.length);offset+=4){const point=view.getUint32(offset,selected==='utf32le');if(point>0x10ffff||(point>=0xd800&&point<=0xdfff))throw Error('Invalid UTF-32 text: not a Unicode scalar value.');points.push(point);}chunks.push(String.fromCodePoint(...points));}content=chunks.join('');}
 else{try{content=new TextDecoder({utf8:'utf-8',utf16le:'utf-16le',utf16be:'utf-16be'}[selected],{fatal:true,ignoreBOM:true}).decode(body);}catch{throw Error(`Invalid ${{utf8:'UTF-8',utf16le:'UTF-16LE',utf16be:'UTF-16BE'}[selected]} text. Reopen using the correct encoding; undecodable bytes are not replaced.`);}}
 validUnicode(content);if(content.includes('\0'))throw Error('Binary files cannot be opened in the text editor.');return {content,format:{encoding:selected,bom,lineEnding:detectLineEnding(content),...(legacyBytes?{legacyBytes}:{})}};
}
// Validate draft text without interpreting its first character as a file signature.
// Return UTF-8 bytes for content bindings; output encoding uses encodeText instead.
function validateText(text){
 if(typeof text!=='string')throw Error('Text must be a string.');
 if(text.length>MAX_BYTES)throw Error('Encoded text exceeds 10 MB.');
 validUnicode(text);if(text.includes('\0'))throw Error('Text contains a null character.');
 const bytes=new TextEncoder().encode(text);
 if(bytes.length>MAX_BYTES)throw Error('Encoded text exceeds 10 MB.');
 return bytes;
}
function encodeText(text,format={encoding:'utf8',bom:false,lineEnding:'none'}){
 if(typeof text!=='string')throw Error('Text must be a string.');if(text.length>MAX_BYTES)throw Error('Encoded text exceeds 10 MB.');format=validateFormat(format);validUnicode(text);if(text.includes('\0'))throw Error('Text contains a null character.');
 const ending={lf:'\n',crlf:'\r\n',cr:'\r'}[format.lineEnding];if(ending)text=text.replace(/\r\n|\r|\n/g,ending);
 if(format.legacyBytes!==undefined){
  const original=parseLegacyBytes(format.legacyBytes,MAX_BYTES),decoded=decodeText(original,format.encoding);
  if(decoded.content===text)return new Uint8Array(original.buffer,original.byteOffset,original.byteLength);
  if(!format.normalizeLegacy)throw Error('This file uses legacy byte aliases. Enable Normalize legacy byte aliases to save edited text, or save using UTF-8.');
 }
 let bytes;
 if(SINGLE_BYTE_ENCODINGS.includes(format.encoding))bytes=encodeSingleByte(text,format.encoding);
 else if(MULTIBYTE_ENCODINGS.includes(format.encoding))bytes=encodeMultibyte(text,format.encoding);
 else if(format.encoding==='utf8')bytes=new TextEncoder().encode(text);
 else if(format.encoding==='utf16le'||format.encoding==='utf16be'){if(text.length*2>MAX_BYTES)throw Error('Encoded text exceeds 10 MB.');bytes=new Uint8Array(text.length*2);const view=new DataView(bytes.buffer);for(let i=0;i<text.length;i++)view.setUint16(i*2,text.charCodeAt(i),format.encoding==='utf16le');}
 else if(format.encoding==='utf32le'||format.encoding==='utf32be'){let count=0;for(const point of text)count++;if(count*4>MAX_BYTES)throw Error('Encoded text exceeds 10 MB.');bytes=new Uint8Array(count*4);const view=new DataView(bytes.buffer);let offset=0;for(const point of text){view.setUint32(offset,point.codePointAt(0),format.encoding==='utf32le');offset+=4;}}
 else if(Object.hasOwn(WINDOWS_ENCODERS,format.encoding)){bytes=new Uint8Array(text.length);const mapping=WINDOWS_ENCODERS[format.encoding];for(let i=0;i<text.length;i++){const point=text.charCodeAt(i),byte=point<128?point:mapping.get(point);if(byte===undefined)throw Error(`Text cannot be represented in Windows-${format.encoding.slice(7)} without data loss.`);bytes[i]=byte;}}
 else if(format.encoding==='windows1251'){bytes=new Uint8Array(text.length);for(let i=0;i<text.length;i++){const point=text.charCodeAt(i),byte=point<128?point:WINDOWS_1251_ENCODE.get(point);if(byte===undefined)throw Error('Text cannot be represented in Windows-1251 without data loss.');bytes[i]=byte;}}
 else{if(text.length>MAX_BYTES)throw Error('Encoded text exceeds 10 MB.');bytes=new Uint8Array(text.length);for(let i=0;i<text.length;i++){const point=text.charCodeAt(i);let byte=point;if(format.encoding==='windows1252'){const special=WINDOWS_1252.indexOf(point);if(special>=0)byte=special+128;else if(point>=128&&point<160)throw Error('Text cannot be represented in Windows-1252 without data loss.');}if(byte>255)throw Error(`Text cannot be represented in ${format.encoding} without data loss.`);bytes[i]=byte;}}
 const prefix=format.bom?(format.encoding==='utf8'?[0xef,0xbb,0xbf]:format.encoding==='utf32le'?[0xff,0xfe,0,0]:format.encoding==='utf32be'?[0,0,0xfe,0xff]:format.encoding==='utf16le'?[0xff,0xfe]:[0xfe,0xff]):[];if(bytes.length+prefix.length>MAX_BYTES)throw Error('Encoded text exceeds 10 MB.');if(!prefix.length){if(format.encoding.startsWith('utf')&&detectBom(bytes))throw Error('Text starts with a Unicode BOM signature. Enable BOM to preserve the leading character when reopening.');return bytes;}const output=new Uint8Array(prefix.length+bytes.length);output.set(prefix);output.set(bytes,prefix.length);return output;
}
module.exports={decodeText,encodeText,validateText,validateFormat,detectLineEnding,ENCODINGS,MAX_BYTES,SINGLE_BYTE_LABELS};
