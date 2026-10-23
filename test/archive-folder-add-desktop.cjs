'use strict';
const {archiveMenuItem}=require('./archive-menu-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {zip}=require('./archive-fixture.cjs'),{parseArchive}=require('../src/archive-core.cjs');
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-archive-folder-add-')));let app,page;
 try{
  const right=path.join(root,'right.zip'),output=path.join(root,'export.zip'),source=path.join(root,'bundle'),badSource=path.join(root,'linked');
  const payload=Buffer.from([0,255,128,65,13,10]),files={'nested/payload.bin':payload,'empty.txt':Buffer.alloc(0)};
  const initial={'destination/bundle/nested/payload.bin':Buffer.from('old'),'destination/bundle/keep.txt':Buffer.from('keep'),'blocker':Buffer.from('file')};
  const original=zip(Object.entries(initial).map(([name,data])=>({name,data,deflate:true})));
  await fs.writeFile(right,original);await fs.mkdir(path.join(source,'nested'),{recursive:true});await fs.mkdir(path.join(source,'vacant'));await fs.mkdir(path.join(source,'nested/deep-empty'));
  for(const [name,data] of Object.entries(files))await fs.writeFile(path.join(source,name),data);
  if(process.platform!=='win32'){for(const name of ['', 'nested','vacant','nested/deep-empty'])await fs.chmod(path.join(source,name),0o700);await fs.chmod(path.join(source,'nested/payload.bin'),0o755);await fs.chmod(path.join(source,'empty.txt'),0o640);}
  await fs.mkdir(badSource);await fs.symlink(source,path.join(badSource,'unsafe'),'dir');
  const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env,timeout:30000});
  page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({BrowserWindow,dialog},files)=>{
   BrowserWindow.getAllWindows().forEach(window=>window.hide());global.archiveFolderNext=[files.right];global.archiveFolderCancel=false;global.archiveFolderSaves=0;global.archiveFolderPickerOptions=[];
   dialog.showOpenDialog=async(_window,options)=>{global.archiveFolderPickerOptions.push(options);return {canceled:global.archiveFolderCancel,filePaths:global.archiveFolderCancel?[]:global.archiveFolderNext};};
   dialog.showSaveDialog=async()=>{global.archiveFolderSaves++;return {canceled:false,filePath:files.output};};dialog.showMessageBox=async()=>({response:1});
  },{right,output});
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#welcome [data-command="new:archive-compare"]').click();
  const host=page.locator('#archiveWorkspace'),dialog=page.locator('#archiveEditDialog'),row=name=>host.locator('.archive-row[data-path="'+name+'"]'),button=name=>host.getByRole('button',{name,exact:true});
  const choose=async(files,cancel=false)=>app.evaluate(({},value)=>{global.archiveFolderNext=value.files;global.archiveFolderCancel=value.cancel;},{files,cancel});
  const menu=async label=>{await host.locator('summary').filter({hasText:'Edit archive…'}).click();await button(label).click();};
  const context=async(name,label)=>{await row(name).click();await row(name).click({button:'right'});await (await archiveMenuItem(page,label)).click();};
  const ready=async()=>{await expect(dialog).toBeVisible();await expect(dialog.locator('[data-apply]')).toBeEnabled();};
  const cancel=async()=>{await dialog.locator('[data-cancel]').click();await expect(dialog).toBeHidden();};
  const apply=async()=>{await dialog.locator('[data-apply]').click();await expect(dialog).toBeHidden();};
  const verify=async(bytes,expected,emptyDirs=[])=>{const archive=parseArchive(bytes);assert.deepEqual([...archive.entries.values()].filter(e=>e.kind==='file').map(e=>e.path).sort(),Object.keys(expected).sort());for(const [name,data] of Object.entries(expected)){assert.deepEqual(Buffer.from(await archive.read(name)),data,name);if(process.platform!=='win32'&&name.endsWith('payload.bin')&&data.equals(payload))assert.equal(archive.entries.get(name).permissions,0o755,'Executable import '+name);if(process.platform!=='win32'&&name.endsWith('empty.txt'))assert.equal(archive.entries.get(name).permissions,0o640,'Ordinary import '+name);}for(const name of emptyDirs){assert.equal(archive.entries.get(name)?.kind,'directory',name);if(process.platform!=='win32')assert.equal(archive.entries.get(name).permissions,0o700,'Private directory import '+name);}if(process.platform!=='win32'&&emptyDirs.length){const prefix=emptyDirs[0].slice(0,-'/vacant'.length);assert.equal(archive.entries.get(prefix).permissions,0o700,'Imported root');assert.equal(archive.entries.get(prefix+'/nested').permissions,0o700,'Imported intermediate directory');}};
  const exportVerify=async(side,expected,emptyDirs=[])=>{await fs.rm(output,{force:true});await host.locator('summary').filter({hasText:'Save archive…'}).click();await button('Save '+side+' archive…').click();await ready();await apply();await expect.poll(()=>fs.stat(output).then(s=>s.size).catch(()=>0)).toBeGreaterThan(0);await expect(host.getByRole('button',{name:'Save '+side+' archive…',exact:true,includeHidden:true})).toBeEnabled();await verify(await fs.readFile(output),expected,emptyDirs);};
  const undo=host.getByRole('button',{name:'Undo archive edit',exact:true,includeHidden:true}),redo=host.getByRole('button',{name:'Redo archive edit',exact:true,includeHidden:true});
  await button('Open right archive').click();await expect(row('destination')).toBeVisible();
  // Cancellation never changes archive bytes, history or disk contents.
  await choose([],true);await menu('Add folder to right…');await expect(dialog).toBeHidden();await expect(undo).toBeDisabled();
  await choose([source]);await context('destination','Add folder to right…');await ready();await expect(dialog.locator('[data-new-path]')).toHaveValue('destination');await expect(dialog.locator('[data-paths]')).toContainText('destination/bundle/nested/payload.bin');await expect(dialog.locator('[data-paths]')).toContainText('destination/bundle/vacant');await expect(dialog.locator('[data-summary]')).toContainText(/1.*overwrite/i);
  const picker=await app.evaluate(()=>global.archiveFolderPickerOptions.at(-1));assert.ok(picker.properties.includes('openDirectory'));
  if(process.env.FC_ARCHIVE_FOLDER_SCREENSHOT){const theme=await page.locator('body').getAttribute('data-theme');await page.evaluate(()=>document.body.dataset.theme='light');await page.screenshot({path:process.env.FC_ARCHIVE_FOLDER_SCREENSHOT});await page.evaluate(()=>document.body.dataset.theme='dark');await page.screenshot({path:process.env.FC_ARCHIVE_FOLDER_SCREENSHOT.replace(/\.png$/,'-dark.png')});await page.evaluate(theme=>document.body.dataset.theme=theme||'light',theme);}
  await dialog.locator('[data-new-path]').fill('other');await expect(dialog.locator('[data-apply]')).toBeDisabled();await dialog.locator('[data-review]').click();await ready();await expect(dialog.locator('[data-paths]')).toContainText('other/bundle/nested/payload.bin');await cancel();await expect(undo).toBeDisabled();assert.equal(await app.evaluate(()=>global.archiveFolderSaves),0);
  await context('destination','Add folder to right…');await ready();await apply();await expect(undo).toBeEnabled();assert.equal(await app.evaluate(()=>global.archiveFolderSaves),0);
  const added={...initial,...Object.fromEntries(Object.entries(files).map(([name,data])=>['destination/bundle/'+name,data]))},emptyDirs=['destination/bundle/vacant','destination/bundle/nested/deep-empty'];
  await exportVerify('right',added,emptyDirs);await menu('Undo archive edit');await expect(redo).toBeEnabled();await exportVerify('right',initial);await menu('Redo archive edit');await exportVerify('right',added,emptyDirs);
  // Destination ancestors cannot replace a file with a directory.
  await menu('Add folder to right…');await ready();await dialog.locator('[data-new-path]').fill('blocker');await dialog.locator('[data-review]').click();await expect(dialog.locator('[data-error]')).not.toBeEmpty();await expect(dialog.locator('[data-apply]')).toBeDisabled();await cancel();await exportVerify('right',added,emptyDirs);
  // Importing into a previously unopened side creates an independent archive.
  await menu('Add folder to left…');await ready();await dialog.locator('[data-new-path]').fill('');await dialog.locator('[data-review]').click();await ready();await apply();await expect(row('bundle')).toBeVisible();
  const newArchive=Object.fromEntries(Object.entries(files).map(([name,data])=>['bundle/'+name,data]));await exportVerify('left',newArchive,['bundle/vacant','bundle/nested/deep-empty']);
  // A selected source with a link is rejected as a whole before review or mutation.
  await choose([badSource]);await menu('Add folder to right…');await expect(dialog).toBeHidden();await expect(host.getByRole('button',{name:'Add folder to right…',exact:true,includeHidden:true})).toBeEnabled();await exportVerify('right',added,emptyDirs);
  assert.deepEqual(await fs.readFile(right),original);for(const [name,data] of Object.entries(files))assert.deepEqual(await fs.readFile(path.join(source,name)),data,name);assert.deepEqual(await fs.readdir(path.join(source,'vacant')),[]);assert.deepEqual(await fs.readdir(path.join(source,'nested/deep-empty')),[]);assert.deepEqual((await fs.readdir(source)).sort(),['empty.txt','nested','vacant']);assert.equal(await fs.readlink(path.join(badSource,'unsafe')),source);assert.deepEqual(errors,[]);
  console.log('Archive folder import passed: recursive root preservation, exact binary/empty files, empty directories, merge overwrite review, retained unrelated entries, destination re-review/conflicts, picker/review cancellation, undo/redo, new archive, rejected source links, unchanged sources and explicit ZIP export.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
