'use strict';
const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4173/compare.html');const area=page.locator('#textA'),query=page.getByLabel('Find text'),status=page.locator('.text-tools-status'),next=page.getByRole('button',{name:'Next',exact:true});
 await expect(query).toBeHidden();await area.focus();await page.keyboard.press('Control+f');await expect(query).toBeFocused();await area.fill('item-12\nitem-345');await page.getByLabel('Regex',{exact:true}).check();await query.fill('item-(\\d+)');await next.click();await expect.poll(()=>area.evaluate(e=>[e.selectionStart,e.selectionEnd])).toEqual([0,7]);await next.click();await expect.poll(()=>area.evaluate(e=>[e.selectionStart,e.selectionEnd])).toEqual([8,16]);
 await page.getByLabel('Replacement text').fill('value=$1');await page.getByRole('button',{name:'Replace all',exact:true}).click();await expect(area).toHaveValue('value=12\nvalue=345');
 await query.fill('(?<=value=)\\d+');await next.click();await expect.poll(()=>area.evaluate(e=>[e.selectionStart,e.selectionEnd])).toEqual([6,8]);await page.getByLabel('Replacement text').fill('[$&]');await page.getByRole('button',{name:'Replace',exact:true}).click();await expect(area).toHaveValue('value=[12]\nvalue=345');
 await area.fill('a\nb');await query.fill('^');await next.click();await expect.poll(()=>area.evaluate(e=>e.selectionStart)).toBe(0);await next.click();await expect.poll(()=>area.evaluate(e=>e.selectionStart)).toBe(2);await next.click();await expect.poll(()=>area.evaluate(e=>e.selectionStart)).toBe(0);
 await query.fill('[');await next.click();await expect(status).toContainText(/Invalid|Unterminated/);await expect(area).toHaveValue('a\nb');
 // A pathological expression runs only in a worker and is terminated.
 await area.fill('a'.repeat(50000)+'!');await query.fill('(a+)+$');await next.click();assert.equal(await page.evaluate(()=>2+2),4);await expect(status).toContainText('too long',{timeout:5000});
 // Results from a search started before editing must not replace new text.
 await page.getByRole('button',{name:'Replace all',exact:true}).click();await area.fill('new draft');await query.fill('draft');await expect(status).toContainText('1 matches');await expect(area).toHaveValue('new draft');
 // Regex replacement growth respects the browser's stricter input limit.
 await area.fill('x'.repeat(1600));await query.fill('x');await page.getByLabel('Replacement text').fill('a'.repeat(1600));await page.getByRole('button',{name:'Replace all',exact:true}).click();await expect(status).toContainText('below 2 MB');await expect(area).toHaveValue('x'.repeat(1600));
 console.log('Pattern browser passed: worker loading, variable-length matches, capture/current replacement, zero-width navigation, malformed patterns, timeout responsiveness, stale edits and output limits.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
