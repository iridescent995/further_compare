'use strict';
const {selectFolderOption,clickFolderOption}=require('./folder-options-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {clickFolderAction}=require('./folder-context-helper.cjs');
(async()=>{const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fc-direction-'));let app,page;try{
 const roots=['left','right'].map(name=>path.join(temp,name));for(const root of roots)await fs.mkdir(root);await fs.writeFile(path.join(roots[0],'left.txt'),'left content');await fs.writeFile(path.join(roots[1],'right.txt'),'right content');
 const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();
 const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
 const menu=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
 const item=name=>page.locator('#folderContext').getByRole('menuitem',{name,exact:true});
 const row=()=>page.locator('#folderRowsA [data-path="left.txt"]');
 const open=async()=>{await ready();await row().click({button:'right'});};
 await ready();
 await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers.get('folders:tree-list');ipcMain.removeHandler('folders:tree-list');ipcMain.handle('folders:tree-list',async(...args)=>{if(global.reviewHold){global.reviewHold=false;global.reviewWaiting=true;await new Promise(resolve=>global.reviewRelease=resolve);}return original(...args);});});
 const hold=async()=>{await ready();await app.evaluate(()=>{global.reviewHold=true;global.reviewWaiting=false;});await menu('folder:refresh');await expect.poll(()=>app.evaluate(()=>global.reviewWaiting)).toBe(true);};
 for(const type of ['folder-compare','folder-merge','folder-sync']){
  await app.evaluate(({dialog},roots)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});},[...roots]);
  await menu('new:'+type);await expect(page.locator('#sessionKind')).toHaveText(type.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' '));await ready();
  await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();await expect(row()).toBeVisible();await open();
  assert.ok(await page.locator('#folderContext').getByRole('menuitem').count()<=22,type+' context must stay compact');
  if(type==='folder-compare'){await expect(item('Direction')).toHaveCount(0);await page.keyboard.press('Escape');continue;}
  await item('Direction').click();await expect(item('Left → Right')).toBeDisabled();await item('Right → Left').click();await ready();await expect(page.locator('#folderDirection')).toHaveValue('b-to-a');await expect(row()).toHaveClass(/selected/);await expect(row()).toBeFocused();
  await open();await item('Direction').click();await expect(item('Right → Left')).toBeDisabled();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await open();await clickFolderAction(page,'Review '+(type==='folder-sync'?'sync':'merge')+' changes');await expect(page.locator('#planDialog')).toBeVisible();await expect(page.locator('#planDescription')).toContainText('Right → Left');
  await expect(page.locator('#planTitle')).toHaveText(type==='folder-sync'?'1 planned operations':'0 planned operations');if(type==='folder-sync')await expect(page.locator('#planOperations')).toContainText('delete');await page.locator('#cancelPlan').click();await ready();
  await open();await clickFolderAction(page,'Left → Right');await ready();await expect(page.locator('#folderDirection')).toHaveValue('a-to-b');
  await open();await clickFolderAction(page,'Review '+(type==='folder-sync'?'sync':'merge')+' changes');await expect(page.locator('#planDescription')).toContainText('Left → Right');await expect(page.locator('#planOperations')).toContainText('copy');await page.locator('#cancelPlan').click();await ready();
  await hold();await page.locator('#previewPlan').click();await expect(page.locator('#planDialog')).toBeHidden();await app.evaluate(()=>global.reviewRelease());await expect(page.locator('#planDialog')).toBeVisible();await expect(page.locator('#planDescription')).toContainText('Left → Right');await page.locator('#cancelPlan').click();await ready();
  await hold();await page.locator('#previewPlan').click();await selectFolderOption(page,'folderDirection','b-to-a');await app.evaluate(()=>global.reviewRelease());await ready();await expect(page.locator('#planDialog')).toBeHidden();await expect(page.locator('#notice')).toContainText('Folder selection changed');await selectFolderOption(page,'folderDirection','a-to-b');
  // A toolbar direction change invalidates a menu that captured the previous direction.
  await open();await page.locator('#folderDirection').evaluate(el=>{el.value='b-to-a';el.dispatchEvent(new Event('change',{bubbles:true}));});await clickFolderAction(page,'Review '+(type==='folder-sync'?'sync':'merge')+' changes');await expect(page.locator('#planDialog')).toBeHidden();await expect(page.locator('#notice')).toContainText('Open the menu again');
 }
 assert.deepEqual(await fs.readdir(roots[0]),['left.txt']);assert.deepEqual(await fs.readdir(roots[1]),['right.txt']);assert.equal(await fs.readFile(path.join(roots[0],'left.txt'),'utf8'),'left content');assert.equal(await fs.readFile(path.join(roots[1],'right.txt'),'utf8'),'right content');
 console.log('Context direction passed: merge/sync directions, toolbar parity, focus and selection, copy/delete previews, stale-menu rejection, and unchanged files.');
}finally{if(app)await app.evaluate(()=>global.reviewRelease?.()).catch(()=>{});if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
