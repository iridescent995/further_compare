'use strict';
const {selectFolderOption,clickFolderOption}=require('./folder-options-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');

(async()=>{
  const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-recursive-')));
  let app,page;
  try {
    const left=path.join(temp,'left'),right=path.join(temp,'right');
    for(const root of [left,right]){
      await fs.mkdir(path.join(root,'alpha','deep'),{recursive:true});
      await fs.writeFile(path.join(root,'root.txt'),'root\n');
      await fs.writeFile(path.join(root,'alpha','equal.txt'),'equal\n');
      await fs.writeFile(path.join(root,'alpha','deep','changed.txt'),root===left?'left\n':'right\n');
    }
    await fs.writeFile(path.join(left,'alpha','only-left.txt'),'left only\n');
    await fs.writeFile(path.join(right,'alpha','deep','only-right.txt'),'right only\n');
    await fs.writeFile(path.join(left,'collision'),'a file\n');
    await fs.mkdir(path.join(right,'collision','nested'),{recursive:true});
    await fs.writeFile(path.join(right,'collision','nested','child.txt'),'directory child\n');
    const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
    app=await electron.launch({...process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]},env});
    page=await app.firstWindow();page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await app.evaluate(({dialog},roots)=>{let index=0;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots[index++]]});},[left,right]);
    const row=(side,name)=>page.locator('#folderRows'+side+' .folder-entry[data-path="'+name+'"]');
    const paths=side=>page.locator('#folderRows'+side+' .folder-entry').evaluateAll(rows=>rows.map(row=>row.dataset.path));
    const complete=async()=>{await expect(page.locator('#folderExpandStatus')).toContainText(/^All files ·/);await expect(page.locator('#folderStop')).toBeDisabled();};
    await page.locator('#welcome [data-command="new:folder-compare"]').click();
    await page.locator('#sessionName').fill('Recursive parent');
    await page.locator('#openA').click();await page.locator('#openB').click();
    await expect(row('A','alpha')).toHaveAttribute('aria-expanded','false');
    await expect(row('A','alpha/equal.txt')).toHaveCount(0);
    await app.evaluate(({Menu})=>{const find=menu=>{for(const item of menu.items){if(item.label==='All Files (Recursive)')return item;if(item.submenu){const found=find(item.submenu);if(found)return found;}}};const item=find(Menu.getApplicationMenu());if(!item)throw Error('Missing recursive view menu');item.click();});await complete();
    await expect(row('A','alpha/equal.txt')).toHaveClass(/\bequal\b/);
    await expect(row('A','alpha/deep/changed.txt')).toHaveClass(/\bchanged\b/);
    await expect(row('A','alpha/only-left.txt')).toHaveClass(/\bleft\b/);
    await expect(row('B','alpha/deep/only-right.txt')).toHaveClass(/\bright\b/);
    await expect(row('A','collision')).toHaveClass(/\bconflict\b/);
    await expect(row('B','collision/nested/child.txt')).toBeVisible();
    await expect(row('A','alpha/deep/changed.txt').locator('.entry-label')).toHaveText('alpha/deep/changed.txt');
    await selectFolderOption(page,'folderSort','path');
    const sorted=await paths('A');assert.deepEqual(await page.locator('#folderRowsB .folder-entry').evaluateAll(rows=>rows.map(row=>row.dataset.id)),await page.locator('#folderRowsA .folder-entry').evaluateAll(rows=>rows.map(row=>row.dataset.id)),'Both panes must use the same logical row order');
    assert.ok(sorted.indexOf('alpha/deep/changed.txt')<sorted.indexOf('alpha/equal.txt'),'Path sort must order nested paths');
    await page.locator('#folderSearch').fill('only-right');
    await expect(page.locator('#folderRowsB .folder-entry')).toHaveCount(1);
    await expect(row('B','alpha/deep/only-right.txt')).toBeVisible();
    await page.locator('#folderSearch').fill('');
    await row('A','alpha/deep/changed.txt').click();
    await expect(row('A','alpha/deep/changed.txt')).toHaveAttribute('aria-selected','true');
    await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');
    await row('A','alpha/equal.txt').click({modifiers:[process.platform==='darwin'?'Meta':'Control']});
    await expect(page.locator('#folderRowsA .selected')).toHaveCount(2);
    await row('A','alpha/deep/changed.txt').dblclick();
    await expect(page.locator('#sessionKind')).toHaveText('Text Compare');
    await expect(page.locator('#textA')).toHaveValue('left\n');
    await expect(page.locator('#textB')).toHaveValue('right\n');
    await page.locator('#backToFolder').click();
    await expect(page.locator('#folderViewMode')).toHaveValue('recursive');
    await expect(row('A','alpha/deep/changed.txt')).toBeVisible();
    await selectFolderOption(page,'folderViewMode','tree');
    await expect(row('A','alpha')).toHaveAttribute('aria-expanded','false');
    await expect(row('A','alpha/deep/changed.txt')).toHaveCount(0);
    await selectFolderOption(page,'folderViewMode','recursive');await complete();
    // Refresh must walk again rather than reusing rows from directories that disappeared.
    await fs.rm(path.join(left,'alpha','deep'),{recursive:true});
    await fs.rm(path.join(right,'alpha','deep'),{recursive:true});
    await fs.mkdir(path.join(left,'new-dir'),{recursive:true});
    await fs.writeFile(path.join(left,'new-dir','fresh.txt'),'fresh\n');
    await page.locator('#reload').click();await complete();
    await expect(row('A','alpha/deep/changed.txt')).toHaveCount(0);
    await expect(row('B','alpha/deep/only-right.txt')).toHaveCount(0);
    await expect(row('A','new-dir/fresh.txt')).toHaveClass(/\bleft\b/);
    // Delay only recursive comparison IPC, leaving UI and Stop messages responsive.
    for(const root of [left,right])for(let i=0;i<20;i++){
      await fs.mkdir(path.join(root,'many','dir'+i),{recursive:true});
      await fs.writeFile(path.join(root,'many','dir'+i,'item.txt'),'same\n');
    }
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('folders:tree-compare');
      global.recursiveCalls=0;
      ipcMain.removeHandler('folders:tree-compare');
      ipcMain.handle('folders:tree-compare',async(...args)=>{global.recursiveCalls++;await new Promise(resolve=>setTimeout(resolve,60));return original(...args);});
    });
    await page.locator('#reload').click();
    await expect(page.locator('#folderStop')).toBeEnabled();
    await page.locator('#folderStop').click();
    await expect(page.locator('#folderStop')).toBeDisabled();
    await expect(page.locator('#folderExpandStatus')).toContainText(/Partial files · stopped/);
    const afterStop=await app.evaluate(()=>global.recursiveCalls);
    await page.waitForTimeout(200);
    assert.ok((await app.evaluate(()=>global.recursiveCalls))<=afterStop+1,'Stopped traversal must not continue queuing nodes');
    await page.locator('#reload').click();await complete();
    await expect(row('B','many/dir19/item.txt')).toHaveClass(/\bequal\b/);
    const sessionFile=path.join(temp,'recursive.fcompare');
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},sessionFile);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','save-session'));
    await expect(page.locator('#dirtyIndicator')).toBeHidden();
    assert.equal(JSON.parse(await fs.readFile(sessionFile,'utf8')).options.folderView.mode,'recursive');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','open-session'));
    await expect(page.getByRole('tab',{name:/Recursive parent/})).toHaveCount(2);await complete();
    await expect(page.locator('#folderViewMode')).toHaveValue('recursive');await expect(row('B','many/dir19/item.txt')).toHaveClass(/\bequal\b/);
    await page.screenshot({path:'/private/tmp/further-folder-recursive.png'});
    assert.deepEqual(errors,[]);
    console.log('Recursive folder view passed: collapsed-tree traversal, nested hashes/colors, type conflicts, paired path sorting, filtering, click/multiselect/double-click, parent return, preserved expansion, fresh refresh and cancellable/resumable scan.');
  }finally{
    if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});
    if(app)await app.close();
    await fs.rm(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
