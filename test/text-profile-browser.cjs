'use strict';
const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:4173/compare.html');
 const a=page.locator('#textA'),b=page.locator('#textB'),count=page.locator('#changeCount');
 const option=async(id,value)=>{await page.locator('#textOptions').click();if(typeof value==='boolean')await page.locator(id).setChecked(value);else await page.locator(id).selectOption(value);await page.locator('#textOptionsDialog [data-done]').click();};
 const filter=async(value)=>{await page.locator('#textOptions').click();await page.locator('[data-filter="'+value+'"]').click();await page.locator('#textOptionsDialog [data-done]').click();};
 const fill=async(left,right)=>{await a.fill(left);await b.fill(right);};
 await expect(page.locator('#textProfile')).toHaveValue('plain');
 const left='// source comment\nint value = 1;\nint next = 10;\nend();',right='// destination comment\nint value = 2;\nint next = 20;\nend();';
 await fill(left,right);await expect(count).toHaveText('1');await option('#textProfile','java');await expect(page.locator('#minorCount')).toHaveText('(1)');await expect(count).toHaveText('1');
 await filter('diff');await expect(page.locator('#textA ~ .live-text-decoration .live-text-band.minor')).toHaveCount(0);await option('#showMinor',true);await expect(page.locator('#textA ~ .live-text-decoration .live-text-band.minor[data-line="1"]')).toHaveCount(1);await expect(a).toHaveValue(left);
 const reportDownload=page.waitForEvent('download');await page.locator('.app-menubar summary').filter({hasText:/^File$/}).click();await page.locator('#exportReport').click();const report=JSON.parse(await fs.readFile(await(await reportDownload).path(),'utf8'));assert.equal(report.textProfile,'java');assert.equal(report.changes.length,1);assert.deepEqual(report.changes[0].left,['int value = 1;','int next = 10;']);assert.equal(report.minorDifferences[0].left,'// source comment');
 await filter('all');
 const gutter=page.locator('#textA').locator('..').locator('.live-text-gutter');await gutter.locator('[data-line="2"].live-text-number').click();
 const arrow=gutter.locator('.live-text-copy');await expect(arrow).toHaveAttribute('aria-label','Copy line 2 to right');await arrow.click();await expect(b).toHaveValue('// destination comment\nint value = 1;\nint next = 20;\nend();');await page.locator('#undoMerge').click();await expect(b).toHaveValue(right);
 await a.focus();await a.press('End');await page.keyboard.insertText(' ');await expect(a).not.toHaveValue(left);await a.press(process.platform==='darwin'?'Meta+z':'Control+z');await expect(a).toHaveValue(left);
 await fill('// inserted\nrun();','run();');await expect(count).toHaveText('0');await expect(page.locator('#minorCount')).toHaveText('(1)');await option('#textProfile','plain');await expect(count).toHaveText('1');await option('#textProfile','java');await expect(count).toHaveText('0');
 for(const fixture of [
  {profile:'java',left:'String s = "// left";',right:'String s = "// right";'},
  {profile:'xml',left:'<!-- left -->\n<item/>',right:'<!-- right -->\n<item/>'},
  {profile:'sql',left:'-- left\nSELECT 1;',right:'-- right\nSELECT 1;'}
 ]){await option('#textProfile',fixture.profile);await fill(fixture.left,fixture.right);await expect(count).toHaveText(fixture.profile==='java'?'1':'0');await expect(a).toHaveValue(fixture.left);await expect(b).toHaveValue(fixture.right);}
 await fill("SELECT '-- left';","SELECT '-- right';");await expect(count).toHaveText('1');await option('#textProfile','xml');await fill('<item value="<!-- left -->"/>','<item value="<!-- right -->"/>');await expect(count).toHaveText('1');
 await page.locator('#sessionName').fill('XML profile');await page.locator('#newTab').click();await expect(page.locator('#textProfile')).toHaveValue('plain');await page.getByRole('tab',{name:/^XML profile/}).click();await expect(page.locator('#textProfile')).toHaveValue('xml');await expect(a).toHaveValue('<item value="<!-- left -->"/>');await expect(count).toHaveText('1');
 await option('#textProfile','java');await fill('// carrier\n','');await expect(count).toHaveText('1');await page.locator('#mergeToB').click();await expect(b).toHaveValue('// carrier\n');await expect(count).toHaveText('0');await page.locator('#undoMerge').click();await expect(b).toHaveValue('');await expect(count).toHaveText('1');
 assert.deepEqual(errors,[]);console.log('Text profile browser passed: Java/XML/SQL rules, comment-only minors, strings, profile recompute, physical line copy, undo, reports and per-tab persistence.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
