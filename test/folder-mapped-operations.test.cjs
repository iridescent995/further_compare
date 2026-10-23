'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs');
const {FolderTree}=require('../desktop/folder-tree.cjs');
const {MappedFolderOperations}=require('../desktop/folder-mapped-operations.cjs');
async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'fc-mapped-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const roots={a:path.join(base,'a'),b:path.join(base,'b')};for(const root of Object.values(roots))await fs.mkdir(root);
 const write=async(side,relative,text)=>{const full=path.join(roots[side],relative);await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,text);};
 await write('a','old/source.txt','left contents');await write('b','new/target.txt','right contents');await write('b','keep.txt','unrelated');
 const service=new FolderService(path.join(base,'backups'));for(const side of ['a','b'])await service.select(side,roots[side]);
 const tree=new FolderTree(service);await tree.setAlignment([{a:'old/source.txt',b:'new/target.txt',kind:'file'}]);
 return {service,tree,roots,write,operations:new MappedFolderOperations(service,tree)};
}
test('mapped copy uses independent actual names, backs up target and ignores renderer plan mutations',async t=>{
 const {operations,roots}=await fixture(t);const plan=await operations.preview('merge','a-to-b',['new/target.txt']);
 assert.deepEqual(plan.operations.map(o=>[o.sourcePath,o.targetPath]),[['old/source.txt','new/target.txt']]);
 plan.operations[0].path='keep.txt';plan.operations[0].sourcePath='keep.txt';
 const result=await operations.execute(plan.id);assert.equal(await fs.readFile(path.join(roots.b,'new/target.txt'),'utf8'),'left contents');
 assert.equal(await fs.readFile(path.join(result.backupPath,'files/new/target.txt'),'utf8'),'right contents');assert.equal(await fs.readFile(path.join(roots.b,'keep.txt'),'utf8'),'unrelated');
 await assert.rejects(()=>fs.stat(path.join(roots.b,'old/source.txt')),{code:'ENOENT'});await assert.rejects(()=>operations.execute(plan.id),/Preview/);
});
test('mapped reverse copy preserves the left filename',async t=>{
 const {operations,roots}=await fixture(t);const plan=await operations.preview('merge','b-to-a',['old/source.txt']);assert.equal(plan.operations[0].sourcePath,'new/target.txt');
 await operations.execute(plan.id);assert.equal(await fs.readFile(path.join(roots.a,'old/source.txt'),'utf8'),'right contents');
});
test('mapped child creates destination parents deleted since alignment was established',async t=>{
 const {operations,roots}=await fixture(t);await fs.rm(path.join(roots.b,'new'),{recursive:true});
 const plan=await operations.preview('merge','a-to-b',['new/target.txt']);assert.ok(plan.operations.some(o=>o.path==='new'&&o.action==='create-folder'));
 await operations.execute(plan.id);assert.equal(await fs.readFile(path.join(roots.b,'new/target.txt'),'utf8'),'left contents');
});
test('full sync preserves synthetic parents and backs up genuine target-only files',async t=>{
 const {operations,roots}=await fixture(t);const plan=await operations.preview('sync','a-to-b');assert.ok(!plan.operations.some(o=>o.path==='new'&&o.action==='delete-folder'));
 const result=await operations.execute(plan.id);assert.equal(await fs.readFile(path.join(roots.b,'new/target.txt'),'utf8'),'left contents');assert.equal(await fs.readFile(path.join(result.backupPath,'files/keep.txt'),'utf8'),'unrelated');
});
test('refresh invalidates mapped previews and external target changes reject execution',async t=>{
 const {operations,tree,roots}=await fixture(t);const plan=await operations.preview('merge','a-to-b');await tree.refresh();await assert.rejects(()=>operations.execute(plan.id),/alignment changed/);
 // Separate valid adapter for the content-change check.
 const fixture2=await fixture(t);const next=await fixture2.operations.preview('merge','a-to-b');await fs.writeFile(path.join(fixture2.roots.b,'new/target.txt'),'external edit');await assert.rejects(()=>fixture2.operations.execute(next.id),/changed after preview/);
 assert.equal(await fs.readFile(path.join(roots.b,'new/target.txt'),'utf8'),'right contents');
});
test('reserved counterparts cannot be deleted by mapped sync',async t=>{
 const {operations,write}=await fixture(t);await write('b','old/source.txt','reserved decoy');await assert.rejects(()=>operations.preview('sync','a-to-b'),/reserved alignment counterpart/);
});
test('alignment changes are blocked while a mapped operation is executing and unlocked afterward',async t=>{
 const {operations,tree,service}=await fixture(t);const plan=await operations.preview('merge','a-to-b',['new/target.txt']);const original=service.snapshot.bind(service);let entered,release;
 const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);service.snapshot=async(...args)=>{entered();await gate;return original(...args);};
 const running=operations.execute(plan.id);await started;await assert.rejects(()=>tree.refresh(),/current folder operation/);await assert.rejects(()=>tree.setAlignment([]),/current folder operation/);release();await running;await tree.refresh();
});
test('selected sync applies exact target rows without deleting unselected siblings',async t=>{
 const {operations,roots,write}=await fixture(t);await write('b','extra/remove.txt','remove');await write('b','extra/keep.txt','keep');
 const plan=await operations.preview('sync','a-to-b',['extra/remove.txt']);assert.deepEqual(plan.operations.map(o=>o.path),['extra/remove.txt']);
 await operations.execute(plan.id);assert.equal(await fs.readFile(path.join(roots.b,'extra/keep.txt'),'utf8'),'keep');await assert.rejects(()=>fs.stat(path.join(roots.b,'extra/remove.txt')),{code:'ENOENT'});
});
test('replaced selected roots invalidate a mapped adapter before writing',async t=>{
 const {operations,roots}=await fixture(t);const plan=await operations.preview('merge','a-to-b');await fs.rename(roots.b,roots.b+'-previous');await fs.mkdir(roots.b);await fs.writeFile(path.join(roots.b,'keep.txt'),'new root');
 await assert.rejects(()=>operations.execute(plan.id),/roots changed/);assert.deepEqual(await fs.readdir(roots.b),['keep.txt']);
});
test('declared mappings cannot change entry type during preview',async t=>{
 const {operations,roots}=await fixture(t);await fs.unlink(path.join(roots.a,'old/source.txt'));await fs.mkdir(path.join(roots.a,'old/source.txt'));
 await assert.rejects(()=>operations.preview('merge','a-to-b'),/changed type/);
});
test('failed mapped execution releases its tree operation lock',async t=>{
 const {operations,tree,service}=await fixture(t);const plan=await operations.preview('merge','a-to-b');const original=service.snapshot.bind(service);service.snapshot=async()=>{throw new Error('test read failure');};
 await assert.rejects(()=>operations.execute(plan.id),/test read failure/);service.snapshot=original;await tree.refresh();await tree.setAlignment([]);
});
test('mapped execution invalidates loaded row metadata after writes',async t=>{
 const {operations,tree}=await fixture(t);const root=await tree.list(),parent=root.rows.find(row=>row.pathA==='old'),children=await tree.list(parent.id),row=children.rows.find(row=>row.pathA==='old/source.txt');
 const plan=await operations.preview('merge','a-to-b',['new/target.txt']),result=await operations.execute(plan.id);assert.notEqual(result.treeRevision,children.revision);await assert.rejects(()=>tree.resolve(row.id,'a',children.revision),/revision changed/);
});
test('root selection change during final delete validation prevents the deletion',async t=>{
 const {operations,roots,service}=await fixture(t);const alternate=path.join(path.dirname(roots.b),'alternate');await fs.mkdir(alternate);await fs.writeFile(path.join(alternate,'keep.txt'),'alternate');
 const plan=await operations.preview('sync','a-to-b',['keep.txt']);const originalSafe=service.safe.bind(service),originalRealpath=fs.realpath;let targetReads=0,armed=false,changed=false;
 service.safe=async(...args)=>{const result=await originalSafe(...args);if(args[0]==='b'&&args[1]==='keep.txt'&&++targetReads===2)armed=true;return result;};
 fs.realpath=async(...args)=>{const result=await originalRealpath(...args);if(armed&&args[0]===service.roots.b){armed=false;changed=true;service.roots.b=await originalRealpath(alternate);}return result;};
 try {await assert.rejects(()=>operations.execute(plan.id),/roots changed/);assert.equal(changed,true);assert.equal(await fs.readFile(path.join(roots.b,'keep.txt'),'utf8'),'unrelated');assert.equal(await fs.readFile(path.join(alternate,'keep.txt'),'utf8'),'alternate');}
 finally {fs.realpath=originalRealpath;service.safe=originalSafe;}
});
test('selecting a mapped directory is exact and does not implicitly copy its descendants',async t=>{
 const {service,tree,roots,write}=await fixture(t);await write('a','folder/child.txt','do not copy');await fs.mkdir(path.join(roots.b,'paired'));
 await tree.setAlignment([{a:'folder',b:'paired',kind:'directory'}]);await fs.rm(path.join(roots.b,'paired'),{recursive:true});
 const operations=new MappedFolderOperations(service,tree),plan=await operations.preview('merge','a-to-b',['paired']);assert.deepEqual(plan.operations.map(o=>[o.path,o.action]),[['paired','create-folder']]);await operations.execute(plan.id);assert.deepEqual(await fs.readdir(path.join(roots.b,'paired')),[]);
});
test('alignment validation already in flight cannot commit during execution',async t=>{
 const {operations,service,tree}=await fixture(t);const plan=await operations.preview('merge','a-to-b',['new/target.txt']);
 const originalSafe=service.safe.bind(service),originalSnapshot=service.snapshot.bind(service);let mappingEntered,releaseMapping,executeEntered,releaseExecute,held=false;
 const mappingStarted=new Promise(r=>mappingEntered=r),mappingGate=new Promise(r=>releaseMapping=r),executeStarted=new Promise(r=>executeEntered=r),executeGate=new Promise(r=>releaseExecute=r);
 service.safe=async(...args)=>{if(!held){held=true;mappingEntered();await mappingGate;}return originalSafe(...args);};
 const mapping=tree.setAlignment(tree.alignment.pairs);await mappingStarted;
 service.snapshot=async(...args)=>{executeEntered();await executeGate;return originalSnapshot(...args);};const execution=operations.execute(plan.id);await executeStarted;
 releaseMapping();await assert.rejects(()=>mapping,/current folder operation/);releaseExecute();await execution;
});
test('context copy reads only selected source coverage and mapped targets',async t=>{
 const {operations,roots,write}=await fixture(t);await write('a','unrelated.txt','never read');await write('b','unrelated.txt','never read');
 const open=fs.open;fs.open=async(file,...args)=>{if(String(file)===path.join(roots.a,'unrelated.txt')||String(file)===path.join(roots.b,'unrelated.txt'))throw new Error('Unrelated file was read');return open(file,...args);};
 try {const plan=await operations.previewCopy('a',['old/source.txt']);assert.equal(plan.mode,'copy');await operations.execute(plan.id);assert.equal(await fs.readFile(path.join(roots.b,'new/target.txt'),'utf8'),'left contents');}
 finally {fs.open=open;}
});
test('context copy excludes source ancestors from destination ownership',async t=>{
 const {operations,roots,write}=await fixture(t);await write('b','old','unrelated file at source parent name');
 const plan=await operations.previewCopy('a',['old/source.txt']);assert.ok(!plan.operations.some(o=>o.path==='old'));await operations.execute(plan.id);assert.equal(await fs.readFile(path.join(roots.b,'old'),'utf8'),'unrelated file at source parent name');
});
test('recursive context copy follows children mapped outside their parent and preserves target-only files',async t=>{
 const {operations,roots,write}=await fixture(t);await write('a','old/regular.txt','regular');await write('b','old/extra.txt','keep extra');
 const plan=await operations.previewCopy('a',['old']);assert.ok(plan.operations.some(o=>o.path==='new/target.txt'));assert.ok(plan.operations.some(o=>o.path==='old/regular.txt'));
 await operations.execute(plan.id);assert.equal(await fs.readFile(path.join(roots.b,'new/target.txt'),'utf8'),'left contents');assert.equal(await fs.readFile(path.join(roots.b,'old/regular.txt'),'utf8'),'regular');assert.equal(await fs.readFile(path.join(roots.b,'old/extra.txt'),'utf8'),'keep extra');
});
test('recursive context copy reverses mapped directory and nested file names',async t=>{
 const {service,tree,roots,write}=await fixture(t);await write('a','folder/a.txt','left');await write('b','paired/b.txt','right');await write('b','paired/sub/extra.txt','extra');
 await tree.setAlignment([{a:'folder',b:'paired',kind:'directory'},{a:'folder/a.txt',b:'paired/b.txt',kind:'file'}]);const operations=new MappedFolderOperations(service,tree);const plan=await operations.previewCopy('b',['paired']);await operations.execute(plan.id);
 assert.equal(await fs.readFile(path.join(roots.a,'folder/a.txt'),'utf8'),'right');assert.equal(await fs.readFile(path.join(roots.a,'folder/sub/extra.txt'),'utf8'),'extra');await assert.rejects(()=>fs.stat(path.join(roots.a,'folder/b.txt')),{code:'ENOENT'});
});
test('context copy rejects missing, displaced and excluded selections',async t=>{
 const {operations,write}=await fixture(t);await write('a','new/target.txt','displaced');await write('a','.git/config','hidden');
 for(const selection of [['missing.txt'],['new/target.txt'],['.git/config'],['../escape']])await assert.rejects(()=>operations.previewCopy('a',selection));
});
test('a new selected descendant after preview invalidates recursive context copy',async t=>{
 const {operations,roots,write}=await fixture(t);const plan=await operations.previewCopy('a',['old']);await write('a','old/new.txt','appeared');await assert.rejects(()=>operations.execute(plan.id),/changed after preview/);assert.equal(await fs.readFile(path.join(roots.b,'new/target.txt'),'utf8'),'right contents');
});
test('scoped copy rejects differently spelled destination ancestors before writing',async t=>{
 const {operations,roots}=await fixture(t);await fs.rename(path.join(roots.b,'new'),path.join(roots.b,'NEW'));
 await assert.rejects(()=>operations.previewCopy('a',['old/source.txt']),/filename spelling/);assert.equal(await fs.readFile(path.join(roots.b,'NEW/target.txt'),'utf8'),'right contents');
});
test('scoped copy rejects replaced source scaffolding even with the same selected file inode',async t=>{
 const {operations,roots}=await fixture(t);const replacement=path.join(roots.a,'replacement');await fs.mkdir(replacement);await fs.link(path.join(roots.a,'old/source.txt'),path.join(replacement,'source.txt'));
 const before=await fs.lstat(path.join(roots.a,'old/source.txt'),{bigint:true}),plan=await operations.previewCopy('a',['old/source.txt']);
 await fs.rename(path.join(roots.a,'old'),path.join(roots.a,'retired'));await fs.rename(replacement,path.join(roots.a,'old'));
 const after=await fs.lstat(path.join(roots.a,'old/source.txt'),{bigint:true});assert.equal(after.ino,before.ino);assert.equal(after.ctimeNs,before.ctimeNs);
 await assert.rejects(()=>operations.execute(plan.id),/changed after preview/);assert.equal(await fs.readFile(path.join(roots.b,'new/target.txt'),'utf8'),'right contents');
});
test('scoped copy creates missing destination parents and isolates returned preview edits',async t=>{
 const {operations,roots}=await fixture(t);await fs.rm(path.join(roots.b,'new'),{recursive:true});const plan=await operations.previewCopy('a',['old/source.txt']);
 for(const op of plan.operations){op.path='keep.txt';op.targetPath='keep.txt';op.action='delete';}
 await operations.execute(plan.id);assert.equal(await fs.readFile(path.join(roots.b,'new/target.txt'),'utf8'),'left contents');assert.equal(await fs.readFile(path.join(roots.b,'keep.txt'),'utf8'),'unrelated');
});
