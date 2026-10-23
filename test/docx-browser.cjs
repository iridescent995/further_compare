'use strict';
const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {build}=require('esbuild');const {documentBytes}=require('./docx-ui-fixture.cjs');
(async()=>{
 // Bundle in memory so this test does not disturb packaged/native test inputs.
 const entries=['app','worker','merge-worker','text-patch-worker','text-patch-apply-worker','search-worker','filename-search-worker','file-content-report-worker'];
 const built=await build({entryPoints:entries.map(name=>'src/'+name+'.js'),outdir:'/tmp/fc-docx-memory',write:false,bundle:true,format:'iife',target:'es2022'});
 const scripts=new Map(built.outputFiles.map(file=>[path.basename(file.path),file.text]));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Page error:',error.message);});
  await page.route('http://localhost:4197/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(scripts.has(name))return route.fulfill({contentType:'application/javascript',body:scripts.get(name)});if(['compare.html','style.css'].includes(name))return route.fulfill({contentType:name.endsWith('.css')?'text/css':'text/html',body:await fs.readFile(name)});if(/^[a-z0-9-]+\.(css|js)$/.test(name)){try{return await route.fulfill({contentType:name.endsWith('.css')?'text/css':'application/javascript',body:await fs.readFile(path.join('public',name))});}catch{}}return route.fulfill({status:404,body:''});});
  await page.goto('http://localhost:4197/compare.html');
  const original=await documentBytes('Document text α 😀');
  await page.locator('#fileA').setInputFiles({name:'source.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:original});
  await expect(page.locator('#textA')).toHaveValue('Document text α 😀\n');await expect(page.locator('#sizeA')).toContainText('DOCX text projection');await expect(page.locator('#readEncodingA')).toBeDisabled();await expect(page.locator('#reopenEncodingA')).toBeDisabled();await expect(page.locator('#applyArchiveEntryA')).toBeHidden();
  await page.locator('#fileB').setInputFiles({name:'plain.txt',mimeType:'text/plain',buffer:Buffer.from('Document text α 😀\n')});await expect(page.locator('#textB')).toHaveValue('Document text α 😀\n');await expect(page.locator('#diffSummary')).toHaveText('Texts are identical');
  await page.locator('#textA').fill('Edited projected result');
  let pending=page.waitForEvent('download');await page.locator('#saveA').click();let download=await pending;assert.equal(download.suggestedFilename(),'source.txt');assert.equal(await fs.readFile(await download.path(),'utf8'),'Edited projected result');await download.delete();
  pending=page.waitForEvent('download');await page.locator('.session-bar [data-command="save-session"]').click();download=await pending;const saved=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.equal(saved.files.a.documentProjection.kind,'docx');assert.equal(saved.text.a,'Edited projected result');await download.delete();
  await page.locator('#clearA').click();await expect(page.locator('#sizeA')).not.toContainText('DOCX');await page.locator('#sessionFile').setInputFiles({name:'saved.fcompare',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await expect(page.locator('#textA')).toHaveValue('Edited projected result');await expect(page.locator('#sizeA')).toContainText('DOCX text projection');await expect(page.locator('#reopenEncodingA')).toBeDisabled();
  await page.locator('#fileA').setInputFiles({name:'bad.docx',mimeType:'application/octet-stream',buffer:Buffer.from('not a document')});await expect(page.locator('#notice')).toBeVisible();await expect(page.locator('#textA')).toHaveValue('Edited projected result');
  await page.locator('#fileA').setInputFiles({name:'plain.txt',mimeType:'text/plain',buffer:Buffer.from('ordinary text')});await expect(page.locator('#sizeA')).not.toContainText('DOCX');await expect(page.locator('#readEncodingA')).toBeEnabled();assert.deepEqual(errors,[]);
  console.log('DOCX browser passed: shared file import, plain-text comparison, source label, safe edited .txt export, session projection restore, invalid-input preservation, plain-input reset.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
