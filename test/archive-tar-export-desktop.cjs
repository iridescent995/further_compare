'use strict';
const {archiveMenuItem}=require('./archive-menu-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {zip}=require('./archive-fixture.cjs'),{parseArchiveInput}=require('../src/archive-core.cjs');
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-archive-tar-export-')));let app,page;
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
  const format=review.locator('[data-format]');let serial=0;
  const choose=async value=>{await format.selectOption(value);await expect(compression)[value==='zip'?'toBeVisible':'toBeHidden']();await expect(review.locator('[data-apply]')).toHaveText('Save '+value.toUpperCase()+' as…');};
  const save=async value=>{const output=path.join(root,'export-'+serial+++'.'+value);await app.evaluate(({},output)=>global.compressionDestination=output,output);await review.locator('[data-apply]').click();await expect(review).toBeHidden();await expect.poll(()=>fs.stat(output).then(s=>s.size).catch(()=>0)).toBeGreaterThan(0);await expect(host.getByRole('button',{name:'Save right archive…',exact:true,includeHidden:true})).toBeEnabled();return fs.readFile(output);};
  const verify=async(bytes,value,expected=entries)=>{assert.equal(bytes[0]===31&&bytes[1]===139,value==='tar.gz');const archive=await parseArchiveInput(bytes);assert.deepEqual([...archive.entries.keys()].sort(),expected.map(entry=>entry.name.replace(/\/$/,'')).sort());for(const entry of expected){const name=entry.name.replace(/\/$/,''),parsed=archive.entries.get(name);assert.equal(parsed.kind,entry.name.endsWith('/')?'directory':'file');if(parsed.kind==='file')assert.deepEqual(Buffer.from(await archive.read(name)),entry.data,name);}return archive;};
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#welcome [data-command="new:archive-compare"]').click();
  await button('Open left archive').click();await expect(host).toHaveAttribute('aria-busy','false');await button('Open right archive').click();await expect(host).toHaveAttribute('aria-busy','false');await expect(row('binary.bin')).toBeVisible();
  // Cancel and Escape each discard format/compression options without opening a save picker.
  await openSave('right');await compression.selectOption('deflate');await choose('tar.gz');await cancel();
  await openSave('left');await expect(format).toHaveValue('zip');await choose('tar');await page.keyboard.press('Escape');await expect(review).toBeHidden();assert.equal(await app.evaluate(()=>global.compressionSaveCount),0);
  // Exercise both formats and both sides through toolbar and context routes.
  let plain,gzip;
  for(const [side,context,value] of [['left',false,'tar'],['right',false,'tar.gz'],['left',true,'tar.gz'],['right',true,'tar']]){
   await openSave(side,context);await expect(format).toHaveValue('zip');await choose(value);if(process.env.FC_TAR_EXPORT_SCREENSHOT&&side==='left'&&!context){const theme=await page.locator('body').getAttribute('data-theme');for(const mode of ['light','dark']){await page.evaluate(mode=>document.body.dataset.theme=mode,mode);await page.screenshot({path:process.env.FC_TAR_EXPORT_SCREENSHOT.replace(/\.png$/,'-'+mode+'.png')});}await page.evaluate(theme=>document.body.dataset.theme=theme||'light',theme);}const bytes=await save(value);await verify(bytes,value);if(value==='tar')plain=bytes;else gzip=bytes;
  }
  assert.ok(gzip.length<plain.length/4,'Gzip should reduce repeated text significantly.');
  await row('binary.bin').click({button:'right'});await (await archiveMenuItem(page,'Rename right…')).click();await expect(format).toBeHidden();await expect(compression).toBeHidden();await review.locator('[data-new-path]').fill('renamed.bin');await review.locator('[data-review]').click();await ready();await review.locator('[data-apply]').click();await expect(review).toBeHidden();await expect(row('renamed.bin')).toBeVisible();
  const undo=host.getByRole('button',{name:'Undo archive edit',exact:true,includeHidden:true});await expect(undo).toBeEnabled();
  for(const value of ['tar','tar.gz']){await openSave('right');await choose(value);await verify(await save(value),value,entries.map(entry=>({...entry,name:entry.name==='binary.bin'?'renamed.bin':entry.name})));await expect(undo).toBeEnabled();}
  await host.locator('summary').filter({hasText:'Edit archive…'}).click();await button('Undo archive edit').click();await expect(row('binary.bin')).toBeVisible();await expect(row('renamed.bin')).toHaveCount(0);await expect(undo).toBeDisabled();await expect(host.getByRole('button',{name:'Redo archive edit',exact:true,includeHidden:true})).toBeEnabled();
  await openSave('right');await expect(format).toHaveValue('zip');await choose('tar');await verify(await save('tar'),'tar');await expect(undo).toBeDisabled();await expect(host.getByRole('button',{name:'Redo archive edit',exact:true,includeHidden:true})).toBeEnabled();
  assert.deepEqual(await fs.readFile(source),original);assert.deepEqual(errors,[]);
  console.log('Archive TAR export desktop passed: both sides and toolbar/context routes, TAR/TAR.GZ exact bytes and empty directories, gzip size, format/compression reset on Cancel/Escape, edited export, source and undo/redo preserved.');
 }catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(os.tmpdir(),'archive-tar-export-failure.png')}).catch(()=>{});throw error;}finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
