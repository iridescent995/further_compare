'use strict';
const {chromium}=require('@playwright/test'),{build}=require('esbuild'),assert=require('node:assert/strict'),{gzipSync}=require('node:zlib');
const {tar}=require('./tar-fixture.cjs'),{zip}=require('./archive-fixture.cjs');
(async()=>{
 const bundled=await build({entryPoints:['src/archive-compare.js'],bundle:true,write:false,format:'iife',globalName:'ArchiveHarness',platform:'browser'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage();await page.setContent('<main id="host"></main>');await page.addScriptTag({content:bundled.outputFiles[0].text});
 const plain={name:'current.zip',data:zip([{name:'current.txt',data:'new'}]).toString('base64')};
 const compressed={name:'slow.tar.gz',data:gzipSync(tar('PAX',[{name:'old.txt',data:'old'}])).toString('base64')};
 const corrupt=Buffer.from(compressed.data,'base64');corrupt[corrupt.length-8]^=1;
 await page.evaluate(()=>{
  const Native=DecompressionStream;window.arm=()=>{window.started=new Promise(r=>window.markStarted=r);window.gate=new Promise(r=>window.release=r);window.gateNext=true;};
  window.DecompressionStream=class{constructor(format){const stream=new Native(format);if(!window.gateNext)return stream;window.gateNext=false;const gate=window.gate;window.markStarted();const before=new TransformStream({async transform(chunk,controller){await gate;controller.enqueue(chunk);}});before.readable.pipeTo(stream.writable).catch(()=>{});return {writable:before.writable,readable:stream.readable};}};
  window.saves=[];window.inputs={};window.dirty=0;window.errors=[];window.compare=ArchiveHarness.createArchiveCompare({host:document.querySelector('#host'),desktop:{openData:async side=>window.inputs[side],saveData:async(data,name)=>{window.saves.push({data,name});return {cancelled:false,path:name};}},onDirty:()=>window.dirty++,notify:message=>window.errors.push(message)});
 });
 // A reset while gzip is decoding must discard the old archive entirely.
 await page.evaluate(input=>{inputs.a=input;arm();window.pending=compare.openSide('a');},compressed);await page.evaluate(()=>started);
 await page.evaluate(async input=>{compare.reset();inputs.a=input;await compare.openSide('a');release();await pending;},plain);
 assert.deepEqual(await page.locator('.archive-row[data-path]').evaluateAll(rows=>rows.map(r=>r.dataset.path)),['current.txt']);
 // A newer request on the same side wins even when it finishes first.
 await page.evaluate(input=>{inputs.a=input;arm();window.pending=compare.openSide('a');},compressed);await page.evaluate(()=>started);
 await page.evaluate(async input=>{inputs.a=input;await compare.openSide('a');release();await pending;},plain);
 assert.equal(await page.evaluate(()=>compare.getState().inputs.a.name),'current.zip');
 // Independent side requests must both survive out-of-order completion.
 await page.evaluate(input=>{compare.reset();inputs.a=input;arm();window.pending=compare.openSide('a');},compressed);await page.evaluate(()=>started);
 await page.evaluate(async input=>{inputs.b=input;await compare.openSide('b');release();await pending;},plain);
 assert.deepEqual(await page.evaluate(()=>[compare.getState().inputs.a.name,compare.getState().inputs.b.name]),['slow.tar.gz','current.zip']);
 // Session restoration is also asynchronous and must not overwrite a newer session.
 await page.evaluate(input=>{arm();window.pending=compare.setState({inputs:{a:input}});},compressed);await page.evaluate(()=>started);
 await page.evaluate(async input=>{await compare.setState({inputs:{a:input}});release();await pending;},plain);
 assert.equal(await page.evaluate(()=>compare.getState().inputs.a.name),'current.zip');
 // A stale decode failure must not surface in the newly selected session.
 await page.evaluate(input=>{inputs.a=input;arm();window.pending=compare.openSide('a').catch(e=>errors.push(e.message));},{name:'corrupt.tar.gz',data:corrupt.toString('base64')});await page.evaluate(()=>started);
 await page.evaluate(async input=>{await compare.setState({inputs:{a:input}});release();await pending;},plain);
 assert.deepEqual(await page.evaluate(()=>errors),[]);
 await page.evaluate(input=>{arm();window.pending=compare.setState({inputs:{a:input}}).catch(e=>errors.push(e.message));},{name:'corrupt.tar.gz',data:corrupt.toString('base64')});await page.evaluate(()=>started);
 await page.evaluate(async input=>{await compare.setState({inputs:{a:input}});release();await pending;},plain);
 assert.deepEqual(await page.evaluate(()=>errors),[]);
 const currentError=await page.evaluate(async input=>{inputs.a=input;try{await compare.openSide('a');return null;}catch(e){return e.message;}},{name:'corrupt.tar.gz',data:corrupt.toString('base64')});
 assert.match(currentError,/compressed data|check/i);
 assert.equal(await page.evaluate(()=>compare.getState().inputs.a.name),'current.zip');

 const exportInput={name:'export.zip',data:zip([{name:'entry.bin',data:Buffer.from([0,255,128]),deflate:true}]).toString('base64')};
 await page.evaluate(async input=>{await compare.setState({inputs:{a:input}});document.querySelector('[data-path="entry.bin"]').click();arm();window.exporting=[...document.querySelectorAll('button')].find(b=>b.textContent==='Save left file as…').onclick();},exportInput);await page.evaluate(()=>started);
 await page.evaluate(async()=>{compare.reset();release();await exporting;});assert.deepEqual(await page.evaluate(()=>saves),[]);assert.deepEqual(await page.evaluate(()=>errors),[]);
 const badEntry=zip([{name:'bad.bin',data:Buffer.from([0,255,128])}]);badEntry[30+'bad.bin'.length]^=1;
 await page.evaluate(async input=>{await compare.setState({inputs:{a:input}});document.querySelector('[data-path="bad.bin"]').click();await [...document.querySelectorAll('button')].find(b=>b.textContent==='Save left file as…').onclick();},{name:'bad.zip',data:badEntry.toString('base64')});assert.deepEqual(await page.evaluate(()=>saves),[]);assert.match((await page.evaluate(()=>errors)).at(-1),/CRC|checksum|integrity/i);
 console.log('Archive async checks passed: reset, replacement, concurrent sides, session restore, stale errors.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
