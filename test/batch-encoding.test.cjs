'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {runBatch,planBatch}=require('../scripts/batch.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-batch-encoding-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const script=path.join(root,'batch.json');return {root,script,write:jobs=>fs.writeFile(script,JSON.stringify({version:1,jobs}))};}
test('batch detects UTF-16/32 BOMs and records formats while comparing decoded content',async t=>{
 const {root,script,write}=await fixture(t);await fs.writeFile(path.join(root,'utf8'),'A😀\n');
 const samples={utf16le:[255,254,65,0,61,216,0,222,10,0],utf16be:[254,255,0,65,216,61,222,0,0,10],utf32le:[255,254,0,0,65,0,0,0,0,246,1,0,10,0,0,0],utf32be:[0,0,254,255,0,0,0,65,0,1,246,0,0,0,0,10]};
 const jobs=[];for(const [encoding,bytes]of Object.entries(samples)){await fs.writeFile(path.join(root,encoding),Buffer.from(bytes));jobs.push({left:encoding,right:'utf8',output:encoding+'.json'});}await write(jobs);const result=await runBatch(script);assert.equal(result.code,0);for(const encoding of Object.keys(samples)){const report=JSON.parse(await fs.readFile(path.join(root,encoding+'.json'),'utf8'));assert.equal(report.equal,true);assert.deepEqual(report.sourceFormats.left,{encoding,bom:true,lineEnding:'lf'});assert.equal(report.sourceFormats.right.encoding,'utf8');}
});
test('explicit encodings survive batch planning and CLI text rules',async t=>{
 const {root,script,write}=await fixture(t);await fs.writeFile(path.join(root,'legacy'),Buffer.from([0xcf,0xf0,0xe8,0xe2,0xe5,0xf2]));await fs.writeFile(path.join(root,'unicode'),'ПРИВЕТ');await write([{left:'legacy',right:'unicode',leftEncoding:'windows1251',ignoreCase:true,output:'result.json'}]);const plan=await planBatch(script);assert.equal(plan[0].leftEncoding,'windows1251');assert.equal(plan[0].rightEncoding,'auto');assert.equal((await runBatch(script,{dryRun:true})).report.jobs[0].leftEncoding,'windows1251');await assert.rejects(fs.stat(path.join(root,'result.json')),{code:'ENOENT'});assert.equal((await runBatch(script)).code,0);
 await fs.writeFile(path.join(root,'bomless'),Buffer.from([0x1f,0x04,0x40,0x04,0x38,0x04,0x32,0x04,0x35,0x04,0x42,0x04]));const output=spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/compare.cjs'),'--left',path.join(root,'legacy'),'--right',path.join(root,'bomless'),'--left-encoding','windows1251','--right-encoding','utf16le','--format','json'],{encoding:'utf8'});assert.equal(output.status,0,output.stderr);assert.equal(JSON.parse(output.stdout).sourceFormats.right.encoding,'utf16le');
});
test('encoding validation rejects non-text options before writes and bad data produces no report',async t=>{
 const {root,script,write}=await fixture(t);await fs.writeFile(path.join(root,'a'),Buffer.from([255,254,0,0,0,216,0,0]));await fs.writeFile(path.join(root,'b'),'valid');const job={left:'a',right:'b',output:'out.json'};
 for(const options of [{leftEncoding:'garbage'},{rightEncoding:null},{type:'binary',leftEncoding:'auto'},{type:'table',rightEncoding:'utf8'}]){await write([{...job,...options}]);await assert.rejects(planBatch(script),/encoding/i);}
 for(const options of [{},{leftEncoding:'utf8'}]){await write([{...job,...options}]);assert.equal((await runBatch(script)).code,2);await assert.rejects(fs.stat(path.join(root,'out.json')),{code:'ENOENT'});}
 const command=path.resolve(__dirname,'../scripts/compare.cjs');for(const type of ['binary','table','folder']){const result=spawnSync(process.execPath,[command,'--left',path.join(root,'a'),'--right',path.join(root,'b'),'--type',type,'--left-encoding','auto'],{encoding:'utf8'});assert.equal(result.status,2);assert.match(result.stderr,/Encoding options/);}
});
test('batch text size limit matches editor and produces no report on overflow',async t=>{
 const {root,script,write}=await fixture(t);await fs.writeFile(path.join(root,'a'),Buffer.alloc(10*1024*1024+1,65));await fs.writeFile(path.join(root,'b'),'B');await write([{left:'a',right:'b',output:'out.json'}]);const result=await runBatch(script);assert.equal(result.code,2);await assert.rejects(fs.stat(path.join(root,'out.json')),{code:'ENOENT'});
});
