'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),Zip=require('jszip');
const {zip}=require('./archive-fixture.cjs'),{archiveMenuItem}=require('./archive-menu-helper.cjs');
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-compressed-draft-')));let app,page;
 try{
  const left=path.join(root,'left.zip'),right=path.join(root,'right.zip'),output=path.join(root,'saved.zip'),session=path.join(root,'draft.fcompare');
  const largeA=Buffer.alloc(17*1024*1024,65),largeB=Buffer.alloc(17*1024*1024,66),note=Buffer.from('original note\n');
  const source=zip([{name:'large-a.bin',data:largeA,deflate:true},{name:'large-b.bin',data:largeB,deflate:true},{name:'note.txt',data:note,deflate:true}]);
  assert.ok(source.length<128*1024);assert.ok(largeA.length+largeB.length>32*1024*1024);
  await fs.writeFile(left,source);await fs.writeFile(right,source);
  const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env,timeout:30000});
  page=await app.firstWindow();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({BrowserWindow,dialog},files)=>{BrowserWindow.getAllWindows().forEach(w=>w.hide());global.compressedQueue=[files.left,files.right];global.compressedDestination=files.output;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.compressedQueue.shift()]});dialog.showSaveDialog=async()=>({canceled:false,filePath:global.compressedDestination});dialog.showMessageBox=async()=>({response:1});},{left,right,output});
  const menu=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  const host=page.locator('#archiveWorkspace'),review=page.locator('#archiveEditDialog'),row=name=>host.locator('.archive-row[data-path="'+name+'"]'),button=name=>host.getByRole('button',{name,exact:true});
  const active=()=>page.locator('#sessionTabs [role="tab"][aria-selected="true"]').evaluate(el=>el.parentElement.dataset.sessionId);
  const switchTo=async id=>{await page.locator('#sessionTabs [data-session-id="'+id+'"] [role="tab"]').click();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');};
  const apply=async()=>{await expect(review.locator('[data-apply]')).toBeEnabled();await review.locator('[data-apply]').click();await expect(review).toBeHidden();};
  const verify=async(bytes,renamed,edited)=>{assert.ok(bytes.length<32*1024*1024);const parsed=await Zip.loadAsync(bytes,{checkCRC32:true});assert.deepEqual(Object.keys(parsed.files).sort(),[renamed?'renamed.bin':'large-a.bin','large-b.bin','note.txt'].sort());assert.deepEqual(await parsed.file(renamed?'renamed.bin':'large-a.bin').async('nodebuffer'),largeA);assert.deepEqual(await parsed.file('large-b.bin').async('nodebuffer'),largeB);assert.deepEqual(await parsed.file('note.txt').async('nodebuffer'),edited?Buffer.from('edited child café\n'):note);};
  const save=async(renamed,edited)=>{await app.evaluate(({},output)=>global.compressedDestination=output,output);await fs.rm(output,{force:true});await host.locator('summary').filter({hasText:'Save archive…'}).click();await button('Save right archive…').click();await expect(review.locator('[data-compression]')).toBeVisible();await expect(review.locator('[data-compression]')).toHaveValue('deflate');await apply();await expect.poll(()=>fs.stat(output).then(s=>s.size).catch(()=>0),{timeout:60000}).toBeGreaterThan(0);await expect(host.getByRole('button',{name:'Save right archive…',exact:true,includeHidden:true})).toBeEnabled();await verify(await fs.readFile(output),renamed,edited);};
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#welcome [data-command="new:archive-compare"]').click();await button('Open left archive').click();await button('Open right archive').click();await expect(row('note.txt')).toBeVisible();const parent=await active();
  await row('large-a.bin').click({button:'right'});await (await archiveMenuItem(page,'Rename right…')).click();await review.locator('[data-new-path]').fill('renamed.bin');await review.locator('[data-review]').click();await apply();await expect(row('renamed.bin')).toBeVisible();await save(true,false);
  await menu('undo');await expect(row('renamed.bin')).toHaveCount(0);await save(false,false);await menu('redo');await expect(row('renamed.bin')).toBeVisible();
  await row('note.txt').dblclick();await expect(page.locator('#sessionKind')).toHaveText('Text Compare');await page.locator('#textB').fill('edited child café\n');await page.locator('#applyArchiveEntryB').click();const childReview=page.locator('#archiveEntryEditDialog');await expect(childReview.locator('[data-apply]')).toBeEnabled();await childReview.locator('[data-apply]').click();await expect(childReview).toBeHidden();await switchTo(parent);await save(true,true);
  await menu('undo');await expect(host.getByRole('button',{name:'Redo archive edit',exact:true,includeHidden:true})).toBeEnabled();await save(true,false);await menu('redo');await save(true,true);
  await app.evaluate(({},session)=>global.compressedDestination=session,session);await menu('save-session');await expect(page.locator('#dirtyIndicator')).toBeHidden();const saved=JSON.parse(await fs.readFile(session,'utf8'));await verify(Buffer.from(saved.advanced.inputs.b.data,'base64'),true,true);assert.equal(Object.hasOwn(saved.advanced,'archiveHistory'),false);
  await app.evaluate(({},session)=>global.compressedQueue.push(session),session);await menu('open-session');await expect(row('renamed.bin')).toBeVisible();await expect(host.getByRole('button',{name:'Undo archive edit',exact:true,includeHidden:true})).toBeDisabled();await save(true,true);
  assert.deepEqual(await fs.readFile(left),source);assert.deepEqual(await fs.readFile(right),source);assert.deepEqual(errors,[]);
  console.log('Compressed draft desktop passed: 34 MiB expanded ZIP rename, child text writeback, undo/redo, session draft reload with transient history reset, independent JSZip CRC/content checks, automatically selected deflated Save ZIP and unchanged originals.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
