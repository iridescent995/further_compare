'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {assertOdsCopyTarget,assertTableValueTarget}=require('../desktop/table-value-save-guard.cjs');
test('preserving ODS output admits a new ODS name without weakening values-only guard',async()=>{
 await assertOdsCopyTarget('/new/copy.ods',null,[]);await assertOdsCopyTarget('/new/copy.ODS',null,[]);
 await assert.rejects(assertTableValueTarget('/new/copy.ods',null,[]),/ODS/);
 await assert.rejects(assertOdsCopyTarget('/new/copy.xlsx',null,[]),/ods/);
 await assert.rejects(assertOdsCopyTarget('/new/source.ods',null,[{path:'/new/source.ods'}]),/source/);
});
test('preserving ODS output rejects existing files and source hardlinks before changing bytes',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-ods-copy-guard-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const source=path.join(root,'source.ods'),alias=path.join(root,'alias.ods'),output=path.join(root,'copy.ods');await fs.writeFile(source,'original');await fs.link(source,alias);const snapshot=await fs.lstat(source,{bigint:true}),sources=[{path:source,dev:snapshot.dev,ino:snapshot.ino}];
 for(const target of [source,alias])await assert.rejects(assertOdsCopyTarget(target,await fs.lstat(target,{bigint:true}),sources),/new output/);
 await assertOdsCopyTarget(output,null,sources);assert.equal(await fs.readFile(source,'utf8'),'original');assert.equal(await fs.readFile(alias,'utf8'),'original');
});
