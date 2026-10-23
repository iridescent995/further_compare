'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ThreeWayFolders}=require('../desktop/folder-threeway.cjs');
async function fixture(t,contents={base:'original',left:'left edit',right:'right edit'}){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-threeway-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const service=new ThreeWayFolders(path.join(root,'backups')),roots={};
 for(const side of ['base','left','right']){roots[side]=path.join(root,side);await fs.mkdir(roots[side]);await fs.writeFile(path.join(roots[side],'file.txt'),contents[side]);await service.select(side,roots[side]);}
 return {service,roots};
}
test('native three-way analysis and explicit resolution remain read-only and return detached data',async t=>{
 const {service,roots}=await fixture(t),scan=await service.analyze();assert.equal(scan.rows.find(r=>r.path==='file.txt').status,'conflict');
 const unresolved=await service.resolve({},scan.revision);assert.deepEqual(unresolved.conflicts,['file.txt']);
 scan.roots.left.path='/untrusted';scan.rows[0].status='unchanged';
 const chosen=await service.resolve({'file.txt':'left'},scan.revision);assert.deepEqual(chosen.conflicts,[]);const file=chosen.entries.find(e=>e.path==='file.txt');assert.equal(file.sourceSide,'left');assert.equal(file.sourcePath,'file.txt');
 file.hash='mutated';assert.notEqual((await service.resolve({'file.txt':'left'},scan.revision)).entries.find(e=>e.path==='file.txt').hash,'mutated');
 for(const [side,text]of Object.entries({base:'original',left:'left edit',right:'right edit'}))assert.equal(await fs.readFile(path.join(roots[side],'file.txt'),'utf8'),text);
});
test('changed file content invalidates decisions and revision even when restored to the old size and mtime',async t=>{
 const {service,roots}=await fixture(t),scan=await service.analyze(),file=path.join(roots.left,'file.txt'),stat=await fs.stat(file);
 await fs.writeFile(file,'LEFT EDIT');await fs.utimes(file,stat.atime,stat.mtime);
 await assert.rejects(()=>service.resolve({'file.txt':'left'},scan.revision),/changed after analysis/);assert.notEqual(service.revision,scan.revision);
 await assert.rejects(()=>service.resolve({},scan.revision),/analysis changed/);
 const next=await service.analyze();assert.notEqual(next.revision,scan.revision);
});
test('replaced root directory requires reselection, rather than trusting a reused path',async t=>{
 const {service,roots}=await fixture(t),scan=await service.analyze();await fs.rename(roots.left,roots.left+'-old');await fs.mkdir(roots.left);await fs.writeFile(path.join(roots.left,'file.txt'),'left edit');
 await assert.rejects(()=>service.resolve({'file.txt':'left'},scan.revision),/root changed/);await assert.rejects(()=>service.analyze(),/root changed/);
 await service.select('left',roots.left);assert.ok((await service.analyze()).revision);
});
test('native selection invalidates earlier analysis and overlapping operations do not change authority',async t=>{
 const {service,roots}=await fixture(t),scan=await service.analyze();await service.select('right',roots.right);await assert.rejects(()=>service.resolve({},scan.revision),/analysis changed/);
 const pending=service.analyze();await assert.rejects(()=>service.select('left',roots.left),/already running/);await pending;
 assert.equal(service.roots.left.path,roots.left);
});
test('skipped entries are reported and cannot be treated as authorized deletion choices',async t=>{
 const {service,roots}=await fixture(t);await fs.mkdir(path.join(roots.base,'.git'));await fs.writeFile(path.join(roots.base,'.git','keep'),'excluded');
 const scan=await service.analyze();assert.equal(scan.skipped.base,1);await assert.rejects(()=>service.resolve({'file.txt':'left'},scan.revision),/incomplete|skipped/i);
 assert.equal(await fs.readFile(path.join(roots.base,'.git','keep'),'utf8'),'excluded');
});

test('output previews include overwrites and type changes, are detached, and never modify inputs or output',async t=>{
 const {service,roots}=await fixture(t),output=path.join(path.dirname(roots.base),'output');await fs.mkdir(output);
 await fs.mkdir(path.join(output,'file.txt'));await fs.writeFile(path.join(output,'file.txt','obsolete.txt'),'keep until applied');
 await fs.writeFile(path.join(output,'extra.txt'),'extra');
 await service.selectOutput(output);const scan=await service.analyze(),plan=await service.preview({'file.txt':'left'},scan.revision);
 assert.deepEqual(plan.operations.map(op=>[op.type,op.path]),[['delete-file','file.txt/obsolete.txt'],['delete-file','extra.txt'],['delete-directory','file.txt'],['copy-file','file.txt']]);
 assert.equal(plan.operations.at(-1).sourceSide,'left');
 plan.operations[0].path='forged';assert.equal((await service.verifyPreview(plan.id)).operations[0].path,'file.txt/obsolete.txt');
 assert.equal(await fs.readFile(path.join(output,'file.txt','obsolete.txt'),'utf8'),'keep until applied');
 assert.equal(await fs.readFile(path.join(roots.left,'file.txt'),'utf8'),'left edit');
});
test('output choice cannot overlap any input or backups, and failed selection preserves prior output',async t=>{
 const {service,roots}=await fixture(t),parent=path.dirname(roots.base),output=path.join(parent,'output');await fs.mkdir(output);await service.selectOutput(output);
 for(const candidate of [roots.base,roots.left,roots.right,parent,path.join(parent,'backups')])await assert.rejects(()=>service.selectOutput(candidate),/overlap|separate/);
 await fs.mkdir(path.join(roots.left,'inside'));await assert.rejects(()=>service.selectOutput(path.join(roots.left,'inside')),/separate/);
 await assert.rejects(()=>service.select('left',output),/separate/);assert.equal(service.roots.left.path,roots.left);assert.equal(service.output.path,output);
});
test('output mutations and root replacement invalidate preview authority',async t=>{
 const {service,roots}=await fixture(t),output=path.join(path.dirname(roots.base),'output');await fs.mkdir(output);await fs.writeFile(path.join(output,'file.txt'),'old output');await service.selectOutput(output);
 const scan=await service.analyze();let plan=await service.preview({'file.txt':'right'},scan.revision);const file=path.join(output,'file.txt'),stat=await fs.stat(file);
 await fs.writeFile(file,'NEW OUTPUT');await fs.utimes(file,stat.atime,stat.mtime);
 await assert.rejects(()=>service.verifyPreview(plan.id),/changed after preview/);await assert.rejects(()=>service.verifyPreview(plan.id),/preview changed/);
 plan=await service.preview({'file.txt':'right'},scan.revision);await fs.rename(output,output+'-old');await fs.mkdir(output);await assert.rejects(()=>service.verifyPreview(plan.id),/root changed/);
});
test('input mutation, reanalysis, and reselecting output reject old plans',async t=>{
 const {service,roots}=await fixture(t),output=path.join(path.dirname(roots.base),'output');await fs.mkdir(output);await service.selectOutput(output);
 let scan=await service.analyze(),plan=await service.preview({'file.txt':'left'},scan.revision);await fs.writeFile(path.join(roots.right,'file.txt'),'new version');await assert.rejects(()=>service.verifyPreview(plan.id),/changed after preview/);
 scan=await service.analyze();plan=await service.preview({'file.txt':'left'},scan.revision);await service.analyze();await assert.rejects(()=>service.verifyPreview(plan.id),/preview changed/);
 scan=await service.analyze();plan=await service.preview({'file.txt':'left'},scan.revision);await service.selectOutput(output);await assert.rejects(()=>service.verifyPreview(plan.id),/preview changed/);
});
test('preview refuses unresolved conflicts and skipped output entries',async t=>{
 const {service,roots}=await fixture(t),output=path.join(path.dirname(roots.base),'output');await fs.mkdir(output);await service.selectOutput(output);const scan=await service.analyze();
 await assert.rejects(()=>service.preview({},scan.revision),/conflict/i);
 await fs.mkdir(path.join(output,'.git'));await fs.writeFile(path.join(output,'.git','keep'),'keep');await assert.rejects(()=>service.preview({'file.txt':'left'},scan.revision),/skipped|incomplete/i);
 assert.equal(await fs.readFile(path.join(output,'.git','keep'),'utf8'),'keep');
});

test('native execution consumes the private plan and writes only its separate output',async t=>{
 const {service,roots}=await fixture(t),output=path.join(path.dirname(roots.base),'output');await fs.mkdir(output);await fs.writeFile(path.join(output,'file.txt'),'previous output');await fs.writeFile(path.join(output,'extra.txt'),'extra');await service.selectOutput(output);
 const scan=await service.analyze(),plan=await service.preview({'file.txt':'left'},scan.revision);plan.operations.length=0;
 const result=await service.execute(plan.id);assert.equal(result.completed,2);assert.ok(result.backupPath);
 assert.equal(await fs.readFile(path.join(output,'file.txt'),'utf8'),'left edit');await assert.rejects(()=>fs.stat(path.join(output,'extra.txt')),{code:'ENOENT'});
 for(const [side,text]of Object.entries({base:'original',left:'left edit',right:'right edit'}))assert.equal(await fs.readFile(path.join(roots[side],'file.txt'),'utf8'),text);
 await assert.rejects(()=>service.execute(plan.id),/preview changed/);
 assert.equal((await service.preview({'file.txt':'left'},scan.revision)).operations.length,0);
});
test('changed output is rejected by execution before any planned writes and consumes the old preview',async t=>{
 const {service,roots}=await fixture(t),output=path.join(path.dirname(roots.base),'output');await fs.mkdir(output);await service.selectOutput(output);
 const scan=await service.analyze(),plan=await service.preview({'file.txt':'left'},scan.revision);await fs.writeFile(path.join(output,'appeared.txt'),'keep');
 await assert.rejects(()=>service.execute(plan.id),/changed after preview/);assert.equal(await fs.readFile(path.join(output,'appeared.txt'),'utf8'),'keep');await assert.rejects(()=>fs.stat(path.join(output,'file.txt')),{code:'ENOENT'});await assert.rejects(()=>service.execute(plan.id),/preview changed/);
});
