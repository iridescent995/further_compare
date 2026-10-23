'use strict';
const {archiveMenuItem}=require('./archive-menu-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {zip}=require('./archive-fixture.cjs'),{parseArchive}=require('../src/archive-core.cjs');
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-archive-history-')));let app,page;
 try{
  const left=path.join(root,'left.zip'),right=path.join(root,'right.zip'),output=path.join(root,'export.zip'),session=path.join(root,'history.fcompare');
  const payload=Buffer.from([0,255,128,65,13,10]);
  const initial={'change.bin':Buffer.from('old'),'nested/deep/child.txt':Buffer.from('right child'),'keep.txt':Buffer.from('untouched')};
  const originalLeft=zip([{name:'change.bin',data:payload,deflate:true}]);
  const originalRight=zip(Object.entries(initial).map(([name,data])=>({name,data,deflate:true})));
  await fs.writeFile(left,originalLeft);await fs.writeFile(right,originalRight);
  const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env,timeout:30000});
  page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({BrowserWindow,dialog},files)=>{
   BrowserWindow.getAllWindows().forEach(window=>window.hide());global.archiveHistoryFiles=[files.left,files.right];
   dialog.showOpenDialog=async(_window,options)=>({canceled:false,filePaths:[options.title==='Open session'?files.session:global.archiveHistoryFiles.shift()]});
   dialog.showSaveDialog=async(_window,options)=>({canceled:false,filePath:options.defaultPath?.endsWith('.zip')?files.output:files.session});
   dialog.showMessageBox=async()=>({response:1});
  },{left,right,output,session});
  const command=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  const nativeHistory=label=>app.evaluate(({Menu,BrowserWindow},label)=>{
   const find=menu=>{for(const item of menu.items){if(item.label===label)return item;if(item.submenu){const match=find(item.submenu);if(match)return match;}}};
   const item=find(Menu.getApplicationMenu());if(!item)throw Error('Missing native menu: '+label);item.click(item,BrowserWindow.getAllWindows()[0],{});
  },label);
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#welcome [data-command="new:archive-compare"]').click();
  const host=page.locator('#archiveWorkspace'),dialog=page.locator('#archiveEditDialog');
  const row=name=>host.locator('.archive-row[data-path="'+name+'"]'),button=name=>host.getByRole('button',{name,exact:true});
  const contextAction=async(name,action)=>{await row(name).click();await row(name).click({button:'right'});await (await archiveMenuItem(page,action)).click();};
  const ready=async()=>{await expect(dialog).toBeVisible();await expect(dialog.locator('[data-apply]')).toBeEnabled();};
  const apply=async()=>{await dialog.locator('[data-apply]').click();await expect(dialog).not.toBeVisible();};
  const cancel=async()=>{await dialog.locator('[data-cancel]').click();await expect(dialog).not.toBeVisible();};
  const verify=async(bytes,expected)=>{
   const archive=parseArchive(bytes),files=[...archive.entries.values()].filter(entry=>entry.kind==='file');
   assert.deepEqual(files.map(entry=>entry.path).sort(),Object.keys(expected).sort());
   for(const [name,data] of Object.entries(expected))assert.deepEqual(Buffer.from(await archive.read(name)),data,name);
  };
  const exportAndVerify=async expected=>{
   await fs.rm(output,{force:true});await host.locator('summary').filter({hasText:'Save archive…'}).click();await button('Save right archive…').click();await ready();await apply();
   await expect.poll(()=>fs.stat(output).then(s=>s.size).catch(()=>0)).toBeGreaterThan(0);
   await expect(host.getByRole('button',{name:'Save right archive…',exact:true,includeHidden:true})).toBeEnabled();
   await verify(await fs.readFile(output),expected);
  };
  await button('Open left archive').click();await button('Open right archive').click();await expect(row('change.bin')).toHaveClass(/changed/);
  const undo=host.getByRole('button',{name:'Undo archive edit',exact:true,includeHidden:true}),redo=host.getByRole('button',{name:'Redo archive edit',exact:true,includeHidden:true});
  const historyClick=async label=>{await host.locator('summary').filter({hasText:'Edit archive…'}).click();await button(label).click();};
  await expect(undo).toBeDisabled();await expect(redo).toBeDisabled();
  // Canceled review creates no undo checkpoint.
  await contextAction('change.bin','Copy left → right…');await ready();await cancel();await expect(undo).toBeDisabled();
  const copied={...initial,'change.bin':payload};
  await contextAction('change.bin','Copy left → right…');await ready();await apply();await expect(row('change.bin')).toHaveClass(/equal/);await exportAndVerify(copied);
  await nativeHistory('Undo Comparison Edit');await expect(row('change.bin')).toHaveClass(/changed/);await expect(undo).toBeDisabled();await expect(redo).toBeEnabled();await exportAndVerify(initial);
  await nativeHistory('Redo Comparison Edit');await expect(row('change.bin')).toHaveClass(/equal/);await expect(redo).toBeDisabled();await exportAndVerify(copied);
  // Rename and delete restore exact descendant bytes, not just top-level rows.
  await contextAction('nested','Rename right…');await dialog.locator('[data-new-path]').fill('moved');await dialog.locator('[data-review]').click();await ready();await apply();await expect(row('moved')).toBeVisible();
  const renamed={...copied,'moved/deep/child.txt':copied['nested/deep/child.txt']};delete renamed['nested/deep/child.txt'];await exportAndVerify(renamed);
  await contextAction('moved','Undo archive edit');await expect(row('nested')).toBeVisible();await expect(row('moved')).toHaveCount(0);await exportAndVerify(copied);
  await historyClick('Redo archive edit');await expect(row('moved')).toBeVisible();await exportAndVerify(renamed);
  await contextAction('moved','Delete right…');await ready();await apply();await expect(row('moved')).toHaveCount(0);
  const deleted={...renamed};delete deleted['moved/deep/child.txt'];await exportAndVerify(deleted);
  await historyClick('Undo archive edit');await expect(row('moved')).toBeVisible();await exportAndVerify(renamed);
  await historyClick('Redo archive edit');await expect(row('moved')).toHaveCount(0);await exportAndVerify(deleted);
  // In-memory history belongs to a tab, including its redo branch.
  await historyClick('Undo archive edit');await expect(row('moved')).toBeVisible();await expect(redo).toBeEnabled();
  const tabId=await page.locator('#sessionTabs [role="tab"][aria-selected="true"]').evaluate(button=>button.parentElement.dataset.sessionId);
  await command('new:archive-compare');await expect(row('change.bin')).toHaveCount(0);await expect(undo).toBeDisabled();await expect(redo).toBeDisabled();
  await page.locator('#sessionTabs [data-session-id="'+tabId+'"] [role="tab"]').click();await expect(row('moved')).toBeVisible();await expect(undo).toBeEnabled();await expect(redo).toBeEnabled();
  await historyClick('Redo archive edit');await expect(row('moved')).toHaveCount(0);await exportAndVerify(deleted);
  await historyClick('Undo archive edit');await expect(row('moved')).toBeVisible();
  // Cancellation preserves redo; a committed edit invalidates it.
  await contextAction('keep.txt','Delete right…');await ready();await cancel();await expect(redo).toBeEnabled();
  await contextAction('keep.txt','Delete right…');await ready();await apply();await expect(row('keep.txt')).toHaveCount(0);await expect(redo).toBeDisabled();
  const finalState={...renamed};delete finalState['keep.txt'];await exportAndVerify(finalState);
  await command('save-session');await expect(page.locator('#dirtyIndicator')).toBeHidden();
  const saved=JSON.parse(await fs.readFile(session,'utf8'));await verify(Buffer.from(saved.advanced.inputs.b.data,'base64'),finalState);
  assert.equal(Object.hasOwn(saved.advanced,'history'),false);assert.equal(Object.hasOwn(saved.advanced,'archiveHistory'),false);
  await command('open-session');await expect(row('moved')).toBeVisible();await expect(row('keep.txt')).toHaveCount(0);await expect(undo).toBeDisabled();await expect(redo).toBeDisabled();await exportAndVerify(finalState);
  assert.deepEqual(await fs.readFile(left),originalLeft);assert.deepEqual(await fs.readFile(right),originalRight);assert.deepEqual(errors,[]);
  console.log('Archive history passed: copy/delete/rename exact-byte undo/redo, native menu routing, canceled reviews, redo invalidation, tab isolation and restoration, session save without transient history, unchanged source archives.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
