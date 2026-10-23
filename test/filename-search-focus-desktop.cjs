'use strict';
const {_electron:electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fc-search-focus-'));let app,page;try{
 const roots=['left','right'].map(name=>path.join(temp,name));for(const root of roots){await fs.mkdir(root);await fs.writeFile(path.join(root,'alpha.txt'),'old');}
 const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[process.cwd()]}),env});page=await app.firstWindow();
 await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));
 await app.evaluate(({dialog},roots)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});},[...roots]);
 const native=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
 const row=page.locator('#folderRowsA [data-path="alpha.txt"]'),dialog=page.getByRole('dialog',{name:'Find filename',exact:true});
 await page.locator('#welcome [data-command="new:folder-compare"]').click();await page.locator('#openA').click();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#openB').click();await expect(row).toHaveClass(/equal/);await expect(page.locator('#folderSummary')).not.toContainText('Comparing');
 await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers.get('folders:tree-compare');ipcMain.removeHandler('folders:tree-compare');ipcMain.handle('folders:tree-compare',async(...args)=>{await new Promise(resolve=>global.releaseSearchComparison=resolve);return original(...args);});});
 await native('folder:refresh');await expect.poll(()=>app.evaluate(()=>typeof global.releaseSearchComparison)).toBe('function');await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await row.click();await native('text:find');await expect(dialog).toBeVisible();
 await page.evaluate(()=>window.originalSearchRow=document.querySelector('#folderRowsA [data-path="alpha.txt"]'));
 await fs.writeFile(path.join(roots[0],'alpha.txt'),'updated contents');await app.evaluate(()=>global.releaseSearchComparison());await expect(row.locator('.entry-size')).toHaveText('16');await expect.poll(()=>page.evaluate(()=>window.originalSearchRow.isConnected)).toBe(false);
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(row).toBeFocused();await expect(row).toHaveClass(/selected/);
 await native('text:find');await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(row).toBeFocused();
 console.log('Filename-search focus passed: cancelled search returns to the selected row after background comparison replaces its DOM; Escape preserves focus.');
}finally{if(app)await app.evaluate(()=>global.releaseSearchComparison?.()).catch(()=>{});if(page)await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
