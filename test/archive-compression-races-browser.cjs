'use strict';
const {chromium,expect}=require('@playwright/test'),{build}=require('esbuild'),assert=require('node:assert/strict');
const {zip}=require('./archive-fixture.cjs'),{parseArchive}=require('../src/archive-core.cjs');
(async()=>{
 const bundled=await build({entryPoints:['src/archive-compare.js'],bundle:true,write:false,format:'iife',globalName:'ArchiveHarness',platform:'browser'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<main id="host"></main>');await page.addScriptTag({content:bundled.outputFiles[0].text});
  const old={name:'old.zip',data:zip([{name:'old.txt',data:'compress me '.repeat(3000)}]).toString('base64')},fresh={name:'fresh.zip',data:zip([{name:'fresh.txt',data:'new content '.repeat(3000)}]).toString('base64')};
  await page.evaluate(()=>{
   const Native=CompressionStream;window.arm=()=>{window.started=new Promise(resolve=>window.markStarted=resolve);window.gate=new Promise(resolve=>window.release=resolve);window.gateNext=true;};
   window.CompressionStream=class{constructor(format){if(window.failNext){window.failNext=false;throw Error('Injected compression failure');}const stream=new Native(format);if(!window.gateNext)return stream;window.gateNext=false;const gate=window.gate;window.markStarted();const before=new TransformStream({async transform(chunk,controller){await gate;controller.enqueue(chunk);}});before.readable.pipeTo(stream.writable).catch(()=>{});return {writable:before.writable,readable:stream.readable};}};
   window.saves=[];window.notices=[];window.errors=[];window.compare=ArchiveHarness.createArchiveCompare({host:document.querySelector('#host'),desktop:{saveData:async(data,name)=>{saves.push({data,name});return {cancelled:false,path:name};}},notify:(message,error)=>{notices.push(message);if(error)errors.push(message);}});
   window.saveButton=()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='Save left archive…');
   window.beginSave=async()=>{await saveButton().onclick();document.querySelector('[data-compression]').value='deflate';window.pendingSave=document.querySelector('[data-apply]').onclick();};
  });
  // Reset invalidates an in-flight compressor before any native save dialog is called.
  await page.evaluate(async input=>{await compare.setState({inputs:{a:input}});arm();await beginSave();},old);await page.evaluate(()=>started);
  await page.evaluate(async()=>{compare.reset();release();await pendingSave;});assert.deepEqual(await page.evaluate(()=>saves),[]);assert.deepEqual(await page.evaluate(()=>errors),[]);
  // Restoring another session while compression runs cannot publish the previous bytes.
  await page.evaluate(async input=>{await compare.setState({inputs:{a:input}});arm();await beginSave();},old);await page.evaluate(()=>started);
  await page.evaluate(async input=>{await compare.setState({inputs:{a:input}});release();await pendingSave;},fresh);
  assert.deepEqual(await page.evaluate(()=>saves),[]);assert.equal(await page.evaluate(()=>compare.getState().inputs.a.name),'fresh.zip');assert.deepEqual(await page.evaluate(()=>errors),[]);
  // The current session can still save normally after an obsolete request settles.
  await page.evaluate(async()=>{await beginSave();await pendingSave;});const successful=await page.evaluate(()=>saves[0]);assert.equal(successful.name,'fresh.zip');const archive=parseArchive(Buffer.from(successful.data,'base64'));assert.equal(archive.entries.get('fresh.txt').method,8);assert.equal(Buffer.from(await archive.read('fresh.txt')).toString(),'new content '.repeat(3000));
  // Compression failures restore enabled controls and leave inputs/history unchanged.
  const before=await page.evaluate(()=>compare.getState());await page.evaluate(async()=>{window.failNext=true;await beginSave();await pendingSave;});assert.equal(await page.evaluate(()=>saves.length),1);assert.match((await page.evaluate(()=>errors)).at(-1),/compression|compress/i);assert.deepEqual(await page.evaluate(()=>compare.getState()),before);
  await expect(page.getByRole('button',{name:'Save left archive…',exact:true,includeHidden:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Undo archive edit',exact:true,includeHidden:true})).toBeDisabled();
  await page.evaluate(async()=>{await beginSave();await pendingSave;});assert.equal(await page.evaluate(()=>saves.length),2);
  console.log('Archive compression races passed: reset/session replacement suppress obsolete native saves, current deflated export exact bytes, compression error unlocks controls and preserves source/history.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
