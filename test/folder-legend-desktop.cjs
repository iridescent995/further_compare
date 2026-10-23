'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const {clickFolderAction}=require('./folder-context-helper.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-legend-')));let app,page;
 try{
  const roots=['left','right'].map(name=>path.join(temp,name)),saved=path.join(temp,'legend.fcompare');
  for(const root of roots){await fs.mkdir(root);await fs.writeFile(path.join(root,'same.txt'),'same');}
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();
  await app.evaluate(({dialog,ipcMain},{roots,saved})=>{dialog.showOpenDialog=async(_w,o)=>({canceled:false,filePaths:[o.properties.includes('openDirectory')?roots.shift():saved]});dialog.showSaveDialog=async()=>({canceled:false,filePath:saved});global.legendReads=[];for(const channel of ['folders:tree-list','folders:tree-compare']){const original=ipcMain._invokeHandlers.get(channel);ipcMain.removeHandler(channel);ipcMain.handle(channel,(...args)=>{global.legendReads.push(channel);return original(...args);});}},{roots:[...roots],saved});
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false'),native=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  const row=page.locator('#folderRowsA [data-path="same.txt"]'),legend=page.locator('.folder-legend');
  await ready();await native('new:folder-compare');await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();await expect(row).toHaveClass(/equal/);
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));await row.click();await row.evaluate(el=>window.legendRow=el);await app.evaluate(()=>global.legendReads=[]);
  const toggle=async label=>{await row.click({button:'right'});await clickFolderAction(page,label);await ready();};
  await expect(legend).toBeVisible();await toggle('Hide color legend');await expect(legend).toBeHidden();await expect(row).toBeFocused();await expect(row).toHaveClass(/selected/);
  assert.equal(await row.evaluate(el=>el===window.legendRow),true,'Toggling must preserve row DOM');
  await app.evaluate(({Menu})=>{const view=Menu.getApplicationMenu().items.find(item=>item.label==='View');view.submenu.items.find(item=>item.label==='Show / Hide Folder Color Legend').click();});await expect(legend).toBeVisible();await toggle('Hide color legend');
  assert.deepEqual(await app.evaluate(()=>global.legendReads),[],'Legend changes must not list or compare folders');
  assert.equal(await page.locator('#folderOperationScope').inputValue(),'filtered');await expect(row).toHaveClass(/equal/);
  const parent=await page.locator('#sessionTabs [role="tab"]').evaluateAll(tabs=>tabs.findIndex(tab=>tab.getAttribute('aria-selected')==='true'));
  await native('save-session');await expect.poll(async()=>JSON.parse(await fs.readFile(saved,'utf8').catch(()=>'{}')).options?.folderView?.hideLegend).toBe(true);
  const count=await page.getByRole('tab').count();await native('new:folder-compare');await expect(page.getByRole('tab')).toHaveCount(count+1);await ready();await expect(legend).toBeVisible();
  await page.locator('#sessionTabs [role="tab"]').nth(parent).click();await ready();await expect(legend).toBeHidden();await native('open-session');await expect(page.getByRole('tab')).toHaveCount(count+2);await ready();await expect(legend).toBeHidden();await expect(row).toHaveClass(/equal/);
  await toggle('Show color legend');await expect(legend).toBeVisible();for(const root of roots)assert.equal(await fs.readFile(path.join(root,'same.txt'),'utf8'),'same');
  console.log('Folder legend passed: context/native routes, row identity/focus/selection, no comparison IO, default and independent tabs, saved reopen, unchanged results and file-action scope.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
