'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs');
const {buildThreeWayPlan}=require('../desktop/folder-threeway-plan.cjs');
const {executeThreeWayPlan}=require('../desktop/folder-threeway-execute.cjs');
async function fixture(t){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-apply3-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const backupRoot=path.join(root,'backups'),services={},roots={};
 for(const side of ['base','left','right','output']){roots[side]=path.join(root,side);await fs.mkdir(roots[side]);services[side]=new FolderService(backupRoot);await services[side].select('a',roots[side]);}
 const put=async(side,p,text)=>{await fs.mkdir(path.dirname(path.join(roots[side],p)),{recursive:true});await fs.writeFile(path.join(roots[side],p),text);};
 await put('left','changed.txt','new');await put('left','file-to-dir/child','child');await put('left','dir-to-file','flat');
 await put('output','changed.txt','original');await put('output','file-to-dir','former file');await put('output','dir-to-file/child','former child');await put('output','obsolete','remove');
 const snapshots={};for(const side of Object.keys(services))snapshots[side]=await services[side].snapshot('a');
 const entries=new Map([...snapshots.left.entries].map(([p,e])=>[p,e.kind==='file'?{...e,sourceSide:'left',sourcePath:p}:{...e}]));
 const operations=buildThreeWayPlan({entries,conflicts:[]},snapshots.output);
 const signature=s=>JSON.stringify({identity:s.identity,skipped:s.skipped,entries:[...s.entries]});
 const args={id:'test-plan',operations,inputs:{base:services.base,left:services.left,right:services.right},output:services.output,inputSnapshots:{base:snapshots.base,left:snapshots.left,right:snapshots.right},targetSnapshot:snapshots.output,backupRoot,
 checkRoots:async()=>{for(const side of Object.keys(services)){const s=await fs.lstat(roots[side],{bigint:true});if(s.isSymbolicLink()||`${s.dev}:${s.ino}`!==snapshots[side].identity)throw new Error('Root changed.');}},
 validatePreview:async()=>{for(const side of Object.keys(services))if(signature(await services[side].snapshot('a'))!==signature(snapshots[side]))throw new Error('Snapshot changed.');}};
 return {args,roots,put,services,snapshots};
}
test('apply stages bytes, backs up originals, handles both type transitions and leaves inputs unchanged',async t=>{
 const {args,roots,services,snapshots}=await fixture(t),result=await executeThreeWayPlan(args);
 assert.equal(await fs.readFile(path.join(roots.output,'changed.txt'),'utf8'),'new');assert.equal(await fs.readFile(path.join(roots.output,'dir-to-file'),'utf8'),'flat');assert.equal(await fs.readFile(path.join(roots.output,'file-to-dir/child'),'utf8'),'child');await assert.rejects(fs.stat(path.join(roots.output,'obsolete')),/ENOENT/);
 const journal=JSON.parse(await fs.readFile(path.join(result.backupPath,'manifest.json'),'utf8'));assert.equal(journal.status,'completed');assert.equal(journal.completed,args.operations.length);assert.equal(journal.backups.length,4);
 for(const item of journal.backups)assert.equal((await fs.readFile(path.join(result.backupPath,item.file))).length,item.size);
 assert.equal(await fs.readFile(path.join(result.backupPath,journal.backups.find(x=>x.path==='changed.txt').file),'utf8'),'original');
 for(const side of ['base','left','right'])assert.deepEqual((await services[side].snapshot('a')).entries,snapshots[side].entries);
});
for(const side of ['left','output'])test(`changed ${side} after staging prevents every output write`,async t=>{
 const {args,roots,put}=await fixture(t);let failure;
 try{await executeThreeWayPlan(args,{beforeStep:async e=>{if(e.phase==='prepared')await put(side,'changed.txt','tampered');}});}catch(e){failure=e;}
 assert.match(failure.message,/changed/i);assert.equal(failure.completed,0);assert.equal(await fs.readFile(path.join(roots.output,'obsolete'),'utf8'),'remove');assert.equal(await fs.readFile(path.join(roots.output,'changed.txt'),'utf8'),side==='output'?'tampered':'original');
 assert.equal(JSON.parse(await fs.readFile(path.join(failure.backupPath,'manifest.json'),'utf8')).status,'failed');
});
test('mid-apply failure retains all backups and exact completed count',async t=>{
 const {args,roots}=await fixture(t);let failure;
 try{await executeThreeWayPlan(args,{beforeStep:async e=>{if(e.phase==='apply'&&e.index===1)throw new Error('Injected failure');}});}catch(e){failure=e;}
 assert.match(failure.message,/Injected/);assert.equal(failure.completed,1);
 const journal=JSON.parse(await fs.readFile(path.join(failure.backupPath,'manifest.json'),'utf8'));assert.equal(journal.status,'failed');assert.equal(journal.completed,1);assert.equal(journal.backups.length,4);
 for(const entry of journal.backups)assert.ok((await fs.stat(path.join(failure.backupPath,entry.file))).isFile());
 assert.equal(await fs.readFile(path.join(roots.left,'changed.txt'),'utf8'),'new');
});
test('unexpected child prevents directory removal and is never recursively deleted',async t=>{
 const {args,roots}=await fixture(t);let failure;
 try{await executeThreeWayPlan(args,{beforeStep:async e=>{if(e.phase==='apply'&&e.operation.type==='delete-directory')await fs.writeFile(path.join(roots.output,e.path,'unexpected'),'keep');}});}catch(e){failure=e;}
 assert.match(failure.message,/ENOTEMPTY|EEXIST/);assert.equal(await fs.readFile(path.join(roots.output,'dir-to-file/unexpected'),'utf8'),'keep');
 assert.equal(JSON.parse(await fs.readFile(path.join(failure.backupPath,'manifest.json'),'utf8')).status,'failed');
});
for(const kind of ['root','parent'])test(`replaced ${kind} symlink is refused during apply`,async t=>{
 const {args,roots}=await fixture(t);const outside=path.join(path.dirname(roots.output),'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'child'),'untouched');let failure,swapped=false;
 try{await executeThreeWayPlan(args,{beforeStep:async e=>{if(e.phase==='apply'&&!swapped){swapped=true;const victim=kind==='root'?roots.output:path.join(roots.output,'dir-to-file');await fs.rename(victim,victim+'-old');await fs.symlink(outside,victim,'dir');}}});}catch(e){failure=e;}
 assert.ok(failure);assert.equal(failure.completed,0);assert.equal(await fs.readFile(path.join(outside,'child'),'utf8'),'untouched');
});
for(const what of ['backup','staged'])test(`tampered ${what} bytes cannot overwrite an original target`,async t=>{
 const {args,roots}=await fixture(t);let failure;
 try{await executeThreeWayPlan(args,{beforeStep:async e=>{if(e.phase==='prepared'){
  const dirs=await fs.readdir(args.backupRoot),directory=path.join(args.backupRoot,dirs.find(n=>n.startsWith('threeway-'))),journal=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
  const record=what==='backup'?journal.backups.find(x=>x.path==='changed.txt'):journal.staged.find(x=>args.operations[x.index].path==='changed.txt');
  await fs.writeFile(path.join(directory,record.file),'tampered');
 }}});}catch(e){failure=e;}
 assert.ok(failure);assert.equal(await fs.readFile(path.join(roots.output,'changed.txt'),'utf8'),'original');
 if(what==='backup')assert.equal(failure.completed,0);
 const journal=JSON.parse(await fs.readFile(path.join(failure.backupPath,'manifest.json'),'utf8'));assert.equal(journal.status,'failed');
});
