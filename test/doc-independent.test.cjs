'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {extractDocStories}=require('../src/doc-text-engine.cjs'),{preflightDoc}=require('../src/doc-preflight.cjs');
const root=path.join(__dirname,'fixtures/doc-independent'),oracle=JSON.parse(fs.readFileSync(path.join(root,'expected.json'))),hashes=JSON.parse(fs.readFileSync(path.join(root,'sha256.json')));
const normalized=s=>s.replace(/\s+/gu,' ').trim();
const bytes=name=>fs.readFileSync(path.join(root,name));
// Independent CFB utility locates streams only for labelled malformed derivatives;
// no application output contributes to the valid text oracle.
function mutation(edit){const input=bytes('baseline.doc'),cfb=require('xlsx').CFB.read(input,{type:'buffer'});const streams={};for(const name of ['WordDocument','1Table']){const content=cfb.FileIndex.find(e=>e.name===name).content,at=input.indexOf(content);assert(at>=0,'Fixture stream must be contiguous');streams[name]=input.subarray(at,at+content.length);}edit(streams);return input;}
function fib(word){let p=32;p+=2+word.readUInt16LE(p)*2;const lw=p+2;p+=2+word.readUInt16LE(p)*4;return {lw,pairs:p+2};}
for(const name of Object.keys(oracle))test('genuine LibreOffice DOC all seven stored stories match independent readback: '+name,()=>{
 const input=bytes(name),before=Buffer.from(input);assert.equal(crypto.createHash('sha256').update(input).digest('hex'),hashes[name]);const {stories,policy}=extractDocStories(input),expected=oracle[name];assert.equal(policy,'stored-story-text-v1');assert.deepEqual(Object.keys(stories),['body','footnotes','headers','annotations','endnotes','textboxes','headerTextboxes']);
 // The authored fixture has generated note labels1/i at these exact anchors.
 const body=expected.body.replace(/alpha1 middlei omega\./u,'alpha middle omega.').replace(/alpha middle1i omega\./u,'alpha middle omega.');assert.equal(normalized(stories.body),normalized(body));
 for(const [kind,values]of [['footnotes',expected.footnotes.map(n=>n.text)],['endnotes',expected.endnotes.map(n=>n.text)],['annotations',expected.annotations.map(n=>n.text)],['textboxes',expected.textboxes.filter(n=>n.name==='Frame1').map(n=>n.text)],['headerTextboxes',expected.textboxes.filter(n=>n.name==='Frame2').map(n=>n.text)]])assert.equal(normalized(stories[kind]),normalized(values.join('\n')),kind);
 const headerLines=stories.headers.split(/[\r\n]+/).map(normalized).filter(Boolean),expectedHeaders=expected.pages.flatMap(p=>[p.HeaderText,p.FooterText]).map(normalized);assert.deepEqual([...new Set(headerLines)].sort(),[...new Set(expectedHeaders)].sort());for(const line of expectedHeaders)assert(headerLines.includes(line));
 assert(stories.body.includes('Cell A1 Café\tCell B1 Ω\n'),'table first row boundaries');assert(stories.body.includes('Cell A2 中\t\n'),'empty final table cell retained');assert(!stories.body.includes('DATE'),'stored field result excludes field instruction');assert.deepEqual(input,before);
});
test('related-only changes do not leak into body and body changes do not alter other stories',()=>{const base=extractDocStories(bytes('baseline.doc')).stories,related=extractDocStories(bytes('related-changed.doc')).stories,body=extractDocStories(bytes('body-changed.doc')).stories;assert.equal(base.body,related.body);assert.notEqual(base.body,body.body);for(const kind of Object.keys(base).filter(k=>k!=='body')){assert.notEqual(base[kind],related[kind],kind);assert.equal(base[kind],body[kind],kind);}});
test('malformed FIB version, table selection, encryption and story counts refuse',()=>{for(const edit of [w=>w.writeUInt16LE(0x9999,2),w=>w.writeUInt16LE(w.readUInt16LE(10)^0x200,10),w=>w.writeUInt16LE(w.readUInt16LE(10)|0x100,10),w=>w.writeInt32LE(-1,fib(w).lw+3*4)])assert.throws(()=>preflightDoc(mutation(s=>edit(s.WordDocument))),/DOC|compound|unsupported/i);});
test('malformed CLX framing, character coverage and physical text bounds refuse',()=>{
 for(const edit of [(w,t,f)=>w.writeUInt32LE(t.length+1,f.pairs+33*8),(w,t,f)=>{const p=w.readUInt32LE(f.pairs+33*8);t.writeUInt32LE(0xffffffff,p+1);},(w,t,f)=>{const p=w.readUInt32LE(f.pairs+33*8);assert.equal(t[p],2);t.writeInt32LE(1,p+5);},(w,t,f)=>{const p=w.readUInt32LE(f.pairs+33*8);t.writeUInt32LE(0x3ffffffe,p+5+8+2);}])assert.throws(()=>preflightDoc(mutation(s=>edit(s.WordDocument,s['1Table'],fib(s.WordDocument)))),/DOC/i);
});
test('malformed field nesting refuses rather than returning partially stripped text',()=>{const input=mutation(s=>{const w=s.WordDocument;let found=false;for(let p=1024;p<w.length-2;p+=2)if(w.readUInt16LE(p)===0x13){w.writeUInt16LE(0x14,p);found=true;break;}assert(found,'genuine field begin');});assert.throws(()=>extractDocStories(input),/field/i);});
test('aborted extraction reports cancellation without changing source',()=>{const input=bytes('baseline.doc'),copy=Buffer.from(input),controller=new AbortController();controller.abort();assert.throws(()=>extractDocStories(input,{signal:controller.signal}),e=>e.code==='DOCUMENT_CANCELLED');assert.deepEqual(input,copy);});
test('meaningful WordDocument bound excludes stale bytes beyond cbMac',()=>{const input=mutation(s=>s.WordDocument.writeUInt32LE(2048,fib(s.WordDocument).lw));assert.throws(()=>extractDocStories(input),/bounds|cbMac|meaningful|truncat|DOC/i);});
test('stored odd-header/footer slots independently match page-style readback',()=>{
 const {mapDocHeaderRanges}=require('../src/doc-story-ranges.cjs');for(const name of Object.keys(oracle)){const doc=preflightDoc(bytes(name)),ranges=mapDocHeaderRanges(doc),word=Buffer.from(doc.wordDocument);function text(range){let out='';for(const piece of doc.pieces){const a=Math.max(piece.cpStart,range.start),b=Math.min(piece.cpEnd,range.end);if(a>=b)continue;assert.equal(piece.compressed,false,'genuine producer uses UTF16 pieces');out+=word.subarray(piece.offset+(a-piece.cpStart)*2,piece.offset+(b-piece.cpStart)*2).toString('utf16le');}let visible='',stack=[];for(const ch of out){if(ch==='\x13'){stack.push(true);continue;}if(ch==='\x14'){assert(stack.length);stack[stack.length-1]=false;continue;}if(ch==='\x15'){assert(stack.length);stack.pop();continue;}if(!stack.some(Boolean))visible+=ch;}assert.equal(stack.length,0);return normalized(visible.replace(/[\x00-\x08\x0e-\x1f]/g,''));}
 const headers=ranges.filter(r=>r.variant==='odd-header'&&!r.empty).map(text),footers=ranges.filter(r=>r.variant==='odd-footer'&&!r.empty).map(text);assert.deepEqual(headers,oracle[name].pages.map(p=>p.HeaderText));assert.deepEqual(footers,oracle[name].pages.map(p=>p.FooterText));assert.equal(ranges.filter(r=>r.kind==='separator').length,6);for(const r of ranges)assert.equal(r.inherits,r.kind==='header-footer'&&r.empty&&r.section>1);
 }
});
test('labelled direct-revision derivative deletes exactly its authored first-word run',()=>{
 function revised(operand){return mutation(s=>{const w=s.WordDocument,t=s['1Table'],f=fib(w),bin=w.readUInt32LE(f.pairs+12*8),len=w.readUInt32LE(f.pairs+12*8+4),n=(len-4)/8,page=t.readUInt32LE(bin+(n+1)*4)*512,count=w[page+511],head=page+4*(count+1),first=w.readUInt32LE(page),next=w.readUInt32LE(page+4);assert.equal(w.subarray(first,first+10).toString('utf16le'),'Body ');assert(next>first+10);const used=[];for(let i=0;i<count;i++)if(w[head+i]){const at=page+2*w[head+i];used.push([at,at+1+w[at]]);}let free=-1;for(let p=head+count+(head+count)%2;p+4<page+511;p+=2)if(!used.some(([a,b])=>p<b&&p+4>a)&&w.subarray(p,p+4).every(v=>v===0)){free=p;break;}assert(free>0);w[free]=3;w.writeUInt16LE(0x0800,free+1);w[free+3]=operand;w[head]=(free-page)/2;w.writeUInt32LE(first+10,page+4);});}
 const expected=oracle['baseline.doc'].body.replace('alpha1 middlei omega.','alpha middle omega.');assert.equal(normalized(extractDocStories(revised(0)).stories.body),normalized(expected));assert.equal(normalized(extractDocStories(revised(1)).stories.body),normalized(expected.slice(5)));for(const value of [2,128,129])assert.throws(()=>extractDocStories(revised(value)),/deletion toggle/i);
});
test('a consistent bin/FKP gap cannot silently default missing paragraph properties',()=>{const input=mutation(s=>{const w=s.WordDocument,t=s['1Table'],f=fib(w),bin=w.readUInt32LE(f.pairs+13*8),len=w.readUInt32LE(f.pairs+13*8+4),n=(len-4)/8,page=t.readUInt32LE(bin+(n+1)*4)*512,first=t.readUInt32LE(bin);t.writeUInt32LE(first+10,bin);w.writeUInt32LE(first+10,page);});assert.throws(()=>extractDocStories(input),/paragraph.*coverage|paragraph.*properties/i);});
test('piece no-paragraph declaration cannot contradict genuine paragraph marks',()=>{const input=mutation(s=>{const w=s.WordDocument,t=s['1Table'],f=fib(w),clx=w.readUInt32LE(f.pairs+33*8),pcd=clx+5+8;assert.equal(t[clx],2);t.writeUInt16LE(t.readUInt16LE(pcd)|1,pcd);});assert.throws(()=>extractDocStories(input),/paragraph|piece/i);});
test('reference-qualified related parts preserve every independently observed story',()=>{
 for(const name of Object.keys(oracle)){const expected=oracle[name],parts=extractDocStories(bytes(name)).relatedParts;for(const [kind,texts]of [['footnote',expected.footnotes.map(n=>n.text)],['endnote',expected.endnotes.map(n=>n.text)],['annotation',expected.annotations.map(n=>n.text)],['textbox',expected.textboxes.filter(n=>n.name==='Frame1').map(n=>n.text)],['header-textbox',expected.textboxes.filter(n=>n.name==='Frame2').map(n=>n.text)]]){const actual=parts.filter(p=>p.kind===kind);assert.deepEqual(actual.map(p=>normalized(p.text)),texts.map(normalized));assert.deepEqual(actual.map(p=>p.ordinal),texts.map((_,i)=>i+1));for(const p of actual){assert.equal(p.refs.length,1);assert(Number.isInteger(p.refs[0]));}}
 for(const [variant,key]of [['odd-header','HeaderText'],['odd-footer','FooterText']]){const selected=parts.filter(p=>p.kind==='header-footer'&&p.variant===variant);assert.deepEqual(selected.map(p=>normalized(p.text)),expected.pages.map(p=>normalized(p[key])));assert.deepEqual(selected.map(p=>p.section),[1,2]);}
 assert.equal(parts.filter(p=>p.kind==='separator').length,6);
 }
});
test('related reference count, bounds and shape identity corruption refuse',()=>{
 for(const edit of [(w,t,f)=>{const at=w.readUInt32LE(f.pairs+40*8);t.writeInt32LE(0,at);},(w,t,f)=>{const at=w.readUInt32LE(f.pairs+2*8);t.writeInt32LE(0x7fffffff,at);},(w,t,f)=>{const at=f.pairs+3*8+4;w.writeUInt32LE(w.readUInt32LE(at)+4,at);},(w,t,f)=>{const at=w.readUInt32LE(f.pairs+4*8);t.writeInt32LE(0,at);},(w,t,f)=>{const at=w.readUInt32LE(f.pairs+56*8),n=(w.readUInt32LE(f.pairs+56*8+4)-4)/26;t.writeUInt32LE(0xffffffff,at+(n+1)*4+14);}])assert.throws(()=>extractDocStories(mutation(s=>edit(s.WordDocument,s['1Table'],fib(s.WordDocument)))),/reference|range|marker|textbox|story/i);
});

test('reserved Pcd fR1 flag does not change independently qualified stories',()=>{
 const input=mutation(s=>{const w=s.WordDocument,t=s['1Table'],clx=w.readUInt32LE(fib(w).pairs+33*8),pcd=clx+5+8;t.writeUInt16LE(t.readUInt16LE(pcd)|2,pcd);});
 assert.deepEqual(extractDocStories(input),extractDocStories(bytes('baseline.doc')));
});
test('genuine relocated note and comment anchors differ only in full-related projection',()=>{
 const {extractDocText}=require('../src/doc-text.cjs'),original=bytes('baseline.doc'),moved=bytes('anchors-moved.doc'),before=Buffer.from(moved);
 const a=extractDocStories(original),b=extractDocStories(moved);assert.deepEqual(a.stories,b.stories,'all seven independently observed story strings stay unchanged');
 const ma=extractDocText(original),mb=extractDocText(moved);assert.equal(ma.content,mb.content);
 const ra=extractDocText(original,{scope:'main-and-related-text'}),rb=extractDocText(moved,{scope:'main-and-related-text'});assert.notEqual(ra.content,rb.content);
 assert(ra.content.includes('alpha[DOC reference: Footnote 1] middle'));
 assert(rb.content.includes('alpha middle[DOC reference: Footnote 1]'));
 assert(ra.content.includes('omega.[DOC reference: Comment 1]'));
 assert(rb.content.includes('Body final.[DOC reference: Comment 1]'));
 const strip=s=>s.replace(/\[DOC reference: (?:Footnote|Endnote|Comment|Text box|Header text box) \d+\]/g,'');assert.equal(strip(ra.content),strip(rb.content));assert.deepEqual(moved,before);
});
