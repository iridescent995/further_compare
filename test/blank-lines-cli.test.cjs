'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {main}=require('../scripts/compare.cjs'),{planBatch,runBatch}=require('../scripts/batch.cjs');
test('CLI optional blank lines preserve source rows and terminal newline significance',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-blank-cli-'));
 try{
  const left=path.join(dir,'left'),right=path.join(dir,'right');await fs.writeFile(left,'a\n \t\nb\n');await fs.writeFile(right,'a\nb\n');
  for(const enabled of [false,true]){const output=path.join(dir,String(enabled)+'.json');assert.equal(await main(['--left',left,'--right',right,'--format','json','--output',output,...(enabled?['--ignore-blank-lines']:[])]),enabled?0:1);const r=JSON.parse(await fs.readFile(output));if(enabled){assert.equal(r.comparisonRules.ignoreBlankLines,true);const blank=r.rows.find(row=>row.ai===1);assert.equal(blank.a,' \t');assert.equal(blank.bi,null);assert.equal(blank.minor,true);}}
  await fs.writeFile(right,'a\nb');assert.equal(await main(['--left',left,'--right',right,'--format','json','--output',path.join(dir,'eol.json'),'--ignore-blank-lines']),1);
  await assert.rejects(main(['--left',left,'--right',right,'--type','binary','--ignore-blank-lines']),/only.*text/i);
  assert.equal(await fs.readFile(left,'utf8'),'a\n \t\nb\n');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('batch blank-line rule validates before execution and persists in reports',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-blank-batch-'));
 try{
  await fs.writeFile(path.join(dir,'a'),'\nx\n\n');await fs.writeFile(path.join(dir,'b'),'x\n');const file=path.join(dir,'batch.json'),job={left:'a',right:'b',output:'report.json',ignoreBlankLines:true};
  const write=jobs=>fs.writeFile(file,JSON.stringify({version:1,jobs}));await write([job]);const dry=await runBatch(file,{dryRun:true});assert.equal(dry.report.jobs[0].ignoreBlankLines,true);await assert.rejects(fs.stat(path.join(dir,'report.json')),e=>e.code==='ENOENT');assert.equal((await runBatch(file)).code,0);assert.equal(JSON.parse(await fs.readFile(path.join(dir,'report.json'))).comparisonRules.ignoreBlankLines,true);
  for(const change of [{ignoreBlankLines:'true'},{type:'binary'}]){await write([{...job,output:'other.json',...change}]);await assert.rejects(planBatch(file));}
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
