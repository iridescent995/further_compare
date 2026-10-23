'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {ShellRequests}=require('../desktop/shell-requests.cjs');
const {stageProviderFolderOpen}=require('../desktop/provider-folder-open.cjs');
const {fixture}=require('./ods-fixture.cjs');
test('shell comparison routes ODS and CSV as a table while preserving exact workbook bytes',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-ods-shell-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const left=path.join(root,'left.ODS'),right=path.join(root,'right.csv'),bytes=await fixture();await fs.writeFile(left,bytes);await fs.writeFile(right,'id,value\nalpha,20');
 const shell=new ShellRequests(path.join(root,'remembered.json'));shell.enqueue(['--fc-compare',left,right]);const out=await shell.take();assert.equal(out.mode,'table-compare');assert.deepEqual(Buffer.from(out.a.data,'base64'),bytes);assert.equal(out.a.content,undefined);await shell.validateFiles(out);assert.deepEqual(await fs.readFile(left),bytes);
});
test('provider ODS input remains embedded bytes without remote write authority',async()=>{
 const bytes=await fixture();let closed=0;const info=()=>({path:'source.ods',kind:'file',identity:'remote',stamp:'v1',size:bytes.length});const service={roots:{a:'opaque'},inspectRoot:async()=>({path:'opaque',identity:'root'}),inspectEntry:async()=>info(),openFileReader:async()=>{let read=false;return {metadata:info(),read:async()=>{if(read)return null;read=true;return bytes;},validate:async()=>info(),close:async()=>{closed++;}};}};
 const out=await stageProviderFolderOpen(service,{a:'source.ods',b:null});assert.equal(out.mode,'table-compare');assert.deepEqual(Buffer.from(out.a.data,'base64'),bytes);assert.equal(out.a.saveToken,undefined);assert.equal(out.a.diskToken,undefined);assert.equal(closed,1);
});
