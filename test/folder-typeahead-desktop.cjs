'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fc-typeahead-'));let app,page;try{
 const roots=[path.join(temp,'left'),path.join(temp,'right')];for(const root of roots){await fs.mkdir(root);for(const name of ['apple.txt','banana.txt','berry.txt','carrot.txt','release draft.txt','release notes.txt','éclair.txt'])await fs.writeFile(path.join(root,name),name);}await fs.writeFile(path.join(roots[1],'blueberry.txt'),'right only');
 const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(12000);
 await app.evaluate(({dialog},roots)=>{let i=0;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots[i++]]});},roots);
 await page.locator('#welcome [data-command="new:folder-compare"]').click();await page.locator('#openA').click();await page.locator('#openB').click();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
 const row=(side,name)=>page.locator(`#folderRows${side} .folder-entry`).filter({has:page.locator('.entry-name',{hasText:name})});
 const focused=async(side,name)=>{await expect(row(side,name)).toBeFocused();await expect(page.locator(`#folderRows${side} .selected`)).toHaveCount(1);};
 const count=await page.getByRole('tab').count();
 await row('A','apple.txt').click();await page.keyboard.press('B');await focused('A','banana.txt');await page.keyboard.press('e');await focused('A','berry.txt');
 // A new mouse selection resets the prefix; repeated letters cycle and wrap.
 await row('A','apple.txt').click();await page.keyboard.press('b');await focused('A','banana.txt');await page.keyboard.press('b');await focused('A','berry.txt');await page.keyboard.press('b');await focused('A','banana.txt');
 // Missing-side placeholders cannot receive focus or selection.
 await row('B','apple.txt').click();await page.keyboard.press('b');await focused('B','banana.txt');await page.keyboard.press('l');await focused('B','blueberry.txt');
 // Modified keys retain their existing meaning and do not extend a prefix.
 const modifier=process.platform==='darwin'?'Meta':'Control';await page.keyboard.press(modifier+'+a');assert.ok(await page.locator('#folderRowsB .selected').count()>1);await page.keyboard.press('c');await focused('B','carrot.txt');
 await page.evaluate(()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'é',bubbles:true,cancelable:true})));await focused('B','clair.txt');
 // Spaces inside a typed filename continue search, rather than deselecting the row.
 for(const side of ['A','B']){await row(side,'apple.txt').click();await page.keyboard.type('release n');await focused(side,'release notes.txt');await page.waitForTimeout(1100);await page.keyboard.press('Space');await expect(row(side,'release notes.txt')).toBeFocused();await expect(page.locator(`#folderRows${side} .selected`)).toHaveCount(0);await page.keyboard.press('Space');await focused(side,'release notes.txt');}
 // Expired prefixes and a no-match key leave a usable, unchanged tree.
 await row('A','apple.txt').click();await page.keyboard.press('b');await page.waitForTimeout(1100);await page.keyboard.press('c');await focused('A','carrot.txt');await page.keyboard.press('z');await focused('A','carrot.txt');
 await page.locator('#folderExclude').fill('berry.txt');await row('A','apple.txt').click();await page.keyboard.press('b');await focused('A','banana.txt');await page.keyboard.press('b');await focused('A','banana.txt');
 await expect(page.locator('#folderSearch')).toHaveValue('');await expect(page.locator('#folderExclude')).toHaveValue('berry.txt');assert.equal(await page.getByRole('tab').count(),count);await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');
 console.log('Folder typeahead passed: prefixes, repeated-letter cycling, both panes, missing-side skips, modifiers, Unicode, timeout, mouse reset, filters and no file opening.');
}finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
