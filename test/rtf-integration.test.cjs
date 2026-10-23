'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {decodeTextInput,isDocumentInput}=require('../src/text-input.cjs');
const {validateDocumentProjection}=require('../src/document-projection.cjs');
const {validateSession,stageSessionData}=require('../desktop/sessions.cjs');
const {assertTextExportTarget,assertDocumentTargetSnapshot}=require('../desktop/document-save-guard.cjs');
const {ShellRequests,comparisonType}=require('../desktop/shell-requests.cjs');
const {FolderService}=require('../desktop/folders.cjs');
const {stageProviderFolderOpen}=require('../desktop/provider-folder-open.cjs');
const {main}=require('../scripts/compare.cjs'),{planBatch,runBatch}=require('../scripts/batch.cjs');
const bytes=Buffer.from('{\\rtf1\\ansi Hello <world>\\par}');
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-rtf-integration-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const left=path.join(root,'source.rtf'),right=path.join(root,'other.txt');await fs.writeFile(left,bytes);await fs.writeFile(right,'Hello <world>\n');return {root,left,right};}
const session=projection=>({version:1,type:'text-compare',name:'RTF text',text:{a:'Edited projection',b:''},files:{a:{name:'source.rtf',path:'',documentProjection:projection},b:{name:'',path:''}},folders:{a:null,b:null},options:{filter:'all',ignoreWhitespace:false,direction:'a-to-b'}});
test('RTF decoding uses structural extraction and normalized strict session provenance',async t=>{
 assert.equal(isDocumentInput('SOURCE.RTF'),true);assert.equal(isDocumentInput('source.rtf.txt'),false);const decoded=await decodeTextInput(bytes,'SOURCE.RTF');assert.equal(decoded.content,'Hello <world>\n');assert.equal(decoded.documentProjection.kind,'rtf');assert.equal(decoded.format.encoding,'utf8');assert.equal(decoded.format.lineEnding,'lf');assert.equal((await decodeTextInput(bytes,'source.txt')).content,bytes.toString());
 const source=session(decoded.documentProjection),saved=validateSession(JSON.parse(JSON.stringify(source)));assert.deepEqual(saved.files.a.documentProjection,decoded.documentProjection);assert.notEqual(saved.files.a.documentProjection.exclusions,decoded.documentProjection.exclusions);assert.equal(saved.text.a,'Edited projection');
 for(const malformed of [{...decoded.documentProjection,kind:'text'},{...decoded.documentProjection,exclusions:[]},{...decoded.documentProjection,extra:true}])assert.throws(()=>validateDocumentProjection(malformed));
 const f=await fixture(t);source.files.a.path=f.left;const staged=await stageSessionData(source,path.join(f.root,'backups'));assert.equal(staged.textPaths.a,f.left);assert.equal(staged.data.text.a,'Edited projection');assert.deepEqual(await fs.readFile(f.left),bytes);
});
test('RTF text export blocks source extension, hardlinks and captured source identity',async t=>{
 const f=await fixture(t),stat=await fs.stat(f.left,{bigint:true}),sources=[{path:f.left,revision:`${stat.dev}:${stat.ino}:unchanged`}],alias=path.join(f.root,'alias.txt');await fs.link(f.left,alias);
 await assert.rejects(assertTextExportTarget(path.join(f.root,'NEW.RTF'),[],{stat(){throw Error('must reject before filesystem');}}),/text|documents/);assert.throws(()=>assertDocumentTargetSnapshot(path.join(f.root,'NEW.RTF'),null),/text|documents/);await assert.rejects(assertTextExportTarget(alias,sources),/source document/);assert.throws(()=>assertDocumentTargetSnapshot(alias,stat,sources),/source document/);await assertTextExportTarget(path.join(f.root,'export.txt'),sources);assert.deepEqual(await fs.readFile(f.left),bytes);
});
test('shell and local-folder RTF routes preserve projected-source protections',async t=>{
 const f=await fixture(t),shell=new ShellRequests(path.join(f.root,'remembered.json'));assert.equal(comparisonType('source.RTF'),'text-compare');shell.enqueue(['--fc-compare',f.left,f.right]);const staged=await shell.take();assert.equal(staged.mode,'text-compare');assert.equal(staged.a.documentProjection.kind,'rtf');assert.equal(staged.a.content,'Hello <world>\n');assert.equal(staged.a.saveToken,undefined);await shell.validateFiles(staged);
 const folder=path.join(f.root,'folder');await fs.mkdir(folder);await fs.copyFile(f.left,path.join(folder,'source.rtf'));const folders=new FolderService(path.join(f.root,'backups'));await folders.select('a',folder);const file=await folders.read('a','source.rtf');assert.equal(file.documentProjection.kind,'rtf');await fs.writeFile(f.left,'invalid rtf');shell.enqueue(['--fc-compare',f.left,f.right]);await assert.rejects(shell.take());
});
test('remote RTF projection supplies no document write authority; invalid input does not fall back to text',async()=>{
 let content=bytes,closed=0;const info=()=>({path:'source.rtf',kind:'file',identity:'remote',stamp:'v1',size:content.length});const service={roots:{a:'opaque'},inspectRoot:async()=>({path:'opaque',identity:'root'}),inspectEntry:async()=>info(),openFileReader:async()=>{let read=false;return {metadata:info(),read:async()=>{if(read)return null;read=true;return content;},validate:async()=>info(),close:async()=>{closed++;}};}};
 const out=await stageProviderFolderOpen(service,{a:'source.rtf',b:null});assert.equal(out.mode,'text-compare');assert.equal(out.a.documentProjection.kind,'rtf');assert.equal(out.a.saveToken,undefined);assert.equal(out.a.source,undefined);assert.equal(closed,1);content=Buffer.from('invalid rtf');await assert.rejects(stageProviderFolderOpen(service,{a:'source.rtf',b:null}));assert.equal(closed,2);
});
test('CLI and batch disclose RTF projection, require auto encoding and preserve source bytes',async t=>{
 const f=await fixture(t),argv=format=>['--left',f.left,'--right',f.right,'--format',format,'--output',path.join(f.root,'report.'+format)];assert.equal(await main(argv('json')),0);const report=JSON.parse(await fs.readFile(path.join(f.root,'report.json'),'utf8'));assert.equal(report.comparisonMeaning,'extracted-text');assert.equal(report.documentProjections.left.kind,'rtf');assert.match(report.inputIdentities.left.sha256,/^[a-f0-9]{64}$/);
 for(const format of ['text','html']){assert.equal(await main(argv(format)),0);const text=await fs.readFile(path.join(f.root,'report.'+format),'utf8');assert.match(text,/RTF/);assert.match(text,/Excluded:/);if(format==='html')assert(!text.includes('Hello <world>'));}
 await assert.rejects(main([...argv('json'),'--left-encoding','utf8']),/auto encoding/);const batch=path.join(f.root,'batch.json');await fs.writeFile(batch,JSON.stringify({version:1,jobs:[{left:f.left,right:f.right,output:'batch-report.json'}]}));const jobs=await planBatch(batch);assert.equal(jobs[0].documentConversions.left.kind,'rtf');assert.equal(jobs[0].documentConversions.left.scope,'main-document');assert.match(jobs[0].documentConversions.left.limitations[0],/stored field results/);assert.equal((await runBatch(batch)).code,0);assert.deepEqual(await fs.readFile(f.left),bytes);
});
