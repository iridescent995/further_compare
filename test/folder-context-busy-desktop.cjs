'use strict';
const {clickFolderAction}=require('./folder-context-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-context-busy-')));let app,page;
 try{
  const left=path.join(temp,'left'),right=path.join(temp,'right');
  for(const root of [left,right]){await fs.mkdir(path.join(root,'nested','child'),{recursive:true});for(const name of ['a.txt','b.txt'])await fs.writeFile(path.join(root,name),name);await fs.writeFile(path.join(root,'nested','child','deep.txt'),'deep');}
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
  page=await app.firstWindow();page.setDefaultTimeout(12000);
  await app.evaluate(({dialog},roots)=>{let i=0;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots[i++]]});},[left,right]);
  const menu=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  const row=name=>page.locator('#folderRowsA .folder-entry[data-path="'+name+'"]');
  // A scheduled shell poll also holds the renderer operation guard on the welcome
  // screen. Creating a session during that poll must queue instead of disappearing.
  await app.evaluate(({ipcMain})=>{
   const original=ipcMain._invokeHandlers.get('shell:take');ipcMain.removeHandler('shell:take');
   global.contextShellHoldNext=true;global.contextShellHeld=false;
   ipcMain.handle('shell:take',async(...args)=>{
    if(global.contextShellHoldNext){global.contextShellHoldNext=false;global.contextShellHeld=true;await new Promise(resolve=>{global.contextShellRelease=()=>{global.contextShellHeld=false;resolve();};});}
    return original(...args);
   });
  });
  await expect.poll(()=>app.evaluate(()=>global.contextShellHeld)).toBe(true);
  await page.locator('#welcome [data-command="new:folder-compare"]').click();await expect(page.locator('#welcome')).toBeVisible();
  await app.evaluate(()=>global.contextShellRelease());await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');await expect(page.locator('#openA')).toBeVisible();
  await page.locator('#openA').click();await page.locator('#openB').click();await expect(row('b.txt')).toBeVisible();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  // Hold a real directory request, leaving the previous rows available for interaction.
  // Count actual clipboard writes without modifying the user's clipboard.
  await app.evaluate(({ipcMain,clipboard})=>{
   global.contextWrites=[];clipboard.writeText=value=>global.contextWrites.push(value);
   const original=ipcMain._invokeHandlers.get('folders:tree-list');ipcMain.removeHandler('folders:tree-list');
   ipcMain.handle('folders:tree-list',async(...args)=>{
    if(global.contextHoldNext){global.contextHoldNext=false;global.contextHeld=true;await new Promise(resolve=>{global.contextRelease=()=>{global.contextHeld=false;resolve();};});}
    return original(...args);
   });
  });
  // Only explicit refreshes should consume the held directory request.
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));
  const hold=async()=>{await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await app.evaluate(()=>{global.contextHoldNext=true;global.contextHeld=false;});await menu('folder:refresh');await expect.poll(()=>app.evaluate(()=>global.contextHeld)).toBe(true);await expect(page.locator('body')).toHaveAttribute('aria-busy','true');};
  const release=()=>app.evaluate(()=>global.contextRelease());
  const writes=()=>app.evaluate(()=>global.contextWrites);
  const context=async(name,action)=>{await row(name).click({button:'right'});await clickFolderAction(page,action);};
  // Native Open commands remain available while background refresh is busy.
  // Cancellation must preserve the roots, and the picker must open exactly once.
  await app.evaluate(({dialog})=>{global.contextOpenCalls=0;dialog.showOpenDialog=async()=>{global.contextOpenCalls++;return {canceled:true,filePaths:[]};};});
  for(const action of ['open-a','open-b']){
   const before=await app.evaluate(()=>global.contextOpenCalls);
   await hold();await menu(action);assert.equal(await app.evaluate(()=>global.contextOpenCalls),before);
   await release();await expect.poll(()=>app.evaluate(()=>global.contextOpenCalls)).toBe(before+1);
   await expect(row('a.txt')).toBeVisible();
  }
  await row('a.txt').click();await hold();await context('a.txt','Copy paths');assert.deepEqual(await writes(),[]);await release();await expect.poll(writes).toEqual([path.join(left,'a.txt')]);
  // Changing selection while the command waits must cancel, rather than act on stale files.
  await hold();await context('a.txt','Copy paths');await row('b.txt').click();await release();await expect(page.locator('#notice')).toContainText(/changed|select|again/i);await expect(page.locator('body')).toHaveAttribute('aria-busy','false');assert.deepEqual(await writes(),[path.join(left,'a.txt')]);
  // The equivalent native menu command must also survive an in-flight refresh.
  await hold();await menu('folder:copy-paths');assert.equal((await writes()).length,1);await release();await expect.poll(writes).toEqual([path.join(left,'a.txt'),path.join(left,'b.txt')]);
  // Both pane buttons, both main toolbar buttons and native copy commands queue previews.
  for(const [side,trigger]of [['a','copyA'],['b','copyB'],['a','mergeToB'],['b','mergeToA'],['a','copy-right'],['b','copy-left']]){
   await page.locator('#folderRows'+side.toUpperCase()+' [data-path="a.txt"]').click();await hold();
   if(trigger.startsWith('copy-'))await menu(trigger);else await page.locator('#'+trigger).click();
   await expect(page.locator('#planDialog')).toBeHidden();await release();await expect(page.locator('#planDialog')).toBeVisible();await expect(page.locator('#planDescription')).toHaveText(new RegExp('^Copy from '+(side==='a'?'left to right':'right to left')+'\\nFile-action scope:'));await page.locator('#cancelPlan').click();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  }
  await row('a.txt').click();await hold();await page.locator('#copyA').click();await row('b.txt').click();await release();await expect(page.locator('#notice')).toContainText(/changed|select|again/i);await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await expect(page.locator('#planDialog')).toBeHidden();
  for(const root of [left,right])for(const name of ['a.txt','b.txt'])assert.equal(await fs.readFile(path.join(root,name),'utf8'),name);
  // Row activation must wait for refresh too, without losing the user's double click.
  const initialTabs=await page.getByRole('tab').count();
  await hold();await row('a.txt').dblclick();await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');assert.equal(await page.getByRole('tab').count(),initialTabs);
  await release();await expect(page.locator('#sessionKind')).toHaveText('Text Compare');await expect(page.locator('#textA')).toHaveValue('a.txt');assert.equal(await page.getByRole('tab').count(),initialTabs+1);
  await page.locator('#backToFolder').click();await expect(row('a.txt')).toBeVisible();
  await row('b.txt').click();await hold();await row('b.txt').focus();await page.keyboard.press('Enter');await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');
  await release();await expect(page.locator('#sessionKind')).toHaveText('Text Compare');await expect(page.locator('#textA')).toHaveValue('b.txt');assert.equal(await page.getByRole('tab').count(),initialTabs+2);
  await page.locator('#backToFolder').click();await expect(row('a.txt')).toBeVisible();
  // A newer selection invalidates the pending open instead of opening a stale row.
  await hold();await row('a.txt').dblclick();await row('b.txt').click();await release();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await expect(page.locator('#notice')).toContainText(/changed|select|again/i);
  await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');assert.equal(await page.getByRole('tab').count(),initialTabs+2);
  // Disclosure expands inline after refresh. Repeated right arrows mean "expand",
  // not two toggles which would leave the folder collapsed.
  await hold();await row('nested').getByRole('button',{name:'Expand nested',exact:true}).click();await expect(row('nested/child')).toHaveCount(0);await release();await expect(row('nested/child')).toBeVisible();
  await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');assert.equal(await page.getByRole('tab').count(),initialTabs+2);
  await row('nested').getByRole('button',{name:'Collapse nested',exact:true}).click();await expect(row('nested/child')).toHaveCount(0);
  await hold();await row('nested').click();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await release();await expect(row('nested/child')).toBeVisible();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await expect(row('nested')).toHaveAttribute('aria-expanded','true');
  // Idle tree arrows navigate into children and back to parents. Modified arrows
  // move focus while preserving selection, just like vertical navigation.
  const chosen=()=>page.locator('#folderRowsA .selected').evaluateAll(entries=>entries.map(entry=>entry.dataset.path));
  await row('nested').click();await page.keyboard.press('ArrowRight');await expect(row('nested/child')).toBeFocused();assert.deepEqual(await chosen(),['nested/child']);
  await page.keyboard.press('ArrowRight');await expect(row('nested/child/deep.txt')).toBeVisible();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  await row('nested/child').focus();await page.keyboard.press('ArrowRight');await expect(row('nested/child/deep.txt')).toBeFocused();assert.deepEqual(await chosen(),['nested/child/deep.txt']);
  const modifier=process.platform==='darwin'?'Meta':'Control';
  await page.keyboard.press(modifier+'+ArrowLeft');await expect(row('nested/child')).toBeFocused();assert.deepEqual(await chosen(),['nested/child/deep.txt']);
  await page.keyboard.press(modifier+'+ArrowRight');await expect(row('nested/child/deep.txt')).toBeFocused();assert.deepEqual(await chosen(),['nested/child/deep.txt']);
  await page.keyboard.press('ArrowLeft');await expect(row('nested/child')).toBeFocused();assert.deepEqual(await chosen(),['nested/child']);
  await page.keyboard.press('ArrowLeft');await expect(row('nested/child/deep.txt')).toHaveCount(0);await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  await row('nested/child').focus();await page.keyboard.press('ArrowLeft');await expect(row('nested')).toBeFocused();assert.deepEqual(await chosen(),['nested']);
  await row('nested').getByRole('button',{name:'Collapse nested',exact:true}).click();await expect(row('nested/child')).toHaveCount(0);await row('b.txt').click();
  // Stop must bypass the busy queue, even when expansion has outstanding directory I/O.
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await app.evaluate(()=>{global.contextHoldNext=true;global.contextHeld=false;});await page.locator('#folderExpandAll').click();await expect.poll(()=>app.evaluate(()=>global.contextHeld)).toBe(true);
  // Keep a separate renderer operation busy while expansion is held.
  await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers.get('folders:tree-copy-paths');ipcMain.removeHandler('folders:tree-copy-paths');ipcMain.handle('folders:tree-copy-paths',async(...args)=>{global.contextCopyHeld=true;await new Promise(resolve=>{global.contextCopyRelease=resolve;});return original(...args);});});
  await menu('folder:copy-paths');await expect.poll(()=>app.evaluate(()=>global.contextCopyHeld)).toBe(true);await expect(page.locator('body')).toHaveAttribute('aria-busy','true');
  await context('b.txt','Stop expanding');await expect(page.locator('#folderStop')).toBeDisabled();await expect(page.locator('#folderExpandStatus')).toContainText('stopped');assert.equal(await app.evaluate(()=>global.contextHeld),true);
  await release();await app.evaluate(()=>global.contextCopyRelease());await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await expect(row('nested/child/deep.txt')).toHaveCount(0);
  console.log('Folder busy context passed: queued context/native actions and exactly-once native Open pickers, double-click and Enter opens, stale selection cancellation, inline disclosure, repeated expansion keys, and immediate Stop during pending directory and command I/O.');
 }catch(error){if(page&&!page.isClosed())console.error('Busy notice:',await page.locator('#notice').textContent());throw error;}finally{if(app)await app.evaluate(()=>{global.contextShellRelease?.();global.contextRelease?.();global.contextCopyRelease?.();}).catch(()=>{});if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
