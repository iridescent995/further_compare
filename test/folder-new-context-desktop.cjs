'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-new-context-')));let app,page;
 try{
  const roots=['left','right'].map(name=>path.join(temp,name));
  for(const root of roots){await fs.mkdir(root);await fs.writeFile(path.join(root,'keep.txt'),'preserved');}
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const menu=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  await ready();await menu('new:folder-compare');await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');await ready();
  await app.evaluate(({dialog},roots)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});},[...roots]);
  await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();await page.locator('#sessionName').fill('Keep this folder');
  const parent=page.getByRole('tab',{name:'Keep this folder',exact:false});
  const row=page.locator('#folderRowsA [data-path="keep.txt"]');
  const labels=['Text Compare','Text Merge','Folder Compare','Folder Merge','Folder Sync','Binary Compare','Table Compare','Picture Compare','Text Merge3','Audio Compare','Archive Compare','Registry Compare','Three-way Folder Merge'];
  for(const label of labels){
   await row.click({button:'right'});const context=page.locator('#folderContext');
   await context.getByRole('menuitem',{name:'Session & tools',exact:true}).click();
   const owner=context.getByRole('menuitem',{name:'New comparison',exact:true});await owner.focus();await page.keyboard.press('ArrowRight');
   for(const name of labels)await expect(context.getByRole('menuitem',{name,exact:true})).toBeVisible();
   const count=await page.getByRole('tab').count();await context.getByRole('menuitem',{name:label,exact:true}).click();
   await expect(page.getByRole('tab')).toHaveCount(count+1);await ready();await expect(page.locator('#sessionKind')).toHaveText(label);
   await parent.click();await ready();await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');
   await expect(row).toHaveClass(/selected/);await expect(page.locator('#pathA')).toHaveValue(roots[0]);await expect(page.locator('#pathB')).toHaveValue(roots[1]);
   await expect(page.locator('#dirtyIndicator')).toBeVisible();
  }
  for(const root of roots)assert.equal(await fs.readFile(path.join(root,'keep.txt'),'utf8'),'preserved');
  console.log('New comparison context passed: all 13 types, nested keyboard menu, new tabs, preserved parent roots, selection and unsaved state.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
