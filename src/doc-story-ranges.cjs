'use strict';
// MS-DOC 2.3.3, 2.8.22 and 2.8.26. Stored slots, not rendered page placement.
// https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-doc/8465bee7-6c79-45a9-812e-58b0c5fd6cdc
const {preflightDoc}=require('./doc-preflight.cjs');
const TYPES=['even-header','odd-header','even-footer','odd-footer','first-header','first-footer'];
const SEPARATORS=['footnote-separator','footnote-continuation-separator','footnote-continuation-notice','endnote-separator','endnote-continuation-separator','endnote-continuation-notice'];
const fail=message=>{throw Error('DOC story ranges: '+message);};
// Internal adapter accepts only descriptors produced by preflightDoc.
function mapDocHeaderRanges(doc){
 const table=doc.table,word=doc.wordDocument,t=new DataView(table.buffer,table.byteOffset,table.byteLength),w=new DataView(word.buffer,word.byteOffset,word.byteLength);
 const body=doc.stories.find(s=>s.kind==='body'),header=doc.stories.find(s=>s.kind==='headers');
 function pair(i){const p=doc.getPair(i);if(p.length&&p.offset+p.length>table.length)fail('Truncated story table.');return p;}
 function char(cp){let lo=0,hi=doc.pieces.length;while(lo<hi){const m=(lo+hi)>>>1;if(doc.pieces[m].cpEnd<=cp)lo=m+1;else hi=m;}const p=doc.pieces[lo];if(!p||cp<p.cpStart)fail('Character outside piece table.');const at=p.offset+(cp-p.cpStart)*(p.compressed?1:2);return p.compressed?word[at]:w.getUint16(at,true);}
 const h=pair(11);if(!header.length){if(h.length)fail('Unexpected header table without header text.');return Object.freeze([]);}
 if(h.length<32||h.length%4)fail('Missing or malformed header table.');
 const s=pair(6);if(s.length<20||(s.length-4)%16)fail('Missing or malformed section table.');
 const sections=(s.length-4)/16;if(sections>10000)fail('Section limit exceeded.');
 let previous=-1;
 for(let i=0;i<=sections;i++){const cp=t.getInt32(s.offset+i*4,true);if(cp<0||cp<=previous||i===0&&cp!==0||i<sections&&cp>=body.end||i===sections&&cp<body.end)fail('Invalid section range.');if(i>0&&i<sections&&char(cp-1)!==12)fail('Missing section boundary character.');previous=cp;}
 const count=h.length/4-2;if(count!==6+6*sections)fail('Header slot count disagrees with sections.');
 const cps=[];previous=-1;
 // The last table CP is undefined; never use it as a content boundary.
 for(let i=0;i<=count;i++){const cp=t.getInt32(h.offset+i*4,true);if(cp<0||cp<previous||cp>=header.length||i===0&&cp!==0)fail('Invalid header character range.');cps.push(cp);previous=cp;}
 if(cps[count]!==header.length-1)fail('Header range does not cover stored stories.');
 const ranges=[];
 for(let i=0;i<count;i++){
  const start=header.start+cps[i],end=header.start+cps[i+1],empty=start===end,separator=i<6,section=separator?0:Math.floor((i-6)/6)+1,variant=separator?SEPARATORS[i]:TYPES[(i-6)%6];
  if(!empty&&(char(end-1)!==13||!separator&&(end-start<2||char(end-2)!==13)))fail('Missing header guard or paragraph terminator.');
  ranges.push(Object.freeze({kind:separator?'separator':'header-footer',section,variant,start,end:empty?end:end-1,empty,inherits:!separator&&empty&&section>1}));
 }
 return Object.freeze(ranges);
}
function readDocHeaderRanges(input){return mapDocHeaderRanges(preflightDoc(input));}
module.exports={readDocHeaderRanges,mapDocHeaderRanges};

// MS-DOC 2.8.7/8, 2.8.16/17, 2.8.19/20, 2.8.23/32 and 2.9.106.
// Logical stored ranges only: shape layout/chaining, author identity and rendered
// citation numbering are not reconstructed. Undefined terminal PLC CPs are ignored.
function mapDocRelatedRanges(doc){
 const table=doc.table,word=doc.wordDocument,t=new DataView(table.buffer,table.byteOffset,table.byteLength),w=new DataView(word.buffer,word.byteOffset,word.byteLength),out=[],ordinals=new Map();
 const story=name=>doc.stories.find(s=>s.kind===name);
 function pair(index){const p=doc.getPair(index);if(p.length&&p.offset+p.length>table.length)fail('Truncated related story table.');return p;}
 function char(cp){let lo=0,hi=doc.pieces.length;while(lo<hi){const m=(lo+hi)>>>1;if(doc.pieces[m].cpEnd<=cp)lo=m+1;else hi=m;}const p=doc.pieces[lo];if(!p||cp<p.cpStart)fail('Character outside piece table.');const at=p.offset+(cp-p.cpStart)*(p.compressed?1:2);return p.compressed?word[at]:w.getUint16(at,true);}
 function add(r){if(out.length>=50000)fail('Related part limit exceeded.');const ordinal=(ordinals.get(r.kind)||0)+1;ordinals.set(r.kind,ordinal);out.push(Object.freeze({...r,ordinal,refs:Object.freeze(r.refs||[])}));}
 function notes(name,kind,textIndex,refIndex,width){
  const s=story(name),p=pair(textIndex),r=pair(refIndex);
  if(!s.length){if(p.length||r.length)fail('Unexpected '+kind+' table without text.');return;}
  if(p.length<12||p.length%4||r.length<4||(r.length-4)%(4+width))fail('Malformed '+kind+' tables.');
  const count=p.length/4-2;if(count>50000||(r.length-4)/(4+width)!==count)fail('Related reference count mismatch.');
  const cps=[];for(let i=0;i<=count;i++){const cp=t.getInt32(p.offset+i*4,true);if(cp<0||cp>=s.length||i===0&&cp!==0||i&&cp<=cps[i-1])fail('Invalid '+kind+' range.');cps.push(cp);}
  if(cps[count]!==s.length-1||char(s.end-1)!==13)fail('Missing '+kind+' trailing guard.');
  let previous=-1;
  for(let i=0;i<count;i++){
   const ref=t.getInt32(r.offset+i*4,true),start=s.start+cps[i],end=s.start+cps[i+1];
   if(ref<=previous||ref<0||ref>=story('body').length)fail('Invalid '+kind+' reference.');previous=ref;
   if(char(end-1)!==13)fail('Missing '+kind+' paragraph terminator.');
   if(kind==='annotation'){if(char(ref)!==5||char(start)!==5)fail('Invalid annotation marker.');}
   else if(t.getUint16(r.offset+(count+1)*4+i*width,true)!==0&&char(ref)!==2)fail('Invalid automatic note marker.');
   // Citation controls remain in the interval; the engine's qualified special-
   // character policy removes controls without deleting custom citation text.
   add({kind,story:name,start,end,refs:[ref]});
  }
 }
 notes('footnotes','footnote',3,2,2);notes('endnotes','endnote',47,46,2);notes('annotations','annotation',5,4,30);
 for(const h of mapDocHeaderRanges(doc))add({...h,story:'headers'});
 function boxes(name,kind,index,shapeIndex,anchorStory){
  const s=story(name),p=pair(index);if(!s.length){if(p.length)fail('Unexpected textbox table.');return;}
  if(p.length<30||(p.length-4)%26)fail('Malformed textbox table.');const count=(p.length-4)/26;if(count>50000)fail('Textbox limit exceeded.');
  const cps=[];for(let i=0;i<=count;i++){const cp=t.getInt32(p.offset+i*4,true);if(cp<0||cp>s.length||i===0&&cp!==0||i&&cp<=cps[i-1])fail('Invalid textbox range.');cps.push(cp);}if(cps[count]!==s.length)fail('Textbox table does not cover story.');
  const shapes=pair(shapeIndex),refs=new Map();if(shapes.length){if(shapes.length<4||(shapes.length-4)%30)fail('Malformed shape reference table.');const n=(shapes.length-4)/30;if(n>50000)fail('Shape reference limit exceeded.');let prev=-1;for(let i=0;i<n;i++){const cp=t.getInt32(shapes.offset+i*4,true),id=t.getUint32(shapes.offset+(n+1)*4+i*26,true);if(cp<0||cp>=anchorStory.length||cp<=prev||refs.has(id))fail('Invalid shape reference.');if(char(anchorStory.start+cp)!==8)fail('Invalid shape anchor marker.');prev=cp;refs.set(id,anchorStory.start+cp);}}
  const usedShapes=new Set();
  for(let i=0;i<count-1;i++){
   const at=p.offset+(count+1)*4+i*22,reusable=t.getUint16(at+8,true),start=s.start+cps[i],end=s.start+cps[i+1];
   if(char(end-1)!==13)fail('Missing textbox terminator.');
   if(reusable){if(!(reusable&1)||end-start!==1)fail('Invalid spare textbox.');continue;}
   if(end-start<=1||t.getInt32(at,true)<1)fail('Invalid actual textbox.');
   const id=t.getUint32(at+14,true),ref=refs.get(id);if(ref===undefined||usedShapes.has(id))fail('Unresolved or duplicate textbox shape reference.');usedShapes.add(id);
   add({kind,story:name,start,end,refs:[ref]});
  }
  // The final FTXBXS text range is explicitly undefined, even when its flag is
  // zero. It is never exposed as document text or interpreted as a real box.
 }
 boxes('textboxes','textbox',56,40,story('body'));boxes('headerTextboxes','header-textbox',58,41,story('headers'));
 return Object.freeze(out);
}
function readDocRelatedRanges(input){return mapDocRelatedRanges(preflightDoc(input));}
module.exports.mapDocRelatedRanges=mapDocRelatedRanges;
module.exports.readDocRelatedRanges=readDocRelatedRanges;
