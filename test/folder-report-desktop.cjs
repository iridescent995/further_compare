'use strict';
const {selectFolderOption,clickFolderOption}=require('./folder-options-helper.cjs');
const {clickFolderAction}=require('./folder-context-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');

(async()=>{
  const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-folder-report-')));
  let app,page;
  try {
    const left=path.join(temp,'left'),right=path.join(temp,'right');
    for(const root of [left,right]){
      await fs.mkdir(path.join(root,'nested'),{recursive:true});
      for(const [name,value] of Object.entries({'empty.txt':'','equal.txt':'same','changed.txt':root===left?'AAAA':'BBBB','comma,name.txt':'comma','nested/hidden.txt':'nested'})){
        await fs.writeFile(path.join(root,name),value);
        await fs.utimes(path.join(root,name),1700000000,1700000000);
      }
    }
    await fs.writeFile(path.join(left,'ampersand&.txt'),'left only');
    const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
    app=await electron.launch({...process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]},env});
    page=await app.firstWindow();page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await app.evaluate(({dialog},roots)=>{let index=0;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots[index++]]});},[left,right]);
    await page.locator('#welcome [data-command="new:folder-compare"]').click();
    await page.locator('#openA').click();await page.locator('#openB').click();
    const row=name=>page.locator('#folderRowsA .folder-entry').filter({has:page.locator('.entry-label',{hasText:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})});
    await expect(row('changed.txt')).toHaveClass(/\bchanged\b/);
    await expect(row('nested')).toHaveAttribute('aria-expanded','false');
    // Intercept browser-generated report downloads without writing to the user's Downloads folder.
    await page.evaluate(()=>{
      window.__reportDownloads=[];const blobs=new Map();
      const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click;
      URL.createObjectURL=blob=>{const url=create(blob);blobs.set(url,blob);return url;};
      URL.revokeObjectURL=url=>{blobs.delete(url);revoke(url);};
      HTMLAnchorElement.prototype.click=function(){const blob=blobs.get(this.href);if(this.download&&blob){const filename=this.download;window.__reportDownloads.push(blob.text().then(text=>({filename,text,type:blob.type})));return;}return click.call(this);};
    });
    const dialog=page.locator('#folderReportDialog'),scope=page.locator('#folderReportScope');
    const open=async()=>{await clickFolderOption(page,'folderReport');await expect(dialog).toBeVisible();};
    const close=async()=>{await page.locator('#folderReportClose').click();await expect(dialog).toBeHidden();};
    const command=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
    const download=async format=>{
      if(!await dialog.isVisible())await open();
      await page.locator('#folderReportFormat').selectOption(format);
      const before=await page.evaluate(()=>window.__reportDownloads.length);
      await page.locator('#folderReportExport').click();
      await expect.poll(()=>page.evaluate(()=>window.__reportDownloads.length)).toBe(before+1);
      const result=await page.evaluate(index=>window.__reportDownloads[index],before);
      assert.ok(result.filename.endsWith('.'+(format==='text'?'txt':format)),result.filename);
      assert.ok(result.text.length>0,'Report must not be empty');return result;
    };
    await open();await expect(scope).toHaveValue('visible');
    await scope.selectOption('loaded');
    await expect(page.locator('#folderReportCoverage')).toContainText(/loaded|partial|tree/i);
    const collapsed=JSON.parse((await download('json')).text);
    assert.ok(!JSON.stringify(collapsed).includes('nested/hidden.txt'),'Collapsed nodes must not be reported as compared');
    assert.equal(collapsed.scope,'loaded');assert.equal(collapsed.scan.state,'loaded');
    assert.equal(collapsed.statistics.entries,6);assert.equal(collapsed.statistics.files,5);
    const empty=collapsed.entries.find(entry=>entry.pathA==='empty.txt');
    assert.equal(empty.sizeA,0);assert.equal(empty.sizeB,0);assert.equal(empty.status,'equal');
    if(await dialog.isVisible())await close();

    await selectFolderOption(page,'folderViewMode','recursive');
    await expect(page.locator('#folderExpandStatus')).toContainText(/^All files ·/);
    await expect(page.locator('#folderStop')).toBeDisabled();
    await page.locator('#folderSearch').fill('changed.txt');
    await expect(page.locator('#folderRowsA .folder-entry')).toHaveCount(1);
    await command('folder:report');await expect(dialog).toBeVisible();await scope.selectOption('visible');
    const filtered=JSON.parse((await download('json')).text);
    assert.deepEqual(filtered.entries.map(entry=>entry.pathA),['changed.txt']);
    assert.equal(filtered.statistics.entries,1);assert.equal(filtered.statistics.different,1);assert.equal(filtered.scan.state,'complete');
    // A modal captures a consistent snapshot. UI changes behind it must not change its visible rows.
    if(!await dialog.isVisible())await open();
    await page.evaluate(()=>{const input=document.getElementById('folderSearch');input.value='equal.txt';input.dispatchEvent(new Event('input',{bubbles:true}));});
    await scope.selectOption('loaded');
    const loaded=JSON.parse((await download('json')).text);
    assert.ok(loaded.entries.some(entry=>entry.pathA==='nested/hidden.txt'));
    assert.ok(loaded.statistics.entries>filtered.statistics.entries);assert.equal(loaded.statistics.files,6);assert.equal(loaded.scan.state,'complete');
    if(!await dialog.isVisible())throw Error('Report dialog must remain open for scope/format export changes');
    await scope.selectOption('visible');
    const frozen=JSON.parse((await download('json')).text);
    assert.deepEqual(frozen,filtered,'Changing scope must use the captured rows and metadata');
    await close();
    await page.locator('#folderSearch').fill('');
    await selectFolderOption(page,'folderCompareMode','size');
    await expect(row('changed.txt')).toHaveClass(/\bequal\b/);
    await expect(page.locator('#folderStop')).toBeDisabled();
    await row('changed.txt').click({button:'right'});
    await clickFolderAction(page,'Comparison report…');
    await expect(dialog).toBeVisible();await scope.selectOption('loaded');
    await expect(page.locator('#folderReportSummary')).toContainText(/metadata/i);
    const metadata=JSON.parse((await download('json')).text);
    assert.equal(metadata.rules.mode,'size');assert.equal(metadata.statistics.metadataMatches,5);
    assert.equal(metadata.statistics.contentMatches,0);assert.equal(metadata.statistics.leftOnly,1);
    assert.equal(metadata.entries.find(entry=>entry.pathA==='changed.txt').comparison,'metadata');
    for(const format of ['html','csv','text']){
      const result=await download(format);
      assert.match(result.text,/metadata/i,'Metadata matches must not be presented as verified equal bytes');
      assert.match(result.text,/size/i,'Report must identify its comparison rule');
      assert.match(result.text,/nested\/hidden\.txt/);
      if(format==='html'){
        assert.ok(result.text.includes('ampersand&amp;.txt'),'HTML paths must be escaped');
        assert.ok(!result.text.includes('ampersand&.txt'),'Raw ampersands must not appear in HTML paths');
      }
      if(format==='csv')assert.ok(result.text.includes('"comma,name.txt"'),'CSV must quote comma-bearing paths');
    }
    await page.screenshot({path:'/private/tmp/further-folder-report.png'});
    await close();await selectFolderOption(page,'folderViewMode','tree');
    await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers.get('folders:tree-compare');ipcMain.removeHandler('folders:tree-compare');ipcMain.handle('folders:tree-compare',async(...args)=>{await new Promise(resolve=>setTimeout(resolve,500));return original(...args);});});
    await selectFolderOption(page,'folderViewMode','recursive');await expect(page.locator('#folderStop')).toBeEnabled();
    await page.locator('#folderStop').click();await open();await expect(page.locator('#folderReportCoverage')).toContainText('Partial scan');
    const stopped=JSON.parse((await download('json')).text);assert.equal(stopped.scan.state,'partial');
    await page.waitForTimeout(650);assert.equal(JSON.parse((await download('json')).text).scan.state,'partial','A late node result cannot upgrade a stopped report');

    assert.deepEqual(errors,[]);
    console.log('Folder report desktop passed: collapsed coverage, recursive reports, visible/loaded scopes, frozen snapshots, metadata labeling, all export formats, path escaping, native/context entry points.');
  } finally {
    if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});
    if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
