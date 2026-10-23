const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('CLI comparison rules are explicit, text-only and preserve original report content',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-case-cli-'));
 try{const a=path.join(dir,'a.txt'),b=path.join(dir,'b.txt');await fs.writeFile(a,'Hello World\nVALUE');await fs.writeFile(b,'hello world\nvalue');
 const run=(...args)=>spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/compare.cjs'),'--left',a,'--right',b,...args],{encoding:'utf8'});
 assert.equal(run().status,1);const matched=run('--ignore-case','--format','json');assert.equal(matched.status,0,matched.stderr);const result=JSON.parse(matched.stdout);assert.deepEqual(result.comparisonRules,{ignoreCase:true,ignoreWhitespace:false});assert.equal(result.ignoredLineCount,2);assert.equal(result.rows[0].a,'Hello World');assert.equal(result.rows[0].b,'hello world');assert.match(run('--ignore-case').stdout,/Equivalent under comparison rules/);
 await fs.writeFile(b,'helloworld\nvalue');assert.equal(run('--ignore-case').status,1);assert.equal(run('--ignore-case','--ignore-whitespace').status,0);
 assert.equal(run('--ignore-case','--ignore-case').status,2);assert.equal(run('--ignore-case','--type','binary').status,2);assert.equal(run('--ignore-case','--type','table').status,2);assert.equal(run('--ignore-case','true').status,2);
 assert.equal(await fs.readFile(a,'utf8'),'Hello World\nVALUE');assert.equal(await fs.readFile(b,'utf8'),'helloworld\nvalue');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
