'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {prepareComparisonKeys,comparisonPair,folderComparisonKey}=require('../src/text-comparison-keys.cjs');
const {compare}=require('../src/diff.cjs');
const {FolderService}=require('../desktop/folders.cjs');
const {FolderTree}=require('../desktop/folder-tree.cjs');
const {classifySnapshotEntries}=require('../desktop/folder-snapshot-comparison.cjs');
const {validateFolderRules}=require('../desktop/folder-rules.cjs');
const {previewFilteredCopyToFolder}=require('../desktop/folder-filtered-copy-destination.cjs');
const {prepareTextComparison}=require('../desktop/ignored-text-client.cjs');
const {createFileContentReport}=require('../src/file-content-report.cjs');
const {createFolderReport,formatFolderReport}=require('../src/folder-report.cjs');
const {main}=require('../scripts/compare.cjs'),{planBatch,runBatch}=require('../scripts/batch.cjs');
const cases=['','\n','x','x\n','\nx\n','x\n\n','// comment','// comment\n','// comment\nx\n','/*a\n\nb*/\nx\n','x/* a */y','x y','x\t y','<!-- comment -->','<!-- comment -->\nx\n','-- comment\nx\n','X\n','x #123\n','x #456\n','\n\n',' \t\n','/* c */','/* c */\n','x\n//a\n'];
test('profile canonical folder keys agree with text diff across comments, blanks, patterns and EOF',()=>{
 for(const textProfile of ['java','xml','sql'])for(const mode of ['text-content','text-whitespace','text-case','text-whitespace-case'])for(const ignoreBlankLines of [false,true])for(const patterns of [[],[{pattern:'#[0-9]+'}]]){
  const rules={mode,textProfile,ignoreBlankLines,textWhitespaceScope:'horizontal'},prepared=cases.map(text=>prepareComparisonKeys([text],patterns,textProfile)[0]);
  for(let a=0;a<cases.length;a++)for(let b=0;b<cases.length;b++){
   const result=compare(cases[a],cases[b],mode.includes('whitespace'),[],mode.includes('case'),'horizontal',ignoreBlankLines,comparisonPair([prepared[a],prepared[b]]));
   assert.equal(folderComparisonKey(cases[a],rules,prepared[a])===folderComparisonKey(cases[b],rules,prepared[b]),result.hunks.length===0,JSON.stringify({textProfile,mode,ignoreBlankLines,a:cases[a],b:cases[b],patterns}));
  }
 }
});
async function fixture(t,a='// first\nclass A {}\n',b='class A {}\n'){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-profile-backend-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const service=new FolderService(path.join(root,'backups'));
 for(const side of ['a','b']){const dir=path.join(root,side);await fs.mkdir(path.join(dir,'closed'),{recursive:true});await fs.writeFile(path.join(dir,'closed/x'),side==='a'?a:b);await service.select(side,dir);}return {root,service};
}
test('profile schema, provider cache and snapshot provenance retain explicit opt-in',async t=>{
 const {service}=await fixture(t),pairs=[{a:'closed/x',b:'closed/x'}],rules={mode:'text-content',textProfile:'java'};
 assert.deepEqual(validateFolderRules({...rules,textProfile:'plain'}),{mode:'text-content',timeToleranceMs:0});for(const textProfile of [null,'Java',true,{}])assert.throws(()=>validateFolderRules({textProfile}));
 assert.equal((await service.compareFilePairs(pairs,rules)).rows[0].status,'equal');assert.equal((await service.compareFilePairs(pairs,{mode:'text-content'})).rows[0].status,'changed');assert.equal((await service.compareFilePairs(pairs,{...rules,textProfile:'xml'})).rows[0].status,'changed');assert.equal((await service.compareFilePairs(pairs,rules)).rows[0].status,'equal');
 const a=(await service.snapshot('a',null,rules)).entries.get('closed/x'),b=(await service.snapshot('b',null,rules)).entries.get('closed/x');assert.equal(a.normalizationTextProfile,'java');assert.notEqual(a.hash,b.hash);assert.equal(classifySnapshotEntries(a,b,rules).status,'equal');assert.throws(()=>classifySnapshotEntries(a,b,{mode:'text-content'}),/profile changed/);
 assert.equal((await service.compareFilePairs(pairs,{mode:'content',textProfile:'java'})).rows[0].status,'changed');
});
test('unopened profile-filtered copy uses original exact bytes and preserves newline differences',async t=>{
 const {root,service}=await fixture(t),tree=new FolderTree(service);await tree.list('root');const out=path.join(root,'out');await fs.mkdir(out);
 const preview=await previewFilteredCopyToFolder(service,tree,'a',['closed'],{status:'same',rules:{mode:'text-content',textProfile:'java'}},async()=>out);await preview.service.execute(preview.preview.id);assert.equal(await fs.readFile(path.join(out,'closed/x'),'utf8'),'// first\nclass A {}\n');
 await fs.writeFile(path.join(root,'b/closed/x'),'class A {}');assert.equal((await service.compareFilePairs([{a:'closed/x',b:'closed/x'}],{mode:'text-content',textProfile:'java'})).rows[0].status,'changed');
});
test('profile worker composition and reports preserve originals and visible rules',async()=>{
 const texts=['// comment\nx #123\n','x #456\n'],patterns=[{pattern:'#[0-9]+'}],rules={mode:'text-content',textProfile:'java',ignoredTextPatterns:patterns};
 const prepared=await prepareTextComparison(texts,patterns,'java');const payload={files:[{left:{content:texts[0]},right:{content:texts[1]}}]};const report=createFileContentReport(payload,rules,[comparisonPair(prepared)]);assert.equal(report.files[0].hunks.length,0);assert.equal(report.files[0].rows[0].a,'// comment');assert.equal(report.files[0].rows[0].minor,true);assert.equal(report.rules.textProfile,'java');assert.match(report.method,/JAVA comment profile/);
 const folder=createFolderReport({rules});assert.equal(folder.rules.textProfile,'java');assert.match(formatFolderReport(folder,'text'),/Text profile: java/);assert.match(formatFolderReport(folder,'html'),/JAVA comment profile/);assert.match(formatFolderReport(createFolderReport({rules:{mode:'content',textProfile:'java'}}),'text'),/not applied by this comparison method/);
 await assert.rejects(()=>prepareTextComparison(['x'],[],'invalid'));await assert.rejects(()=>prepareTextComparison(['x'],[{pattern:'['}],'java'),/Invalid ignored-text/);
});
test('CLI and batch carry profile through reports with source bytes unchanged',async t=>{
 const {root}=await fixture(t),left=path.join(root,'a/closed/x'),right=path.join(root,'b/closed/x'),out=path.join(root,'report.json');
 assert.equal(await main(['--left',left,'--right',right,'--text-profile','java','--format','json','--output',out]),0);const report=JSON.parse(await fs.readFile(out));assert.equal(report.comparisonRules.textProfile,'java');assert.equal(report.rows[0].a,'// first');assert.equal(report.rows[0].minor,true);assert.equal(await fs.readFile(left,'utf8'),'// first\nclass A {}\n');
 for(const extra of [['--type','binary','--text-profile','plain'],['--text-profile','invalid']])await assert.rejects(()=>main(['--left',left,'--right',right,'--output',path.join(root,'bad.json'),...extra]));await assert.rejects(fs.stat(path.join(root,'bad.json')),e=>e.code==='ENOENT');
 const script=path.join(root,'batch.json'),job={left:'a/closed/x',right:'b/closed/x',output:'batch-report.json',textProfile:'java'};await fs.writeFile(script,JSON.stringify({version:1,jobs:[job]}));const dry=await runBatch(script,{dryRun:true});assert.equal(dry.report.jobs[0].textProfile,'java');assert.equal((await runBatch(script)).code,0);assert.equal(JSON.parse(await fs.readFile(path.join(root,'batch-report.json'))).comparisonRules.textProfile,'java');
 for(const change of [{textProfile:'invalid'},{type:'binary'}]){await fs.writeFile(script,JSON.stringify({version:1,jobs:[{...job,output:'bad.json',...change}]}));await assert.rejects(()=>planBatch(script));}
});
