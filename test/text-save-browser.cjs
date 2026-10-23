'use strict';
const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.env.FC_TEST_URL||'http://127.0.0.1:4173/compare.html');
 async function saved(trigger,name,expected){
  const [file]=await Promise.all([page.waitForEvent('download',{timeout:4000}),trigger()]);
  assert.equal(file.suggestedFilename(),name);assert.equal(await file.failure(),null);
  assert.deepEqual(await fs.readFile(await file.path()),expected);await file.delete();
 }
 await page.locator('#textA').fill('left\n');await page.locator('#textB').fill('right\n');
 await saved(()=>page.locator('#saveA').click(),'left.txt',Buffer.from('left\n'));
 await saved(()=>page.locator('#saveB').click(),'right.txt',Buffer.from('right\n'));
 // Exporting a file must not claim the whole comparison session was saved.
 await expect(page.locator('#dirtyIndicator')).toBeVisible();
 const cp1251=Buffer.from([0xcf,0xf0,0xe8,0xe2,0xe5,0xf2,13,10]);
 await page.locator('#readEncodingA').selectOption('windows1251');
 await page.locator('#fileA').setInputFiles({name:'cyrillic.txt',mimeType:'text/plain',buffer:cp1251});
 await expect(page.locator('#textA')).toHaveValue('Привет\n');
 await saved(()=>page.locator('#saveA').click(),'cyrillic.txt',cp1251);
 await page.locator('#textA').fill('Привет!\n');
 await saved(()=>page.locator('#saveA').click(),'cyrillic.txt',Buffer.from([0xcf,0xf0,0xe8,0xe2,0xe5,0xf2,33,13,10]));
 // Explicit output conversion uses the same encoder as native saves.
 await page.locator('#encodingA').selectOption('utf16be');await page.locator('#bomA').check();await page.locator('#eolA').selectOption('cr');
 const be=Buffer.from('Привет!\r','utf16le');be.swap16();
 await saved(()=>page.locator('#saveA').click(),'cyrillic.txt',Buffer.concat([Buffer.from([0xfe,0xff]),be]));
 const mixed=Buffer.from('one\r\ntwo\rthree\n');
 await page.locator('#fileB').setInputFiles({name:'mixed.txt',mimeType:'text/plain',buffer:mixed});
 await expect(page.locator('#eolB')).toHaveValue('mixed');
 await page.getByText('File',{exact:true}).click();
 await saved(()=>page.locator('[data-command="save-b"]').click(),'mixed.txt',mixed);
 await page.locator('#encodingB').selectOption('utf8');await page.locator('#bomB').check();await page.locator('#eolB').selectOption('lf');
 await saved(()=>page.locator('#saveB').click(),'mixed.txt',Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('one\ntwo\nthree\n')]));
 // Invalid legacy output must report the error without starting a download.
 let rejectedDownloads=0;const rejectDownload=()=>rejectedDownloads++;page.on('download',rejectDownload);
 await page.locator('#encodingA').selectOption('windows1251');await page.locator('#textA').fill('snowman ☃');await page.locator('#saveA').click();
 await expect(page.locator('#notice')).toContainText('without data loss');await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
 await expect(page.locator('#textA')).toHaveValue('snowman ☃');assert.equal(rejectedDownloads,0);page.off('download',rejectDownload);
 // Recover from the error and save through the left File menu command.
 await page.locator('#encodingA').selectOption('utf8');await page.getByText('File',{exact:true}).click();
 await saved(()=>page.locator('[data-command="save-a"]').click(),'cyrillic.txt',Buffer.from('snowman ☃'));
 // Enforce the existing browser byte limit after encoding too (UTF-16 expands ASCII).
 page.on('download',rejectDownload);
 await page.locator('#encodingB').selectOption('utf16le');
 await page.locator('#textB').evaluate(el=>{el.value='x'.repeat(1024*1024);el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#saveB').click();await expect(page.locator('#notice')).toContainText('Encoded file exceeds the 2 MB browser limit');
 assert.equal(rejectedDownloads,0);page.off('download',rejectDownload);
 assert.deepEqual(errors,[]);
 console.log('Browser text Save As passed: both panes and menus, default/original names, edited CP1251/CRLF, UTF16BE/BOM, mixed endings, UTF8/BOM/LF, loss/size rejection and dirty-session preservation.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
