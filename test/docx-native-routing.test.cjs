'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ShellRequests,comparisonType}=require('../desktop/shell-requests.cjs');
const {FolderService}=require('../desktop/folders.cjs');
const {stageFolderPair,validateStagedPair}=require('../desktop/folder-pair.cjs');
const {stageProviderFolderOpen}=require('../desktop/provider-folder-open.cjs');
async function docx(){
 const zip=new(require('jszip'))();
 zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
 zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
 zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello document</w:t></w:r></w:p><w:sectPr/></w:body></w:document>');
 return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-docx-routing-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const bytes=await docx();for(const side of ['left','right'])await fs.mkdir(path.join(root,side));const a=path.join(root,'left','sample.docx'),b=path.join(root,'right','sample.txt');await fs.writeFile(a,bytes);await fs.writeFile(b,'Hello text');const folders=new FolderService(path.join(root,'backups'));await folders.select('a',path.dirname(a));await folders.select('b',path.dirname(b));return {root,a,b,bytes,folders};}
function provider(bytes){let closed=0,validations=0;const info={path:'sample.docx',kind:'file',identity:'remote-file',stamp:'original',size:bytes.length};const service={roots:{a:'opaque'},inspectRoot:async()=>({path:'opaque',identity:'root'}),inspectEntry:async()=>({...info}),openFileReader:async()=>{let offset=0;return {metadata:{...info},read:async max=>{if(offset===bytes.length)return null;const value=bytes.subarray(offset,offset+max);offset+=value.length;return value;},validate:async()=>{validations++;return {...info};},close:async()=>{closed++;}};}};return {service,info,closed:()=>closed,validations:()=>validations};}
test('shell DOCX projection compares with plain text and preserves source snapshots',async t=>{
 const f=await fixture(t),shell=new ShellRequests(path.join(f.root,'left.json'));assert.equal(comparisonType('DOCUMENT.DOCX'),'text-compare');shell.enqueue(['--fc-compare',f.a,f.b]);const result=await shell.take();assert.equal(result.mode,'text-compare');assert.match(result.a.content,/Hello document/);assert.equal(result.b.content,'Hello text');assert.equal(result.a.documentProjection.kind,'docx');assert.equal(result.b.documentProjection,undefined);assert.equal(result.a.data,undefined);assert.equal(result.a.saveToken,undefined);await shell.validateFiles(result);assert.deepEqual(await fs.readFile(f.a),f.bytes);
});
test('malformed DOCX shell selection fails closed without changing remembered left',async t=>{
 const f=await fixture(t),shell=new ShellRequests(path.join(f.root,'left.json'));await shell.setLeft(f.b,'file');await fs.writeFile(f.a,'invalid docx');shell.enqueue(['--fc-set-left',f.a]);await assert.rejects(shell.take());assert.equal((await shell.state()).left.path,f.b);
});
test('local tree and selected pair retain projection metadata and reject stale source',async t=>{
 const f=await fixture(t);const child=await f.folders.read('a','sample.docx');assert.equal(child.documentProjection.kind,'docx');assert.match(child.content,/Hello document/);const staged=await stageFolderPair(f.folders,'sample.docx','sample.txt');assert.equal(staged.mode,'text-compare');assert.equal(staged.a.documentProjection.kind,'docx');await fs.writeFile(f.a,'changed');await assert.rejects(validateStagedPair(staged),/changed/);
});
test('remote DOCX projection supplies no write authority and revalidates after extraction',async()=>{
 const f=provider(await docx());const result=await stageProviderFolderOpen(f.service,{a:'sample.docx',b:null});assert.equal(result.mode,'text-compare');assert.equal(result.a.documentProjection.kind,'docx');assert.equal(result.a.path,undefined);assert.equal(result.a.saveToken,undefined);assert.equal(result.a.source,undefined);assert.ok(f.validations()>=2);assert.equal(f.closed(),1);
});
test('malformed remote DOCX rejects auto mode and closes reader; explicit data stays bytes',async()=>{
 const f=provider(Buffer.from('bad'));await assert.rejects(stageProviderFolderOpen(f.service,{a:'sample.docx',b:null}));assert.equal(f.closed(),1);const result=await stageProviderFolderOpen(f.service,{a:'sample.docx',b:null},{mode:'data'});assert.equal(result.mode,'binary-compare');assert.equal(result.a.documentProjection,undefined);assert.equal(result.a.data,Buffer.from('bad').toString('base64'));
});
test('remote DOCX changed during asynchronous extraction cannot publish a stale child',async()=>{
 const f=provider(await docx()),open=f.service.openFileReader;
 f.service.openFileReader=async()=>{const reader=await open();let count=0;const validate=reader.validate;reader.validate=async()=>{if(++count===2)f.info.stamp='changed-after-extraction';return validate();};return reader;};
 await assert.rejects(stageProviderFolderOpen(f.service,{a:'sample.docx',b:null}),/changed/);assert.equal(f.closed(),1);
});
test('DOCX packages above 10 MiB open through every native route without raising ordinary text limits',async t=>{
 const f=await fixture(t),zip=await require('jszip').loadAsync(f.bytes);
 zip.file('word/media/unused.bin',Buffer.alloc(10*1024*1024+1,65));
 const bytes=await zip.generateAsync({type:'nodebuffer',compression:'STORE'});
 assert.ok(bytes.length>10*1024*1024&&bytes.length<32*1024*1024);
 await fs.writeFile(f.a,bytes);
 const shell=new ShellRequests(path.join(f.root,'left.json'));shell.enqueue(['--fc-compare',f.a,f.b]);const opened=await shell.take();assert.equal(opened.mode,'text-compare');assert.match(opened.a.content,/Hello document/);await shell.validateFiles(opened);
 const tree=await f.folders.read('a','sample.docx');assert.equal(tree.documentProjection.kind,'docx');
 const pair=await stageFolderPair(f.folders,'sample.docx','sample.txt');assert.equal(pair.a.documentProjection.kind,'docx');await validateStagedPair(pair);
 const remote=provider(bytes);for(const mode of ['auto','text']){const value=await stageProviderFolderOpen(remote.service,{a:'sample.docx',b:null},{mode});assert.equal(value.mode,'text-compare');assert.equal(value.a.documentProjection.kind,'docx');}
 await fs.writeFile(f.b,Buffer.alloc(10*1024*1024+1,65));await assert.rejects(f.folders.read('b','sample.txt'),/10 MB/);
 shell.enqueue(['--fc-compare',f.a,f.b]);await assert.rejects(shell.take(),/limit/);
 assert.deepEqual(await fs.readFile(f.a),bytes,'Projection must not mutate original document bytes');
});
