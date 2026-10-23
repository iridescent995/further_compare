'use strict';
const {selectFolderOption,clickFolderOption}=require('./folder-options-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test'),{clickFolderAction}=require('./folder-context-helper.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-clear-')));let app,page;try{
 const saved=path.join(base,'saved.fcompare'),left=path.join(base,'left'),right=path.join(base,'right');for(const root of [left,right]){await fs.mkdir(root);await fs.writeFile(path.join(root,'file.txt'),'original');}
 const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[process.cwd()]}),env});page=await app.firstWindow();page.setDefaultTimeout(20000);
 await app.evaluate(({BrowserWindow,dialog},{saved,roots})=>{BrowserWindow.getAllWindows().forEach(w=>w.hide());globalThis.clearRoots=roots;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[globalThis.clearRoots.shift()]});dialog.showSaveDialog=async()=>({canceled:false,filePath:saved});},{saved,roots:[left,right]});
 const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
 const native=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
 await page.locator('#welcome [data-command="new:text-merge"]').click();await ready();await page.locator('#textA').fill('keep this draft');await page.locator('#sessionName').fill('Draft');
 const id=await page.locator('.session-tab').getAttribute('data-session-id');
 await native('clear-session');await expect(page.locator('#unsavedDialog')).toBeVisible();await page.locator('#cancelDiscard').click();await ready();await expect(page.locator('#textA')).toHaveValue('keep this draft');
 await native('clear-session');await page.locator('#saveBeforeContinue').click();await ready();await expect(page.locator('#textA')).toHaveValue('');assert.equal(JSON.parse(await fs.readFile(saved,'utf8')).text.a,'keep this draft');await expect(page.locator('#sessionKind')).toHaveText('Text Merge');assert.equal(await page.locator('.session-tab').getAttribute('data-session-id'),id);await expect(page.locator('#dirtyIndicator')).toBeHidden();
 await page.locator('#textA').fill('neighbor stays');await native('new:folder-sync');await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();await page.locator('#folderExclude').fill('*.bak');await selectFolderOption(page,'folderOperationScope','all');
 await page.locator('#folderRowsA [data-path="file.txt"]').click({button:'right'});await clickFolderAction(page,'Clear session…');await expect(page.locator('#unsavedDialog')).toBeVisible();await page.locator('#discardSession').click();await ready();
 await expect(page.locator('#sessionKind')).toHaveText('Folder Sync');await expect(page.locator('#pathA')).toHaveValue('');await expect(page.locator('#pathB')).toHaveValue('');await expect(page.locator('#folderRowsA [data-id]')).toHaveCount(0);await expect(page.locator('#folderOperationScope')).toHaveValue('filtered');await expect(page.locator('#folderExclude')).toHaveValue('');await expect(page.locator('#folderBackA')).toBeDisabled();await expect(page.getByRole('tab')).toHaveCount(2);
 assert.equal(await fs.readFile(path.join(left,'file.txt'),'utf8'),'original');
 await page.getByRole('tab').first().click();await ready();await expect(page.locator('#textA')).toHaveValue('neighbor stays');
 await page.getByRole('tab').first().click({button:'right'});await page.locator('#tabContext').getByRole('menuitem',{name:'Clear session…',exact:true}).click();await page.locator('#discardSession').click();await ready();await expect(page.locator('#textA')).toHaveValue('');await expect(page.getByRole('tab')).toHaveCount(2);
 console.log('Clear session passed: cancel, save-before-clear, discard, native/folder/tab context routes, same tab and type, neighbor preservation, fresh roots/history/filters/scope, unchanged disk files.');
}finally{if(page)await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(base,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
