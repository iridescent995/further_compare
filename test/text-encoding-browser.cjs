'use strict';
const {chromium,expect}=require('@playwright/test');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage();await page.goto(process.env.FC_TEST_URL||'http://127.0.0.1:4173/compare.html');
 const bytes=Buffer.from([0xcf,0xf0,0xe8,0xe2,0xe5,0xf2,13,10]);
 await page.locator('#readEncodingA').selectOption('windows1251');await page.locator('#fileA').setInputFiles({name:'cyrillic.txt',mimeType:'text/plain',buffer:bytes});
 await expect(page.locator('#textA')).toHaveValue('Привет\n');await expect(page.locator('#encodingA')).toHaveValue('windows1251');await expect(page.locator('#bomA')).toBeDisabled();
 await page.locator('#fileB').setInputFiles({name:'unicode.txt',mimeType:'text/plain',buffer:Buffer.from('Привет\r\n')});await expect(page.locator('#diffSummary')).toHaveText('Texts are identical');
 await page.locator('#fileA').setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from([0x98])});await expect(page.locator('#notice')).toContainText('undefined');await expect(page.locator('#textA')).toHaveValue('Привет\n');
 console.log('Browser Windows-1251 passed: explicit import, UTF-8 comparison, BOM disabled and undefined-byte rejection preserving loaded text.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
