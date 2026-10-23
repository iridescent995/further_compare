'use strict';
const {chromium,expect}=require('@playwright/test'),{build}=require('esbuild'),assert=require('node:assert/strict'),fs=require('node:fs');
const {zip}=require('./archive-fixture.cjs');
(async()=>{
 const bundled=await build({entryPoints:['src/archive-compare.js'],bundle:true,write:false,format:'iife',globalName:'ArchiveHarness',platform:'browser',plugins:[{name:'node-gate',setup(builder){builder.onLoad({filter:/archive-compare\.js$/},args=>{const original=fs.readFileSync(args.path,'utf8'),needle='const rows=await compareArchiveNode(archives.a,archives.b,parent);';assert.ok(original.includes(needle));return {contents:original.replace(needle,'await (window.nodeGate?window.nodeGate(parent):Promise.resolve());'+needle),loader:'js'};});}}]});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage();await page.setContent('<button id="outside">Outside control</button><main id="host"></main><dialog id="modal"><button id="modal-button">Modal control</button></dialog>');await page.addScriptTag({content:bundled.outputFiles[0].text});
 const input={name:'keyboard.zip',data:zip([{name:'dir/child.txt',data:'child'},{name:'alpha.txt',data:'alpha'},{name:'bravo.txt',data:'bravo'},{name:'charlie.txt',data:'charlie'}]).toString('base64')};
 await page.evaluate(()=>{window.errors=[];window.opened=[];window.compare=ArchiveHarness.createArchiveCompare({host:document.querySelector('#host'),notify:(message,error)=>{if(error)errors.push(message);},onOpenEntry:entry=>opened.push(entry)});});
 const tree=page.getByRole('treegrid'),row=path=>page.locator('[data-path="'+path+'"]');
 await expect(tree).toHaveAttribute('tabindex','0');await expect(page.locator('[data-path][tabindex="0"]')).toHaveCount(0);await tree.focus();await expect(tree).toBeFocused();
 await page.evaluate(input=>compare.setState({inputs:{a:input}}),input);await expect(tree).toHaveAttribute('tabindex','-1');await expect(page.locator('[data-path][tabindex="0"]')).toHaveCount(1);await expect(page.locator('.archive-toggle')).toHaveAttribute('tabindex','-1');
 // Additive ranges preserve a disjoint selection while the anchor follows the last click.
 await row('alpha.txt').click();await row('charlie.txt').click({modifiers:['Meta']});await page.keyboard.press('Control+Shift+ArrowUp');
 assert.deepEqual(await page.locator('[data-path][aria-selected="true"]').evaluateAll(items=>items.map(item=>item.dataset.path).sort()),['alpha.txt','bravo.txt','charlie.txt']);await expect(row('bravo.txt')).toBeFocused();
 await page.keyboard.press('Meta+Home');await expect(row('dir')).toBeFocused();assert.equal(await page.locator('[data-path][aria-selected="true"]').count(),3);
 // A delayed node comparison may rerender after focus moved to another tree row.
 await page.evaluate(()=>{window.nodeGate=parent=>parent==='dir'?new Promise(resolve=>window.releaseNode=resolve):Promise.resolve();});await row('dir').press('ArrowRight');await page.waitForFunction(()=>!!window.releaseNode);await expect(row('dir')).toHaveAttribute('aria-expanded','true');await row('bravo.txt').focus();
 await page.evaluate(()=>{nodeGate=null;releaseNode();});await expect(row('dir/child.txt')).toBeVisible();await expect(row('bravo.txt')).toBeFocused();await expect(row('bravo.txt')).toHaveAttribute('tabindex','0');
 // The same background completion must not pull focus out of a modal.
 await row('dir').press('ArrowLeft');await expect(row('dir/child.txt')).toHaveCount(0);await page.evaluate(()=>{window.releaseNode=null;window.nodeGate=parent=>parent==='dir'?new Promise(resolve=>window.releaseNode=resolve):Promise.resolve();});await row('dir').press('ArrowRight');await page.waitForFunction(()=>!!window.releaseNode);await page.evaluate(()=>document.querySelector('#modal').showModal());await expect(page.locator('#modal-button')).toBeFocused();await page.evaluate(()=>{nodeGate=null;releaseNode();});await expect(row('dir/child.txt')).toHaveCount(1);await expect(page.locator('#modal-button')).toBeFocused();await page.evaluate(()=>document.querySelector('#modal').close());
 // Nor may it pull focus away from an ordinary toolbar/control.
 await row('dir').press('ArrowLeft');await page.evaluate(()=>{window.releaseNode=null;window.nodeGate=parent=>parent==='dir'?new Promise(resolve=>window.releaseNode=resolve):Promise.resolve();});await row('dir').press('ArrowRight');await page.waitForFunction(()=>!!window.releaseNode);await page.locator('#outside').focus();await page.evaluate(()=>{nodeGate=null;releaseNode();});await expect(row('dir/child.txt')).toHaveCount(1);await expect(page.locator('#outside')).toBeFocused();
 // A double-click on the disclosure control performs just one toggle, never row-open.
 await row('dir').press('ArrowLeft');await row('dir').locator('.archive-toggle').dblclick();await expect(row('dir')).toHaveAttribute('aria-expanded','true');await expect(row('dir/child.txt')).toHaveCount(1);assert.deepEqual(await page.evaluate(()=>opened),[]);
 await row('dir/child.txt').focus();await page.getByRole('button',{name:'Collapse all',exact:true}).click();await expect(row('dir')).toHaveAttribute('tabindex','0');await expect(page.getByRole('button',{name:'Collapse all',exact:true})).toBeFocused();await expect(page.locator('[data-path][tabindex="0"]')).toHaveCount(1);
 await page.evaluate(()=>compare.reset());await expect(tree).toHaveAttribute('tabindex','0');await expect(page.locator('[data-path][tabindex="0"]')).toHaveCount(0);assert.deepEqual(await page.evaluate(()=>errors),[]);
 console.log('Archive keyboard focus passed: empty and roving Tab stops, additive ranges, Command focus-only movement, async row focus retention, modal/control focus isolation, disclosure double-click and collapsed-descendant fallback.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
