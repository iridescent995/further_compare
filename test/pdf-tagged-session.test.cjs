'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateSession}=require('../desktop/sessions.cjs');
const {PDF_TAGGED_EXCLUSIONS}=require('../src/document-projection.cjs');
const projection=()=>({kind:'pdf',version:4,engine:'pdfjs',engineVersion:'6.2.108',scope:'page-text',pages:1,emptyPages:0,order:'tagged-structure',orderVersion:1,exclusions:[...PDF_TAGGED_EXCLUSIONS]});
const session=()=>({version:1,type:'text-compare',name:'Tagged PDF',text:{a:'edited normalized draft',b:''},files:{a:{name:'source.pdf',path:'',documentProjection:projection()},b:{name:'',path:''}},folders:{a:null,b:null},options:{filter:'all',ignoreWhitespace:false,direction:'a-to-b',pdfOrders:{a:'tagged-structure',b:'document'}}});
test('tagged two-way policy and projection persist separately from drafts; legacy pending selection migrates',()=>{
 const value=session(),before=structuredClone(value);assert.deepEqual(validateSession(value),value);assert.deepEqual(value,before);value.options.pdfOrders.a='page-columns';const saved=validateSession(value);assert.equal(saved.options.pdfOrders.a,'tagged-structure');assert.equal(saved.text.a,'edited normalized draft');assert.deepEqual(saved.files.a.documentProjection,projection());
});
test('three-way tagged policy applies independently to base, left and right and retains source drafts',()=>{
 for(const side of ['base','a','b']){const value=session();value.type='text-merge3';value.files={a:{name:'',path:''},b:{name:'',path:''}};value.advanced={inputs:{base:null,a:null,b:null,[side]:{name:'source.pdf',data:Buffer.from('original bytes').toString('base64')}},options:{mergePdfOrders:{[side]:'tagged-structure'},mergeDocumentProjections:{[side]:projection()},mergeDrafts:{[side]:'edited source'}},output:'edited result'};assert.deepEqual(validateSession(value),value);const bad=structuredClone(value);bad.advanced.options.mergePdfOrders[side]='document';assert.throws(()=>validateSession(bad),/disagrees/);}
});
test('tagged session validation rejects malformed options and contradictory provenance',()=>{
 for(const mutate of [v=>v.options.pdfOrders.a='tagged',v=>v.options.pdfOrders={a:'tagged-structure'},v=>v.files.a.documentProjection.order='page-columns',v=>v.files.a.documentProjection.version=3,v=>v.files.a.documentProjection.orderVersion=2,v=>v.files.a.documentProjection.exclusions=[]]){const value=session();mutate(value);assert.throws(()=>validateSession(value));}
});

test('isolated native PDF preload admits tagged order and rejects unknown values',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events');for(const order of ['tagged-structure','tagged']){const ipc=new EventEmitter();ipc.send=()=>{};let api;vm.runInNewContext(fs.readFileSync('desktop/pdf-text-preload.cjs','utf8'),{require:()=>({contextBridge:{exposeInMainWorld(_name,value){api=value;}},ipcRenderer:ipc}),Uint8Array});let received;api.receive(value=>received=value);const invoke=()=>ipc.emit('pdf-text:input',{}, {bytes:new Uint8Array([1]),order});if(order==='tagged-structure'){invoke();assert.equal(received.order,order);}else assert.throws(invoke,/request/);}
});
