'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {planBatch,runBatch}=require('../scripts/batch.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-batch-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'a.txt'),'Alpha\n');await fs.writeFile(path.join(root,'b.txt'),'alpha\n');const file=path.join(root,'batch.json');return {root,file,write:jobs=>fs.writeFile(file,JSON.stringify({version:1,jobs})),job:{left:'a.txt',right:'b.txt',output:'report.json'}};}
test('batch dry run validates relative paths without writes, then runs multiple comparison types',async t=>{
 const {root,file,write,job}=await fixture(t);for(const dir of ['left','right']){await fs.mkdir(path.join(root,dir));await fs.writeFile(path.join(root,dir,'file'),'same');}
 await write([{...job,ignoreCase:true},{...job,type:'binary',output:'binary.json'},{...job,type:'table',output:'table.html',format:'html'},{left:'left',right:'right',type:'folder',output:'folder.json'}]);
 const before=(await fs.readdir(root)).sort(),dry=await runBatch(file,{dryRun:true});assert.equal(dry.code,0);assert.ok(dry.report.jobs.every(j=>j.status==='planned'&&path.isAbsolute(j.left)));assert.deepEqual((await fs.readdir(root)).sort(),before);
 const result=await runBatch(file);assert.equal(result.code,1);assert.deepEqual(result.report.jobs.map(j=>j.status),['same','different','different','same']);assert.equal(JSON.parse(await fs.readFile(path.join(root,'report.json'),'utf8')).equal,true);assert.match(await fs.readFile(path.join(root,'table.html'),'utf8'),/<!doctype html>/);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'Alpha\n');
 await assert.rejects(runBatch(file),/already exists/);
});
test('all jobs preflight before writes; duplicate and input-tree report paths are refused',async t=>{
 const {root,file,write,job}=await fixture(t);
 await write([job,{...job,right:'missing',output:'next.json'}]);await assert.rejects(runBatch(file));await assert.rejects(fs.stat(path.join(root,'report.json')),{code:'ENOENT'});
 await write([job,{...job,output:'./report.json'}]);await assert.rejects(planBatch(file),/unique/);
 await fs.mkdir(path.join(root,'left'));await fs.mkdir(path.join(root,'right'));await write([{left:'left',right:'right',type:'folder',output:'left/result.json'}]);await assert.rejects(planBatch(file),/outside/);
 await write([{...job,output:'a.txt'}]);await assert.rejects(planBatch(file),/already exists/);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'Alpha\n');
});
test('batch execution reports errors independently, continues later jobs and returns error precedence',async t=>{
 const {root,file,write,job}=await fixture(t);await fs.writeFile(path.join(root,'bad.txt'),Buffer.from([255]));await write([{...job,left:'bad.txt'},{...job,ignoreCase:true,output:'second.json'}]);const result=await runBatch(file);assert.equal(result.code,2);assert.deepEqual(result.report.jobs.map(j=>j.status),['error','same']);await assert.rejects(fs.stat(path.join(root,'report.json')),{code:'ENOENT'});assert.equal(JSON.parse(await fs.readFile(path.join(root,'second.json'),'utf8')).equal,true);
});
test('batch schema rejects unsupported commands, options, flags and excessive jobs',async t=>{
 const {file,write,job}=await fixture(t);
 for(const jobs of [[],Array(101).fill(job),[{...job,command:'delete'}],[{...job,type:'shell'}],[{...job,ignoreCase:'yes'}],[{...job,type:'binary',ignoreWhitespace:true}],[{...job,output:'\0bad'}]]){await write(jobs);await assert.rejects(planBatch(file));}
});
test('batch CLI emits JSON and uses documented dry-run and difference exit codes',async t=>{
 const {file,write,job}=await fixture(t);await write([job]);const script=path.resolve(__dirname,'../scripts/batch.cjs');let result=spawnSync(process.execPath,[script,'--script',file,'--dry-run'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).jobs[0].status,'planned');result=spawnSync(process.execPath,[script,'--script',file],{encoding:'utf8'});assert.equal(result.status,1,result.stderr);assert.equal(JSON.parse(result.stdout).jobs[0].status,'different');result=spawnSync(process.execPath,[script,'--script',file],{encoding:'utf8'});assert.equal(result.status,2);assert.match(result.stderr,/already exists/);
});
