'use strict';
const {_electron:electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {clickFolderAction}=require('./folder-context-helper.cjs');
(async()=>{const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fc-ignored-'));let app,page;try{
 const roots=['left','right'].map(name=>path.join(temp,name));for(const [i,root]of roots.entries()){await fs.mkdir(path.join(root,'nested'),{recursive:true});for(const name of ['a.txt','b.txt','nested/child.txt'])await fs.writeFile(path.join(root,name),String(i)+name);}
 const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[process.cwd()]}),env});page=await app.firstWindow();await app.evaluate(({BrowserWindow,dialog},roots)=>{BrowserWindow.getAllWindows().forEach(w=>w.hide());dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});},[...roots]);
 const native=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
 await page.locator('#welcome [data-command="new:folder-compare"]').click();await page.locator('#openA').click();await page.locator('#openB').click();await page.locator('#sessionName').fill('Ignore review');
 const row=(side,name)=>page.locator('#folderRows'+side+' .folder-entry[data-path="'+name+'"]');
 await expect(row('A','a.txt')).toHaveClass(/changed/);await row('A','a.txt').click({button:'right'});await clickFolderAction(page,'Ignore selected differences');
 for(const side of ['A','B']){await expect(row(side,'a.txt')).toHaveClass(/ignored/);await expect(row(side,'a.txt')).toHaveAttribute('aria-label',/actual result changed/);}
 await expect(page.locator('#folderSummary')).toContainText('1 ignored');await expect(page.locator('#changeCount')).toHaveText('1');await expect(page.locator('#changePosition')).toContainText('/ 1');
 await page.locator('[data-filter="diff"]').click();await expect(row('A','a.txt')).toHaveCount(0);await expect(row('A','b.txt')).toBeVisible();await page.locator('[data-filter="same"]').click();await expect(row('A','a.txt')).toHaveCount(0);await page.locator('[data-filter="all"]').click();await expect(row('A','a.txt')).toHaveClass(/ignored/);
 // Marks are display-only: explicit copy previews retain the true source result.
 await row('A','a.txt').click();await native('copy-right');await expect(page.locator('#planDialog')).toBeVisible();await expect(page.locator('#planOperations')).toContainText('a.txt');await page.locator('#cancelPlan').click();
 const saved=path.join(temp,'review.fcompare');await app.evaluate(({dialog},saved)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:saved});},saved);await native('save-session-as');await expect.poll(()=>fs.readFile(saved,'utf8').catch(()=>'' )).not.toBe('');assert.equal(JSON.stringify(JSON.parse(await fs.readFile(saved,'utf8')).options).includes('ignored'),false);
 // Returning to a tab restores the marks; a new tab starts clean.
 await page.locator('#newTab').click();await page.locator('#welcome [data-command="new:folder-compare"]').click();await page.getByRole('tab',{name:/Ignore review/}).click();await expect(row('A','a.txt')).toHaveClass(/ignored/);
 await row('B','a.txt').click();await native('folder:restore-selected');await expect(row('B','a.txt')).toHaveClass(/changed/);await native('folder:ignore-selected');
 // The actual comparison result remains available in reports, not recorded as equal.
 await native('folder:report');await expect(page.locator('#folderReportDialog')).toBeVisible();await expect(page.locator('#folderReportDialog')).toContainText(/ignored/i);await page.keyboard.press('Escape');
 // Metadata changes invalidate a stale mark when refreshed.
 await fs.writeFile(path.join(roots[0],'a.txt'),'modified after ignoring, still different');await native('folder:refresh-selected');await expect(row('A','a.txt')).not.toHaveClass(/ignored/);await expect(row('A','a.txt')).toHaveClass(/changed/);
 // Ignored folders cover children loaded later, and restoring a child restores the scope.
 await row('A','nested').click();await native('folder:ignore-selected');await row('A','nested').getByRole('button').click();await expect(row('A','nested/child.txt')).toHaveClass(/ignored/);await expect(row('A','nested')).not.toHaveClass(/contains-differences/);await row('A','nested/child.txt').click();await native('folder:restore-selected');await expect(row('A','nested/child.txt')).toHaveClass(/changed/);await expect(row('A','nested')).not.toHaveClass(/ignored/);
 await row('A','b.txt').click();await native('folder:ignore-selected');await native('folder:restore-all');await expect(page.locator('.folder-entry.ignored')).toHaveCount(0);
 assert.equal(await fs.readFile(path.join(roots[1],'a.txt'),'utf8'),'1a.txt');assert.equal(await fs.readFile(path.join(roots[0],'b.txt'),'utf8'),'0b.txt');
 console.log('Ignored entries passed: context/native marking, both panes, difference filters/navigation, no false equality, tab isolation, actual report results, metadata invalidation, later-loaded descendants, restore and unchanged files.');
}finally{if(page)await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
