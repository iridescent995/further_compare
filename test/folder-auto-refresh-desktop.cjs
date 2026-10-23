'use strict';
const {_electron:electron,expect:baseExpect}=require('@playwright/test'),expect=baseExpect.configure({timeout:15000});
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-folder-auto-refresh-')));let app,page;
 try{
  const roots=['left','right'].map(name=>path.join(root,name)),saved=path.join(root,'refresh.fcompare');
  for(const base of roots){for(const folder of ['opened/closed','unrelated/deep'])await fs.mkdir(path.join(base,folder),{recursive:true});for(const name of ['root.txt','opened/child.txt','opened/closed/never.txt','unrelated/deep/never.txt'])await fs.writeFile(path.join(base,name),'initial equal bytes');}
  const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env,timeout:30000});page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Keep actual timer scheduling active even when the test window is hidden.
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}));
  await app.evaluate(({BrowserWindow,dialog,ipcMain},{roots,saved})=>{
   BrowserWindow.getAllWindows().forEach(w=>{w.webContents.setBackgroundThrottling(false);w.hide();});global.refreshFiles=roots;global.refreshReads=[];global.refreshActive=0;global.refreshLastRead=0;
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.refreshFiles.shift()]});dialog.showSaveDialog=async()=>({canceled:false,filePath:saved});dialog.showMessageBox=async()=>({response:1});
   for(const channel of ['folders:tree-list','folders:tree-compare']){const original=ipcMain._invokeHandlers.get(channel);ipcMain.removeHandler(channel);ipcMain.handle(channel,async(...args)=>{global.refreshReads.push([channel,args[1]]);global.refreshActive++;global.refreshLastRead=Date.now();try{return await original(...args);}finally{global.refreshActive--;global.refreshLastRead=Date.now();}});}
  },{roots:[...roots],saved});
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false'),row=name=>page.locator('#folderRowsA .folder-entry[data-path="'+name+'"]');
  const dialog=page.locator('#folderOptionsDialog'),setting=page.locator('#folderAutoRefresh');
  const command=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  const active=()=>page.locator('#sessionTabs [role="tab"][aria-selected="true"]').evaluate(el=>el.parentElement.dataset.sessionId);
  const switchTo=async id=>{await page.locator('#sessionTabs [data-session-id="'+id+'"] [role="tab"]').click();await ready();};
  const close=async()=>{await dialog.locator('[data-done]').click();await ready();};
  const native=()=>app.evaluate(({Menu,BrowserWindow})=>{const find=menu=>{for(const item of menu.items){if(item.label==='Automatic Refresh…')return item;if(item.submenu){const result=find(item.submenu);if(result)return result;}}};const item=find(Menu.getApplicationMenu());if(!item)throw Error('Missing native Automatic Refresh menu');item.click(item,BrowserWindow.getAllWindows()[0],{});});
  const reads=()=>app.evaluate(()=>global.refreshReads),clear=()=>app.evaluate(()=>{global.refreshReads=[];});
  const waitTicks=()=>page.waitForTimeout(3800);
  const settled=()=>expect.poll(()=>app.evaluate(()=>global.refreshActive===0&&Date.now()-global.refreshLastRead>=300)).toBe(true);
  await ready();await command('new:folder-compare');await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  await expect(row('root.txt')).toHaveClass(/\bequal\b/);await row('opened').locator('.tree-toggle').click();await expect(row('opened/child.txt')).toHaveClass(/\bequal\b/);await ready();
  const closedIds=[await row('unrelated').getAttribute('data-id'),await row('opened/closed').getAttribute('data-id')],openedId=await row('opened').getAttribute('data-id');
  await native();await expect(dialog).toBeVisible();await expect(setting).toHaveValue('1500');await expect(setting).toBeFocused();assert.deepEqual(await setting.locator('option').evaluateAll(items=>items.map(item=>item.value)),['0','1500','5000','15000','30000','60000','300000']);await close();await clear();
  await fs.writeFile(path.join(roots[1],'root.txt'),'external root replacement');await fs.writeFile(path.join(roots[1],'opened/child.txt'),'external child replacement');
  await expect(row('root.txt')).toHaveClass(/\bchanged\b/);await expect(row('opened/child.txt')).toHaveClass(/\bchanged\b/);await ready();
  assert.ok((await reads()).some(([,id])=>id===openedId),'Automatic refresh must revisit the expanded node');assert.ok(!(await reads()).some(([,id])=>closedIds.includes(id)),'Automatic refresh must not scan closed nodes');await expect(row('unrelated/deep')).toHaveCount(0);await expect(row('opened/closed/never.txt')).toHaveCount(0);
  await fs.rm(path.join(roots[0],'opened/child.txt'));await fs.rm(path.join(roots[1],'opened/child.txt'));await expect(row('opened/child.txt')).toHaveCount(0);await ready();
  // Dialogs pause automatic refresh, protecting the user's in-progress settings.
  await native();await expect(dialog).toBeVisible();await ready();await settled();await clear();await fs.writeFile(path.join(roots[0],'root.txt'),'external root replacement');await waitTicks();assert.deepEqual(await reads(),[],'No scan while a dialog is open');await expect(row('root.txt')).toHaveClass(/\bchanged\b/);await close();await expect(row('root.txt')).toHaveClass(/\bequal\b/);await ready();
  // The context command exposes the same per-session setting.
  await row('root.txt').click({button:'right'});await page.locator('#folderContext').getByRole('menuitem',{name:'View',exact:true}).click();await page.locator('#folderContext').getByRole('menuitem',{name:'Automatic refresh…',exact:true}).click();await expect(dialog).toBeVisible();await expect(setting).toBeFocused();await setting.selectOption('0');await close();await settled();await clear();
  await fs.writeFile(path.join(roots[1],'root.txt'),'changed while refresh is off');await waitTicks();assert.deepEqual(await reads(),[],'Off suppresses refresh for more than two default intervals');await expect(row('root.txt')).toHaveClass(/\bequal\b/);
  await command('reload');await expect(row('root.txt')).toHaveClass(/\bchanged\b/);await ready();assert.ok((await reads()).length>0,'Manual refresh still works while automatic refresh is off');
  const first=await active();await command('save-session');await expect(page.locator('#dirtyIndicator')).toBeHidden();assert.equal(JSON.parse(await fs.readFile(saved,'utf8')).options.folderView.refreshIntervalMs,0);
  await command('new:folder-compare');await expect.poll(active).not.toBe(first);await ready();const second=await active();await native();await expect(setting).toHaveValue('1500');await close();await switchTo(first);await native();await expect(setting).toHaveValue('0');await close();await command('swap');await expect(page.locator('#pathA')).toHaveValue(roots[1]);await ready();await native();await expect(setting).toHaveValue('0');await close();await switchTo(second);
  await app.evaluate(({},saved)=>global.refreshFiles.push(saved),saved);await command('open-session');await expect.poll(active).not.toBe(second);await expect(row('root.txt')).toHaveClass(/\bchanged\b/);await ready();await native();await expect(setting).toHaveValue('0');await setting.selectOption('5000');await close();
  await command('session:defaults');const defaults=page.locator('#sessionDefaultsDialog');await expect(defaults).toBeVisible();await defaults.locator('[data-save]').click();await expect(defaults.locator('[data-result]')).toContainText('Defaults saved');await defaults.locator('[data-close]').click();const restored=await active();await command('new:folder-compare');await expect.poll(active).not.toBe(restored);await ready();await native();await expect(setting).toHaveValue('5000');await close();
  assert.deepEqual(errors,[]);console.log('Folder automatic refresh passed: external edits/deletions, root and expanded-node scope, no closed-descendant reads, dialog pause, off and manual refresh, context/native settings, session/tab/swap isolation, and saved defaults.');
 }catch(error){if(page&&!page.isClosed())console.error('Refresh notice:',await page.locator('#notice').textContent());throw error;}finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
