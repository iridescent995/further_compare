'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateSession}=require('../desktop/sessions.cjs');
const {PDF_EXCLUSIONS,PDF_PAGE_ROWS_EXCLUSIONS,PDF_PAGE_COLUMNS_EXCLUSIONS}=require('../src/document-projection.cjs');
const policies=['document','page-rows','page-columns'];
function projection(version){return {kind:'pdf',version,engine:'pdfjs',engineVersion:'6.2.108',scope:'page-text',pages:2,emptyPages:0,exclusions:[...[PDF_EXCLUSIONS,PDF_PAGE_ROWS_EXCLUSIONS,PDF_PAGE_COLUMNS_EXCLUSIONS][version-1]],...(version>1?{order:policies[version-1],orderVersion:1}:{})};}
function session(version,orders){return {version:1,type:'text-compare',name:'Applied provenance',text:{a:'Edited draft\r\nΩ\tuntouched',b:'Other draft'},files:{a:{name:'source.pdf',path:'',documentProjection:projection(version)},b:{name:'plain.txt',path:''}},folders:{a:null,b:null},options:{filter:'all',ignoreWhitespace:false,direction:'a-to-b',...(orders===undefined?{}:{pdfOrders:orders})}};}
for(let version=1;version<=3;version++)test(`PDF v${version}: applied provenance wins valid pending preferences without rewriting draft or source metadata`,()=>{
 for(const preference of [undefined,...policies]){
  const input=session(version,preference===undefined?undefined:{a:preference,b:'page-columns'}),before=structuredClone(input),saved=validateSession(input);
  assert.equal(saved.options.pdfOrders?.a??saved.files.a.documentProjection.order??'document',policies[version-1]);
  if(preference!==undefined)assert.equal(saved.options.pdfOrders.b,'page-columns');
  assert.deepEqual(saved.text,before.text);assert.deepEqual(saved.files,before.files);assert.deepEqual(input,before);
  assert.deepEqual(validateSession(saved),saved);
 }
});
test('Invalid pending enum/maps are rejected before any provenance normalization',()=>{
 for(const orders of [null,[],{},'document',{a:'bogus',b:'document'},{a:'document'},{a:'document',b:'document',base:'document'}])assert.throws(()=>validateSession(session(3,orders)),/ordering/i);
 const invalid=session(3,{a:'document',b:'document'});invalid.files.a.documentProjection.order='page-rows';assert.throws(()=>validateSession(invalid),/projection/i);
});
test('Plain text input preferences retain their requested value',()=>{const input=session(1,{a:'page-rows',b:'page-columns'});delete input.files.a.documentProjection;assert.deepEqual(validateSession(input),input);});
