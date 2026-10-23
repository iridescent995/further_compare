'use strict';
const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});await page.goto('http://127.0.0.1:4173/compare.html');
 async function show(){await page.evaluate(()=>{document.body.classList.add('folder-mode');document.querySelector('#textWorkspace').hidden=true;document.querySelector('#folderWorkspace').hidden=false;for(const side of ['A','B']){const row=document.createElement('div');row.className='folder-entry selected';row.innerHTML='<span class="entry-name">Long file name for comparison.txt</span><span class="entry-size">1,024</span><span class="entry-modified">21 Oct 2026</span>';document.querySelector('#folderRows'+side).replaceChildren(row);}});await expect(page.getByRole('slider',{name:'Left size column width'})).toBeVisible();}
 await show();const width=()=>page.locator('.folder-entry .entry-size').evaluateAll(es=>es.map(e=>Math.round(e.getBoundingClientRect().width)));await expect.poll(width).toEqual([78,78]);
 const size=page.getByRole('slider',{name:'Left size column width'}),modified=page.getByRole('slider',{name:'Right last modified column width'});await size.focus();await page.keyboard.press('ArrowRight');await expect.poll(width).toEqual([83,83]);await page.keyboard.press('Shift+ArrowRight');await expect.poll(width).toEqual([103,103]);
 const before=await page.locator('[data-folder-sort]').evaluateAll(es=>es.map(e=>e.textContent));const box=await size.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+30,box.y+box.height/2);await page.mouse.up();await expect.poll(width).toEqual([73,73]);assert.deepEqual(await page.locator('[data-folder-sort]').evaluateAll(es=>es.map(e=>e.textContent)),before);assert.equal(await page.locator('.folder-entry.selected').count(),2);
 // Escape restores the pre-drag widths and stored preference.
 const cancel=await size.boundingBox();await page.mouse.move(cancel.x+4,cancel.y+10);await page.mouse.down();await page.mouse.move(cancel.x+44,cancel.y+10);await page.keyboard.press('ArrowRight');await page.keyboard.press('Escape');await page.mouse.up();await expect.poll(width).toEqual([73,73]);
 await modified.focus();await page.keyboard.press('Shift+ArrowRight');await expect(modified).toHaveAttribute('aria-valuenow','175');await page.reload();await show();await expect.poll(width).toEqual([73,73]);await expect(modified).toHaveAttribute('aria-valuenow','175');
 await size.focus();await page.keyboard.press('Home');await expect.poll(width).toEqual([78,78]);await modified.dblclick();await expect(modified).toHaveAttribute('aria-valuenow','155');
 await page.setViewportSize({width:800,height:800});await expect.poll(width).toEqual([60,60]);await expect(modified).toHaveAttribute('aria-valuenow','115');
 await size.focus();for(let i=0;i<20;i++)await page.keyboard.press('Shift+ArrowRight');const sizes=await width();assert.equal(sizes[0],sizes[1]);assert.ok(sizes[0]<=240);const names=await page.locator('.entry-name').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().width));assert.ok(names.every(w=>w>=99),names.join(','));
 // Corrupt saved widths must not damage layout; valid fields survive independently.
 await page.setViewportSize({width:1440,height:960});
 for(const [stored,expected]of [['invalid JSON',[78,155]],[JSON.stringify({size:-50,modified:999999}),[78,155]],[JSON.stringify({size:'120',modified:200}),[78,200]]]){
  await page.evaluate(value=>localStorage.setItem('further-compare.folder-columns.v1',value),stored);await page.reload();await show();await expect.poll(width).toEqual([expected[0],expected[0]]);await expect(modified).toHaveAttribute('aria-valuenow',String(expected[1]));
 }
 console.log('Column widths passed: paired alignment, mouse/keyboard resize, cancellation, persistence, reset, responsive bounds and unchanged sort/selection.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
