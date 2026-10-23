'use strict';
const {archiveMenuItem}=require('./archive-menu-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {zip}=require('./archive-fixture.cjs'),{parseArchive}=require('../src/archive-core.cjs');

(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-archive-edit-')));let app,page;
 try{
  const left=path.join(root,'left.zip'),right=path.join(root,'right.zip'),output=path.join(root,'edited.zip'),session=path.join(root,'edited.fcompare');
  const payload=Buffer.from([0,255,128,65,13,10]);
  const originalLeft=zip([{name:'change.bin',data:payload,deflate:true},{name:'only.txt',data:'left only'},{name:'nested/deep/child.txt',data:'left child'}]);
  const originalRight=zip([{name:'change.bin',data:'old'},{name:'nested/deep/child.txt',data:'right child'},{name:'remove/deep/gone.txt',data:'remove me'},{name:'keep.txt',data:'untouched'}]);
  await fs.writeFile(left,originalLeft);await fs.writeFile(right,originalRight);
  const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env,timeout:30000});
  page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({BrowserWindow,dialog,shell},files)=>{
   BrowserWindow.getAllWindows().forEach(window=>window.hide());
   global.archiveEditExternalOpens=0;shell.openPath=async()=>{global.archiveEditExternalOpens++;return '';};
   global.archiveEditFiles=[files.left,files.right];global.archiveEditSaveCancel=false;global.archiveEditSaves=0;
   dialog.showOpenDialog=async(_window,options)=>({canceled:false,filePaths:[options.title==='Open session'?files.session:global.archiveEditFiles.shift()]});
   dialog.showSaveDialog=async(_window,options)=>{global.archiveEditSaves++;global.archiveEditSuggestedName=options.defaultPath;return global.archiveEditSaveCancel?{canceled:true}:{canceled:false,filePath:options.defaultPath?.endsWith('.zip')?files.output:files.session};};
   dialog.showMessageBox=async()=>({response:1});
  },{left,right,session,output});
  const command=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#welcome [data-command="new:archive-compare"]').click();
  const host=page.locator('#archiveWorkspace'),dialog=page.locator('#archiveEditDialog');
  const row=name=>host.locator('.archive-row[data-path="'+name+'"]'),button=name=>host.getByRole('button',{name,exact:true});
  const contextAction=async(name,action)=>{await row(name).click({button:'right'});await (await archiveMenuItem(page,action)).click();};
  const reviewReady=async()=>{await expect(dialog).toBeVisible();await expect(dialog.locator('[data-apply]')).toBeEnabled();};
  const cancel=async()=>{await dialog.locator('[data-cancel]').click();await expect(dialog).not.toBeVisible();};
  const apply=async()=>{await dialog.locator('[data-apply]').click();await expect(dialog).not.toBeVisible();};
  const unchanged=async()=>{assert.deepEqual(await fs.readFile(left),originalLeft);assert.deepEqual(await fs.readFile(right),originalRight);};
  await button('Open left archive').click();await button('Open right archive').click();await expect(row('change.bin')).toHaveClass(/changed/);
  await command('editor:right');await expect.poll(()=>app.evaluate(()=>global.archiveEditExternalOpens)).toBe(1);

  // Single-click selection and Ctrl/Command multi-selection never open a comparison.
  const tabCount=await page.locator('#sessionTabs [role="tab"]').count();
  await row('change.bin').click();await row('only.txt').click({modifiers:[process.platform==='darwin'?'Meta':'Control']});
  await expect(host.locator('.archive-row.selected')).toHaveCount(2);assert.equal(await page.locator('#sessionTabs [role="tab"]').count(),tabCount);
  await host.locator('summary').filter({hasText:'Edit archive…'}).click();await button('Copy left → right…').click();await reviewReady();await expect(dialog.locator('[data-paths]')).toContainText('change.bin');await expect(dialog.locator('[data-paths]')).toContainText('only.txt');await cancel();
  await expect(row('change.bin')).toHaveClass(/changed/);await expect(row('only.txt')).toHaveClass(/left/);await unchanged();
  await contextAction('change.bin','Copy left → right…');await reviewReady();await apply();
  await expect(row('change.bin')).toHaveClass(/equal/);await expect(row('only.txt')).toHaveClass(/equal/);await unchanged();assert.equal(await app.evaluate(()=>global.archiveEditSaves),0);
  await command('editor:right');await expect(page.locator('#notice')).toContainText('Open this input from disk first');assert.equal(await app.evaluate(()=>global.archiveEditExternalOpens),1);

  // Rename and deletion review every descendant even while the source folder is collapsed.
  await contextAction('nested','Rename right…');await expect(dialog).toBeVisible();await dialog.locator('[data-new-path]').fill('moved');await dialog.locator('[data-review]').click();await reviewReady();await expect(dialog.locator('[data-paths]')).toContainText('child.txt');await cancel();await expect(row('moved')).toHaveCount(0);
  await contextAction('nested','Rename right…');await dialog.locator('[data-new-path]').fill('moved');await dialog.locator('[data-review]').click();await reviewReady();await apply();await expect(row('moved')).toBeVisible();await expect(row('nested')).toHaveClass(/left/);
  await contextAction('remove','Delete right…');await reviewReady();await expect(dialog.locator('[data-paths]')).toContainText('gone.txt');await cancel();await expect(row('remove')).toBeVisible();
  await contextAction('remove','Delete right…');await reviewReady();await apply();await expect(row('remove')).toHaveCount(0);await unchanged();

  // Saving is explicit, cancellable, and exports the current edited archive as a valid ZIP.
  await app.evaluate(()=>{global.archiveEditSaveCancel=true;});await host.locator('summary').filter({hasText:'Save archive…'}).click();await button('Save right archive…').click();await reviewReady();await apply();await expect.poll(()=>app.evaluate(()=>global.archiveEditSaves)).toBe(1);await expect(host.getByRole('button',{name:'Save right archive…',exact:true,includeHidden:true})).toBeEnabled();await assert.rejects(fs.stat(output),{code:'ENOENT'});
  await app.evaluate(()=>{global.archiveEditSaveCancel=false;});await host.locator('summary').filter({hasText:'Save archive…'}).click();await button('Save right archive…').click();await reviewReady();await apply();await expect.poll(()=>fs.stat(output).then(stat=>stat.size).catch(()=>0)).toBeGreaterThan(0);await expect(host.getByRole('button',{name:'Save right archive…',exact:true,includeHidden:true})).toBeEnabled();
  const verify=async bytes=>{const archive=parseArchive(bytes);assert.deepEqual([...archive.entries.values()].filter(entry=>entry.kind==='file').map(entry=>entry.path).sort(),['change.bin','keep.txt','moved/deep/child.txt','only.txt']);assert.deepEqual(Buffer.from(await archive.read('change.bin')),payload);assert.equal(Buffer.from(await archive.read('only.txt')).toString(),'left only');assert.equal(Buffer.from(await archive.read('moved/deep/child.txt')).toString(),'right child');assert.equal(Buffer.from(await archive.read('keep.txt')).toString(),'untouched');};
  await verify(await fs.readFile(output));await unchanged();
  await command('save-session');await expect(page.locator('#dirtyIndicator')).toBeHidden();const saved=JSON.parse(await fs.readFile(session,'utf8'));assert.equal(saved.type,'archive-compare');assert.equal(Object.hasOwn(saved.advanced.inputs.b,'diskToken'),false);await verify(Buffer.from(saved.advanced.inputs.b.data,'base64'));

  // A pending review cannot survive switching sessions or change the restored edited bytes.
  const archiveTab=page.locator('#sessionTabs [role="tab"][aria-selected="true"]');const archiveTabId=await archiveTab.evaluate(button=>button.parentElement.dataset.sessionId);
  await contextAction('keep.txt','Delete right…');await reviewReady();await command('new:text-compare');await expect(page.locator('#sessionKind')).toHaveText('Archive Compare');await expect(dialog).toBeVisible();await cancel();await command('new:text-compare');await expect(page.locator('#sessionKind')).toHaveText('Text Compare');await expect(dialog).not.toBeVisible();
  await page.locator('#sessionTabs [data-session-id="'+archiveTabId+'"] [role="tab"]').click();
  await expect(host).toBeVisible();await expect(row('keep.txt')).toBeVisible();await expect(row('moved')).toBeVisible();
  await command('open-session');await expect(host).toBeVisible();await expect(row('moved')).toBeVisible();await expect(row('remove')).toHaveCount(0);await expect(row('change.bin')).toHaveClass(/equal/);
  if(process.env.FC_ARCHIVE_EDIT_SCREENSHOT){await contextAction('keep.txt','Delete right…');await reviewReady();await page.screenshot({path:process.env.FC_ARCHIVE_EDIT_SCREENSHOT});const theme=await page.locator('body').getAttribute('data-theme');await page.evaluate(()=>document.body.dataset.theme='dark');await page.screenshot({path:process.env.FC_ARCHIVE_EDIT_SCREENSHOT.replace(/\.png$/,'-dark.png')});await page.evaluate(theme=>document.body.dataset.theme=theme||'light',theme);await cancel();}
  assert.deepEqual(errors,[]);await unchanged();
  console.log('Archive editing passed: selection, multi-file copy, rename/delete subtree review and cancellation, unchanged originals, explicit ZIP export, session restoration and reset-safe review.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
