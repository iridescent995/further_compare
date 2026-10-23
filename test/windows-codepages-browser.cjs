'use strict';
const {chromium,expect}=require('@playwright/test');
// Independent fixtures generated with Python's strict cp125x codecs.
const fixtures=require('./windows-codepages-fixtures.json');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage();await page.goto(process.env.FC_TEST_URL||'http://127.0.0.1:4173/compare.html');
 for(const fixture of fixtures){
  await page.locator('#textOptions').click();await page.locator('#readEncodingA').selectOption(fixture.encoding);await page.locator('#textOptionsDialog [data-done]').click();
  await page.locator('#fileA').setInputFiles({name:fixture.encoding+'.txt',mimeType:'text/plain',buffer:Buffer.from(fixture.bytes)});
  await expect(page.locator('#textA')).toHaveValue(fixture.text.replace(/\r\n/g,'\n'));
  await expect(page.locator('#encodingA')).toHaveValue(fixture.encoding);await expect(page.locator('#bomA')).toBeDisabled();
  await page.locator('#fileB').setInputFiles({name:'unicode.txt',mimeType:'text/plain',buffer:Buffer.from(fixture.text)});
  await expect(page.locator('#diffSummary')).toHaveText('Texts are identical');
 }
 await page.locator('#textOptions').click();await page.locator('#readEncodingA').selectOption('windows1253');await page.locator('#textOptionsDialog [data-done]').click();
 await page.locator('#fileA').setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from([0x81])});
 await expect(page.locator('#notice')).toContainText('undefined');
 await expect(page.locator('#textA')).toHaveValue(fixtures.at(-1).text.replace(/\r\n/g,'\n'));
 console.log('Seven Windows code pages passed browser import, Unicode comparison, source format retention, BOM exclusion and invalid-byte preservation.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
