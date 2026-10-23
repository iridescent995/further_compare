'use strict';
const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{const page=await browser.newPage();await page.goto('http://127.0.0.1:4173/compare.html');
 for(const [encoding,bytes]of [['utf32le',Buffer.from([255,254,0,0,65,0,0,0,0,246,1,0,13,0,0,0,10,0,0,0])],['utf32be',Buffer.from([0,0,254,255,0,0,0,65,0,1,246,0,0,0,0,13,0,0,0,10])]]){
  await page.locator('#readEncodingA').selectOption('auto');await page.locator('#fileA').setInputFiles({name:encoding+'.txt',mimeType:'text/plain',buffer:bytes});await expect(page.locator('#encodingA')).toHaveValue(encoding);await expect(page.locator('#textA')).toHaveValue('A😀\n');await expect(page.locator('#bomA')).toBeChecked();
  await page.locator('#fileB').setInputFiles({name:'utf8.txt',mimeType:'text/plain',buffer:Buffer.from('A😀\r\n')});await expect(page.locator('#diffSummary')).toHaveText('Texts are identical');
  const downloaded=page.waitForEvent('download');await page.locator('#saveA').click();const file=await downloaded;assert.deepEqual(await fs.readFile(await file.path()),bytes);await file.delete();
  await page.locator('#readEncodingA').selectOption(encoding);await page.locator('#fileA').setInputFiles({name:'bomless.txt',mimeType:'text/plain',buffer:bytes.subarray(4)});await expect(page.locator('#bomA')).not.toBeChecked();await expect(page.locator('#textA')).toHaveValue('A😀\n');
  await page.locator('#fileA').setInputFiles({name:'broken.txt',mimeType:'text/plain',buffer:bytes.subarray(4,7)});await expect(page.locator('#notice')).toContainText('incomplete');await expect(page.locator('#textA')).toHaveValue('A😀\n');
 }
 console.log('UTF-32 browser passed: both byte orders, BOM/explicit input, UTF-8 comparison, byte-exact downloads and invalid-input preservation.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
