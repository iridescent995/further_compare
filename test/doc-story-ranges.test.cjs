'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {preflightDoc}=require('../src/doc-preflight.cjs');
const {readDocHeaderRanges,mapDocHeaderRanges}=require('../src/doc-story-ranges.cjs');
const bytes=()=>fs.readFileSync(__dirname+'/fixtures/doc-independent/baseline.doc');
function changed(mutate){const d=preflightDoc(bytes()),table=d.table,wordDocument=d.wordDocument;mutate(d,table,wordDocument);return {...d,table,wordDocument};}
test('genuine DOC header slots retain section and variant identities and exclude guard characters',()=>{
 const ranges=readDocHeaderRanges(bytes());assert.equal(ranges.length,18);assert.equal(ranges.filter(r=>r.kind==='separator').length,6);
 assert.equal(ranges.filter(r=>r.section===1).length,6);assert.equal(ranges.filter(r=>r.section===2).length,6);
 assert.equal(ranges.find(r=>r.section===1&&r.variant==='even-header').empty,true);
 assert.equal(ranges.find(r=>r.section===1&&r.variant==='odd-header').empty,false);
 assert(Object.isFrozen(ranges));assert(ranges.every(Object.isFrozen));
});
test('header framing rejects truncated tables, invalid slot counts and CP order',()=>{
 const d=preflightDoc(bytes()),h=d.getPair(11);
 for(const length of [0,7,h.length-4,0x7fffffff])assert.throws(()=>mapDocHeaderRanges({...d,getPair:i=>i===11?{...h,length}:d.getPair(i)}),/header|story table/i);
 assert.throws(()=>mapDocHeaderRanges(changed((d,t)=>new DataView(t.buffer).setInt32(d.getPair(11).offset+4,-1,true))),/range/);
});
test('undefined final header CP is ignored; penultimate CP is authoritative',()=>{
 const d=changed((d,t)=>{const h=d.getPair(11);new DataView(t.buffer).setUint32(h.offset+h.length-4,0xffffffff,true);});assert.equal(mapDocHeaderRanges(d).length,18);
 assert.throws(()=>mapDocHeaderRanges(changed((d,t)=>{const h=d.getPair(11);new DataView(t.buffer).setUint32(h.offset+h.length-8,0,true);})),/range/);
});
test('missing header guards and section boundary characters reject',()=>{
 for(const cp of [39,264])assert.throws(()=>mapDocHeaderRanges(changed((d,t,w)=>{const p=d.pieces.find(p=>cp>=p.cpStart&&cp<p.cpEnd),at=p.offset+(cp-p.cpStart)*(p.compressed?1:2);new DataView(w.buffer).setUint16(at,65,true);})),/boundary|guard|terminator/);
});
test('empty later slot records inheritance without inventing page placement',()=>{
 const d=changed((d,t)=>{const h=d.getPair(11),v=new DataView(t.buffer);v.setUint32(h.offset+12*4,v.getUint32(h.offset+13*4,true),true);});
 const r=mapDocHeaderRanges(d).find(r=>r.section===2&&r.variant==='even-header');assert.equal(r.empty,true);assert.equal(r.inherits,true);
});
const {mapDocRelatedRanges,readDocRelatedRanges}=require('../src/doc-story-ranges.cjs');
test('related ranges identify all genuine stories and references without exposing trailing guards',()=>{
 const r=readDocRelatedRanges(bytes());assert.equal(r.length,23);
 for(const [kind,start,end,ref] of [['footnote',208,230,22],['endnote',366,385,30],['annotation',342,365,38],['textbox',386,406,197],['header-textbox',407,434,260]]){
  const p=r.find(p=>p.kind===kind);assert.deepEqual([p.start,p.end,p.refs[0]],[start,end,ref]);assert.equal(p.ordinal,1);assert(Object.isFrozen(p.refs));
 }
 assert(Object.isFrozen(r));assert(r.every(Object.isFrozen));
});
test('notes reject mismatched references, range gaps and missing paragraph guards',()=>{
 for(const [index,delta,value] of [[3,0,1],[3,4,21],[2,0,999],[5,4,22],[47,0,1]])assert.throws(()=>mapDocRelatedRanges(changed((d,t)=>new DataView(t.buffer).setInt32(d.getPair(index).offset+delta,value,true))),/range|reference|guard|terminator/);
 assert.throws(()=>mapDocRelatedRanges(changed((d,t,w)=>{const p=d.pieces[0];new DataView(w.buffer).setUint16(p.offset+230*2,65,true);})),/guard/);
});
test('undefined note/reference terminal positions are ignored',()=>{
 const d=changed((d,t)=>{const v=new DataView(t.buffer);for(const i of [3,5,47]){const p=d.getPair(i);v.setUint32(p.offset+p.length-4,0xffffffff,true);}for(const i of [2,4,46])v.setUint32(d.getPair(i).offset+4,0xffffffff,true);});assert.equal(mapDocRelatedRanges(d).length,23);
});
test('textboxes require complete ranges and a real matching shape; ignored terminal record never becomes a part',()=>{
 for(const [index,delta,value] of [[56,0,1],[56,8,20],[56,26,0x123456],[58,26,0x123456]])assert.throws(()=>mapDocRelatedRanges(changed((d,t)=>new DataView(t.buffer).setUint32(d.getPair(index).offset+delta,value,true))),/textbox|shape/);
 const d=changed((d,t)=>{const p=d.getPair(56);t.fill(0xff,p.offset+34,p.offset+56);});assert.equal(mapDocRelatedRanges(d).filter(r=>r.kind==='textbox').length,1);
});
test('shape references cannot point at ordinary text',()=>{
 for(const index of [40,41])assert.throws(()=>mapDocRelatedRanges(changed((d,t)=>new DataView(t.buffer).setInt32(d.getPair(index).offset,0,true))),/shape anchor/);
});
