'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const {clickFolderAction,folderContextItem}=require('./folder-context-helper.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-selected-report-')));let app,page;
 try{
  const roots=['left','right'].map(name=>path.join(temp,name));
  for(const root of roots){
   await fs.mkdir(path.join(root,'branch'),{recursive:true});
   for(const [name,value] of Object.entries({'pair.txt':'same','comma,&.txt':root===roots[0]?'left':'right','unselected.txt':'same','branch/child.txt':'same'}))await fs.writeFile(path.join(root,name),value);
  }
  await fs.writeFile(path.join(roots[1],'right-only.txt'),'right');
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
  page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));
  await app.evaluate(({dialog,ipcMain},roots)=>{
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});global.reportReads=[];
   for(const channel of ['folders:tree-list','folders:tree-compare','folders:tree-compare-selected','folders:tree-refresh-selected']){
    const original=ipcMain._invokeHandlers.get(channel);ipcMain.removeHandler(channel);
    ipcMain.handle(channel,async(...args)=>{global.reportReads.push(channel);return original(...args);});
   }
  },[...roots]);
  const row=(name,side='A')=>page.locator('#folderRows'+side+' .folder-entry[data-path="'+name+'"]');
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const settled=()=>expect(page.locator('#folderSummary')).not.toContainText('Comparing');
  const modifier=process.platform==='darwin'?'Meta':'Control';
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();
  await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  await expect(row('pair.txt')).toHaveClass(/equal/);await settled();
  await row('branch').getByRole('button').click();await ready();await expect(row('branch/child.txt')).toHaveClass(/equal/);await settled();
  await page.evaluate(()=>{
   window.__reportDownloads=[];const blobs=new Map(),create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click;
   URL.createObjectURL=blob=>{const url=create(blob);blobs.set(url,blob);return url;};
   URL.revokeObjectURL=url=>{blobs.delete(url);revoke(url);};
   HTMLAnchorElement.prototype.click=function(){const blob=blobs.get(this.href);if(this.download&&blob){const filename=this.download;window.__reportDownloads.push(blob.text().then(text=>({filename,text})));return;}return click.call(this);};
  });
  const dialog=page.locator('#folderReportDialog'),scope=page.locator('#folderReportScope');
  const nativeReport=()=>app.evaluate(({Menu})=>{
   const view=Menu.getApplicationMenu().items.find(item=>item.label==='View');
   const item=view?.submenu.items.find(item=>item.label==='Selected Entries Report…');
   if(!item)throw Error('Missing View > Selected Entries Report…');item.click();
  });
  const download=async format=>{
   await page.locator('#folderReportFormat').selectOption(format);const before=await page.evaluate(()=>window.__reportDownloads.length);
   await page.locator('#folderReportExport').click();await expect.poll(()=>page.evaluate(()=>window.__reportDownloads.length)).toBe(before+1);
   const result=await page.evaluate(index=>window.__reportDownloads[index],before);assert.ok(result.filename.endsWith('.'+(format==='text'?'txt':format)));return result.text;
  };
  const tabs=await page.getByRole('tab').count();
  await row('pair.txt').click();await row('pair.txt','B').click({modifiers:[modifier]});
  await row('comma,&.txt').click({modifiers:[modifier]});await row('right-only.txt','B').click({modifiers:[modifier]});await row('branch').click({modifiers:[modifier]});
  await row('branch').click({button:'right'});await app.evaluate(()=>{global.reportReads=[];});await clickFolderAction(page,'Selected entries report…');
  await expect(dialog).toBeVisible();await expect(scope).toHaveValue('selected');await expect(scope.locator('option[value="selected"]')).toHaveText('Selected rows (both panes)');
  const selected=JSON.parse(await download('json'));
  assert.equal(selected.scope,'selected');assert.equal(selected.statistics.entries,4);assert.equal(selected.statistics.directories,1);assert.equal(selected.statistics.files,3);
  assert.deepEqual(selected.entries.map(entry=>entry.pathA||entry.pathB).sort(),['branch','comma,&.txt','pair.txt','right-only.txt']);
  assert.equal(selected.entries.filter(entry=>entry.pathA==='pair.txt').length,1,'A pair selected in both panes must appear once');
  assert.ok(!selected.entries.some(entry=>entry.pathA==='branch/child.txt'),'Selected directories must not implicitly include even loaded descendants');
  // Programmatic UI events simulate changes behind the modal; every scope must retain its captured snapshot.
  await row('unselected.txt').dispatchEvent('click');
  await scope.selectOption('loaded');const loaded=JSON.parse(await download('json'));assert.ok(loaded.entries.some(entry=>entry.pathA==='branch/child.txt'));
  await scope.selectOption('visible');assert.ok(JSON.parse(await download('json')).entries.length>selected.entries.length);
  await scope.selectOption('selected');assert.deepEqual(JSON.parse(await download('json')),selected);
  for(const format of ['html','csv','text']){
   const text=await download(format);assert.match(text,/pair\.txt/);assert.match(text,/right-only\.txt/);assert.ok(!text.includes('child.txt'));assert.ok(!text.includes('unselected.txt'));assert.match(text,/selected/i);
   if(format==='html')assert.ok(text.includes('comma,&amp;.txt'),'Selected report must escape HTML filenames');
   if(format==='csv')assert.ok(text.includes('"comma,&.txt"'),'Selected report must quote CSV filenames');
  }
  await page.locator('#folderReportClose').click();await expect(dialog).toBeHidden();
  await nativeReport();await expect(dialog).toBeVisible();await expect(scope).toHaveValue('selected');
  assert.deepEqual(JSON.parse(await download('json')).entries.map(entry=>entry.pathA),['unselected.txt'],'New report must capture the new selection');
  await page.locator('#folderReportClose').click();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','folder:clear-selection'));await ready();
  await expect(page.locator('#folderRowsA [aria-selected="true"],#folderRowsB [aria-selected="true"]')).toHaveCount(0);
  await page.locator('#folderRowsA').dispatchEvent('contextmenu',{button:2,bubbles:true,clientX:100,clientY:200});
  await expect(await folderContextItem(page,'Selected entries report…')).toBeDisabled();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await nativeReport();await expect(page.locator('#notice')).toBeVisible();await expect(dialog).toBeHidden();
  assert.deepEqual(await app.evaluate(()=>global.reportReads),[],'Reporting must not read or compare any folder nodes');
  assert.equal(await page.getByRole('tab').count(),tabs);assert.deepEqual(errors,[]);
  console.log('Selected folder report passed: native/context entry points, union/dedup of both panes, exact selection without descendants, frozen scopes, four export formats, empty-selection guards, no reads or tabs.');
 }finally{
  if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});
  if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
