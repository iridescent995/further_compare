'use strict';
const {_electron:electron,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:20000});
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-toggle-doubleclick-')));let app,page;
 try{
  const roots=['left','right'].map(name=>path.join(base,name));
  for(const root of roots){await fs.mkdir(path.join(root,'branch'),{recursive:true});await fs.writeFile(path.join(root,'branch','file.txt'),'same');}
  const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(20000);
  await app.evaluate(({dialog,BrowserWindow,ipcMain},roots)=>{
   BrowserWindow.getAllWindows().forEach(window=>window.hide());dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});global.toggleListings=[];
   const list=ipcMain._invokeHandlers.get('folders:tree-list');ipcMain.removeHandler('folders:tree-list');ipcMain.handle('folders:tree-list',(...args)=>{global.toggleListings.push(args[1]);return list(...args);});
  },roots);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});window.toggleEvents=[];document.addEventListener('click',event=>{if(event.target.matches('.tree-toggle'))window.toggleEvents.push({detail:event.detail,expanded:event.target.closest('.folder-entry').getAttribute('aria-expanded')});},true);});
  await page.locator('#welcome [data-command="new:folder-compare"]').click();await page.locator('#openA').click();await page.locator('#openB').click();
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');await ready();
  const row=page.locator('#folderRowsA [data-path="branch"]'),child=page.locator('#folderRowsA [data-path="branch/file.txt"]'),id=await row.getAttribute('data-id'),tabs=await page.getByRole('tab').count();
  // A disclosure is focusable by native mouse-down even though it is outside the tab order.
  // Refresh must restore its owning row when the focused descendant is replaced.
  await row.click();await row.locator('.tree-toggle').focus();
  await expect(row.locator('.tree-toggle')).toBeFocused();
  await page.evaluate(()=>{window.beforeRefresh=document.querySelector('#folderRowsA [data-path="branch"]');});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','folder:refresh'));
  await expect.poll(()=>page.evaluate(()=>window.beforeRefresh.isConnected)).toBe(false);await ready();
  await expect(row).toBeFocused({timeout:3000});await expect(row).toHaveClass(/selected/);
  // Real double-clicks may lose their second DOM click when a scan replaces the row
  // between mouse-down and mouse-up; the resulting toggle and scan count must still be exact.
  for(const delay of [0,100])for(const opening of [true,false]){
   await app.evaluate(()=>{global.toggleListings=[];});await page.evaluate(()=>{window.toggleEvents=[];});
   await row.locator('.tree-toggle').dblclick({delay});await ready();await expect(row).toHaveAttribute('aria-expanded',String(opening));
   if(opening){await expect(child).toBeVisible();await expect(child).toHaveClass(/equal/);}else await expect(child).toHaveCount(0);
   await expect(page.locator('#folderSummary')).not.toContainText('Comparing');
   assert.deepEqual(await app.evaluate(()=>global.toggleListings),opening?['root',id]:['root'],'Double-click must perform exactly one expansion/collapse scan');
   const events=await page.evaluate(()=>window.toggleEvents);assert.equal(events[0]?.detail,1);assert.ok(events.slice(1).every(event=>event.detail===2));
   await expect(row).toBeFocused();await expect(row).toHaveClass(/selected/);assert.equal(await page.getByRole('tab').count(),tabs);
  }
  // Separately guarantee a second click on the replacement DOM, independent of
  // scan speed. Native mouse events retain the double-click count explicitly.
  for(const opening of [true,false]){
   await app.evaluate(()=>{global.toggleListings=[];});await page.evaluate(()=>{window.toggleEvents=[];window.firstToggle=document.querySelector('#folderRowsA [data-path="branch"] .tree-toggle');});
   const box=await row.locator('.tree-toggle').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
   await page.mouse.click(x,y,{clickCount:1});await ready();await expect(row).toHaveAttribute('aria-expanded',String(opening));
   await expect(page.locator('#folderSummary')).not.toContainText('Comparing');
   assert.equal(await page.evaluate(()=>window.firstToggle.isConnected),false,'First click must replace the disclosure before the second click');
   await page.mouse.move(x,y);await page.mouse.down({clickCount:2});await page.mouse.up({clickCount:2});await ready();
   await expect(row).toHaveAttribute('aria-expanded',String(opening));
   if(opening)await expect(child).toBeVisible();else await expect(child).toHaveCount(0);
   assert.deepEqual(await app.evaluate(()=>global.toggleListings),opening?['root',id]:['root'],'Replacement disclosure must not trigger a second scan');
   const events=await page.evaluate(()=>window.toggleEvents);assert.deepEqual(events.map(event=>event.detail),[1,2]);assert.equal(events[1].expanded,String(opening));
   await expect(row).toBeFocused();await expect(row).toHaveClass(/selected/);assert.equal(await page.getByRole('tab').count(),tabs);
  }
  console.log('Disclosure double-click passed: collapsed/expanded folders, immediate/delayed second clicks, replaced DOM, exactly one scan, stable selection/focus and no child tabs.');
 }finally{if(page)await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
