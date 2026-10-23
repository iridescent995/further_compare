'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {main}=require('../scripts/compare.cjs'),{planBatch,runBatch}=require('../scripts/batch.cjs');
test('CLI pattern file ignores generated values without changing original rows or files',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-pattern-cli-'));
 try{
  const left=path.join(dir,'left'),right=path.join(dir,'right'),patternFile=path.join(dir,'patterns.json'),output=path.join(dir,'report.json');const original='id=123\r\nname=Alpha\r\n';await fs.writeFile(left,original);await fs.writeFile(right,'id=456\nname=Alpha\n');await fs.writeFile(patternFile,JSON.stringify([{pattern:'[0-9]+'}]));
  assert.equal(await main(['--left',left,'--right',right,'--ignore-patterns',patternFile,'--format','json','--output',output]),0);const r=JSON.parse(await fs.readFile(output));assert.equal(r.comparisonRules.ignoredTextPatterns[0].pattern,'[0-9]+');assert.equal(r.rows[0].a,'id=123');assert.equal(r.rows[0].b,'id=456');assert.equal(r.rows[0].minor,true);assert.equal(await fs.readFile(left,'utf8'),original);
  await fs.writeFile(patternFile,JSON.stringify([{pattern:'('}]));await assert.rejects(main(['--left',left,'--right',right,'--ignore-patterns',patternFile,'--output',path.join(dir,'invalid.json')]));await assert.rejects(fs.stat(path.join(dir,'invalid.json')),e=>e.code==='ENOENT');
  await assert.rejects(main(['--left',left,'--right',right,'--type','binary'],{ignoredTextPatterns:[]}));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('batch ignored patterns survive dry-run and execute through isolated workers',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-pattern-batch-'));
 try{
  await fs.writeFile(path.join(dir,'a'),'build123');await fs.writeFile(path.join(dir,'b'),'build456');const file=path.join(dir,'batch.json'),job={left:'a',right:'b',output:'report.json',ignoredTextPatterns:[{pattern:'[0-9]+',matchCase:true}]};const write=jobs=>fs.writeFile(file,JSON.stringify({version:1,jobs}));await write([job]);const dry=await runBatch(file,{dryRun:true});assert.deepEqual(dry.report.jobs[0].ignoredTextPatterns,job.ignoredTextPatterns);await assert.rejects(fs.stat(path.join(dir,'report.json')),e=>e.code==='ENOENT');assert.equal((await runBatch(file)).code,0);assert.equal(JSON.parse(await fs.readFile(path.join(dir,'report.json'))).comparisonRules.ignoredTextPatterns.length,1);
  for(const change of [{ignoredTextPatterns:[{pattern:3}]},{type:'binary'}]){await write([{...job,output:'other.json',...change}]);await assert.rejects(planBatch(file));}
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
