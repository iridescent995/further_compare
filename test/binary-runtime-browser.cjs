'use strict';
const {chromium,expect}=require('@playwright/test'),{build}=require('esbuild'),assert=require('node:assert/strict');
(async()=>{
 const bundled=await build({entryPoints:['src/advanced.js'],bundle:true,write:false,format:'iife',globalName:'AdvancedHarness',platform:'browser'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage();await page.setContent('<main id="host"></main><main id="other"></main>');await page.addScriptTag({content:bundled.outputFiles[0].text});
  await page.evaluate(()=>{
   window.errors=[];window.controller=AdvancedHarness.createAdvanced({host:document.querySelector('#host'),notify:(m,e)=>{if(e)errors.push(m);},desktop:{openData:async()=>({name:'replacement.bin',data:btoa('new')})}});
   window.other=AdvancedHarness.createAdvanced({host:document.querySelector('#other'),notify:()=>{}});
   window.original={inputs:{a:{name:'a.bin',data:btoa('abc'),diskToken:'a-origin'},b:{name:'b.bin',data:btoa('abc'),diskToken:'b-origin'}}};
   controller.setType('binary-compare',original);
  });
  const host=page.locator('#host');
  await host.getByLabel('Byte offset (hex)').fill('1');await host.getByLabel('Right byte (hex)').fill('58');await host.getByRole('button',{name:'Apply byte',exact:true}).click();
  await expect(host.getByRole('button',{name:'Undo edit',exact:true})).toBeEnabled();
  assert.equal(await page.evaluate(()=>atob(controller.getState().inputs.b.data)),'aXc');
  await page.evaluate(()=>{window.saved=controller.getState();window.runtime=controller.getRuntimeState();controller.reset();controller.setType('binary-compare',saved,runtime);});
  await expect(host.getByRole('button',{name:'Undo edit',exact:true})).toBeEnabled();
  await page.evaluate(()=>controller.undo());assert.equal(await page.evaluate(()=>atob(controller.getState().inputs.b.data)),'abc');
  await page.evaluate(()=>{window.redoSaved=controller.getState();window.redoRuntime=controller.getRuntimeState();controller.setType('text-merge3');});
  assert.equal(await page.evaluate(()=>controller.getRuntimeState()),null);
  await page.evaluate(()=>{controller.setType('binary-compare',redoSaved,redoRuntime);controller.redo();});
  assert.equal(await page.evaluate(()=>atob(controller.getState().inputs.b.data)),'aXc');
  // Registered history is controller-specific and bound to both input descriptors.
  for(const change of ['name','data','diskToken','left']){
   await page.evaluate(change=>{const stale=structuredClone(saved);if(change==='left')stale.inputs.a.data=btoa('changed');else stale.inputs.b[change]+='changed';controller.setType('binary-compare',stale,runtime);},change);
   await expect(host.getByRole('button',{name:'Undo edit',exact:true})).toBeDisabled();
  }
  await page.evaluate(()=>other.setType('binary-compare',saved,runtime));
  await expect(page.locator('#other').getByRole('button',{name:'Undo edit',exact:true})).toBeDisabled();
  for(const token of ['forged','serialized','null']){
   await page.evaluate(token=>controller.setType('binary-compare',saved,token==='forged'?{}:token==='serialized'?JSON.parse(JSON.stringify(runtime)):null),token);
   await expect(host.getByRole('button',{name:'Undo edit',exact:true})).toBeDisabled();
  }
  for(const side of ['a','b']){
   await page.evaluate(async side=>{controller.setType('binary-compare',saved,runtime);await controller.openSide(side);},side);
   await expect(host.getByRole('button',{name:'Undo edit',exact:true})).toBeDisabled();
  }
  await page.evaluate(()=>controller.setType('binary-compare',saved,runtime));await host.getByRole('button',{name:'Undo edit',exact:true}).click();
  assert.equal(await page.evaluate(()=>atob(controller.getState().inputs.b.data)),'abc');
  assert.equal(await page.evaluate(()=>JSON.stringify(runtime)),'{}');
  assert.deepEqual(await page.evaluate(()=>Object.keys(controller.getState()).sort()),['inputs','options','type']);
  await host.getByLabel('Byte offset (hex)').fill('1');await host.getByLabel('Right byte (hex)').fill('59');await host.getByRole('button',{name:'Apply byte',exact:true}).click();
  await expect(host.getByRole('button',{name:'Redo edit',exact:true})).toBeDisabled();
  assert.equal(await page.evaluate(()=>atob(controller.getState().inputs.b.data)),'aYc');
  await page.evaluate(()=>controller.setType('binary-compare',saved,runtime));
  await page.evaluate(()=>controller.undo());
  assert.equal(await page.evaluate(()=>atob(controller.getState().inputs.b.data)),'abc');
  assert.equal(await page.evaluate(()=>Object.isFrozen(runtime)),true);
  assert.deepEqual(await page.evaluate(()=>errors),[]);
  console.log('Binary runtime passed: exact-input controller binding, immutable repeated restore, toolbar/native API undo/redo, open clears history, saved JSON excludes runtime.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
