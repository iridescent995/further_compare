'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {DOMParser}=require('@xmldom/xmldom');
const {extractDocxText}=require('../src/docx-text.cjs');
const {validateSession,stageSessionData}=require('../desktop/sessions.cjs');
const {documentBytes}=require('./docx-ui-fixture.cjs');
const session=projection=>({version:1,type:'text-compare',name:'Document comparison',text:{a:'Edited extracted text',b:''},files:{a:{name:'source.docx',path:'',documentProjection:projection},b:{name:'',path:''}},folders:{a:null,b:null},options:{filter:'all',ignoreWhitespace:false,direction:'a-to-b'}});
test('DOCX projection provenance survives normalized sessions without claiming source contents were edited',async()=>{
 const {projection}=await extractDocxText(await documentBytes(),{DOMParser});const source=session(projection),saved=validateSession(source);
 assert.deepEqual(saved.files.a.documentProjection,projection);assert.notEqual(saved.files.a.documentProjection,projection);assert.notEqual(saved.files.a.documentProjection.exclusions,projection.exclusions);assert.equal(saved.text.a,'Edited extracted text');
 const restored=validateSession(JSON.parse(JSON.stringify(saved)));assert.deepEqual(restored.files.a.documentProjection,projection);
 for(const change of [value=>value.files.a.documentProjection.kind='text',value=>value.files.a.documentProjection.exclusions=[],value=>value.type='folder-compare']){const bad=structuredClone(source);change(bad);assert.throws(()=>validateSession(bad));}
});
test('DOCX session staging preserves source reload path, projection metadata and edited draft without writing source',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-docx-session-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const bytes=await documentBytes(),file=path.join(root,'source.docx');await fs.writeFile(file,bytes);const {projection}=await extractDocxText(bytes,{DOMParser});const value=session(projection);value.files.a.path=file;
 const staged=await stageSessionData(value,path.join(root,'backup'));assert.equal(staged.data.text.a,'Edited extracted text');assert.deepEqual(staged.data.files.a.documentProjection,projection);assert.equal(staged.textPaths.a,await fs.realpath(file));assert.deepEqual(await fs.readFile(file),bytes);
});

test('related DOCX scope requires explicit matching policy and preserves edited drafts',async()=>{
 const bytes=await fs.readFile(path.join(__dirname,'fixtures/docx-related-independent/baseline.docx')),{projection}=await extractDocxText(bytes,{DOMParser,scope:'main-and-related-text'}),value=session(projection);value.options.docxScopes={a:'main-and-related-text',b:'main-document'};
 assert.equal(validateSession(value).options.docxScopes.a,'main-and-related-text');assert.equal(validateSession(value).text.a,'Edited extracted text');
 for(const policy of [undefined,{a:'main-document',b:'main-document'},{a:'all',b:'main-document'},[],{a:'main-and-related-text',b:'main-document',base:'main-document'}]){const bad=structuredClone(value);if(policy===undefined)delete bad.options.docxScopes;else bad.options.docxScopes=policy;assert.throws(()=>validateSession(bad),/DOCX/);}
 const merge={...session(projection),type:'text-merge3',files:{a:{name:'',path:''},b:{name:'',path:''}},advanced:{inputs:{base:{name:'source.docx',data:bytes.toString('base64')},a:null,b:null},options:{mergeDocxScopes:{base:'main-and-related-text'},mergeDocumentProjections:{base:projection},mergeDrafts:{base:'edited related source'}},output:'edited result'}};
 assert.equal(validateSession(merge).advanced.options.mergeDrafts.base,'edited related source');delete merge.advanced.options.mergeDocxScopes;assert.throws(()=>validateSession(merge),/DOCX/);
});
