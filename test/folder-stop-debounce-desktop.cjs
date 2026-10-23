'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-stop-debounce-')));let app,page;
 try{
  const roots=[path.join(temp,'left'),path.join(temp,'right')];
  for(const [index,root] of roots.entries()){await fs.mkdir(root);await fs.writeFile(path.join(root,'example.txt'),'side '+index);}
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
  page=await app.firstWindow();page.setDefaultTimeout(10000);
  await app.evaluate(({dialog,ipcMain},roots)=>{
   let i=0;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots[i++]]});
   const original=ipcMain._invokeHandlers.get('folders:tree-compare');ipcMain.removeHandler('folders:tree-compare');global.debounceCompareCalls=0;
   ipcMain.handle('folders:tree-compare',(...args)=>{global.debounceCompareCalls++;return original(...args);});
  },roots);
  await page.locator('#welcome [data-command="new:folder-compare"]').click();
  await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');
  await page.locator('#openA').click();
  await expect.poll(()=>app.evaluate(()=>global.debounceCompareCalls)).toBeGreaterThan(0);
  await expect(page.locator('#folderStop')).toBeDisabled();
  await app.evaluate(()=>{global.debounceCompareCalls=0;});
  // The bundled callback is minified. All three 80 ms timers in app.js schedule
  // compareVisibleFolders. Hold this narrow debounce window without altering IPC.
  await page.evaluate(()=>{
   const original=window.setTimeout.bind(window);window.debounceHeld=[];
   window.setTimeout=(callback,delay,...args)=>{
    if(delay===80&&typeof callback==='function'){
     const id=original(()=>{},600000);window.debounceHeld.push({callback,args,id});return id;
    }
    return original(callback,delay,...args);
   };
   window.releaseDebounce=async()=>{const held=window.debounceHeld.splice(0);for(const item of held){clearTimeout(item.id);await item.callback(...item.args);}};
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
  });
  await page.locator('#openB').click();
  const row=page.locator('#folderRowsA .folder-entry[data-path="example.txt"]');
  await expect(row).toBeVisible();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  await expect.poll(()=>page.evaluate(()=>window.debounceHeld.length)).toBeGreaterThan(0);
  assert.equal(await app.evaluate(()=>global.debounceCompareCalls),0,'Comparison must still be queued');
  await expect(page.locator('#folderStop')).toBeEnabled();
  await page.locator('#folderStop').click();await expect(page.locator('#folderStop')).toBeDisabled();
  await page.evaluate(()=>window.releaseDebounce());
  assert.equal(await app.evaluate(()=>global.debounceCompareCalls),0,'Stopped debounce callbacks must not invoke comparison');
  await expect(row).toBeVisible();await expect(page.locator('#folderRowsB .folder-entry[data-path="example.txt"]')).toBeVisible();
  await expect(page.locator('#folderStop')).toBeDisabled();
  console.log('Folder Stop debounce passed: queued comparison is stoppable before IPC, released callbacks stay cancelled, and both rows remain.');
 }finally{
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
  await fs.rm(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
