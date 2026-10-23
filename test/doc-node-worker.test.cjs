'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {extractDocText}=require('../src/doc-text.cjs'),{extractDocTextInNode}=require('../src/doc-text-node.cjs');
test('real Node worker agrees with both scoped projections and leaves original Buffer intact',async()=>{
 const input=fs.readFileSync(__dirname+'/fixtures/doc-independent/baseline.doc'),before=Buffer.from(input);
 for(const scope of ['main-document','main-and-related-text'])assert.deepEqual(await extractDocTextInNode(input,{scope}),extractDocText(input,{scope}));assert.deepEqual(input,before);
});
test('real worker cancellation and malformed input settle without a partial projection',async()=>{
 const bytes=fs.readFileSync(__dirname+'/fixtures/doc-independent/baseline.doc'),c=new AbortController(),work=extractDocTextInNode(bytes,{signal:c.signal});c.abort();await assert.rejects(work,e=>e.code==='DOCUMENT_CANCELLED');
 await assert.rejects(extractDocTextInNode(new Uint8Array([1,2,3])),/input|compound|DOC/i);
 assert((await extractDocTextInNode(bytes)).content.includes('Body Café'));
});
