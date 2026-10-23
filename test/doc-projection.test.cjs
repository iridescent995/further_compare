'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {extractDocText}=require('../src/doc-text.cjs'),{validateDocProjection}=require('../src/doc-projection.cjs');
const input=name=>fs.readFileSync(__dirname+'/fixtures/doc-independent/'+name+'.doc');
test('main scope isolates related changes; related scope records all mapped parts with stable labels',()=>{
 const a=extractDocText(input('baseline')),b=extractDocText(input('related-changed'));assert.equal(a.content,b.content);assert.equal(a.projection.scope,'main-document');assert.deepEqual(a.projection.relatedParts,[]);
 const full=extractDocText(input('baseline'),{scope:'main-and-related-text'}),changed=extractDocText(input('related-changed'),{scope:'main-and-related-text'});
 assert.notEqual(full.content,changed.content);assert.equal(full.projection.relatedParts.length,23);assert.deepEqual(new Set(full.projection.relatedParts.map(p=>p.kind)),new Set(['footnote','endnote','annotation','textbox','header-textbox','separator','header-footer']));
 for(const value of ['Footnote 中 original','Endnote original','Textbox Ω original','Header Café original'])assert(full.content.includes(value));
 assert(full.content.includes('[DOC Section 1 odd-header]'));assert.deepEqual(validateDocProjection(full.projection),full.projection);assert(!JSON.stringify(full.projection).includes('start'));assert(!full.content.includes('DATE'));
});
test('projection rejects forged policy, source offsets, duplicates and invalid header inheritance',()=>{
 const good=extractDocText(input('baseline'),{scope:'main-and-related-text'}).projection;
 for(const mutate of [p=>p.policy='visible-word-layout',p=>p.nFib=0,p=>p.relatedParts.push(p.relatedParts[0]),p=>p.relatedParts[0].start=123,p=>p.relatedParts[0].ordinal=2,p=>p.scope='main-document',p=>p.exclusions.pop(),p=>{const h=p.relatedParts.find(x=>x.kind==='header-footer');h.inherits=!h.inherits;},p=>{const h=p.relatedParts.filter(x=>x.kind==='header-footer');h[1].variant=h[0].variant;},p=>p.relatedParts.reverse()]){const p=structuredClone(good);mutate(p);assert.throws(()=>validateDocProjection(p),/metadata/);}
 const validated=validateDocProjection(good);validated.relatedParts[0].ordinal=999;assert.notEqual(good.relatedParts[0].ordinal,999);
});
