'use strict';
const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {fixture}=require('./pdf-spike-fixtures.cjs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Page error:',error.message);});
  await page.route('http://localhost:4197/**',async route=>{const name=decodeURIComponent(new URL(route.request().url()).pathname.slice(1)),root=path.resolve('dist'),file=path.resolve(root,name);if(!file.startsWith(root+path.sep))return route.abort();try{await route.fulfill({contentType:/\.m?js$/.test(name)?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream',body:await fs.readFile(file)});}catch{await route.fulfill({status:404,body:''});}});
  await page.addInitScript(()=>{const NativeWorker=window.Worker;window.textCompareStarts=0;window.Worker=class extends NativeWorker{constructor(url,options){super(url,options);if(String(url)==='worker.js')window.textCompareStarts++;}};});
  await page.goto('http://localhost:4197/compare.html');
  const original=Buffer.from(fixture());
  await page.locator('#fileA').setInputFiles({name:'source.pdf',mimeType:'application/pdf',buffer:original});
  await expect(page.locator('#textA')).toHaveValue('Ω中🚀\n\nΩ中🚀');await expect(page.locator('#sizeA')).toContainText('PDF text projection');await expect(page.locator('#readEncodingA')).toBeDisabled();await expect(page.locator('#reopenEncodingA')).toBeDisabled();await expect(page.locator('#applyArchiveEntryA')).toBeHidden();
  await page.locator('#fileB').setInputFiles({name:'plain.txt',mimeType:'text/plain',buffer:Buffer.from('Ω中🚀\n\nΩ中🚀')});await expect(page.locator('#textB')).toHaveValue('Ω中🚀\n\nΩ中🚀');await expect(page.locator('#diffSummary')).toHaveText('Texts are identical');
  await page.locator('#textA').fill('Edited projected result');
  await page.locator('#textA').press('Control+Enter');
  await expect(page.locator('#changeCount')).toHaveText('1');
  const starts=await page.evaluate(()=>window.textCompareStarts);
  const line=page.locator('#textA').locator('..').locator('.live-text-number[data-line="1"]');
  await line.click();await expect(line).toHaveAttribute('aria-pressed','true');
  await page.waitForTimeout(500); // Cross the former duplicate 220ms debounce deadline.
  assert.equal(await page.evaluate(()=>window.textCompareStarts),starts);
  await expect(line).toHaveAttribute('aria-pressed','true');
  let pending=page.waitForEvent('download');await page.locator('#saveA').click();let download=await pending;assert.equal(download.suggestedFilename(),'source.txt');assert.equal(await fs.readFile(await download.path(),'utf8'),'Edited projected result');await download.delete();
  pending=page.waitForEvent('download');await page.locator('.session-bar [data-command="save-session"]').click();download=await pending;const saved=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.equal(saved.files.a.documentProjection.kind,'pdf');assert.equal(saved.text.a,'Edited projected result');await download.delete();
  await page.locator('#clearA').click();await expect(page.locator('#sizeA')).not.toContainText('PDF');await page.locator('#sessionFile').setInputFiles({name:'saved.fcompare',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await expect(page.locator('#textA')).toHaveValue('Edited projected result');await expect(page.locator('#sizeA')).toContainText('PDF text projection');await expect(page.locator('#reopenEncodingA')).toBeDisabled();
  await page.locator('#fileA').setInputFiles({name:'bad.pdf',mimeType:'application/octet-stream',buffer:Buffer.from('not a document')});await expect(page.locator('#notice')).toContainText('Invalid PDF');await expect(page.locator('#textA')).toHaveValue('Edited projected result');
  await page.locator('#fileA').setInputFiles({name:'scan.pdf',mimeType:'application/pdf',buffer:Buffer.from(fixture(true))});await expect(page.locator('#notice')).toContainText('no extractable text');await expect(page.locator('#textA')).toHaveValue('Edited projected result');
  await page.locator('#fileA').setInputFiles({name:'plain.txt',mimeType:'text/plain',buffer:Buffer.from('ordinary text')});await expect(page.locator('#sizeA')).not.toContainText('PDF');await expect(page.locator('#readEncodingA')).toBeEnabled();assert.deepEqual(errors,[]);
  console.log('PDF browser passed: shared file import, plain-text comparison, source label, safe edited .txt export, session projection restore, invalid-input preservation, plain-input reset.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
