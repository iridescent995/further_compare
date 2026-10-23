'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-filtered-plans-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const a=path.join(root,'a'),b=path.join(root,'b');await fs.mkdir(a);await fs.mkdir(b);const service=new FolderService(path.join(root,'backup'));await service.select('a',a);await service.select('b',b);return {a,b,service};}
test('filtered copy executes only eligible descendants and retains full snapshot coverage',async t=>{
 const {a,b,service}=await fixture(t);await fs.mkdir(path.join(a,'folder'));await fs.writeFile(path.join(a,'folder','copy.txt'),'included');await fs.writeFile(path.join(a,'folder','keep.bak'),'excluded');
 const scope={include:'*.txt',exclude:'*.bak'},plan=await service.previewAction('copy','a',['folder'],scope);
 scope.include='*';scope.exclude='';
 assert.deepEqual(plan.operations.map(x=>[x.path,x.action]),[['folder','create-folder'],['folder/copy.txt','copy']]);
 await service.execute(plan.id);assert.equal(await fs.readFile(path.join(b,'folder/copy.txt'),'utf8'),'included');await assert.rejects(fs.stat(path.join(b,'folder/keep.bak')), {code:'ENOENT'});assert.equal(await fs.readFile(path.join(a,'folder/keep.bak'),'utf8'),'excluded');
 const next=await service.previewAction('copy','a',['folder'],{exclude:'*.bak'});await fs.writeFile(path.join(a,'folder/keep.bak'),'changed while hidden');await assert.rejects(service.execute(next.id),/changed after preview/);
});
test('filtered delete preserves excluded files/directories and backs up only eligible files',async t=>{
 const {a,b,service}=await fixture(t);for(const root of [a,b]){await fs.mkdir(path.join(root,'folder/empty'),{recursive:true});await fs.writeFile(path.join(root,'folder/remove.txt'),'same');await fs.writeFile(path.join(root,'folder/keep.bak'),'same');}
 const plan=await service.previewAction('delete','a',['folder'],{exclude:'*.bak;empty'});
 assert.deepEqual(plan.operations.map(x=>[x.path,x.action]),[['folder/remove.txt','delete']]);
 const result=await service.execute(plan.id);await assert.rejects(fs.stat(path.join(a,'folder/remove.txt')), {code:'ENOENT'});assert.equal(await fs.readFile(path.join(a,'folder/keep.bak'),'utf8'),'same');assert.ok((await fs.stat(path.join(a,'folder/empty'))).isDirectory());assert.equal(await fs.readFile(path.join(result.backupPath,'files/folder/remove.txt'),'utf8'),'same');assert.equal(await fs.readFile(path.join(b,'folder/remove.txt'),'utf8'),'same');
});
test('normalized eligibility keeps byte-based copies and validates untouched comparison counterparts',async t=>{
 const {a,b,service}=await fixture(t);for(const root of [a,b])await fs.mkdir(path.join(root,'folder'));
 await fs.writeFile(path.join(a,'folder/same.txt'),'HELLO\r\n');await fs.writeFile(path.join(b,'folder/same.txt'),'hello\n');await fs.writeFile(path.join(a,'folder/diff.txt'),'left');await fs.writeFile(path.join(b,'folder/diff.txt'),'right');
 const scope={status:'diff',rules:{mode:'text-case'}},plan=await service.previewAction('delete','a',['folder'],scope);
 assert.deepEqual(plan.operations.map(x=>x.path),['folder/diff.txt']);
 await fs.writeFile(path.join(b,'folder/diff.txt'),'left');await assert.rejects(service.execute(plan.id),/changed after preview/);assert.equal(await fs.readFile(path.join(a,'folder/diff.txt'),'utf8'),'left');
 const copy=await service.previewAction('copy','a',['folder'],{status:'same',rules:{mode:'text-case'}});assert.ok(copy.operations.some(x=>x.path==='folder/same.txt'));await service.execute(copy.id);assert.equal(await fs.readFile(path.join(b,'folder/same.txt'),'utf8'),'HELLO\r\n');
});
test('filtered sync preserves unmatched target-only children and their directory',async t=>{
 const {a,b,service}=await fixture(t);await fs.mkdir(path.join(b,'folder'));await fs.writeFile(path.join(b,'folder/remove.txt'),'remove');await fs.writeFile(path.join(b,'folder/keep.bak'),'keep');
 const plan=await service.preview('sync','a-to-b',null,null,{include:'*.txt',exclude:'*.bak',status:'right'});
 assert.deepEqual(plan.operations.map(x=>[x.path,x.action]),[['folder/remove.txt','delete']]);await service.execute(plan.id);assert.equal(await fs.readFile(path.join(b,'folder/keep.bak'),'utf8'),'keep');
});
