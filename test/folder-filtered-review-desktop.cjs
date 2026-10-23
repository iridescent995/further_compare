'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-review-scope-')));let app,page;
 try{
  const left=path.join(base,'left'),right=path.join(base,'right');
  for(const root of [left,right])await fs.mkdir(root);
  const write=(root,name,text)=>fs.writeFile(path.join(root,name),text);
  await write(left,'update.txt','new');await write(right,'update.txt','old');
  await write(left,'hidden.bak','source backup');await write(right,'hidden.bak','target backup');
  await write(right,'orphan.txt','delete');await write(right,'orphan.bak','retain');
  const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[process.cwd()]}),env});
  page=await app.firstWindow();page.setDefaultTimeout(20000);
  await app.evaluate(({BrowserWindow,dialog},roots)=>{BrowserWindow.getAllWindows().forEach(w=>w.hide());globalThis.reviewRoots=roots;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[globalThis.reviewRoots.shift()]});dialog.showMessageBox=async()=>({response:1});},[left,right,left,right]);
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  for(const type of ['folder-merge','folder-sync']){
   if(type==='folder-merge')await page.locator('#welcome [data-command="new:folder-merge"]').click();
   else await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','new:folder-sync'));
   await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
   await page.locator('#folderExclude').fill('*.bak');
   await page.locator('#folderRowsA [data-path="update.txt"]').click();
   if(type==='folder-sync')await page.locator('#folderRowsB [data-path="orphan.txt"]').click({modifiers:['ControlOrMeta']});
   await page.locator('#previewPlan').click();await expect(page.locator('#planDialog')).toBeVisible();
   await expect(page.locator('#planDescription')).toContainText('exclude *.bak');
   await expect(page.locator('#planOperations')).not.toContainText('.bak');
   if(type==='folder-merge'){
    await expect(page.locator('#planOperations')).toContainText('update.txt');await page.locator('#cancelPlan').click();
   }else{
    await expect(page.locator('#planOperations')).toContainText('orphan.txt');
    await page.locator('#applyPlan').click();await expect(page.locator('#planDialog')).toBeHidden();await ready();
    assert.equal(await fs.readFile(path.join(right,'update.txt'),'utf8'),'new');
    await assert.rejects(()=>fs.access(path.join(right,'orphan.txt')),{code:'ENOENT'});
   }
  }
  assert.equal(await fs.readFile(path.join(right,'hidden.bak'),'utf8'),'target backup');
  assert.equal(await fs.readFile(path.join(right,'orphan.bak'),'utf8'),'retain');
  console.log('Filtered review UI passed: merge and sync scope, selected copy/deletion, excluded target retention.');
 }finally{if(page)await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
