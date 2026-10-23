'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {detectTextProfile,resolveTextProfile,prepareTextProfile,validateTextProfile,TEXT_PROFILE_RULES_VERSION}=require('../src/text-profile.cjs');
const {prepareComparisonKeys,comparisonPair}=require('../src/text-comparison-keys.cjs');
const {createFileContentReport,formatFileContentReport}=require('../src/file-content-report.cjs');
const {createFolderReport,formatFolderReport}=require('../src/folder-report.cjs');
const {main}=require('../scripts/compare.cjs'),{planBatch,runBatch}=require('../scripts/batch.cjs');
test('automatic filename rules v1 are literal, case insensitive, pair consistent and conservative',()=>{
 assert.equal(TEXT_PROFILE_RULES_VERSION,1);assert.equal(validateTextProfile('auto'),'auto');
 for(const name of ['Test.java','/tmp/README.JAVA','C:\\folder\\Name.Java','[a+b] $.java'])assert.equal(detectTextProfile(name),'java',name);
 for(const ext of ['xml','xsd','xsl','xslt','svg','xhtml','wsdl','fxml'])assert.equal(detectTextProfile('a.'+ext.toUpperCase()),'xml');
 for(const name of ['',null,undefined,{},'x.js','x.java.bak','.java','x.java/','x.java\\','x.java?foo','x.java\0'])assert.equal(detectTextProfile(name),'plain');
 assert.equal(resolveTextProfile('auto',['a.JAVA','b.java']),'java');
 assert.equal(resolveTextProfile('auto',['a.sql',null]),'sql');
 assert.equal(resolveTextProfile('auto',['',undefined,'a.svg']),'xml');
 assert.equal(resolveTextProfile('auto',['a.xml','b.xsd']),'xml');
 for(const names of [[],['',''],['a.java','b.sql'],['a.java','unknown'],['a.java',{}],['.java','b.java']])assert.equal(resolveTextProfile('auto',names),'plain');
 assert.equal(resolveTextProfile('java',['a.sql','b.xml']),'java');assert.equal(resolveTextProfile('plain',['a.java']),'plain');
 assert.throws(()=>prepareTextProfile('// comment','auto'),/Resolve/);assert.throws(()=>prepareComparisonKeys([],[],'auto'),/Resolve/);
});
test('automatic file and folder reports preserve per-pair resolution and source text',()=>{
 const files=[{pathA:'old/A.JAVA',pathB:'new/A.java',left:{content:'// old\nx\n'},right:{content:'x\n'}},{pathA:'a.java',pathB:'b.sql',left:{content:'// old\nx\n'},right:{content:'x\n'}},{pathA:null,pathB:'solo.SQL',right:{content:'-- solo\nx\n'}}];
 const keys=files.map(file=>comparisonPair(prepareComparisonKeys([file.left?.content||'',file.right?.content||''],[],resolveTextProfile('auto',[file.pathA,file.pathB]))));
 const report=createFileContentReport({files},{mode:'text-content',textProfile:'auto'},keys);
 assert.equal(report.rules.textProfile,'auto');assert.deepEqual(report.files.map(f=>f.resolvedTextProfile),['java','plain','sql']);
 assert.equal(report.files[0].hunks.length,0);assert.ok(report.files[1].hunks.length);assert.equal(report.files[0].rows[0].a,'// old');
 for(const format of ['text','html']){
  const output=formatFileContentReport(report,format);
  for(const [index,profile]of ['java','plain','sql'].entries()){
   const left=files[index].pathA??'Absent',right=files[index].pathB;
   const start=output.indexOf(`${left} ↔ ${right}`);assert.ok(start>=0,`${format}: pair heading ${left}`);
   const next=format==='html'?output.indexOf('</section>',start):output.indexOf('\n\n',start);
   const section=output.slice(start,next<0?undefined:next);
   assert.ok(section.includes(`Text profile: auto → ${profile} (rules v1)`),`${format}: profile for ${left} must be inside its own section`);
  }
 }
 const serialized=JSON.parse(formatFileContentReport(report,'json'));
 assert.deepEqual(serialized.files.map(file=>[file.textProfile,file.resolvedTextProfile,file.textProfileRulesVersion]),[['auto','java',1],['auto','plain',1],['auto','sql',1]]);
 const folder=createFolderReport({rules:{mode:'text-content',textProfile:'auto'},entries:files.map((file,index)=>({pathA:file.pathA,pathB:file.pathB,kindA:file.left?'file':null,kindB:'file',comparison:'text-normalized',status:index===0?'equal':index===1?'changed':'right'}))});
 assert.deepEqual(folder.entries.map(entry=>entry.resolvedTextProfile),['java','plain','sql']);
 for(const format of ['text','html','csv']){
  const output=formatFolderReport(folder,format);
  for(const profile of ['java','plain','sql'])assert.ok(output.includes(`auto → ${profile}; rules v1`),`${format}: effective ${profile} profile`);
 }
 assert.deepEqual(JSON.parse(formatFolderReport(folder,'json')).entries.map(entry=>[entry.resolvedTextProfile,entry.textProfileRulesVersion]),[['java',1],['plain',1],['sql',1]]);
 const retained=createFileContentReport({files:[files[0]]},{mode:'content',textProfile:'auto'});assert.equal(retained.files[0].resolvedTextProfile,'plain');assert.ok(retained.files[0].hunks.length);
});
test('CLI and batch automatically resolve names and retain requested and effective provenance',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-auto-cli-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const left=path.join(dir,'before.JAVA'),right=path.join(dir,'after.java');await fs.writeFile(left,'// comment\nx\n');await fs.writeFile(right,'x\n');
 async function run(profile,other=right){const output=path.join(dir,Math.random()+'.json');const code=await main(['--left',left,'--right',other,'--text-profile',profile,'--format','json','--output',output]);return {code,report:JSON.parse(await fs.readFile(output))};}
 const auto=await run('auto');assert.equal(auto.code,0);assert.deepEqual(auto.report.comparisonRules,{ignoreCase:false,ignoreWhitespace:false,textProfile:'auto',resolvedTextProfile:'java',textProfileRulesVersion:1});
 const txt=path.join(dir,'after.txt');await fs.writeFile(txt,'x\n');assert.equal((await run('auto',txt)).code,1);assert.equal((await run('java',txt)).code,0);assert.equal((await run('plain')).code,1);
 const script=path.join(dir,'batch.json');await fs.writeFile(script,JSON.stringify({version:1,jobs:[{left:'before.JAVA',right:'after.java',output:'batch-result.json',textProfile:'auto'}]}));
 const plan=await planBatch(script);assert.equal(plan[0].textProfile,'auto');assert.equal(plan[0].resolvedTextProfile,'java');assert.equal(plan[0].textProfileRulesVersion,1);
 const runResult=await runBatch(script);assert.equal(runResult.code,0);assert.equal(runResult.report.jobs[0].resolvedTextProfile,'java');assert.equal(JSON.parse(await fs.readFile(path.join(dir,'batch-result.json'))).comparisonRules.textProfile,'auto');
 assert.equal(await fs.readFile(left,'utf8'),'// comment\nx\n');
});
