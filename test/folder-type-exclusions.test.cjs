'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fileTypeMasks,appendTypeMasks,appendExcludedFileTypes}=require('../src/folder-type-exclusions.cjs');
const {excluded,filterEntries}=require('../src/folder-view.cjs');
const row=(a,b)=>({id:'opaque',kindA:a?'file':null,kindB:b?'file':null,pathA:a,pathB:b});
test('actual selected-side names determine deduplicated case-insensitive extensions',()=>{
 const rows=[row('source/A.TXT','target/a.md'),row('b.txt','b.JSON'),{...row('path/fallback.log',null),nameA:'actual.CSV'}];
 assert.deepEqual(fileTypeMasks(rows,'a'),['*.txt','*.csv']);
 assert.deepEqual(fileTypeMasks(rows.slice(0,2),'b'),['*.md','*.json']);
 assert.deepEqual(fileTypeMasks([row('archive.tar.gz',null)],'a'),['*.gz']);
 assert.throws(()=>fileTypeMasks(rows,'b'),/regular files/);
});
test('literal glob characters other than star/question stay literal under current matcher',()=>{
 const masks=fileTypeMasks([row('file.[x]+(v)$',null)],'a');
 const expression=appendTypeMasks('',masks);
 assert.equal(excluded('dir/other.[X]+(V)$',expression),true);
 assert.equal(excluded('dir/other.xv',expression),false);
});
test('quoted paths and semicolons survive appending, and existing glob case is deduplicated',()=>{
 const expression='"dir/a;b.txt";*.TXT;"*.json"';
 assert.equal(appendTypeMasks(expression,['*.txt','*.JSON','*.json']),expression+';*.json');
 assert.equal(excluded('dir/a;b.txt',appendTypeMasks(expression,['*.log'])),true);
 assert.throws(()=>appendTypeMasks('"unfinished',['*.txt']),/unfinished quoted/);
});
test('invalid selections reject atomically, including dotfiles, missing extensions and directories',()=>{
 for(const invalid of [row('.gitignore',null),row('.config.json',null),row('README',null),row('name.',null),{...row('a.txt',null),kindA:'directory'},{...row('a.txt','b.txt'),kindB:'directory'},{...row('a.txt',null),alignmentConflict:true},row(null,'right.txt')]){
  assert.throws(()=>appendExcludedFileTypes('*.bak',[row('valid.txt',null),invalid],'a'));
 }
 assert.throws(()=>fileTypeMasks([],'a'),/Select between/);
 assert.throws(()=>fileTypeMasks([row('a.txt',null)],'left'),/left or right/);
});
test('unsafe extensions cannot inject glob syntax or extra exclusions',()=>{
 for(const extension of ['t*','t?','t;*','t"','t\\x','t\nx','t ',' t']){
  assert.throws(()=>fileTypeMasks([row('file.'+extension,null)],'a'));
  assert.throws(()=>appendTypeMasks('*.bak',['*.'+extension]),/Invalid/);
 }
 for(const masks of [[],['*'],['*.'],['*.a/b'],['*.a.b'],[null]])assert.throws(()=>appendTypeMasks('',masks),/Invalid/);
});
test('bounds enforce row count and persisted expression length',()=>{
 assert.deepEqual(fileTypeMasks(Array.from({length:1000},()=>row('a.txt',null)),'a'),['*.txt']);
 assert.throws(()=>fileTypeMasks(Array.from({length:1001},()=>row('a.txt',null)),'a'),/1,000/);
 assert.throws(()=>appendTypeMasks('x'.repeat(4096),['*.txt']),/Too many exclusions/);
});
test('applied masks hide both aligned endpoint matches and matching directory descendants consistently',()=>{
 const masks=appendExcludedFileTypes('',[row('left/code.js','right/code.txt')],'a');
 const rows=[row('left/other.JS','right/other.txt'),{...row('keep.txt','keep.txt'),id:'keep'},{...row('cache.js/a.txt','cache.js/a.txt'),id:'descendant'}];
 assert.deepEqual(filterEntries(rows,{exclude:masks}).map(r=>r.id),['keep']);
});
