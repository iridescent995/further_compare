'use strict';
const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {build}=require('esbuild');
(async()=>{
 // Bundle in memory so this test does not disturb packaged/native test inputs.
 const entries=['doc-text-browser-worker','app','worker','merge-worker','text-patch-worker','text-patch-apply-worker','search-worker','filename-search-worker','file-content-report-worker'];
 const built=await build({entryPoints:entries.map(name=>'src/'+name+'.js'),outdir:'/tmp/fc-doc-memory',write:false,bundle:true,format:'iife',target:'es2022'});
 const scripts=new Map(built.outputFiles.map(file=>[path.basename(file.path),file.text]));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Page error:',error.message);});
  await page.route('http://localhost:4197/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(scripts.has(name))return route.fulfill({contentType:'application/javascript',body:scripts.get(name)});if(['compare.html','style.css'].includes(name))return route.fulfill({contentType:name.endsWith('.css')?'text/css':'text/html',body:await fs.readFile(name)});if(/^[a-z0-9-]+\.(css|js)$/.test(name)){try{return await route.fulfill({contentType:name.endsWith('.css')?'text/css':'application/javascript',body:await fs.readFile(path.join('public',name))});}catch{}}return route.fulfill({status:404,body:''});});
  await page.goto('http://localhost:4197/compare.html');await expect(page.locator('#sessionTabs [role=tab]')).toHaveCount(1);await expect.poll(()=>page.locator('#textA').evaluate(n=>!!n.closest('[inert]'))).toBe(false);
  const original=await fs.readFile(path.join(__dirname,'fixtures/doc-independent/baseline.doc'));
  await page.locator('#fileA').setInputFiles({name:'source.doc',mimeType:'application/octet-stream',buffer:original});await expect(page.locator('#textA')).toHaveValue(require('./doc-fixture.cjs').expected());await page.locator('#textA').fill('draft before scope');await page.locator('#textOptions').click();await page.locator('#docScopeA').selectOption('main-and-related-text');await expect(page.locator('#textA')).not.toHaveValue(/Header Café/);
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('#reextractDocA').click();await expect(page.locator('#textA')).toHaveValue('draft before scope');
  page.on('dialog',dialog=>dialog.accept());await page.locator('#reextractDocA').click();await page.locator('#discardSession').click();await expect(page.locator('#textA')).toHaveValue(/Header Café original/);await expect(page.locator('#textA')).toHaveValue(/Footnote 中 original/);
  await page.getByRole('button',{name:'Close text options',exact:true}).click();let pending=page.waitForEvent('download');await page.locator('.session-bar [data-command="save-session"]').click();let download=await pending,saved=JSON.parse(await fs.readFile(await download.path(),'utf8'));await download.delete();assert.equal(saved.options.docScopes.a,'main-and-related-text');assert.equal(saved.files.a.documentProjection.version,1);
  // A pending selection must not relabel an already extracted draft.
  await page.locator('#textOptions').click();await page.locator('#docScopeA').selectOption('main-document');await page.getByRole('button',{name:'Close text options',exact:true}).click();pending=page.waitForEvent('download');await page.locator('.session-bar [data-command="save-session"]').click();download=await pending;const pendingSaved=JSON.parse(await fs.readFile(await download.path(),'utf8'));await download.delete();assert.equal(pendingSaved.options.docScopes.a,'main-and-related-text');
  await page.locator('#textA').fill('edited related draft');pending=page.waitForEvent('download');await page.locator('.session-bar [data-command="save-session"]').click();download=await pending;saved=JSON.parse(await fs.readFile(await download.path(),'utf8'));await download.delete();
  await page.locator('#clearA').click();await page.locator('#sessionFile').setInputFiles({name:'saved.fcompare',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await expect(page.locator('#textA')).toHaveValue('edited related draft');await expect(page.locator('#docScopeA')).toHaveValue('main-and-related-text');await expect(page.locator('#reextractDocA')).toBeDisabled();assert.deepEqual(await fs.readFile(path.join(__dirname,'fixtures/doc-independent/baseline.doc')),original);assert.deepEqual(errors,[]);
  console.log('DOC related browser passed: explicit scope, cancelled replacement, related extraction, pending policy provenance, draft session restore and source-required re-extraction.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
