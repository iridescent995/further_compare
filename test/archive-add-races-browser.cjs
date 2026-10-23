'use strict';
const {chromium,expect}=require('@playwright/test'),{build}=require('esbuild'),assert=require('node:assert/strict');
const {zip}=require('./archive-fixture.cjs');
(async()=>{
 const bundled=await build({entryPoints:['src/archive-compare.js'],bundle:true,write:false,format:'iife',globalName:'ArchiveHarness',platform:'browser'}),browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<main id="host"></main>');await page.addScriptTag({content:bundled.outputFiles[0].text});
  await page.evaluate(()=>{window.errors=[];window.saves=[];window.dirties=0;window.compare=ArchiveHarness.createArchiveCompare({host:document.querySelector('#host'),desktop:{openArchiveFiles:()=>{window.pickerStarted=true;return new Promise(resolve=>window.releasePicker=resolve);},saveData:async(...args)=>{saves.push(args);return {cancelled:true};}},notify:(message,error)=>{if(error)errors.push(message);},onDirty:()=>dirties++});});
  const state={inputs:{b:{name:'right.zip',data:zip([{name:'keep.txt',data:'original'}]).toString('base64'),diskToken:'origin'}}},files=[{name:'new.bin',data:Buffer.from([0,255,128]).toString('base64'),modified:'2026-10-21 12:00:00'}];
  const begin=async()=>{await page.evaluate(state=>compare.setState(state),state);await page.getByText('Edit archive…',{exact:true}).click();await page.evaluate(()=>{window.pickerStarted=false;const button=[...document.querySelectorAll('button')].find(button=>button.textContent==='Add files to right…');window.pendingPicker=button.onclick();});await page.waitForFunction(()=>pickerStarted);};
  await begin();await page.evaluate(async files=>{compare.reset();releasePicker(files);await pendingPicker;},files);await expect(page.locator('.archive-row[data-path]')).toHaveCount(0);await expect(page.locator('#archiveEditDialog')).toBeHidden();assert.equal(await page.evaluate(()=>compare.getState().inputs.b),null);assert.equal(await page.evaluate(()=>dirties),0);
  // Replacing the session while a native picker is pending cannot import into the new session.
  await begin();const replacement={inputs:{a:{name:'replacement.zip',data:zip([{name:'other.txt',data:'other'}]).toString('base64')}}};await page.evaluate(async({replacement,files})=>{await compare.setState(replacement);releasePicker(files);await pendingPicker;},{replacement,files});await expect(page.locator('[data-path="other.txt"]')).toBeVisible();await expect(page.locator('#archiveEditDialog')).toBeHidden();assert.equal(await page.evaluate(()=>compare.getState().inputs.b),null);assert.equal(await page.evaluate(()=>dirties),0);
  // A canceled picker leaves the same authoritative input and empty history.
  await begin();await page.evaluate(async()=>{releasePicker(null);await pendingPicker;});assert.deepEqual(await page.evaluate(()=>compare.getState().inputs.b),state.inputs.b);await expect(page.getByRole('button',{name:'Undo archive edit',exact:true,includeHidden:true})).toBeDisabled();await expect(page.locator('#archiveEditDialog')).toBeHidden();assert.deepEqual(await page.evaluate(()=>saves),[]);assert.deepEqual(await page.evaluate(()=>errors),[]);
  console.log('Archive add picker races passed: reset/session replacement discard late selections, cancel preserves exact input and history, no writes or dirty transitions.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
