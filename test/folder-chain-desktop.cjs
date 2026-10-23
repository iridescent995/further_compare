'use strict';
const {clickFolderAction}=require('./folder-context-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-folder-chain-')));let app,page;
 try{
  const roots=[path.join(base,'left'),path.join(base,'right')];
  const write=async(root,name,text='same')=>{await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),text);};
  for(const root of roots){
   await write(root,'java/oracle/fsgbu/tfpm/orchestrator/application.txt',root===roots[0]?'left':'right');
   await write(root,'branch/one/a.txt');await write(root,'branch/two/b.txt');
   await write(root,'with-file/child/deeper/a.txt');await write(root,'with-file/readme.txt');
   await write(root,'excluded-file/child/deeper/a.txt');await write(root,'excluded-file/stop.bak');
   await write(root,'excluded-folder/one/a.txt');await write(root,'excluded-folder/hidden/b.txt');
   await write(root,'unrelated/deep/never.txt');
  }
  await write(roots[0],'only-left/a/b/final.txt');
  const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
  page=await app.firstWindow();page.setDefaultTimeout(15000);
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));
  await app.evaluate(({dialog,ipcMain},roots)=>{
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});global.chainReads=[];
   for(const channel of ['folders:tree-list','folders:tree-compare']){const original=ipcMain._invokeHandlers.get(channel);ipcMain.removeHandler(channel);ipcMain.handle(channel,(...args)=>{global.chainReads.push([channel,args[1]]);return original(...args);});}
  },[...roots]);
  await page.locator('#welcome [data-command="new:folder-compare"]').click();await page.locator('#openA').click();await page.locator('#openB').click();
  const row=(name,side='A')=>page.locator('#folderRows'+side+' .folder-entry[data-path="'+name+'"]');
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  await ready();const tabs=await page.getByRole('tab').count(),unrelatedId=await row('unrelated').getAttribute('data-id');
  await app.evaluate(()=>{global.chainReads=[];});
  await row('java').click();await page.keyboard.press('ArrowRight');
  await expect(row('java/oracle/fsgbu/tfpm/orchestrator/application.txt')).toBeVisible();await ready();
  for(const name of ['java','java/oracle','java/oracle/fsgbu','java/oracle/fsgbu/tfpm','java/oracle/fsgbu/tfpm/orchestrator']){
   await expect(row(name)).toHaveAttribute('aria-expanded','true');await expect(row(name,'B')).toHaveAttribute('aria-expanded','true');
  }
  await expect(row('java')).toHaveClass(/selected/);await expect(row('java')).toBeFocused();
  await expect(row('java/oracle/fsgbu/tfpm/orchestrator/application.txt')).toHaveClass(/different|changed/);
  assert.equal(await page.getByRole('tab').count(),tabs);
  assert.ok(!(await app.evaluate(()=>global.chainReads)).some(([,id])=>id===unrelatedId),'Auto expansion must not read a closed sibling');
  await page.keyboard.press('ArrowLeft');await expect(row('java/oracle')).toHaveCount(0);await ready();
  await row('java').locator('.tree-toggle').click();await expect(row('java/oracle/fsgbu/tfpm/orchestrator/application.txt')).toBeVisible();await ready();
  // Context expansion follows the same chain for a directory present on one side only.
  await row('only-left').click({button:'right'});await clickFolderAction(page,'Expand folder');
  await expect(row('only-left/a/b/final.txt')).toBeVisible();await ready();
  await expect(row('only-left/a/b')).toHaveAttribute('aria-expanded','true');
  await row('branch').locator('.tree-toggle').click();await expect(row('branch/one')).toBeVisible();await ready();
  for(const name of ['branch/one','branch/two'])await expect(row(name)).toHaveAttribute('aria-expanded','false');
  await expect(row('branch/one/a.txt')).toHaveCount(0);
  await row('with-file').locator('.tree-toggle').click();await expect(row('with-file/readme.txt')).toBeVisible();await ready();
  await expect(row('with-file/child')).toHaveAttribute('aria-expanded','false');await expect(row('with-file/child/deeper')).toHaveCount(0);
  // Native expansion uses the same chain behavior after an explicit collapse.
  await row('only-left').click();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','folder:collapse'));await expect(row('only-left')).toHaveAttribute('aria-expanded','false');await ready();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','folder:expand'));await expect(row('only-left/a/b/final.txt')).toBeVisible();await ready();await expect(row('only-left')).toBeFocused();
  // Filtered-out children must still count when deciding whether this is a single-folder chain.
  await page.locator('#folderExclude').fill('*.bak;excluded-folder/hidden');
  await row('excluded-file').locator('.tree-toggle').click();await expect(row('excluded-file/child')).toBeVisible();await ready();
  await expect(row('excluded-file/stop.bak')).toHaveCount(0);await expect(row('excluded-file/child')).toHaveAttribute('aria-expanded','false');
  await row('excluded-folder').locator('.tree-toggle').click();await expect(row('excluded-folder/one')).toBeVisible();await ready();
  await expect(row('excluded-folder/hidden')).toHaveCount(0);await expect(row('excluded-folder/one')).toHaveAttribute('aria-expanded','false');
  assert.equal(await page.getByRole('tab').count(),tabs);
  assert.ok(!(await app.evaluate(()=>global.chainReads)).some(([,id])=>id===unrelatedId),'No unrelated closed sibling is read throughout chain expansion');
  await expect(row('unrelated/deep')).toHaveCount(0);
  console.log('Folder chain expansion passed: paired and one-sided chains, keyboard/context/disclosure routes, selection/focus, collapse/re-expand, files and branches stop, raw excluded entries stop, no unrelated reads or new tabs.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
