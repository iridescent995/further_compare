'use strict';
const {chromium}=require('@playwright/test'),{build}=require('esbuild'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {extractDocText}=require('../src/doc-text.cjs');
(async()=>{
 const input=await fs.readFile('test/fixtures/doc-independent/baseline.doc');
 const [client,worker]=await Promise.all(['src/doc-text-browser.js','src/doc-text-browser-worker.js'].map(entry=>build({entryPoints:[entry],bundle:true,write:false,format:'iife',globalName:'DocHarness',platform:'browser',target:'es2022'})));
 const browser=await chromium.launch({channel:'chrome',headless:true});try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.route('http://fc-doc.test/**',route=>route.fulfill({contentType:route.request().url().endsWith('.js')?'text/javascript':'text/html',body:route.request().url().endsWith('doc-text-browser-worker.js')?worker.outputFiles[0].text:'<!doctype html><title>DOC worker qualification</title>'}));
  await page.goto('http://fc-doc.test/index.html');await page.addScriptTag({content:client.outputFiles[0].text});
  for(const scope of ['main-document','main-and-related-text']){
   const result=await page.evaluate(async({bytes,scope})=>{const input=new Uint8Array(bytes),before=[...input],result=await DocHarness.extractDocTextInBrowser(input,{scope});return {result,unchanged:input.every((x,i)=>x===before[i])};},{bytes:[...input],scope});assert(result.unchanged);assert.deepEqual(result.result,extractDocText(input,{scope}));
  }
  const cancelled=await page.evaluate(async bytes=>{const c=new AbortController(),pending=DocHarness.extractDocTextInBrowser(new Uint8Array(bytes),{signal:c.signal});c.abort();try{await pending;return 'unexpected success';}catch(error){return error.code;}},[...input]);assert.equal(cancelled,'DOCUMENT_CANCELLED');
  const rejected=await page.evaluate(async()=>{try{await DocHarness.extractDocTextInBrowser(new Uint8Array([1,2,3]));return false;}catch{return true;}});assert(rejected);assert.deepEqual(errors,[]);
  console.log('Real browser DOC workers passed: both scopes match native engine, transferred input immutable, cancellation terminates and malformed input returns no projection.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
