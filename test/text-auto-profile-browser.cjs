'use strict';
const {chromium,expect:baseExpect}=require('@playwright/test'),expect=baseExpect.configure({timeout:15000}),assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:4173/compare.html');
 const a=page.locator('#textA'),b=page.locator('#textB'),count=page.locator('#changeCount');
 const profile=async value=>{await page.locator('#textOptions').click();await page.locator('#textProfile').selectOption(value);await page.locator('#textOptionsDialog [data-done]').click();};
 const upload=async(side,name,text)=>{await page.locator('#file'+side).setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from(text)});await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await expect(page.locator('#text'+side)).toHaveValue(text);await expect(page.locator('#diffSummary')).not.toHaveText('Ready');};
 const report=async(requested,resolved)=>{await expect(page.locator('#diffSummary')).not.toHaveText('Ready');if(requested==='auto')await expect(page.locator('#textProfileResolved')).toHaveText('Automatic → '+(resolved==='plain'?'Plain text':resolved.toUpperCase()));const download=page.waitForEvent('download');await page.locator('.app-menubar summary').filter({hasText:/^File$/}).click();await page.locator('#exportReport').click();const value=JSON.parse(await fs.readFile(await(await download).path(),'utf8'));assert.equal(value.textProfile,requested);assert.equal(value.resolvedTextProfile,resolved);return value;};
 const left='// source comment\nrun();',right='// destination comment\nrun();';
 await profile('auto');await a.fill(left);await b.fill(right);await expect(count).toHaveText('1');await report('auto','plain');
 await upload('A','Example.java',left);await upload('B','Example.JAVA',right);await expect(count).toHaveText('0');await expect(page.locator('#minorCount')).toHaveText('(1)');await report('auto','java');
 // Replace the same bytes under another filename: resolution must invalidate even when text is unchanged.
 await upload('B','Example.txt',right);await expect(count).toHaveText('1');await report('auto','plain');
 await upload('B','Example.sql',right);await expect(count).toHaveText('1');await report('auto','plain');
 await profile('java');await expect(count).toHaveText('0');await report('java','java');
 await profile('auto');await expect(count).toHaveText('1');await upload('B','Example.java',right);await expect(count).toHaveText('0');
 await page.locator('#sessionName').fill('Automatic Java');await page.locator('#newTab').click();await expect(page.locator('#textProfile')).toHaveValue('plain');await page.getByRole('tab',{name:/^Automatic Java/}).click();await expect(page.locator('#textProfile')).toHaveValue('auto');await expect(count).toHaveText('0');await expect(a).toHaveValue(left);await expect(b).toHaveValue(right);await report('auto','java');
 await upload('A','schema.xsd','<!-- left -->\n<item/>');await upload('B','schema.xml','<!-- right -->\n<item/>');await expect(count).toHaveText('0');await report('auto','xml');
 await upload('A','query.sql','-- left\nSELECT 1;');await upload('B','query.sql','-- right\nSELECT 1;');await expect(count).toHaveText('0');await report('auto','sql');
 assert.deepEqual(errors,[]);console.log('Automatic text profile browser passed: filename resolution, unknown/mixed fallback, same-text replacement, explicit override, tabs, original contents and requested/resolved reports.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
