'use strict';
const {chromium,expect}=require('@playwright/test'),{build}=require('esbuild'),assert=require('node:assert/strict');
(async()=>{
 const bundled=await build({entryPoints:['src/advanced.js'],bundle:true,write:false,format:'iife',globalName:'AdvancedHarness',platform:'browser'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage();await page.setContent('<main id="host"></main><main id="other"></main>');await page.addScriptTag({content:bundled.outputFiles[0].text});
 await page.evaluate(()=>{window.errors=[];window.controller=AdvancedHarness.createAdvanced({host:document.querySelector('#host'),notify:(m,e)=>{if(e)errors.push(m);},onDirty:()=>controller.refreshActions(),renderToolbarActions:()=>{if(window.controller)controller.getState();return [];},desktop:{openData:async()=>({name:'replacement.csv',data:btoa('new')})}});window.other=AdvancedHarness.createAdvanced({host:document.querySelector('#other'),notify:()=>{}});window.original={inputs:{a:{name:'a.csv',data:btoa('a,b\nc'),diskToken:'a-token'},b:{name:'b.csv',data:btoa('x,y\nz'),diskToken:'b-token'}}};controller.setType('table-compare',original);});
 const host=page.locator('#host'),button=name=>host.getByRole('button',{name,exact:true}),result=()=>page.evaluate(()=>controller.getState().options.tableResult??null);
 await button('Use left as result').click();await page.evaluate(()=>controller.undo());assert.equal(await result(),null);await button('Redo edit').click();assert.deepEqual(await result(),[['a','b'],['c']]);
 const cell=host.getByLabel('Result row 1 column 1',{exact:true});await cell.focus();await cell.press('End');await cell.pressSequentially('123');await expect(cell).toBeFocused();assert.equal(await cell.inputValue(),'a123');assert.equal(await cell.evaluate(e=>e.selectionStart),4);
 // No snapshot between keystrokes: the whole focus session is one transition.
 await button('Undo edit').click();assert.deepEqual(await result(),[['a','b'],['c']]);await button('Redo edit').click();assert.deepEqual(await result(),[['a123','b'],['c']]);
 // A structural edit after typing must read the latest result, not a stale render closure.
 await cell.fill('latest');await button('Insert row before').click();assert.deepEqual(await result(),[['',''],['latest','b'],['c']]);await button('Undo edit').click();assert.deepEqual(await result(),[['latest','b'],['c']]);await button('Undo edit').click();assert.deepEqual(await result(),[['a123','b'],['c']]);
 await button('Insert column before').click();assert.deepEqual(await result(),[['','a123','b'],['','c','']]);await button('Undo edit').click();assert.deepEqual(await result(),[['a123','b'],['c']]);
 await button('Delete column').click();assert.deepEqual(await result(),[['b'],[]]);await button('Undo edit').click();assert.deepEqual(await result(),[['a123','b'],['c']]);
 await button('Delete row').click();assert.deepEqual(await result(),[['c']]);await button('Undo edit').click();assert.deepEqual(await result(),[['a123','b'],['c']]);
 await page.evaluate(()=>{window.saved=controller.getState();window.runtime=controller.getRuntimeState();controller.reset();controller.setType('table-compare',saved,runtime);});await button('Undo edit').click();assert.deepEqual(await result(),[['a','b'],['c']]);
 await page.evaluate(()=>{window.redoSaved=controller.getState();window.redoRuntime=controller.getRuntimeState();controller.setType('binary-compare');controller.setType('table-compare',redoSaved,redoRuntime);controller.redo();});assert.deepEqual(await result(),[['a123','b'],['c']]);
 for(const change of ['name','data','diskToken','left','result']){await page.evaluate(change=>{const stale=structuredClone(saved);if(change==='left')stale.inputs.a.data=btoa('changed');else if(change==='result')stale.options.tableResult[0][0]='changed';else if(change==='data')stale.inputs.b.data=btoa('changed');else stale.inputs.b[change]+='changed';controller.setType('table-compare',stale,runtime);},change);await expect(button('Undo edit')).toBeDisabled();}
 await page.evaluate(()=>other.setType('table-compare',saved,runtime));await expect(page.locator('#other').getByRole('button',{name:'Undo edit',exact:true})).toBeDisabled();
 for(const token of ['forged','serialized','null']){await page.evaluate(token=>controller.setType('table-compare',saved,token==='forged'?{}:token==='serialized'?JSON.parse(JSON.stringify(runtime)):null),token);await expect(button('Undo edit')).toBeDisabled();}
 for(const side of ['a','b']){await page.evaluate(async side=>{controller.setType('table-compare',saved,runtime);await controller.openSide(side);},side);await expect(button('Undo edit')).toBeDisabled();assert.equal(await result(),null);}
 assert.equal(await page.evaluate(()=>JSON.stringify(runtime)),'{}');assert.deepEqual(await page.evaluate(()=>errors),[]);
 console.log('Table runtime passed: grouping, focus/caret, structural edits, ragged rows, null result, exact-input/result opaque binding, per-tab redo, replacement reset.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
