'use strict';
const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const setRule=async(selector,checked)=>{await page.locator('#textOptions').click();await page.locator(selector).setChecked(checked);await page.locator('#textOptionsDialog [data-done]').click();};
  await page.goto('http://127.0.0.1:4173/compare.html');await expect(page.locator('#textA')).toBeVisible();await expect(page.getByLabel('Ignore case',{exact:true})).not.toBeChecked();
  await page.locator('#textA').fill('Header\nMixed CASE\nTail');await page.locator('#textB').fill('header\nmixed case\ntail');await expect(page.locator('#changeCount')).toHaveText('1');
  await setRule('#ignoreCase',true);await expect(page.locator('#changeCount')).toHaveText('0');await expect(page.locator('#diffSummary')).toContainText(/ignoring case/i);
  await expect(page.locator('#textA')).toHaveValue('Header\nMixed CASE\nTail');await expect(page.locator('#textB')).toHaveValue('header\nmixed case\ntail');await expect(page.locator('#next')).toBeDisabled();
  await page.locator('[data-filter="diff"]').click();await expect(page.locator('.live-text-band.deemphasized')).toHaveCount(6);await expect(page.locator('#textA')).toBeEditable();await page.locator('[data-filter="same"]').click();await expect(page.locator('.live-text-band.deemphasized')).toHaveCount(0);await expect(page.locator('#textA')).toHaveValue('Header\nMixed CASE\nTail');await expect(page.locator('#textB')).toHaveValue('header\nmixed case\ntail');
  await page.locator('[data-filter="all"]').click();await expect(page.locator('#textA')).toHaveValue('Header\nMixed CASE\nTail');
  await page.locator('#textA').fill(' A\tB\nUNCHANGED');await page.locator('#textB').fill('ab\nunchanged');await expect(page.locator('#changeCount')).toHaveText('1');await setRule('#ignoreWhitespace',true);await expect(page.locator('#changeCount')).toHaveText('0');
  await setRule('#ignoreCase',false);await expect(page.locator('#changeCount')).toHaveText('1');await setRule('#ignoreCase',true);await expect(page.locator('#changeCount')).toHaveText('0');
  // Reports explicitly record comparison rules while preserving raw input strings.
  await page.locator('#textB').fill('ab\nDifferent');await expect(page.locator('#changeCount')).toHaveText('1');
  const reportDownload=page.waitForEvent('download');await page.locator('.app-menubar summary').filter({hasText:/^File$/}).click();await page.locator('#exportReport').click();const report=JSON.parse(await fs.readFile(await (await reportDownload).path(),'utf8'));
  assert.equal(report.ignoreCase,true);assert.equal(report.ignoreWhitespace,true);assert.equal(report.changes.length,1);assert.deepEqual(report.changes[0].left,['UNCHANGED']);assert.deepEqual(report.changes[0].right,['Different']);
  await page.locator('#sessionName').fill('Case settings');await page.locator('#newTab').click();await expect(page.getByLabel('Ignore case',{exact:true})).not.toBeChecked();await expect(page.locator('#ignoreWhitespace')).not.toBeChecked();
  await page.getByRole('tab',{name:/^Case settings(?: •)?$/}).click();await expect(page.getByLabel('Ignore case',{exact:true})).toBeChecked();await expect(page.locator('#ignoreWhitespace')).toBeChecked();await expect(page.locator('#textA')).toHaveValue(' A\tB\nUNCHANGED');await expect(page.locator('#changeCount')).toHaveText('1');
  assert.deepEqual(errors,[]);console.log('Ignore case browser passed: exact default, raw case preserved, matching/difference filters, combined whitespace rule, raw report hunks and options, and tab-specific settings.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
