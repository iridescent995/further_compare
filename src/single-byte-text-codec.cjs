'use strict';
// Explicit SBCS mappings from the existing pinned iconv-lite 0.7.2 dependency.
// Do not invoke its permissive encoder: unsupported characters must fail before
// publication. Full-byte mappings are independently checked against Python.
const tables=require('iconv-lite/encodings/sbcs-data-generated');
const SINGLE_BYTE_LABELS=Object.freeze({cp437:'CP437 (DOS)',cp850:'CP850 (DOS Western European)','iso8859-15':'ISO-8859-15 (Latin-9)','koi8-r':'KOI8-R (Cyrillic)',macroman:'MacRoman (Western European)'});
const source={cp437:'cp437',cp850:'cp850','iso8859-15':'iso885915','koi8-r':'koi8r',macroman:'macroman'};
const mappings=new Map();
for(const [name,id]of Object.entries(source)){
 const chars=tables[id]?.chars;if(typeof chars!=='string'||chars.length!==128)throw Error('Unsupported pinned single-byte mapping.');
 const points=[...Array(128).keys(),...Array.from(chars,c=>c.charCodeAt(0))];
 // iconv-lite ships an older Mac table. Apply Apple's Mac OS 8.5+ Roman
 // mapping (ROMAN.TXT c02, 2005-04-05), rather than silently emitting the
 // old currency/Ohm mappings or an unmapped private-use character.
 // https://www.unicode.org/Public/MAPPINGS/VENDORS/APPLE/ROMAN.TXT
 if(name==='macroman'){points[0xbd]=0x03a9;points[0xdb]=0x20ac;points[0xf0]=0xf8ff;}
 const inverse=new Map(points.map((point,byte)=>[point,byte]));
 // These profiles are bijective. A dependency change must not silently introduce
 // aliases requiring the multibyte original-byte preservation protocol.
 if(points.length!==256||inverse.size!==256||points.includes(0xfffd))throw Error('Ambiguous pinned single-byte mapping.');
 mappings.set(name,{points,inverse});
}
function mapping(encoding){const value=mappings.get(encoding);if(!value)throw Error('Unsupported single-byte text encoding.');return value;}
function decodeSingleByte(bytes,encoding){const {points}=mapping(encoding),chunks=[];for(let start=0;start<bytes.length;start+=8192)chunks.push(String.fromCharCode(...Array.from(bytes.subarray(start,start+8192),byte=>points[byte])));return chunks.join('');}
function encodeSingleByte(text,encoding){const {inverse}=mapping(encoding),bytes=new Uint8Array(text.length);for(let i=0;i<text.length;i++){const byte=inverse.get(text.charCodeAt(i));if(byte===undefined)throw Error(`Text cannot be represented in ${SINGLE_BYTE_LABELS[encoding]} without data loss.`);bytes[i]=byte;}return bytes;}
module.exports={SINGLE_BYTE_LABELS,SINGLE_BYTE_ENCODINGS:Object.freeze(Object.keys(source)),decodeSingleByte,encodeSingleByte};
