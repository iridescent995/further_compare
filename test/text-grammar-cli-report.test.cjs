'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {main}=require('../scripts/compare.cjs'),{planBatch,runPlannedJobs}=require('../scripts/batch.cjs');
const {prepareComparisonKeys,comparisonPair}=require('../src/text-comparison-keys.cjs');
const {createFileContentReport,formatFileContentReport}=require('../src/file-content-report.cjs');
const {createFolderReport,formatFolderReport}=require('../src/folder-report.cjs');
const grammar={version:1,importance:{},elements:[{name:'Generated',kind:'block',importance:'unimportant',start:'[generated]',end:'[/generated]',escape:''}]};
test('CLI custom multiline grammar applies on plain text and reports configuration without rewriting input',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-grammar-cli-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const left=path.join(dir,'a.txt'),right=path.join(dir,'b.txt'),config=path.join(dir,'rules.json');const a='keep\n[generated]\nold\n[/generated]\nend\n',b='keep\nend\n';await fs.writeFile(left,a);await fs.writeFile(right,b);await fs.writeFile(config,JSON.stringify(grammar));
 const output=path.join(dir,'report.json');assert.equal(await main(['--left',left,'--right',right,'--format','json','--text-grammar',config,'--output',output]),0);const report=JSON.parse(await fs.readFile(output));assert.deepEqual(report.comparisonRules.textGrammar,grammar);assert.equal(report.comparisonRules.textGrammarVersion,1);assert.ok(report.rows.some(row=>row.a==='old'));assert.equal(await fs.readFile(left,'utf8'),a);
 for(const argv of [['--type','binary'],['--text-grammar',config]])await assert.rejects(main(['--left',left,'--right',right,'--output',path.join(dir,'invalid.json'),...argv],{textGrammar:grammar}));
 await assert.rejects(fs.stat(path.join(dir,'invalid.json')),{code:'ENOENT'});
 const batch=path.join(dir,'jobs.json');await fs.writeFile(batch,JSON.stringify({version:1,jobs:[{left:'a.txt',right:'b.txt',output:'batch.json',textGrammar:grammar}]}));const plan=await planBatch(batch);assert.deepEqual(plan[0].textGrammar,grammar);assert.equal((await runPlannedJobs(plan)).code,0);
});
test('reports retain grammar provenance and dormant settings; HTML escapes element names',()=>{
 const custom={...grammar,elements:[{...grammar.elements[0],name:'<script>alert(1)</script>'}]};const file={pathA:'a.txt',pathB:'b.txt',left:{content:'[generated]old[/generated]\nx'},right:{content:'x'}};const prepared=comparisonPair(prepareComparisonKeys([file.left.content,file.right.content],[],'plain',custom));
 const report=createFileContentReport({files:[file]},{mode:'text-content',textGrammar:custom},[prepared]);assert.equal(report.files[0].hunks.length,0);assert.deepEqual(report.rules.textGrammar,custom);assert.equal(report.rules.textGrammarVersion,1);
 assert.ok(formatFileContentReport(report,'text').includes('Grammar configuration'));assert.ok(!formatFileContentReport(report,'html').includes('<script>alert(1)</script>'));
 const folder=createFolderReport({rules:{mode:'text-content',textGrammar:custom},entries:[{pathA:'a.txt',pathB:'b.txt',kindA:'file',kindB:'file',comparison:'text-normalized',status:'equal'}]});assert.deepEqual(folder.rules.textGrammar,custom);assert.ok(formatFolderReport(folder,'text').includes('Grammar configuration'));assert.ok(!formatFolderReport(folder,'html').includes('<script>alert(1)</script>'));
 const dormant=createFileContentReport({files:[file]},{mode:'content',textGrammar:custom});assert.match(dormant.method,/retained, not applied/);assert.ok(dormant.files[0].hunks.length);
 assert.throws(()=>createFileContentReport({files:[file]},{mode:'text-content',textGrammar:custom}),/worker-prepared/);
});
test('custom grammar regex timeout retires its worker and subsequent comparisons recover',async t=>{
 const {createIgnoredTextPool}=require('../desktop/ignored-text-client.cjs');const pool=createIgnoredTextPool({timeoutMs:100});t.after(()=>pool.close());
 const expensive={version:1,importance:{},elements:[{name:'Expensive',kind:'pattern',importance:'unimportant',pattern:'(a+)+$',matchCase:true}]};
 await assert.rejects(pool.prepare(['a'.repeat(40000)+'!'],[],'plain',true,expensive),/too long/);
 const result=await pool.prepare(['keep\n[generated]old[/generated]\nend'],[],'plain',true,grammar);assert.deepEqual(result[0].omit,[false,true,false]);
});
