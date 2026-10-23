'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {assertTableValueTarget}=require('../desktop/table-value-save-guard.cjs');
const {saveLocalText}=require('../desktop/local-text-save.cjs');
const snapshots=require('../desktop/local-file-snapshot.cjs');
const {fixture}=require('./ods-fixture.cjs');
test('table values reject ODS names before accessing disk',async()=>{
 await assert.rejects(assertTableValueTarget('/unread/new.ODS',null,[],{open(){throw Error('Unexpected read');}}),/ODS/);
});
test('table values preserve native originals, aliases and embedded-session ODS targets',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-ods-save-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=path.join(root,'source.ods'),alias=path.join(root,'alias.csv'),renamed=path.join(root,'renamed'),output=path.join(root,'values.csv'),bytes=await fixture();
 await fs.writeFile(source,bytes);const snapshot=await snapshots.capture(source),sources=[{path:source,dev:snapshot.dev,ino:snapshot.ino}];await fs.link(source,alias);
 await assert.rejects(saveLocalText(alias,Buffer.from('changed'),{validateTarget:(p,s)=>assertTableValueTarget(p,s,sources)}),/ODS source/);
 await fs.rename(source,renamed);
 await assert.rejects(saveLocalText(renamed,Buffer.from('changed'),{validateTarget:(p,s)=>assertTableValueTarget(p,s,sources)}),/ODS source/);
 // Embedded sessions intentionally have no disk authority. The package MIME
 // still protects renamed documents and aliases without trusting saved paths.
 for(const file of [alias,renamed])await assert.rejects(saveLocalText(file,Buffer.from('changed'),{validateTarget:(p,s)=>assertTableValueTarget(p,s)}),/contains an ODS/);
 await fs.writeFile(output,'previous');await saveLocalText(output,Buffer.from('a,b\n1,2'),{validateTarget:(p,s)=>assertTableValueTarget(p,s,sources)});
 assert.equal(await fs.readFile(output,'utf8'),'a,b\n1,2');assert.deepEqual(await fs.readFile(alias),bytes);assert.deepEqual(await fs.readFile(renamed),bytes);
 assert.deepEqual((await fs.readdir(root)).sort(),['alias.csv','renamed','values.csv']);
});
test('ODS target inspection is bounded and refuses a changed snapshot before staging',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-ods-target-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const file=path.join(root,'target.csv');await fs.writeFile(file,'old');const before=await snapshots.capture(file);await fs.writeFile(file,'new bytes');
 await assert.rejects(assertTableValueTarget(file,before),/changed/);
 let readBytes=0,closed=false;const current=await snapshots.capture(file),injected={...fs,open:async(...args)=>{const h=await fs.open(...args);return new Proxy(h,{get(target,key){if(key==='read')return async(...args)=>{readBytes+=args[2];const result=await target.read(...args);await fs.appendFile(file,'x');return result;};if(key==='close')return async()=>{closed=true;await target.close();};const value=target[key];return typeof value==='function'?value.bind(target):value;}});}};
 await assert.rejects(assertTableValueTarget(file,current,[],injected),/changed/);assert.ok(readBytes<10000);assert.equal(closed,true);
});
