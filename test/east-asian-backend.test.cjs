'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const fixtures=require('./east-asian-encoding-fixtures.cjs');
const {runBatch}=require('../scripts/batch.cjs');
const {FolderService}=require('../desktop/folders.cjs');
const {decodeText,encodeText}=require('../src/text-codec.cjs');
const {validateSession}=require('../desktop/sessions.cjs');
test('batch compares all legacy fixtures and aliases without embedding original byte provenance in reports',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-east-batch-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const jobs=[];
 for(const [i,item]of [...fixtures,fixtures.alias].entries()){
  await fs.writeFile(path.join(root,'left'+i),item.bytes);await fs.writeFile(path.join(root,'right'+i),item.text+'\r\n');
  jobs.push({left:'left'+i,right:'right'+i,leftEncoding:item.encoding,output:'result'+i+'.json'});
 }
 const script=path.join(root,'batch.json');await fs.writeFile(script,JSON.stringify({version:1,jobs}));assert.equal((await runBatch(script)).code,0);
 for(let i=0;i<jobs.length;i++){
  const report=JSON.parse(await fs.readFile(path.join(root,'result'+i+'.json'),'utf8'));assert.equal(report.equal,true);assert.deepEqual(report.sourceFormats.left,{encoding:jobs[i].leftEncoding,bom:false,lineEnding:'crlf'});
 }
});
test('folder normalization compares legacy text with Unicode while byte-copy retains original aliases',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-east-folder-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const a=path.join(root,'a'),b=path.join(root,'b');await fs.mkdir(a);await fs.mkdir(b);const service=new FolderService(path.join(root,'backups'));await service.select('a',a);await service.select('b',b);
 for(const item of [...fixtures,fixtures.alias]){
  await fs.writeFile(path.join(a,'text.txt'),item.bytes);await fs.writeFile(path.join(b,'text.txt'),item.text+'\n');
  const result=await service.compareNode('',{mode:'text-whitespace',textEncodingA:item.encoding,textEncodingB:'utf8'});assert.equal(result.rows[0].status,'equal',item.encoding);assert.equal(result.rows[0].comparison,'text-normalized');
 }
 const preview=await service.previewAction('copy','a',['text.txt'],{status:'diff',rules:{mode:'content'}});await service.execute(preview.id);assert.deepEqual(await fs.readFile(path.join(b,'text.txt')),fixtures.alias.bytes);
});
test('sessions preserve alias provenance and explicit normalization choice while rejecting malformed provenance',()=>{
 const decoded=decodeText(fixtures.alias.bytes,'big5');
 const session={version:1,type:'text-compare',name:'Alias',text:{a:decoded.content,b:''},files:{a:{name:'',path:''},b:{name:'',path:''}},folders:{a:null,b:null},options:{ignoreWhitespace:false,filter:'all',direction:'a-to-b',textFormats:{a:decoded.format,b:{encoding:'utf8',bom:false,lineEnding:'none'}}}};
 const restored=validateSession(session);assert.deepEqual(Buffer.from(encodeText(restored.text.a,restored.options.textFormats.a)),fixtures.alias.bytes);
 session.text.a+='x';assert.doesNotThrow(()=>validateSession(session));assert.throws(()=>encodeText(session.text.a,restored.options.textFormats.a),/Normalize/);
 session.options.textFormats.a.normalizeLegacy=true;assert.equal(validateSession(session).options.textFormats.a.normalizeLegacy,true);
 session.options.textFormats.a.legacyBytes='INVALID';assert.throws(()=>validateSession(session),/legacy byte/);
});
