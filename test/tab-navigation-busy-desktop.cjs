'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-tab-busy-')));let app,page;try{
 const left=path.join(temp,'left'),right=path.join(temp,'right');for(const root of [left,right]){await fs.mkdir(root);await fs.writeFile(path.join(root,'a.txt'),'same');}
 const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
 const menu=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
 const tab=name=>page.getByRole('tab',{name:new RegExp('^'+name+'(?: •)?$')});
 await app.evaluate(({dialog},roots)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});},[left,right]);
 await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#sessionName').fill('Folders');await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
 for(const name of ['First','Second']){await menu('new:text-compare');await expect(page.locator('#sessionKind')).toHaveText('Text Compare');await ready();await page.locator('#sessionName').fill(name);await page.locator('#textA').fill(name+' draft');}
 await tab('Folders').click();await ready();
 await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers.get('folders:tree-list');ipcMain.removeHandler('folders:tree-list');ipcMain.handle('folders:tree-list',async(...args)=>{if(global.tabHoldNext){global.tabHoldNext=false;global.tabHeld=true;await new Promise(resolve=>{global.tabRelease=()=>{global.tabHeld=false;resolve();};});}return original(...args);});});
 const hold=async()=>{await ready();await app.evaluate(()=>{global.tabHoldNext=true;global.tabHeld=false;});await menu('folder:refresh');await expect.poll(()=>app.evaluate(()=>global.tabHeld)).toBe(true);};
 const release=()=>app.evaluate(()=>global.tabRelease());
 await hold();await tab('First').click();await expect(tab('Folders')).toHaveAttribute('aria-selected','true');await release();
 await expect(tab('First')).toHaveAttribute('aria-selected','true');await expect(page.locator('#textA')).toHaveValue('First draft');await ready();
 await tab('Folders').click();await ready();await hold();await tab('First').click();await tab('Second').click();await release();
 await expect(tab('Second')).toHaveAttribute('aria-selected','true');await expect(page.locator('#textA')).toHaveValue('Second draft');await ready();
 // Clicking the current tab last cancels an earlier queued switch.
 await tab('Folders').click();await ready();await hold();await tab('First').click();await tab('Folders').click();await release();await ready();
 await expect(tab('Folders')).toHaveAttribute('aria-selected','true');await expect(page.locator('#folderRowsA .folder-entry[data-path="a.txt"]')).toBeVisible();
 // A newer click during native tab activation must survive that active-session change.
 await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers.get('session:activate');ipcMain.removeHandler('session:activate');global.tabActivateHold=true;global.tabActivateHeld=false;ipcMain.handle('session:activate',async(...args)=>{if(global.tabActivateHold){global.tabActivateHold=false;global.tabActivateHeld=true;await new Promise(resolve=>{global.tabActivateRelease=()=>{global.tabActivateHeld=false;resolve();};});}return original(...args);});});
 await tab('First').click();await expect.poll(()=>app.evaluate(()=>global.tabActivateHeld)).toBe(true);await tab('Second').click();await app.evaluate(()=>global.tabActivateRelease());
 await expect(tab('Second')).toHaveAttribute('aria-selected','true');await expect(page.locator('#textA')).toHaveValue('Second draft');await ready();
 assert.equal(await page.getByRole('tab').count(),3);
 // New-session navigation shares the same queue and latest-click ordering as tabs.
 await tab('Folders').click();await ready();await hold();await page.locator('#newTab').click();await expect(page.locator('#welcome')).toBeHidden();await release();
 await expect(page.locator('#welcome')).toBeVisible();await ready();assert.equal(await page.getByRole('tab').count(),3);
 await tab('Folders').click();await ready();await hold();await page.locator('#newTab').click();await tab('First').click();await release();
 await expect(tab('First')).toHaveAttribute('aria-selected','true');await expect(page.locator('#welcome')).toBeHidden();await ready();
 await tab('Folders').click();await ready();await hold();await tab('First').click();await page.locator('#newTab').click();await release();
 await expect(page.locator('#welcome')).toBeVisible();await ready();await tab('Folders').click();await ready();
 // Close requests retain their explicit target and still require the unsaved decision.
 await tab('Folders').click();await ready();await hold();
 await page.getByRole('button',{name:'Close First',exact:true}).click();await page.getByRole('button',{name:'Close First',exact:true}).click();
 await expect(page.locator('#unsavedDialog')).toBeHidden();await release();await expect(page.locator('#unsavedDialog')).toBeVisible();await expect(page.locator('#sessionName')).toHaveValue('First');
 await page.locator('#cancelDiscard').click();await ready();await expect(tab('First')).toBeVisible();await expect(page.locator('#unsavedDialog')).toBeHidden();await expect(page.locator('#textA')).toHaveValue('First draft');
 await tab('Folders').click();await ready();await hold();await menu('close-session');await release();await expect(page.locator('#unsavedDialog')).toBeVisible();await expect(page.locator('#sessionName')).toHaveValue('Folders');await page.locator('#cancelDiscard').click();await ready();
 const saved=path.join(temp,'first.fcompare');await app.evaluate(({dialog},saved)=>{global.closeSaveAttempts=0;dialog.showSaveDialog=async()=>++global.closeSaveAttempts===1?{canceled:true}:{canceled:false,filePath:saved};},saved);
 await hold();await page.getByRole('button',{name:'Close First',exact:true}).click();await release();await expect(page.locator('#unsavedDialog')).toBeVisible();
 await page.locator('#saveBeforeContinue').click();await expect.poll(()=>app.evaluate(()=>global.closeSaveAttempts)).toBe(1);await expect(page.locator('#unsavedDialog')).toBeVisible();await expect(tab('First')).toBeVisible();
 await page.locator('#saveBeforeContinue').click();await expect(tab('First')).toHaveCount(0);await ready();assert.equal(JSON.parse(await fs.readFile(saved,'utf8')).text.a,'First draft');
 await tab('Folders').click();await ready();await hold();await page.getByRole('button',{name:'Close Second',exact:true}).click();await release();await expect(page.locator('#unsavedDialog')).toBeVisible();await expect(page.locator('#textA')).toHaveValue('Second draft');await page.locator('#discardSession').click();await ready();
 await expect(tab('Second')).toHaveCount(0);assert.equal(await page.getByRole('tab').count(),1);await expect(tab('Folders')).toHaveAttribute('aria-selected','true');assert.deepEqual(errors,[]);
 console.log('Busy tab navigation passed: queued switch after refresh, latest requested tab wins, current-tab cancellation, a newer click during activation, preserved drafts, queued close targets, duplicate suppression, Cancel, cancelled Save, Save and Discard.');
}finally{if(app)await app.evaluate(()=>{global.tabRelease?.();global.tabActivateRelease?.();}).catch(()=>{});if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
