'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {zip}=require('./archive-fixture.cjs'),{parseArchive}=require('../src/archive-core.cjs');
const utf8=text=>Buffer.concat([Buffer.from([239,187,191]),Buffer.from(text)]),utf16=text=>Buffer.concat([Buffer.from([255,254]),Buffer.from(text,'utf16le')]);
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-archive-entry-edit-')));let app,page;
 try{
  const left=path.join(root,'left.zip'),right=path.join(root,'right.zip'),output=path.join(root,'output.zip'),session=path.join(root,'child.fcompare'),disk=path.join(root,'saved.txt');
  const initialA={'nested/deep/note.txt':utf8('left\r\noriginal\r\n'),'only.txt':Buffer.from('only left\n')},initialB={'nested/deep/note.txt':utf16('right\r\noriginal\r\n')};
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
  const openEntry=async name=>{for(const ancestor of ['nested','nested/deep'])if(name.startsWith(ancestor+'/')&&!await row(name).isVisible()){const folder=row(ancestor);await expect(folder).toBeVisible();{const expand=folder.getByRole('button',{name:'Expand '+ancestor.split('/').pop(),exact:true}).first();if(await expand.isVisible())await expand.click();}}await row(name).dblclick();await expect(page.locator('#sessionKind')).toHaveText('Text Compare');return active();};
  const apply=async side=>{await page.locator('#applyArchiveEntry'+side).click();await expect(review).toBeVisible();await expect(review.locator('[data-apply]')).toBeEnabled();await review.locator('[data-apply]').click();await expect(review).not.toBeVisible();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');};
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#welcome [data-command="new:archive-compare"]').click();await button('Open left archive').click();await button('Open right archive').click();const parent=await active();
  const child=await openEntry('nested/deep/note.txt');await expect(page.locator('#textA')).toHaveValue('left\noriginal\n');await expect(page.locator('#textB')).toHaveValue('right\noriginal\n');await expect(page.locator('#encodingA')).toHaveValue('utf8');await expect(page.locator('#encodingB')).toHaveValue('utf16le');
  await page.getByLabel('Wrap',{exact:true}).check();await page.locator('#textA').fill('left\nEDITED café\n');await page.locator('#textB').fill('right\nEDITED 日本語\n');
  await page.locator('#applyArchiveEntryA').click();await expect(review).toBeVisible();await expect(review.locator('[data-summary]')).toContainText('note.txt');if(process.env.FC_ARCHIVE_ENTRY_SCREENSHOT){await page.screenshot({path:process.env.FC_ARCHIVE_ENTRY_SCREENSHOT});const theme=await page.locator('body').getAttribute('data-theme');await page.evaluate(()=>document.body.dataset.theme='dark');await page.screenshot({path:process.env.FC_ARCHIVE_ENTRY_SCREENSHOT.replace(/\.png$/,'-dark.png')});await page.evaluate(theme=>document.body.dataset.theme=theme||'light',theme);}await review.locator('[data-cancel]').click();await expect(review).not.toBeVisible();
  await switchTo(parent);await exportCheck('left',initialA);await exportCheck('right',initialB);await switchTo(child);
  await apply('A');assert.equal(await active(),child);await expect(page.locator('#textA')).toHaveAttribute('wrap','soft');await expect(page.locator('#textB')).toHaveAttribute('wrap','soft');
  const editedA={...initialA,'nested/deep/note.txt':utf8('left\r\nEDITED café\r\n')},editedB={...initialB,'nested/deep/note.txt':utf16('right\r\nEDITED 日本語\r\n')};
  await apply('B');await switchTo(parent);await exportCheck('left',editedA);await exportCheck('right',editedB);
  await menu('undo');await expect(host.getByRole('button',{name:'Redo archive edit',exact:true,includeHidden:true})).toBeEnabled();await exportCheck('right',initialB);await exportCheck('left',editedA);
  await menu('redo');await expect(host.getByRole('button',{name:'Redo archive edit',exact:true,includeHidden:true})).toBeDisabled();await exportCheck('right',editedB);
  await switchTo(child);await page.locator('#textA').fill('left\nSECOND\n');await apply('A');editedA['nested/deep/note.txt']=utf8('left\r\nSECOND\r\n');assert.equal(await active(),child);await expect(page.locator('#textA')).toHaveAttribute('wrap','soft');
  // Save file remains an explicit native disk operation, independent of archive staging.
  await destination(disk);await page.locator('#saveA').click();await expect.poll(()=>fs.readFile(disk).then(b=>b.toString('hex')).catch(()=>'' )).toBe(editedA['nested/deep/note.txt'].toString('hex'));
  await switchTo(parent);await exportCheck('left',editedA);await switchTo(child);
  await destination(session);await menu('save-session');await expect(page.locator('#dirtyIndicator')).toBeHidden();const saved=JSON.parse(await fs.readFile(session,'utf8'));
  assert.equal(JSON.stringify(saved).includes(parent),false);assert.equal(Object.hasOwn(saved,'archiveEntryLink'),false);assert.equal(Object.hasOwn(saved,'archiveEntryRuntime'),false);
  await queue(session);await menu('open-session');await expect(page.locator('#textA')).toHaveValue('left\nSECOND\n');await expect(page.locator('#applyArchiveEntryA')).not.toBeVisible();await expect(page.locator('#applyArchiveEntryB')).not.toBeVisible();
  // A one-sided entry never offers an update into a missing opposite archive entry.
  await switchTo(parent);const only=await openEntry('only.txt');await expect(page.locator('#applyArchiveEntryA')).toBeEnabled();await expect(page.locator('#applyArchiveEntryB')).toBeDisabled();
  // Replacing an archive invalidates a child's captured input even with the same entry name.
  await switchTo(parent);await queue(left);await button('Open left archive').click();await expect(row('only.txt')).toBeVisible();await switchTo(only);await page.locator('#textA').fill('stale edit');await page.locator('#applyArchiveEntryA').click();
  await expect(review).toBeVisible();await review.locator('[data-apply]').click();await expect(review.locator('[data-error]')).toContainText(/changed|stale|reopen/i);await review.locator('[data-cancel]').click();await expect(review).not.toBeVisible();await switchTo(parent);await exportCheck('left',initialA);
  await openEntry('nested/deep/note.txt');await queue(disk);await page.locator('#openA').click();await expect(page.locator('#textA')).toHaveValue('left\nSECOND\n');await expect(page.locator('#applyArchiveEntryA')).toBeDisabled();await switchTo(parent);const fresh=await openEntry('nested/deep/note.txt');await switchTo(parent);await menu('close-session');if(await page.locator('#unsavedDialog').isVisible())await page.locator('#discardSession').click();await expect(page.locator('#sessionTabs [data-session-id="'+parent+'"]')).toHaveCount(0);await switchTo(fresh);await expect(page.locator('#applyArchiveEntryA')).toBeDisabled();await expect(page.locator('#applyArchiveEntryB')).toBeDisabled();
  assert.deepEqual(await fs.readFile(left),originalA);assert.deepEqual(await fs.readFile(right),originalB);assert.deepEqual(errors,[]);
  console.log('Archive entry text editing passed: review cancel/apply, exact UTF-8 BOM and UTF-16LE CRLF exports, parent undo/redo, repeat apply, child focus/wrap, disk Save as, missing side, stale reload, closed parent and session runtime isolation.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
