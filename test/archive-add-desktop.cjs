'use strict';
const {archiveMenuItem}=require('./archive-menu-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {zip}=require('./archive-fixture.cjs'),{parseArchive}=require('../src/archive-core.cjs');
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-archive-add-')));let app,page;
 try{
  const right=path.join(root,'right.zip'),output=path.join(root,'export.zip'),session=path.join(root,'added.fcompare'),binary=path.join(root,'payload.bin'),empty=path.join(root,'empty.txt'),conflict=path.join(root,'folder');
  const payload=Buffer.from([0,255,128,65,13,10]),initial={'folder/keep.txt':Buffer.from('keep'),'folder/payload.bin':Buffer.from('old')};
  const original=zip(Object.entries(initial).map(([name,data])=>({name,data,deflate:true})));
  await fs.writeFile(right,original);await fs.writeFile(binary,payload);await fs.writeFile(empty,Buffer.alloc(0));await fs.writeFile(conflict,'file conflicts with directory');if(process.platform!=='win32'){await fs.chmod(binary,0o755);await fs.chmod(empty,0o640);}
  const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env,timeout:30000});
  page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({BrowserWindow,dialog},files)=>{
   BrowserWindow.getAllWindows().forEach(window=>window.hide());global.archiveAddNext=[files.right];global.archiveAddCancel=false;global.archiveAddSaves=0;global.archiveAddPickerOptions=[];
   dialog.showOpenDialog=async(_window,options)=>{global.archiveAddPickerOptions.push(options);return options.title==='Open session'?{canceled:false,filePaths:[files.session]}:{canceled:global.archiveAddCancel,filePaths:global.archiveAddCancel?[]:global.archiveAddNext};};
   dialog.showSaveDialog=async(_window,options)=>{global.archiveAddSaves++;return {canceled:false,filePath:options.defaultPath?.endsWith('.zip')?files.output:files.session};};
   dialog.showMessageBox=async()=>({response:1});
  },{right,session,output});
  const command=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#welcome [data-command="new:archive-compare"]').click();
  const host=page.locator('#archiveWorkspace'),dialog=page.locator('#archiveEditDialog'),row=name=>host.locator('.archive-row[data-path="'+name+'"]'),button=name=>host.getByRole('button',{name,exact:true});
  const choose=async(files,cancel=false)=>app.evaluate(({ },value)=>{global.archiveAddNext=value.files;global.archiveAddCancel=value.cancel;},{files,cancel});
  const menu=async label=>{await host.locator('summary').filter({hasText:'Edit archive…'}).click();await button(label).click();};
  const context=async(name,label)=>{await row(name).click();await row(name).click({button:'right'});await (await archiveMenuItem(page,label)).click();};
  const ready=async()=>{await expect(dialog).toBeVisible();await expect(dialog.locator('[data-apply]')).toBeEnabled();};
  const cancel=async()=>{await dialog.locator('[data-cancel]').click();await expect(dialog).toBeHidden();};
  const apply=async()=>{await dialog.locator('[data-apply]').click();await expect(dialog).toBeHidden();};
  const verify=async(bytes,expected)=>{const archive=parseArchive(bytes);assert.deepEqual([...archive.entries.values()].filter(e=>e.kind==='file').map(e=>e.path).sort(),Object.keys(expected).sort());for(const [name,data] of Object.entries(expected)){assert.deepEqual(Buffer.from(await archive.read(name)),data,name);if(process.platform!=='win32'&&name.endsWith('payload.bin')&&data.equals(payload))assert.equal(archive.entries.get(name).permissions,0o755,'Executable import '+name);if(process.platform!=='win32'&&name.endsWith('empty.txt'))assert.equal(archive.entries.get(name).permissions,0o640,'Ordinary import '+name);}};
  const exportVerify=async(side,expected)=>{await fs.rm(output,{force:true});await host.locator('summary').filter({hasText:'Save archive…'}).click();await button('Save '+side+' archive…').click();await ready();await apply();await expect.poll(()=>fs.stat(output).then(s=>s.size).catch(()=>0)).toBeGreaterThan(0);await expect(host.getByRole('button',{name:'Save '+side+' archive…',exact:true,includeHidden:true})).toBeEnabled();await verify(await fs.readFile(output),expected);};
  const undo=host.getByRole('button',{name:'Undo archive edit',exact:true,includeHidden:true}),redo=host.getByRole('button',{name:'Redo archive edit',exact:true,includeHidden:true});
  await button('Open right archive').click();await expect(row('folder')).toBeVisible();
  // Picker cancellation and review cancellation preserve the existing archive and history.
  await choose([],true);await menu('Add files to right…');await expect(dialog).toBeHidden();await expect(undo).toBeDisabled();
  await choose([binary,empty]);await context('folder','Add files to right…');await ready();await expect(dialog.locator('[data-new-path]')).toHaveValue('folder');await expect(dialog.locator('[data-paths]')).toContainText('Overwrite');await expect(dialog.locator('[data-paths]')).toContainText('folder/payload.bin');await expect(dialog.locator('[data-paths]')).toContainText('folder/empty.txt');await expect(dialog.locator('[data-summary]')).toContainText(/1.*overwrite/i);
  if(process.env.FC_ARCHIVE_ADD_SCREENSHOT){const theme=await page.locator('body').getAttribute('data-theme');await page.evaluate(()=>document.body.dataset.theme='light');await page.screenshot({path:process.env.FC_ARCHIVE_ADD_SCREENSHOT});await page.evaluate(()=>document.body.dataset.theme='dark');await page.screenshot({path:process.env.FC_ARCHIVE_ADD_SCREENSHOT.replace(/\.png$/,'-dark.png')});await page.evaluate(theme=>document.body.dataset.theme=theme||'light',theme);}
  await dialog.locator('[data-new-path]').fill('other');await expect(dialog.locator('[data-apply]')).toBeDisabled();await dialog.locator('[data-review]').click();await ready();await expect(dialog.locator('[data-paths]')).toContainText('other/payload.bin');await cancel();await expect(undo).toBeDisabled();assert.equal(await app.evaluate(()=>global.archiveAddSaves),0);
  const picker=await app.evaluate(()=>global.archiveAddPickerOptions.at(-1));assert.ok(picker.properties.includes('multiSelections'));
  await context('folder','Add files to right…');await ready();await apply();await expect(undo).toBeEnabled();assert.equal(await app.evaluate(()=>global.archiveAddSaves),0);
  const added={...initial,'folder/payload.bin':payload,'folder/empty.txt':Buffer.alloc(0)};await exportVerify('right',added);
  await menu('Undo archive edit');await expect(redo).toBeEnabled();await exportVerify('right',initial);await menu('Redo archive edit');await exportVerify('right',added);
  // A file cannot overwrite an existing directory; the invalid review cannot publish.
  await choose([conflict]);await menu('Add files to right…');await expect(dialog).toBeVisible();await dialog.locator('[data-new-path]').fill('');await dialog.locator('[data-review]').click();await expect(dialog.locator('[data-error]')).not.toBeEmpty();await expect(dialog.locator('[data-apply]')).toBeDisabled();await cancel();await exportVerify('right',added);
  // The same commands also create a new archive from arbitrary native files at its root.
  await choose([binary,empty]);await menu('Add files to left…');await ready();await dialog.locator('[data-new-path]').fill('');await dialog.locator('[data-review]').click();await ready();await apply();await expect(row('payload.bin')).toBeVisible();await expect(row('empty.txt')).toBeVisible();const newArchive={'payload.bin':payload,'empty.txt':Buffer.alloc(0)};await exportVerify('left',newArchive);
  const tabId=await page.locator('#sessionTabs [role="tab"][aria-selected="true"]').evaluate(button=>button.parentElement.dataset.sessionId);
  await command('new:text-compare');await expect(page.locator('#sessionKind')).toHaveText('Text Compare');await page.locator('#sessionTabs [data-session-id="'+tabId+'"] [role="tab"]').click();await expect(row('payload.bin')).toBeVisible();await exportVerify('right',added);await exportVerify('left',newArchive);
  await command('save-session');await expect(page.locator('#dirtyIndicator')).toBeHidden();const saved=JSON.parse(await fs.readFile(session,'utf8'));await verify(Buffer.from(saved.advanced.inputs.b.data,'base64'),added);await verify(Buffer.from(saved.advanced.inputs.a.data,'base64'),newArchive);assert.equal(saved.advanced.inputs.b.diskToken,undefined);assert.equal(saved.advanced.inputs.a.diskToken,undefined);
  await command('open-session');await expect(row('payload.bin')).toBeVisible();await expect(undo).toBeDisabled();await exportVerify('right',added);await exportVerify('left',newArchive);
  assert.deepEqual(await fs.readFile(right),original);assert.deepEqual(await fs.readFile(binary),payload);assert.deepEqual(await fs.readFile(empty),Buffer.alloc(0));assert.equal(await fs.readFile(conflict,'utf8'),'file conflicts with directory');assert.deepEqual(errors,[]);
  console.log('Archive add passed: native multiple files, binary/empty bytes, folder/root destinations, review and picker cancel, explicit overwrite, type conflict, undo/redo, new archive, unchanged sources, tab/session persistence and explicit ZIP export.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
