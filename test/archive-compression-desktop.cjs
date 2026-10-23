'use strict';
const {archiveMenuItem}=require('./archive-menu-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {zip}=require('./archive-fixture.cjs'),{parseArchive}=require('../src/archive-core.cjs');
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-archive-compression-')));let app,page;
 try{
  const entries=[{name:'empty/',data:Buffer.alloc(0)},{name:'nested/',data:Buffer.alloc(0)},{name:'nested/repeated.txt',data:Buffer.from('Pastel archive comparison — repeated text.\n'.repeat(2500))},{name:'binary.bin',data:Buffer.from(Array.from({length:256},(_,i)=>i))},{name:'empty.txt',data:Buffer.alloc(0)}];
  const original=zip(entries),source=path.join(root,'source.zip');await fs.writeFile(source,original);
  const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env,timeout:30000});
  page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({BrowserWindow,dialog},source)=>{
   BrowserWindow.getAllWindows().forEach(window=>window.hide());global.compressionDestination='';global.compressionSaveCount=0;
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});
   dialog.showSaveDialog=async()=>{global.compressionSaveCount++;return {canceled:false,filePath:global.compressionDestination};};
   dialog.showMessageBox=async()=>({response:1});
  },source);
  const host=page.locator('#archiveWorkspace'),review=page.locator('#archiveEditDialog'),compression=review.locator('[data-compression]');
  const button=name=>host.getByRole('button',{name,exact:true}),row=name=>host.locator('.archive-row[data-path="'+name+'"]');
  const ready=async()=>{await expect(review).toBeVisible();await expect(review.locator('[data-apply]')).toBeEnabled();};
  const cancel=async()=>{await review.locator('[data-cancel]').click();await expect(review).toBeHidden();};
  const openSave=async(side,viaContext=false)=>{if(viaContext){await row('binary.bin').click({button:'right'});await (await archiveMenuItem(page,'Save '+side+' archive…')).click();}else{await host.locator('summary').filter({hasText:'Save archive…'}).click();await button('Save '+side+' archive…').click();}await ready();await expect(compression).toBeVisible();await expect(compression).toHaveValue('stored');await expect(review.getByLabel('ZIP compression',{exact:true})).toHaveCount(1);};
  let serial=0;
  const save=async()=>{const output=path.join(root,'export-'+serial+++'.zip');await app.evaluate(({},output)=>global.compressionDestination=output,output);await review.locator('[data-apply]').click();await expect(review).toBeHidden();await expect.poll(()=>fs.stat(output).then(s=>s.size).catch(()=>0)).toBeGreaterThan(0);await expect(host.getByRole('button',{name:'Save right archive…',exact:true,includeHidden:true})).toBeEnabled();return fs.readFile(output);};
  const verify=async(bytes,deflated,expected=entries)=>{const archive=parseArchive(bytes);assert.deepEqual([...archive.entries.keys()].sort(),expected.map(entry=>entry.name.replace(/\/$/,'')).sort());for(const entry of expected){const name=entry.name.replace(/\/$/,''),parsed=archive.entries.get(name);if(entry.name.endsWith('/')){assert.equal(parsed.kind,'directory');assert.equal(parsed.method,0);}else{assert.equal(parsed.kind,'file');assert.deepEqual(Buffer.from(await archive.read(name)),entry.data,name);assert.equal(parsed.method,deflated&&name==='nested/repeated.txt'?8:0,name+' compression method');}}return archive;};
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#welcome [data-command="new:archive-compare"]').click();
  await button('Open left archive').click();await expect(host).toHaveAttribute('aria-busy','false');await button('Open right archive').click();await expect(host).toHaveAttribute('aria-busy','false');await expect(row('binary.bin')).toBeVisible();
  // Save review cancellation does not even launch a native destination picker.
  await openSave('right');await compression.selectOption('deflate');await cancel();assert.equal(await app.evaluate(()=>global.compressionSaveCount),0);
  await openSave('right');const stored=await save();await verify(stored,false);
  await openSave('right');await compression.selectOption('deflate');
  if(process.env.FC_ARCHIVE_COMPRESSION_SCREENSHOT){const theme=await page.locator('body').getAttribute('data-theme');await page.evaluate(()=>document.body.dataset.theme='light');await page.screenshot({path:process.env.FC_ARCHIVE_COMPRESSION_SCREENSHOT});await page.evaluate(()=>document.body.dataset.theme='dark');await page.screenshot({path:process.env.FC_ARCHIVE_COMPRESSION_SCREENSHOT.replace(/\.png$/,'-dark.png')});await page.evaluate(theme=>document.body.dataset.theme=theme||'light',theme);}
  const compressed=await save();await verify(compressed,true);assert.ok(compressed.length<stored.length/4,'Compressible output should be substantially smaller.');
  // Both sides of the context menu share the reviewed compression option.
  await openSave('left',true);await compression.selectOption('deflate');await verify(await save(),true);
  await openSave('right',true);await verify(await save(),false);
  await openSave('right');await expect(compression).toHaveValue('stored');await cancel();
  // Editing reviews do not expose an export-only setting, even after a deflated save.
  await row('binary.bin').click({button:'right'});await (await archiveMenuItem(page,'Rename right…')).click();await expect(review).toBeVisible();await expect(compression).toBeHidden();await review.locator('[data-new-path]').fill('renamed.bin');await review.locator('[data-review]').click();await ready();await expect(compression).toBeHidden();await cancel();
  await row('binary.bin').click({button:'right'});await (await archiveMenuItem(page,'Delete right…')).click();await ready();await expect(compression).toBeHidden();await cancel();
  assert.equal(await app.evaluate(()=>global.compressionSaveCount),4);await expect(host.getByRole('button',{name:'Undo archive edit',exact:true,includeHidden:true})).toBeDisabled();
  await openSave('right');await verify(await save(),false);
  // Compression exports the edited in-memory archive without consuming its undo history.
  await row('binary.bin').click({button:'right'});await (await archiveMenuItem(page,'Rename right…')).click();await review.locator('[data-new-path]').fill('renamed.bin');await review.locator('[data-review]').click();await ready();await review.locator('[data-apply]').click();await expect(review).toBeHidden();await expect(row('renamed.bin')).toBeVisible();
  const undo=host.getByRole('button',{name:'Undo archive edit',exact:true,includeHidden:true});await expect(undo).toBeEnabled();await openSave('right');await compression.selectOption('deflate');await verify(await save(),true,entries.map(entry=>({...entry,name:entry.name==='binary.bin'?'renamed.bin':entry.name})));await expect(undo).toBeEnabled();
  await host.locator('summary').filter({hasText:'Edit archive…'}).click();await button('Undo archive edit').click();await expect(row('binary.bin')).toBeVisible();await expect(row('renamed.bin')).toHaveCount(0);await expect(undo).toBeDisabled();await expect(host.getByRole('button',{name:'Redo archive edit',exact:true,includeHidden:true})).toBeEnabled();await openSave('right');await compression.selectOption('deflate');await verify(await save(),true);await expect(undo).toBeDisabled();await expect(host.getByRole('button',{name:'Redo archive edit',exact:true,includeHidden:true})).toBeEnabled();
  assert.deepEqual(await fs.readFile(source),original);assert.deepEqual(errors,[]);
  console.log('Archive compression desktop passed: toolbar and both context sides, stored default/reset, deflated method8 with exact round-trip bytes/directories, incompressible stored fallback, smaller output, cancel without native save, hidden edit-only setting, edited archive export and independent undo/redo, unchanged source and history.');
 }catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(os.tmpdir(),'archive-compression-failure.png')}).catch(()=>{});throw error;}finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
