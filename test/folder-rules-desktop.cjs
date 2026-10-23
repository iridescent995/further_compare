'use strict';
const {openFolderOptions,selectFolderOption,clickFolderOption}=require('./folder-options-helper.cjs');
const {clickFolderAction}=require('./folder-context-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');

(async()=>{
  const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-folder-rules-')));
  let app,page;
  try {
    const left=path.join(temp,'left'),right=path.join(temp,'right');
    const stamp=1700000000;
    for(const root of [left,right]){
      await fs.mkdir(path.join(root,'nested'),{recursive:true});
      for(const prefix of ['','nested/']){
        // Equal metadata must not be mistaken for equal bytes in content mode.
        await fs.writeFile(path.join(root,prefix+'bytes.txt'),root===left?'AAAA':'BBBB');
        await fs.writeFile(path.join(root,prefix+'time.txt'),'same');
        await fs.writeFile(path.join(root,prefix+'size.txt'),root===left?'x':'yyy');
        for(const name of ['bytes.txt','time.txt','size.txt']){
          const modified=stamp+(root===right&&name==='time.txt'?2:0);
          await fs.utimes(path.join(root,prefix+name),modified,modified);
        }
      }
    }
    const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
    app=await electron.launch({...process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]},env});
    page=await app.firstWindow();page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const queue=roots=>app.evaluate(({dialog},roots)=>{
      global.rulesRoots=[...roots];dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.rulesRoots.shift()]});
    },roots);
    const row=name=>page.locator('#folderRowsA .folder-entry[data-path="'+name+'"]');
    const status=(name,value)=>expect(row(name)).toHaveClass(new RegExp('\\b'+value+'\\b'));
    const mode=page.locator('#folderCompareMode'),tolerance=page.locator('#folderTimeTolerance');
    const complete=async()=>{await expect(page.locator('#folderExpandStatus')).toContainText(/^All files ·/);await expect(page.locator('#folderStop')).toBeDisabled();};
    const command=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
    const seconds=async value=>{await openFolderOptions(page);await expect(tolerance).toBeVisible();await tolerance.fill(String(value));await tolerance.press('Tab');await page.locator('#folderOptionsDialog [data-done]').click();};
    await queue([left,right]);
    await page.locator('#welcome [data-command="new:folder-compare"]').click();
    await page.locator('#sessionName').fill('Content rules');
    await page.locator('#openA').click();await page.locator('#openB').click();
    await expect(mode).toHaveValue('content');await expect(page.locator('#folderToleranceLabel')).toHaveJSProperty('hidden',true);
    await status('bytes.txt','changed');await status('time.txt','equal');await status('size.txt','changed');
    await expect(row('nested/time.txt')).toHaveCount(0);

    await selectFolderOption(page,'folderCompareMode','size');
    await status('bytes.txt','equal');await status('time.txt','equal');await status('size.txt','changed');
    await expect(page.locator('#folderToleranceLabel')).toHaveJSProperty('hidden',true);
    await expect(page.locator('#folderRulesHint')).toContainText(/content.*not.*verified|not.*verif.*content/i);
    await selectFolderOption(page,'folderCompareMode','modified');
    await expect(page.locator('#folderToleranceLabel')).toHaveJSProperty('hidden',false);await seconds(0);
    await status('bytes.txt','equal');await status('time.txt','changed');await status('size.txt','equal');
    // Context and native tolerance controls share the existing persisted comparison rule.
    const toleranceDialog=page.getByRole('dialog',{name:'Timestamp tolerance',exact:true}),toleranceInput=toleranceDialog.getByRole('spinbutton');
    await row('time.txt').click({button:'right'});await clickFolderAction(page,'Timestamp tolerance…');
    await expect(toleranceInput).toHaveValue('0');await expect(toleranceInput).toBeFocused();
    const theme=await page.locator('body').getAttribute('data-theme');for(const value of ['light','dark']){await page.locator('body').evaluate((el,value)=>el.dataset.theme=value,value);await toleranceDialog.screenshot({path:path.join(os.tmpdir(),'further-tolerance-'+value+'.png')});}await page.locator('body').evaluate((el,value)=>el.dataset.theme=value,theme);
    for(const invalid of ['', '-1', '86401', '0.0001']){
      await toleranceInput.fill(invalid);await toleranceDialog.getByRole('button',{name:'Apply tolerance',exact:true}).click();
      await expect(toleranceDialog).toBeVisible();await expect(tolerance).toHaveValue('0');
    }
    await toleranceInput.fill('2');await toleranceDialog.getByRole('button',{name:'Apply tolerance',exact:true}).click();
    await expect(toleranceDialog).toBeHidden();await expect(tolerance).toHaveValue('2');await status('time.txt','equal');await expect(row('time.txt')).toBeFocused();
    const nativeTolerance=()=>app.evaluate(({Menu})=>{
      const find=menu=>{for(const item of menu.items){if(item.label==='Timestamp Tolerance…')return item;if(item.submenu){const found=find(item.submenu);if(found)return found;}}};
      const item=find(Menu.getApplicationMenu());if(!item)throw Error('Missing native timestamp tolerance menu');item.click();
    });
    await nativeTolerance();await expect(toleranceInput).toHaveValue('2');await toleranceInput.fill('0');await toleranceDialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(tolerance).toHaveValue('2');await expect(row('time.txt')).toBeFocused();
    await nativeTolerance();await toleranceInput.fill('0');await page.keyboard.press('Escape');await expect(tolerance).toHaveValue('2');
    await nativeTolerance();await toleranceInput.fill('1.001');await toleranceDialog.getByRole('button',{name:'Apply tolerance',exact:true}).click();await expect(tolerance).toHaveValue('1.001');await status('time.txt','changed');

    await seconds(1);await status('time.txt','changed');
    await selectFolderOption(page,'folderCompareMode','size-modified');await seconds(2);
    await status('bytes.txt','equal');await status('time.txt','equal');await status('size.txt','changed');

    // Exercise the actual native menu handler, not just the renderer control.
    await app.evaluate(({Menu})=>{
      const find=menu=>{for(const item of menu.items){if(item.label==='File Contents')return item;if(item.submenu){const result=find(item.submenu);if(result)return result;}}};
      const item=find(Menu.getApplicationMenu());if(!item)throw Error('Missing File Contents native menu');item.click();
    });
    await expect(mode).toHaveValue('content');await status('bytes.txt','changed');await status('time.txt','equal');
    await selectFolderOption(page,'folderCompareMode','size');
    await status('bytes.txt','equal');
    await row('bytes.txt').click({button:'right'});
    await clickFolderAction(page,'Compare by content');
    await expect(mode).toHaveValue('content');await status('bytes.txt','changed');

    // Recursive scanning and subsequent rule changes must re-evaluate nested rows too.
    await selectFolderOption(page,'folderViewMode','recursive');await complete();
    await status('nested/bytes.txt','changed');await status('nested/time.txt','equal');
    await selectFolderOption(page,'folderCompareMode','modified');await seconds(0);await complete();
    await status('nested/bytes.txt','equal');await status('nested/time.txt','changed');await status('nested/size.txt','equal');
    await seconds(1.5);await status('nested/time.txt','changed');await expect(tolerance).toHaveValue('1.5');await complete();await seconds(2);await status('nested/time.txt','equal');await complete();
    const sessionFile=path.join(temp,'rules.fcompare');
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},sessionFile);
    await command('save-session');
    await expect(page.locator('#dirtyIndicator')).toBeHidden();
    const saved=JSON.parse(await fs.readFile(sessionFile,'utf8'));
    assert.deepEqual(saved.options.folderRules,{mode:'modified',timeToleranceMs:2000});
    assert.equal(saved.options.folderView.mode,'recursive');

    // A new folder session starts with content rules and cannot mutate the first tab.
    await page.locator('#newTab').click();
    await page.locator('#welcome [data-command="new:folder-compare"]').click();
    await page.locator('#sessionName').fill('Independent rules');
    await queue([left,right]);await page.locator('#openA').click();await page.locator('#openB').click();
    await expect(mode).toHaveValue('content');await status('bytes.txt','changed');
    await selectFolderOption(page,'folderCompareMode','size');await status('bytes.txt','equal');
    await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
    await page.getByRole('tab',{name:/Content rules/}).click();
    await expect(mode).toHaveValue('modified');await expect(tolerance).toHaveValue('2');
    await expect(page.locator('#folderViewMode')).toHaveValue('recursive');await complete();
    await status('nested/size.txt','equal');
    await command('folder:rules-content');await expect(mode).toHaveValue('content');
    await status('nested/bytes.txt','changed');await complete();
    await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
    await page.getByRole('tab',{name:/Independent rules/}).click();
    await expect(mode).toHaveValue('size');await status('bytes.txt','equal');

    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},sessionFile);
    await command('open-session');
    await expect(page.getByRole('tab',{name:/Content rules/})).toHaveCount(2);
    await expect(mode).toHaveValue('modified');await expect(tolerance).toHaveValue('2');await complete();
    await status('nested/bytes.txt','equal');await status('nested/time.txt','equal');await status('nested/size.txt','equal');
    await page.screenshot({path:'/private/tmp/further-folder-rules.png'});
    assert.deepEqual(errors,[]);
    console.log('Folder rules desktop passed: strict content default, size/time/combined metadata results, inclusive tolerance, native/context actions, recursive rescans, saved rule restoration and tab isolation.');
  } finally {
    if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});
    if(app)await app.close();
    await fs.rm(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
