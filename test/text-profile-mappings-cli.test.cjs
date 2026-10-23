'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {main}=require('../scripts/compare.cjs'),{planBatch,runBatch,runPlannedJobs}=require('../scripts/batch.cjs');
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-mappings-cli-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('CLI filename mappings select SQL, preserve original content, and report ordered configuration',async t=>{
 const dir=await fixture(t),left=path.join(dir,'before.DDL'),right=path.join(dir,'after.ddl'),output=path.join(dir,'report.json'),mappingFile=path.join(dir,'mappings.json');
 const mappings=[{pattern:'*.ddl',profile:'sql'},{pattern:'*',profile:'plain'}];
 await fs.writeFile(left,'-- generated old\r\nselect 1;\r\n');await fs.writeFile(right,'-- generated new\r\nselect 1;\r\n');await fs.writeFile(mappingFile,JSON.stringify(mappings));
 assert.equal(await main(['--left',left,'--right',right,'--text-profile','auto','--text-profile-mappings',mappingFile,'--format','json','--output',output]),0);
 const report=JSON.parse(await fs.readFile(output));assert.equal(report.comparisonRules.resolvedTextProfile,'sql');assert.deepEqual(report.comparisonRules.textProfileMappings,mappings);assert.equal(report.rows[0].a,'-- generated old');assert.equal(await fs.readFile(left,'utf8'),'-- generated old\r\nselect 1;\r\n');
});
test('CLI custom mappings support plain opt-out and conservative conflicting pairs',async t=>{
 const dir=await fixture(t),left=path.join(dir,'before.java'),right=path.join(dir,'after.java'),other=path.join(dir,'after.ddl');await fs.writeFile(left,'// old\nx\n');await fs.writeFile(right,'x\n');await fs.writeFile(other,'x\n');
 async function run(mappings,otherFile=right){const output=path.join(dir,Math.random()+'.json');const code=await main(['--left',left,'--right',otherFile,'--text-profile','auto','--format','json','--output',output],{textProfileMappings:mappings});return {code,report:JSON.parse(await fs.readFile(output))};}
 const opted=await run([{pattern:'*.java',profile:'plain'}]);assert.equal(opted.code,1);assert.equal(opted.report.comparisonRules.resolvedTextProfile,'plain');
 const conflict=await run([{pattern:'*.ddl',profile:'sql'}],other);assert.equal(conflict.code,1);assert.equal(conflict.report.comparisonRules.resolvedTextProfile,'plain');
 const empty=await run([]);assert.equal(empty.code,0);assert.equal(Object.hasOwn(empty.report.comparisonRules,'textProfileMappings'),false);
});
test('CLI mapping validation precedes source reads and report writes',async t=>{
 const dir=await fixture(t),left=path.join(dir,'missing-left'),right=path.join(dir,'missing-right'),output=path.join(dir,'report.json'),config=path.join(dir,'config.json');
 const argv=['--left',left,'--right',right,'--output',output];
 for(const mappings of [null,{},[{pattern:'*.ddl',profile:'auto'}],[{pattern:'x',profile:'sql',extra:true}],Array.from({length:33},()=>({pattern:'*',profile:'plain'}))])await assert.rejects(main([...argv,'--text-profile','auto'],{textProfileMappings:mappings}),e=>e.code!=='ENOENT');
 for(const args of [[],['--text-profile','plain'],['--text-profile','sql'],['--type','binary'],['--type','folder']])await assert.rejects(main([...argv,...args],{textProfileMappings:[]}),/automatic profiles in text mode/);
 await fs.writeFile(config,'[]');await assert.rejects(main([...argv,'--text-profile','auto','--text-profile-mappings',config],{textProfileMappings:[]}),/one text-profile mapping source/);
 await fs.writeFile(config,' '.repeat(65537));await assert.rejects(main([...argv,'--text-profile','auto','--text-profile-mappings',config]),e=>e.code!=='ENOENT');
 await fs.writeFile(config,Buffer.from([0xff]));await assert.rejects(main([...argv,'--text-profile','auto','--text-profile-mappings',config]),e=>e.code!=='ENOENT');
 await assert.rejects(fs.stat(output),e=>e.code==='ENOENT');
});
test('batch retains ordered mappings through review and executes the reviewed configuration',async t=>{
 const dir=await fixture(t),file=path.join(dir,'batch.json'),mappings=[{pattern:'*.ddl',profile:'sql'},{pattern:'*',profile:'plain'}],job={left:'before.ddl',right:'after.ddl',output:'report.json',textProfile:'auto',textProfileMappings:mappings};
 await fs.writeFile(path.join(dir,job.left),'-- old\nx\n');await fs.writeFile(path.join(dir,job.right),'x\n');await fs.writeFile(file,JSON.stringify({version:1,jobs:[job]}));
 const plan=await planBatch(file);assert.deepEqual(plan[0].textProfileMappings,mappings);assert.equal(plan[0].resolvedTextProfile,'sql');
 const dry=await runBatch(file,{dryRun:true});assert.deepEqual(dry.report.jobs[0].textProfileMappings,mappings);await assert.rejects(fs.stat(path.join(dir,'report.json')),e=>e.code==='ENOENT');
 await fs.writeFile(file,JSON.stringify({version:1,jobs:[{...job,textProfileMappings:[{pattern:'*',profile:'plain'}]}]}));
 const result=await runPlannedJobs(plan);assert.equal(result.code,0);assert.deepEqual(result.report.jobs[0].textProfileMappings,mappings);assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'report.json'))).comparisonRules.textProfileMappings,mappings);
 for(const change of [{textProfile:'plain'},{textProfile:'java'},{type:'binary'},{textProfileMappings:[{pattern:'*',profile:'auto'}]}]){await fs.writeFile(file,JSON.stringify({version:1,jobs:[{...job,output:'invalid.json',...change}]}));await assert.rejects(runBatch(file));await assert.rejects(fs.stat(path.join(dir,'invalid.json')),e=>e.code==='ENOENT');}
});
test('desktop batch review is invalidated by mapping order changes before any report is written',async t=>{
 const {BatchService}=require('../desktop/batch-service.cjs');
 const dir=await fixture(t),file=path.join(dir,'batch.json'),mappings=[{pattern:'*.ddl',profile:'sql'},{pattern:'*',profile:'plain'}],job={left:'before.ddl',right:'after.ddl',output:'report.json',textProfile:'auto',textProfileMappings:mappings};
 await fs.writeFile(path.join(dir,job.left),'-- old\nx\n');await fs.writeFile(path.join(dir,job.right),'x\n');
 const write=job=>fs.writeFile(file,JSON.stringify({version:1,jobs:[job]}));await write(job);
 const service=new BatchService(),review=await service.preview(file);assert.deepEqual(review.jobs[0].textProfileMappings,mappings);
 await write({...job,textProfileMappings:[...mappings].reverse()});let confirmed=false;
 await assert.rejects(service.execute(review.token,async()=>{confirmed=true;return true;}),/plan changed/);assert.equal(confirmed,false);await assert.rejects(fs.stat(path.join(dir,'report.json')),e=>e.code==='ENOENT');
});
