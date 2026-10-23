'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs/promises'),os=require('node:os');
const fixture=n=>path.join(__dirname,'fixtures/doc-independent',n+'.doc');
test('CLI DOC scopes preserve main default and reveal related-only changes',()=>{
 for(const [scope,code]of [['main-document',0],['main-and-related-text',1]]){const r=spawnSync(process.execPath,['scripts/compare.cjs','--left',fixture('baseline'),'--right',fixture('related-changed'),'--type','text','--format','json','--doc-scope',scope],{encoding:'utf8'});assert.equal(r.status,code,r.stderr);const out=JSON.parse(r.stdout);assert.equal(out.equal,!code);assert.equal(out.documentProjections.left.kind,'doc');assert.equal(out.documentProjections.left.scope,scope);}
 const r=spawnSync(process.execPath,['scripts/compare.cjs','--left',fixture('baseline'),'--right',fixture('baseline'),'--doc-scope','rendered'],{encoding:'utf8'});assert.equal(r.status,2);
});
test('batch DOC plan records scope and runs worker-backed extraction',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-doc-batch-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const script=path.join(dir,'jobs.json');await fs.writeFile(script,JSON.stringify({version:1,jobs:[{left:fixture('baseline'),right:fixture('related-changed'),output:'result.json',type:'text',format:'json',docScope:'main-and-related-text'}]}));const {planBatch,runPlannedJobs}=require('../scripts/batch.cjs');const jobs=await planBatch(script);assert.equal(jobs[0].documentConversions.left.scope,'main-and-related-text');const result=await runPlannedJobs(jobs);assert.equal(result.code,1);assert.equal(JSON.parse(await fs.readFile(path.join(dir,'result.json'),'utf8')).documentProjections.left.kind,'doc');
});
