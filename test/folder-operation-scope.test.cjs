'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateOperationScope,selectOperationEntries}=require('../desktop/folder-operation-scope.cjs');
const row=(id,path,kind='file',extra={})=>({id,parentId:path.includes('/')?'dir':'root',pathA:path,pathB:path,kindA:kind,kindB:kind,status:'changed',sizeA:1,sizeB:2,mtimeA:20,mtimeB:10,...extra});
const inventory=()=>[row('dir','tree','directory'),row('yes','tree/a.txt'),row('no','tree/b.bin'),row('empty','tree/empty','directory')];
test('operation scope validates and freezes independent defaults and rules',()=>{
 const input={rules:{mode:'size',timeToleranceMs:4}},scope=validateOperationScope(input);input.rules.mode='content';assert.equal(scope.rules.mode,'size');assert.ok(Object.isFrozen(scope)&&Object.isFrozen(scope.rules));
 for(const value of [{foo:true},{include:2},{query:'x'.repeat(4097)},{exclude:'a\0b'},{status:'unknown'},{rules:{mode:'unknown'}}])assert.throws(()=>validateOperationScope(value));
});
test('matching files retain scaffolding but hidden descendants prevent directory removal',()=>{
 const rows=inventory(),before=JSON.stringify(rows),result=selectOperationEntries(rows,{include:'*.txt'},'a');assert.deepEqual([...result.fileIds],['yes']);assert.ok(result.directoryIds.has('dir'));assert.ok(!result.removableDirectoryIds.has('dir'));assert.ok(result.removableDirectoryIds.has('empty'));assert.equal(JSON.stringify(rows),before);
 const all=selectOperationEntries(rows,{},'a');assert.deepEqual([...all.removableDirectoryIds],['dir','empty']);
});
test('query and status filter files while preserving required ancestors',()=>{
 const rows=inventory();rows[1].status='equal';
 assert.deepEqual([...selectOperationEntries(rows,{status:'same'},'a').fileIds],['yes']);
 assert.deepEqual([...selectOperationEntries(rows,{query:'b.bin'},'a').fileIds],['no']);
 assert.deepEqual([...selectOperationEntries(rows,{status:'newer-left'},'a').fileIds],['yes','no']);
 assert.equal(selectOperationEntries(rows,{query:'a.txt'},'a').removableDirectoryIds.size,0);
});
test('aligned actual ancestors and either endpoint exclusions protect source directories',()=>{
 const rows=[row('dir','left','directory',{pathB:'right'}),row('other','elsewhere','directory'),row('yes','left/a.txt','file',{pathB:'right/renamed.txt'}),row('no','left/b.bin','file',{parentId:'other',pathB:'elsewhere/b.bin'})];
 const selected=selectOperationEntries(rows,{exclude:'elsewhere'},'a');assert.deepEqual([...selected.fileIds],['yes']);assert.ok(!selected.removableDirectoryIds.has('dir'));
 assert.deepEqual([...selectOperationEntries(rows,{exclude:'right'},'a').fileIds],['no']);
});
test('excluded empty directories prevent ancestor removal and side-only entries respect requested side',()=>{
 const rows=inventory();rows[1].pathB=null;rows[1].kindB=null;rows[1].status='left';
 assert.deepEqual([...selectOperationEntries(rows,{status:'left'},'a').fileIds],['yes']);assert.equal(selectOperationEntries(rows,{status:'left'},'b').fileIds.size,0);
 assert.ok(!selectOperationEntries(rows,{exclude:'empty'},'a').removableDirectoryIds.has('dir'));
});
test('malformed logical graphs, actual ancestors, duplicate endpoints and bounds are rejected',()=>{
 const bad=[ [row('x','a',{},{})], [row('x','a'),row('x','b')], [row('x','a'),row('y','a')], [row('x','a/b')], [row('x','a','file',{parentId:'missing'})], [row('x','a','directory',{parentId:'y'}),row('y','b','directory',{parentId:'x'})], [row('x','../escape')], [row('x','a','file',{mtimeA:NaN})] ];
 for(const rows of bad)assert.throws(()=>selectOperationEntries(rows,{},'a'));
 assert.throws(()=>selectOperationEntries([],{},'c'));assert.throws(()=>selectOperationEntries(Array(50001).fill(null),{},'a'));
});
