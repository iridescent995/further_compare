'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {ThreeWayFolders}=require('../desktop/folder-threeway.cjs');
const {ThreeWayRecovery}=require('../desktop/folder-threeway-recovery.cjs');
async function fixture(t){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-recovery-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const backups=path.join(root,'backups'),service=new ThreeWayFolders(backups);
 for(const side of ['base','left','right']){const folder=path.join(root,side);await fs.mkdir(folder);await fs.writeFile(path.join(folder,'file.txt'),side);await service.select(side,folder);}
 const output=path.join(root,'output');await fs.mkdir(output);await fs.writeFile(path.join(output,'file.txt'),'original output');await fs.writeFile(path.join(output,'extra.txt'),'original extra');await service.selectOutput(output);
 const scan=await service.analyze(),plan=await service.preview({'file.txt':'left'},scan.revision),result=await service.execute(plan.id);
 return {root,backups,output,result,id:path.basename(result.backupPath),recovery:new ThreeWayRecovery(backups)};
}
test('native recovery inspects a completed journal and prepares an exact read-only restoration',async t=>{
 const {output,result,id,recovery}=await fixture(t);const list=await recovery.list();assert.equal(list.length,1);assert.equal(list[0].id,id);assert.equal(list[0].status,'completed');
 const preview=await recovery.inspect(id);assert.equal(preview.output.path,output);assert.deepEqual(preview.operations.map(op=>[op.type,op.path]),[['copy-file','extra.txt'],['copy-file','file.txt']]);
 preview.operations[0].path='forged';assert.equal((await recovery.verify(preview.token)).operations[0].path,'extra.txt');
 assert.equal(await fs.readFile(path.join(output,'file.txt'),'utf8'),'left');await assert.rejects(()=>fs.stat(path.join(output,'extra.txt')),{code:'ENOENT'});
 const journal=JSON.parse(await fs.readFile(path.join(result.backupPath,'manifest.json'),'utf8'));assert.equal(journal.version,2);assert.ok(journal.rootIdentities.output);
});
test('recovery refuses later edits, new files and replaced output roots',async t=>{
 const {output,recovery,id}=await fixture(t);await fs.writeFile(path.join(output,'file.txt'),'later edit');await assert.rejects(()=>recovery.inspect(id));assert.equal(await fs.readFile(path.join(output,'file.txt'),'utf8'),'later edit');
 await fs.writeFile(path.join(output,'file.txt'),'left');await fs.writeFile(path.join(output,'later.txt'),'keep');await assert.rejects(()=>recovery.inspect(id));await fs.unlink(path.join(output,'later.txt'));
 await fs.rename(output,output+'-old');await fs.mkdir(output);await fs.writeFile(path.join(output,'file.txt'),'left');await assert.rejects(()=>recovery.inspect(id),/root was replaced/);
});
test('backup tampering and journal changes revoke recovery previews',async t=>{
 const {result,recovery,id}=await fixture(t),preview=await recovery.inspect(id),file=path.join(result.backupPath,'manifest.json');let journal=JSON.parse(await fs.readFile(file,'utf8'));
 journal.error='changed after preview';await fs.writeFile(file,JSON.stringify(journal));await assert.rejects(()=>recovery.verify(preview.token),/changed after review/);await assert.rejects(()=>recovery.verify(preview.token),/again/);
 await fs.writeFile(path.join(result.backupPath,journal.backups[0].file),'tampered');await assert.rejects(()=>recovery.inspect(id),/Recovery backup changed|size limit/);
});
test('recovery rejects traversal, symlink records and corrupt manifests without hiding valid records',async t=>{
 const {backups,id,recovery}=await fixture(t);await assert.rejects(()=>recovery.inspect('../output'),/backup list/);
 const alias='threeway-11111111-1111-1111-1111-111111111111';await fs.symlink(path.join(backups,id),path.join(backups,alias),'dir');await assert.rejects(()=>recovery.inspect(alias),/symbolic link/);
 const corrupt='threeway-22222222-2222-2222-2222-222222222222';await fs.mkdir(path.join(backups,corrupt));await fs.writeFile(path.join(backups,corrupt,'manifest.json'),'{invalid');const list=await recovery.list();assert.equal(list.find(r=>r.id===id).status,'completed');assert.ok(list.find(r=>r.id===corrupt).error);assert.ok(!list.some(r=>r.id===alias));
});
test('reviewed recovery restores original output and creates a recoverable undo journal',async t=>{
 const {root,output,recovery,id}=await fixture(t),preview=await recovery.inspect(id);
 const result=await recovery.execute(preview.token);assert.equal(result.completed,2);
 assert.equal(await fs.readFile(path.join(output,'file.txt'),'utf8'),'original output');assert.equal(await fs.readFile(path.join(output,'extra.txt'),'utf8'),'original extra');
 for(const side of ['base','left','right'])assert.equal(await fs.readFile(path.join(root,side,'file.txt'),'utf8'),side);
 await assert.rejects(()=>recovery.execute(preview.token),/again/);
 const undo=await recovery.inspect(path.basename(result.backupPath));await recovery.execute(undo.token);
 assert.equal(await fs.readFile(path.join(output,'file.txt'),'utf8'),'left');await assert.rejects(()=>fs.stat(path.join(output,'extra.txt')),{code:'ENOENT'});
});
test('recovery execution consumes and rejects a stale preview without writing output',async t=>{
 const {output,recovery,id}=await fixture(t),preview=await recovery.inspect(id);
 await fs.writeFile(path.join(output,'file.txt'),'new user edit');await assert.rejects(()=>recovery.execute(preview.token),/changed/);
 assert.equal(await fs.readFile(path.join(output,'file.txt'),'utf8'),'new user edit');await assert.rejects(()=>recovery.execute(preview.token),/again/);
 assert.equal((await recovery.list()).length,1);
});
test('interrupted recovery retains a journal that restores the pre-recovery output',async t=>{
 const {output,recovery,id}=await fixture(t),preview=await recovery.inspect(id);let failure;
 try{await recovery.execute(preview.token,{beforeStep:async({phase,index})=>{if(phase==='apply'&&index===1)throw Error('Injected interruption');}});}catch(error){failure=error;}
 assert.match(failure.message,/Injected interruption/);assert.equal(failure.completed,1);assert.ok(failure.backupPath);
 assert.equal(await fs.readFile(path.join(output,'extra.txt'),'utf8'),'original extra');assert.equal(await fs.readFile(path.join(output,'file.txt'),'utf8'),'left');
 const undo=await recovery.inspect(path.basename(failure.backupPath));await recovery.execute(undo.token);
 assert.equal(await fs.readFile(path.join(output,'file.txt'),'utf8'),'left');await assert.rejects(()=>fs.stat(path.join(output,'extra.txt')),{code:'ENOENT'});
 const retry=await recovery.inspect(id);await recovery.execute(retry.token);assert.equal(await fs.readFile(path.join(output,'file.txt'),'utf8'),'original output');
});
test('recovery refuses replaced record authority and backup symlinks after preview',async t=>{
 const {backups,result,recovery,id,output}=await fixture(t),preview=await recovery.inspect(id);
 await fs.rename(result.backupPath,result.backupPath+'-old');await fs.mkdir(result.backupPath);
 for(const name of await fs.readdir(result.backupPath+'-old'))await fs.rename(path.join(result.backupPath+'-old',name),path.join(result.backupPath,name));
 await assert.rejects(()=>recovery.execute(preview.token),/changed/);
 const second=await fixture(t),again=await second.recovery.inspect(second.id),manifest=JSON.parse(await fs.readFile(path.join(second.result.backupPath,'manifest.json'),'utf8')),backup=path.join(second.result.backupPath,manifest.backups[0].file);
 await fs.rename(backup,backup+'-original');await fs.symlink(backup+'-original',backup);
 await assert.rejects(()=>second.recovery.execute(again.token));assert.equal(await fs.readFile(path.join(output,'file.txt'),'utf8'),'left');assert.equal((await recovery.list()).length,1);
});
test('a partial original merge can be restored using its failed journal',async t=>{
 const {FolderService}=require('../desktop/folders.cjs'),{executeThreeWayPlan}=require('../desktop/folder-threeway-execute.cjs');
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-partial-recovery-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const backups=path.join(root,'backups'),inputs={},inputSnapshots={};
 for(const side of ['base','left','right']){const directory=path.join(root,side);await fs.mkdir(directory);await fs.writeFile(path.join(directory,'file.txt'),'merged');inputs[side]=new FolderService(backups);await inputs[side].select('a',directory);inputSnapshots[side]=await inputs[side].snapshot('a');}
 const outputPath=path.join(root,'output');await fs.mkdir(outputPath);await fs.writeFile(path.join(outputPath,'file.txt'),'original');await fs.writeFile(path.join(outputPath,'extra.txt'),'extra');const output=new FolderService(backups);await output.select('a',outputPath);const targetSnapshot=await output.snapshot('a'),file=inputSnapshots.base.entries.get('file.txt'),old=targetSnapshot.entries.get('file.txt'),extra=targetSnapshot.entries.get('extra.txt');
 const operations=[{type:'delete-file',path:'extra.txt',hash:extra.hash,size:extra.size},{type:'copy-file',path:'file.txt',sourceSide:'base',sourcePath:'file.txt',hash:file.hash,size:file.size,oldHash:old.hash,oldSize:old.size}];let failure;
 try{await executeThreeWayPlan({id:'partial',operations,inputs,inputSnapshots,output,targetSnapshot,backupRoot:backups,checkRoots:async()=>{},validatePreview:async()=>{}},{beforeStep:async({phase,index})=>{if(phase==='apply'&&index===1)throw Error('Partial apply');}});}catch(error){failure=error;}
 assert.equal(failure.completed,1);const recovery=new ThreeWayRecovery(backups),preview=await recovery.inspect(path.basename(failure.backupPath));await recovery.execute(preview.token);
 assert.equal(await fs.readFile(path.join(outputPath,'file.txt'),'utf8'),'original');assert.equal(await fs.readFile(path.join(outputPath,'extra.txt'),'utf8'),'extra');
});
test('handled partial sibling write failure leaves an inspectable recovery journal',async t=>{
 const {output,recovery,id}=await fixture(t),preview=await recovery.inspect(id),open=fs.open;let failure;
 fs.open=async function(file,...args){const handle=await open.call(this,file,...args);if(path.basename(String(file)).startsWith('.fc-threeway-')){const write=handle.write.bind(handle);let wrote=false;handle.write=async(buffer,offset,length,position)=>{if(wrote){const error=Error('Injected disk full');error.code='ENOSPC';throw error;}wrote=true;return write(buffer,offset,1,position);};}return handle;};
 try{await recovery.execute(preview.token);}catch(error){failure=error;}finally{fs.open=open;}
 assert.match(failure.message,/Injected disk full/);assert.ok(failure.backupPath);assert.ok(!(await fs.readdir(output)).some(name=>name.startsWith('.fc-threeway-')));
 assert.equal(await fs.readFile(path.join(output,'file.txt'),'utf8'),'left');const undo=await recovery.inspect(path.basename(failure.backupPath));assert.equal(undo.operations.length,0);
});
test('abrupt process exit during sibling write can recover only its recorded inode and staged prefix',async t=>{
 const {spawnSync}=require('node:child_process');const {backups,output,recovery,id}=await fixture(t);
 const script=`const fs=require('node:fs/promises'),path=require('node:path');const {ThreeWayRecovery}=require(process.argv[1]);(async()=>{const recovery=new ThreeWayRecovery(process.argv[2]),preview=await recovery.inspect(process.argv[3]),open=fs.open;fs.open=async function(file,...args){const h=await open.call(this,file,...args);if(path.basename(String(file)).startsWith('.fc-threeway-')){const write=h.write.bind(h);h.write=async(buffer,offset,length,position)=>{await write(buffer,offset,Math.min(3,length),position);await h.sync();process.exit(73);};}return h;};await recovery.execute(preview.token);process.exit(74);})().catch(error=>{console.error(error);process.exit(75);});`;
 const child=spawnSync(process.execPath,['-e',script,require.resolve('../desktop/folder-threeway-recovery.cjs'),backups,id],{encoding:'utf8',timeout:30000});assert.equal(child.status,73,child.stderr);
 const record=(await recovery.list()).find(item=>item.id!==id);assert.equal(record.status,'applying');
 const manifest=JSON.parse(await fs.readFile(path.join(backups,record.id,'manifest.json'),'utf8'));assert.equal(manifest.temporaryIdentities.length,1);const temporary=manifest.temporaryFiles[0],prefix=await fs.readFile(temporary);assert.equal(prefix.length,3);
 const preview=await recovery.inspect(record.id);assert.deepEqual(preview.operations.map(op=>[op.type,op.path]),[['delete-file',path.basename(temporary)]]);
 await fs.writeFile(temporary,'BAD');await assert.rejects(()=>recovery.inspect(record.id),/prefix/);
 await fs.writeFile(temporary,prefix);await fs.rename(temporary,temporary+'-saved');await fs.writeFile(temporary,prefix);await assert.rejects(()=>recovery.inspect(record.id),/identity changed/);
 await fs.unlink(temporary);await fs.rename(temporary+'-saved',temporary);const verified=await recovery.inspect(record.id);await recovery.execute(verified.token);
 assert.equal(await fs.readFile(path.join(output,'file.txt'),'utf8'),'left');assert.ok(!(await fs.readdir(output)).some(name=>name.startsWith('.fc-threeway-')));
});
