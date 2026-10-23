'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs'),{previewMove}=require('../desktop/folder-move.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-filter-move-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const a=path.join(root,'a'),b=path.join(root,'b');await fs.mkdir(a);await fs.mkdir(b);const service=new FolderService(path.join(root,'backup'));await service.select('a',a);await service.select('b',b);await fs.mkdir(path.join(a,'folder/hidden-empty'),{recursive:true});await fs.writeFile(path.join(a,'folder/go.txt'),'source');await fs.writeFile(path.join(a,'folder/keep.bak'),'hidden');return {a,b,service};}
const selectSourceEntries=entries=>[...entries.keys()].filter(p=>p==='folder'||p.endsWith('.txt'));
test('filtered move retains excluded children and directories while moving eligible files',async t=>{
 const {a,b,service}=await fixture(t),plan=await previewMove(service,'a',['folder'],null,{selectSourceEntries});
 assert.equal(plan.preview.retainedDirectories,2);assert.ok(!plan.preview.operations.some(op=>op.action==='move-folder'));await plan.service.execute(plan.preview.id);
 await assert.rejects(fs.stat(path.join(a,'folder/go.txt')),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(b,'folder/go.txt'),'utf8'),'source');assert.equal(await fs.readFile(path.join(a,'folder/keep.bak'),'utf8'),'hidden');assert.ok((await fs.stat(path.join(a,'folder/hidden-empty'))).isDirectory());await assert.rejects(fs.stat(path.join(b,'folder/keep.bak')),{code:'ENOENT'});
});
test('filtered move validates excluded source coverage before making changes',async t=>{
 const {a,b,service}=await fixture(t),plan=await previewMove(service,'a',['folder'],null,{selectSourceEntries});await fs.writeFile(path.join(a,'folder/keep.bak'),'external');await assert.rejects(plan.service.execute(plan.preview.id),/changed/);assert.equal(await fs.readFile(path.join(a,'folder/go.txt'),'utf8'),'source');await assert.rejects(fs.stat(path.join(b,'folder')),{code:'ENOENT'});
});
test('filtered move rolls back eligible files while preserving retained descendants',async t=>{
 const {a,b,service}=await fixture(t);await fs.mkdir(path.join(b,'folder'));await fs.writeFile(path.join(b,'folder/go.txt'),'target');
 const plan=await previewMove(service,'a',['folder'],null,{selectSourceEntries,beforeStep:async({phase})=>{if(phase==='complete')throw Error('injected after source removal');}});await assert.rejects(plan.service.execute(plan.preview.id),/injected/);
 assert.equal(await fs.readFile(path.join(a,'folder/go.txt'),'utf8'),'source');assert.equal(await fs.readFile(path.join(b,'folder/go.txt'),'utf8'),'target');assert.equal(await fs.readFile(path.join(a,'folder/keep.bak'),'utf8'),'hidden');assert.ok((await fs.stat(path.join(a,'folder/hidden-empty'))).isDirectory());
});
test('filtered move maps only eligible entries and rejects malformed native selections',async t=>{
 const {a,b,service}=await fixture(t);
 for(const values of [['unknown'],['folder/go.txt','folder/go.txt'],null])await assert.rejects(previewMove(service,'a',['folder'],null,{selectSourceEntries:()=>values}),/Invalid filtered move/);
 const plan=await previewMove(service,'a',['folder'],null,{selectSourceEntries:entries=>{entries.get('folder/go.txt').hash='tampered copy';return ['folder/go.txt'];},targetPath:p=>{assert.equal(p,'folder/go.txt');return 'different/renamed.txt';}});await plan.service.execute(plan.preview.id);assert.equal(await fs.readFile(path.join(b,'different/renamed.txt'),'utf8'),'source');assert.equal(await fs.readFile(path.join(a,'folder/keep.bak'),'utf8'),'hidden');
});
