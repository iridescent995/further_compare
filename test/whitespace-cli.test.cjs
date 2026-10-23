'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {main}=require('../scripts/compare.cjs'),{planBatch,runBatch}=require('../scripts/batch.cjs');
test('CLI whitespace scopes preserve significant locations and original inputs',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-scope-cli-'));
 try{
  const left=path.join(dir,'left'),right=path.join(dir,'right');await fs.writeFile(left,'  a b\n\tc d\n');await fs.writeFile(right,'a b\nc d\n');
  for(const [scope,code] of [['leading',0],['edges',0],['trailing',1],['embedded',1],['horizontal',0],['all',0],['leading-embedded',0],['trailing-embedded',1]]){
   const output=path.join(dir,scope+'.json');assert.equal(await main(['--left',left,'--right',right,'--format','json','--output',output,'--ignore-whitespace','--whitespace-scope',scope]),code);const report=JSON.parse(await fs.readFile(output));assert.equal(report.comparisonRules.whitespaceScope,scope);assert.equal(report.rows[0].a,'  a b');
  }
  await assert.rejects(main(['--left',left,'--right',right,'--whitespace-scope','leading']),/scope requires/i);
  await assert.rejects(main(['--left',left,'--right',right,'--ignore-whitespace','--whitespace-scope','bad']),/supported scope/i);
  assert.equal(await fs.readFile(left,'utf8'),'  a b\n\tc d\n');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('batch dry run and execution retain validated whitespace scope',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-scope-batch-'));
 try{
  await fs.writeFile(path.join(dir,'a'),'x  \ny\t');await fs.writeFile(path.join(dir,'b'),'x\ny');
  const file=path.join(dir,'batch.json'),job={left:'a',right:'b',output:'result.json',ignoreWhitespace:true,whitespaceScope:'trailing'};
  const write=jobs=>fs.writeFile(file,JSON.stringify({version:1,jobs}));await write([job]);
  const dry=await runBatch(file,{dryRun:true});assert.equal(dry.report.jobs[0].whitespaceScope,'trailing');await assert.rejects(fs.stat(path.join(dir,'result.json')),e=>e.code==='ENOENT');
  const result=await runBatch(file);assert.equal(result.code,0);assert.equal(JSON.parse(await fs.readFile(path.join(dir,'result.json'))).comparisonRules.whitespaceScope,'trailing');
  for(const change of [{ignoreWhitespace:false},{whitespaceScope:'bad'},{type:'binary'}]){await write([{...job,output:'other.json',...change}]);await assert.rejects(planBatch(file));}
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
