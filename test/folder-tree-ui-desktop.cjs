'use strict';
const {selectFolderOption,clickFolderOption}=require('./folder-options-helper.cjs');
const {folderContextItem}=require('./folder-context-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-tree-ui-')));let app,page;
 try{
  const left=path.join(base,'left'),right=path.join(base,'right');
  await fs.mkdir(path.join(left,'old'),{recursive:true});await fs.mkdir(path.join(right,'build/new'),{recursive:true});
  await fs.writeFile(path.join(left,'old/source.txt'),'left contents');await fs.writeFile(path.join(right,'build/new/target.txt'),'right contents');
  const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(12000);
  await app.evaluate(({dialog},roots)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});},[left,right]);
  await page.locator('#welcome [data-command="new:folder-compare"]').click();await page.locator('#openA').click();await page.locator('#openB').click();
  const row=(side,name)=>page.locator('#folderRows'+side+' .folder-entry[data-path="'+name+'"]');
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  await row('A','old').locator('.tree-toggle').click();await expect(row('A','old/source.txt')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await row('B','build').locator('.tree-toggle').click();await expect(row('B','build/new')).toBeVisible();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await expect(row('B','build/new')).toHaveAttribute('aria-expanded','true');
  await expect(row('A','old/source.txt')).toBeVisible();await expect(row('B','build/new/target.txt')).toBeVisible();
  const tabs=await page.getByRole('tab').count(),modifier=process.platform==='darwin'?'Meta':'Control';
  await row('A','old/source.txt').click();await row('B','build/new/target.txt').click({modifiers:[modifier]});
  await expect(page.locator('#alignFolderPair')).toBeEnabled();await clickFolderOption(page,'alignFolderPair');
  await expect(page.locator('#clearFolderAlignment')).toBeEnabled();
  await expect(row('A','old/source.txt')).toBeVisible();await expect(row('B','build/new/target.txt')).toBeVisible();
  assert.equal(await row('A','old/source.txt').getAttribute('data-id'),await row('B','build/new/target.txt').getAttribute('data-id'));
  await expect(row('A','old/source.txt')).toHaveClass(/changed/);await expect(row('B','build/new/target.txt')).toHaveClass(/changed/);
  assert.equal(await page.getByRole('tab').count(),tabs);
  // The right disk parent differs from the displayed logical parent after alignment.
  // Excluding its complete path must hide the aligned child on both sides.
  await page.locator('#folderExclude').fill('build/new');
  await expect(row('A','old/source.txt')).toHaveCount(0);await expect(row('B','build/new/target.txt')).toHaveCount(0);
  await page.locator('#folderExclude').fill('');
  await expect(row('A','old/source.txt')).toBeVisible();await expect(row('B','build/new/target.txt')).toBeVisible();
  await row('B','build/new/target.txt').click();await expect(row('B','build/new/target.txt')).toHaveClass(/selected/);assert.equal(await page.getByRole('tab').count(),tabs);
  await row('B','build/new/target.txt').dblclick();await expect(page.locator('#sessionKind')).toHaveText('Text Compare');
  await expect(page.locator('#textA')).toHaveValue('left contents');await expect(page.locator('#textB')).toHaveValue('right contents');
  await page.locator('#backToFolder').click();await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');
  await expect(page.locator('#clearFolderAlignment')).toBeEnabled();await clickFolderOption(page,'clearFolderAlignment');await expect(page.locator('#clearFolderAlignment')).toBeDisabled();
  await expect(row('A','old/source.txt')).toBeVisible();await expect(row('B','build/new/target.txt')).toBeVisible();
  await expect.poll(async()=>await row('A','old/source.txt').getAttribute('data-id')===await row('B','build/new/target.txt').getAttribute('data-id')).toBe(false);
  // Existing file alignment must not become an expandable directory mapping.
  await row('A','old/source.txt').click();await row('B','build/new/target.txt').click({modifiers:[modifier]});await clickFolderOption(page,'alignFolderPair');
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  for(const endpoint of [path.join(left,'old/source.txt'),path.join(right,'build/new/target.txt')]){await fs.unlink(endpoint);await fs.mkdir(endpoint);await fs.writeFile(path.join(endpoint,'child.txt'),'new child');}
  const menu=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  await menu('folder:refresh');await expect(row('A','old/source.txt')).toHaveClass(/conflict/);await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  await expect(row('A','old/source.txt').locator('.tree-toggle')).toBeDisabled();await expect(row('B','build/new/target.txt').locator('.tree-toggle')).toBeDisabled();
  const conflictId=await row('A','old/source.txt').getAttribute('data-id');
  await app.evaluate(({ipcMain})=>{global.conflictNodeReads=[];const original=ipcMain._invokeHandlers.get('folders:tree-list');ipcMain.removeHandler('folders:tree-list');ipcMain.handle('folders:tree-list',(...args)=>{global.conflictNodeReads.push(args[1]);return original(...args);});});
  for(const label of ['Compare this folder','Expand folder','Expand subtree']){await row('A','old/source.txt').click({button:'right'});await expect(await folderContextItem(page,label)).toBeDisabled();await page.keyboard.press('Escape');await page.keyboard.press('Escape');}
  await row('A','old/source.txt').click();await page.keyboard.press('ArrowRight');await menu('folder:expand-subtree');await expect(page.locator('#notice')).toContainText('Clear its alignment');await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  assert.ok(!(await app.evaluate(()=>global.conflictNodeReads)).includes(conflictId),'Conflicting entry must not be read as a directory');
  await expect(row('A','old/source.txt/child.txt')).toHaveCount(0);assert.equal(await page.getByRole('tab').count(),tabs+1);
  await clickFolderOption(page,'clearFolderAlignment');await expect(row('A','old/source.txt').locator('.tree-toggle')).toBeEnabled();await row('A','old/source.txt').locator('.tree-toggle').click();await expect(row('A','old/source.txt/child.txt')).toBeVisible();
  console.log('Folder tree UI passed: cross-parent alignment in place, independent filenames, disk-parent exclusions, live colors, click selection, double-click actual files, parent return, changed-type conflict expansion guards and recovery after clearing alignment.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
