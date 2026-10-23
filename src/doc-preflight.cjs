'use strict';
// Structural admission only; field/revision/list/property semantics belong to
// the text adapter. MS-DOC 2.5.1/2.5.14, 2.8.35, 2.9.38/73/177/178/209.
// https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-doc/9aeaa2e7-4a45-468e-ab13-3f6193eb9394
// https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-doc/fe661052-9c88-4ae1-aec4-44799b2b4777
// https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-doc/1caae71f-35c4-49d7-adf0-af5fc766331c
const {readCompoundFile}=require('./compound-file.cjs');
const VERSIONS=new Map([[0xc1,[93,0]],[0xd9,[108,2]],[0x101,[136,2]],[0x10c,[164,2]],[0x112,[183,5]]]);
const MAX_CP=8*1024*1024,MAX_PIECES=100000,MAX_PRC=32768;
function fail(message){throw Error('DOC: '+message);}
function preflightDoc(input){
 const compound=readCompoundFile(input),streams=compound.streams;let word=streams.get('WordDocument');
 if(!word)fail('Missing root WordDocument stream.');
 const w=new DataView(word.buffer,word.byteOffset,word.byteLength),need=(p,n)=>{if(!Number.isSafeInteger(p)||!Number.isSafeInteger(n)||p<0||n<0||p+n>word.length)fail('Truncated FIB.');};
 const u16=p=>{need(p,2);return w.getUint16(p,true);},u32=p=>{need(p,4);return w.getUint32(p,true);};
 need(0,32);if(u16(0)!==0xa5ec)fail('Invalid Word signature.');const baseVersion=u16(2),flags=u16(10);if(!VERSIONS.has(baseVersion))fail('Unsupported Word version.');if(flags&0x8100)fail('Encrypted or obfuscated Word documents are unsupported.');
 let p=32;const csw=u16(p);if(csw!==14)fail('Invalid FIB word count.');p+=2+csw*2;const cslw=u16(p);if(cslw!==22)fail('Invalid FIB long count.');p+=2;const rgLwOffset=p;p+=cslw*4;const pairCount=u16(p);if(pairCount>183||pairCount<93)fail('Invalid FIB pair count.');p+=2;const rgFcLcbOffset=p;need(p,pairCount*8+2);p+=pairCount*8;const cswNew=u16(p);p+=2;if(cswNew>5)fail('Invalid FIB extension count.');need(p,cswNew*2);const nFib=cswNew?u16(p):baseVersion,profile=VERSIONS.get(nFib);if(!profile||pairCount!==profile[0]||cswNew!==profile[1])fail('FIB version/count mismatch.');p+=cswNew*2;const fibEnd=p;const cbMac=u32(rgLwOffset);if(cbMac<fibEnd||cbMac>word.length)fail('Invalid logical WordDocument extent.');word=word.slice(0,cbMac);
 const pairs=Object.freeze(Array.from({length:pairCount},(_,i)=>Object.freeze({offset:u32(rgFcLcbOffset+i*8),length:u32(rgFcLcbOffset+i*8+4)})));
 const getPair=index=>{if(!Number.isInteger(index)||index<0||index>=pairs.length)fail('Invalid FIB pair index.');return pairs[index];};
 const tableName=flags&0x200?'1Table':'0Table',table=streams.get(tableName);if(!table)fail('Missing selected '+tableName+' stream.');const t=new DataView(table.buffer,table.byteOffset,table.byteLength),clx=getPair(33),end=clx.offset+clx.length;if(clx.length<9||end>table.length)fail('Invalid or truncated CLX range.');
 const stories=[];let total=0;for(const [kind,index]of [['body',3],['footnotes',4],['headers',5],['annotations',7],['endnotes',8],['textboxes',9],['headerTextboxes',10]]){const length=w.getInt32(rgLwOffset+index*4,true);if(length<0||length>MAX_CP||total+length>MAX_CP)fail('Invalid or excessive story character count.');stories.push(Object.freeze({kind,start:total,end:total+length,length}));total+=length;}
 const hasRelated=stories.slice(1).some(s=>s.length>0),expectedFinal=total+(hasRelated?1:0);p=clx.offset;const prcs=[];
 while(p<end&&table[p]===1){if(p+3>end)fail('Truncated Prc.');const length=t.getInt16(p+1,true);if(length<0||p+3+length>end||prcs.length>=MAX_PRC)fail('Invalid or excessive Prc.');prcs.push(Object.freeze({offset:p+3,length}));p+=3+length;}
 if(p+5>end||table[p]!==2)fail('Missing Pcdt.');const length=t.getUint32(p+1,true);p+=5;if(length<4||(length-4)%12||p+length!==end)fail('Invalid Pcdt size.');const count=(length-4)/12;if(count>MAX_PIECES)fail('Piece count limit exceeded.');const cpAt=i=>t.getInt32(p+i*4,true);if(cpAt(0)!==0||cpAt(count)!==expectedFinal)fail('Piece table story coverage mismatch.');const pieces=[];
 for(let i=0;i<count;i++){const cpStart=cpAt(i),cpEnd=cpAt(i+1),at=p+(count+1)*4+i*8,pcdFlags=t.getUint16(at,true),fc=t.getUint32(at+2,true),prm=t.getUint16(at+6,true);if(cpStart<0||cpEnd<=cpStart||cpEnd>expectedFinal)fail('Invalid piece character positions.');if(pcdFlags&4)fail('Dirty Pcd is unsupported.');const compressed=Boolean(fc&0x40000000),rawOffset=fc&0x3fffffff;if(compressed&&rawOffset%2)fail('Invalid compressed text offset.');const offset=compressed?rawOffset/2:rawOffset,byteLength=(cpEnd-cpStart)*(compressed?1:2);if(offset<fibEnd||offset+byteLength>word.length)fail('Piece text outside WordDocument bounds.');if((prm&1)&&(prm>>>1)>=prcs.length)fail('Missing piece property group.');pieces.push(Object.freeze({cpStart,cpEnd,offset,compressed,byteLength,prm,flags:pcdFlags}));}
 return Object.freeze({nFib,baseVersion,tableName,flags,totalCharacters:total,finalCp:expectedFinal,fib:Object.freeze({rgLwOffset,rgFcLcbOffset,pairCount,end:fibEnd,cbMac}),stories:Object.freeze(stories),pieces:Object.freeze(pieces),prcs:Object.freeze(prcs),getPair,get wordDocument(){return word.slice();},get table(){return table.slice();}});
}
module.exports={preflightDoc};
