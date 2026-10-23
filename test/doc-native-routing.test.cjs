'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ShellRequests,comparisonType}=require('../desktop/shell-requests.cjs');
const {FolderService}=require('../desktop/folders.cjs');
const {stageFolderPair,validateStagedPair}=require('../desktop/folder-pair.cjs');
const {stageProviderFolderOpen}=require('../desktop/provider-folder-open.cjs');
const {extractDocTextInNode:extractDocText}=require('../src/doc-text-node.cjs');
async function docx(){return fs.readFile(path.join(__dirname,'fixtures/doc-independent/baseline.doc'));}
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-docx-routing-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const bytes=await docx();for(const side of ['left','right'])await fs.mkdir(path.join(root,side));const a=path.join(root,'left','sample.doc'),b=path.join(root,'right','sample.txt');await fs.writeFile(a,bytes);await fs.writeFile(b,'Hello text');const folders=new FolderService(path.join(root,'backups'),{extractDocText});await folders.select('a',path.dirname(a));await folders.select('b',path.dirname(b));return {root,a,b,bytes,folders};}
function provider(bytes){let closed=0,validations=0;const info={path:'sample.doc',kind:'file',identity:'remote-file',stamp:'original',size:bytes.length};const service={roots:{a:'opaque'},inspectRoot:async()=>({path:'opaque',identity:'root'}),inspectEntry:async()=>({...info}),openFileReader:async()=>{let offset=0;return {metadata:{...info},read:async max=>{if(offset===bytes.length)return null;const value=bytes.subarray(offset,offset+max);offset+=value.length;return value;},validate:async()=>{validations++;return {...info};},close:async()=>{closed++;}};}};return {service,info,closed:()=>closed,validations:()=>validations};}
test('shell DOC projection compares with plain text and preserves source snapshots',async t=>{
 const f=await fixture(t),shell=new ShellRequests(path.join(f.root,'left.json'),{extractDocText});assert.equal(comparisonType('DOCUMENT.DOC'),'text-compare');shell.enqueue(['--fc-compare',f.a,f.b]);const result=await shell.take();assert.equal(result.mode,'text-compare');assert.match(result.a.content,/Body/);assert.equal(result.b.content,'Hello text');assert.equal(result.a.documentProjection.kind,'doc');assert.equal(result.b.documentProjection,undefined);assert.equal(result.a.data,undefined);assert.equal(result.a.saveToken,undefined);await shell.validateFiles(result);assert.deepEqual(await fs.readFile(f.a),f.bytes);
});
test('malformed DOC shell selection fails closed without changing remembered left',async t=>{
 const f=await fixture(t),shell=new ShellRequests(path.join(f.root,'left.json'),{extractDocText});await shell.setLeft(f.b,'file');await fs.writeFile(f.a,'invalid docx');shell.enqueue(['--fc-set-left',f.a]);await assert.rejects(shell.take());assert.equal((await shell.state()).left.path,f.b);
});
test('local tree and selected pair retain projection metadata and reject stale source',async t=>{
 const f=await fixture(t);const child=await f.folders.read('a','sample.doc');assert.equal(child.documentProjection.kind,'doc');assert.match(child.content,/Body/);const staged=await stageFolderPair(f.folders,'sample.doc','sample.txt');assert.equal(staged.mode,'text-compare');assert.equal(staged.a.documentProjection.kind,'doc');await fs.writeFile(f.a,'changed');await assert.rejects(validateStagedPair(staged),/changed/);
});
test('remote DOC projection supplies no write authority and revalidates after extraction',async()=>{
 const f=provider(await docx());const result=await stageProviderFolderOpen(f.service,{a:'sample.doc',b:null},{extractDocText});assert.equal(result.mode,'text-compare');assert.equal(result.a.documentProjection.kind,'doc');assert.equal(result.a.path,undefined);assert.equal(result.a.saveToken,undefined);assert.equal(result.a.source,undefined);assert.ok(f.validations()>=2);assert.equal(f.closed(),1);
});
test('malformed remote DOC rejects auto mode and closes reader; explicit data stays bytes',async()=>{
 const f=provider(Buffer.from('bad'));await assert.rejects(stageProviderFolderOpen(f.service,{a:'sample.doc',b:null},{extractDocText}));assert.equal(f.closed(),1);const result=await stageProviderFolderOpen(f.service,{a:'sample.doc',b:null},{mode:'data'});assert.equal(result.mode,'binary-compare');assert.equal(result.a.documentProjection,undefined);assert.equal(result.a.data,Buffer.from('bad').toString('base64'));
});
test('remote DOC changed during asynchronous extraction cannot publish a stale child',async()=>{
 const f=provider(await docx()),open=f.service.openFileReader;
 f.service.openFileReader=async()=>{const reader=await open();let count=0;const validate=reader.validate;reader.validate=async()=>{if(++count===2)f.info.stamp='changed-after-extraction';return validate();};return reader;};
 await assert.rejects(stageProviderFolderOpen(f.service,{a:'sample.doc',b:null},{extractDocText}),/changed/);assert.equal(f.closed(),1);
});
