'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {zip}=require('./archive-fixture.cjs'),{parseArchive}=require('../src/archive-core.cjs');

(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-archive-binary-entry-')));let app,page;
 try{
  const left=path.join(root,'left.zip'),right=path.join(root,'right.zip'),output=path.join(root,'output.zip'),session=path.join(root,'child.fcompare'),disk=path.join(root,'saved.bin');
  const initialA={'nested/deep/data.bin':Buffer.from([0,255,2,3,128]),'only.bin':Buffer.from([0,254,129])},initialB={'nested/deep/data.bin':Buffer.from([0,255,9,3,128])};
  const originalA=zip(Object.entries(initialA).map(([name,data])=>({name,data,deflate:true}))),originalB=zip(Object.entries(initialB).map(([name,data])=>({name,data,deflate:true})));
  await fs.writeFile(left,originalA);await fs.writeFile(right,originalB);
  const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env,timeout:30000});
  page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({BrowserWindow,dialog},files)=>{
   BrowserWindow.getAllWindows().forEach(window=>window.hide());global.entryFiles=[files.left,files.right];global.entryDestination=files.output;
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.entryFiles.shift()]});
   dialog.showSaveDialog=async()=>({canceled:false,filePath:global.entryDestination});dialog.showMessageBox=async()=>({response:1});
  },{left,right,output});
  const menu=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  const destination=file=>app.evaluate(({},file)=>{global.entryDestination=file;},file),queue=file=>app.evaluate(({},file)=>{global.entryFiles.push(file);},file);
  const active=()=>page.locator('#sessionTabs [role="tab"][aria-selected="true"]').evaluate(el=>el.parentElement.dataset.sessionId);
  const switchTo=async id=>{await page.locator('#sessionTabs [data-session-id="'+id+'"] [role="tab"]').click();await expect(page.locator('#sessionTabs [data-session-id="'+id+'"] [role="tab"]')).toHaveAttribute('aria-selected','true');await expect(page.locator('body')).toHaveAttribute('aria-busy','false');};
  const host=page.locator('#archiveWorkspace'),review=page.locator('#archiveEntryEditDialog'),archiveReview=page.locator('#archiveEditDialog');
  const row=name=>host.locator('.archive-row[data-path="'+name+'"]');
  const button=name=>host.getByRole('button',{name,exact:true});
  const exportCheck=async(side,expected)=>{
   await destination(output);await fs.rm(output,{force:true});await host.locator('summary').filter({hasText:'Save archive…'}).click();await button('Save '+side+' archive…').click();
   await expect(archiveReview.locator('[data-apply]')).toBeEnabled();await archiveReview.locator('[data-apply]').click();await expect(archiveReview).not.toBeVisible();
   await expect.poll(()=>fs.stat(output).then(s=>s.size).catch(()=>0)).toBeGreaterThan(0);
   await expect(host.getByRole('button',{name:'Save '+side+' archive…',exact:true,includeHidden:true})).toBeEnabled();
   const archive=parseArchive(await fs.readFile(output));assert.deepEqual([...archive.entries.values()].filter(e=>e.kind==='file').map(e=>e.path).sort(),Object.keys(expected).sort());
   for(const [name,data] of Object.entries(expected))assert.deepEqual(Buffer.from(await archive.read(name)),data,name);
  };
  const openEntry=async name=>{for(const ancestor of ['nested','nested/deep'])if(name.startsWith(ancestor+'/')&&!await row(name).isVisible()){const folder=row(ancestor);await expect(folder).toBeVisible();{const expand=folder.getByRole('button',{name:'Expand '+ancestor.split('/').pop(),exact:true}).first();if(await expand.isVisible())await expand.click();}}await row(name).dblclick();await expect(page.locator('#sessionKind')).toHaveText('Binary Compare');return active();};
  const apply=async side=>{await page.locator('#applyBinaryArchiveEntry'+side).click();await expect(review).toBeVisible();await expect(review.locator('[data-apply]')).toBeEnabled();await review.locator('[data-apply]').click();await expect(review).not.toBeVisible();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');};
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#welcome [data-command="new:archive-compare"]').click();await button('Open left archive').click();await button('Open right archive').click();const parent=await active();
  const child=await openEntry('nested/deep/data.bin');
  const binaryButton=name=>page.getByRole('button',{name,exact:true});
  const edit=async value=>{await page.getByLabel('Byte offset (hex)',{exact:true}).fill('2');await page.getByLabel('Right byte (hex)',{exact:true}).fill(value);await binaryButton('Apply byte').click();};
  const saveBytes=async expected=>{await destination(disk);await fs.rm(disk,{force:true});await binaryButton('Save result').click();await expect.poll(()=>fs.readFile(disk).then(b=>[...b]).catch(()=>null)).toEqual([...expected]);};
  await expect(page.locator('#applyBinaryArchiveEntryB')).toBeEnabled();await edit('aa');
  const editedB={'nested/deep/data.bin':Buffer.from([0,255,170,3,128])};
  await page.locator('#applyBinaryArchiveEntryB').click();await expect(review).toBeVisible();await expect(review.locator('[data-summary]')).toContainText('data.bin');
  if(process.env.FC_ARCHIVE_BINARY_SCREENSHOT){await page.screenshot({path:process.env.FC_ARCHIVE_BINARY_SCREENSHOT});const theme=await page.locator('body').getAttribute('data-theme');await page.evaluate(()=>document.body.dataset.theme='dark');await page.screenshot({path:process.env.FC_ARCHIVE_BINARY_SCREENSHOT.replace(/\.png$/,'-dark.png')});await page.evaluate(theme=>document.body.dataset.theme=theme||'light',theme);}
  await review.locator('[data-cancel]').click();await expect(review).not.toBeVisible();await switchTo(parent);await exportCheck('right',initialB);await switchTo(child);
  await apply('B');assert.equal(await active(),child);await expect(page.locator('#sessionKind')).toHaveText('Binary Compare');await saveBytes(editedB['nested/deep/data.bin']);
  await switchTo(parent);await exportCheck('right',editedB);await exportCheck('left',initialA);
  await menu('undo');await expect(host.getByRole('button',{name:'Redo archive edit',exact:true,includeHidden:true})).toBeEnabled();await exportCheck('right',initialB);
  await menu('redo');await expect(host.getByRole('button',{name:'Redo archive edit',exact:true,includeHidden:true})).toBeDisabled();await exportCheck('right',editedB);
  // A fresh child has local binary history; applying must not clear that history.
  const repeat=await openEntry('nested/deep/data.bin');await edit('bb');await apply('B');await binaryButton('Undo edit').click();await saveBytes(editedB['nested/deep/data.bin']);await apply('B');
  await binaryButton('Next difference').click();await binaryButton('Copy difference to right').click();await saveBytes(initialA['nested/deep/data.bin']);await apply('B');assert.equal(await active(),repeat);
  await switchTo(parent);await exportCheck('right',{'nested/deep/data.bin':initialA['nested/deep/data.bin']});await switchTo(repeat);
  // Persisted sessions contain bytes, but never runtime links into another tab.
  await destination(session);await menu('save-session');await expect(page.locator('#dirtyIndicator')).toBeHidden();const saved=JSON.parse(await fs.readFile(session,'utf8'));
  assert.equal(JSON.stringify(saved).includes(parent),false);assert.equal(Object.hasOwn(saved,'archiveEntryLink'),false);assert.equal(Object.hasOwn(saved,'archiveEntryRuntime'),false);
  await queue(session);await menu('open-session');await expect(page.locator('#sessionKind')).toHaveText('Binary Compare');await expect(page.locator('#applyBinaryArchiveEntryA')).not.toBeVisible();await expect(page.locator('#applyBinaryArchiveEntryB')).not.toBeVisible();await saveBytes(initialA['nested/deep/data.bin']);
  await switchTo(parent);const only=await openEntry('only.bin');await expect(page.locator('#applyBinaryArchiveEntryA')).toBeEnabled();await expect(page.locator('#applyBinaryArchiveEntryB')).toBeDisabled();
  await queue(disk);await binaryButton('Open right').click();await edit('cc');await expect(page.locator('#applyBinaryArchiveEntryB')).toBeDisabled();
  // Replacing the parent archive invalidates previously captured entry revisions.
  await switchTo(parent);await queue(left);await button('Open left archive').click();await expect(row('only.bin')).toBeVisible();await switchTo(only);await page.locator('#applyBinaryArchiveEntryA').click();await expect(review).toBeVisible();await review.locator('[data-apply]').click();await expect(review.locator('[data-error]')).toContainText(/changed|stale|reopen/i);await review.locator('[data-cancel]').click();await expect(review).not.toBeVisible();
  await switchTo(parent);await exportCheck('left',initialA);await openEntry('nested/deep/data.bin');
  // Reopening a source, even under its original basename, severs that side's link.
  const sameName=path.join(root,'data.bin');await fs.writeFile(sameName,Buffer.from([0,255,90,3,128]));await queue(sameName);await binaryButton('Open right').click();await expect(page.locator('#applyBinaryArchiveEntryB')).toBeDisabled();await expect(page.locator('#applyBinaryArchiveEntryA')).toBeEnabled();
  assert.deepEqual(await fs.readFile(left),originalA);assert.deepEqual(await fs.readFile(right),originalB);assert.deepEqual(errors,[]);
  console.log('Archive binary entry editing passed: automatic binary routing, review cancel/apply, exact ZIP bytes, parent undo/redo, binary undo and range copy repeat apply, standalone Save result, missing/replaced sides, stale parent, runtime tab linkage and saved-session isolation.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
