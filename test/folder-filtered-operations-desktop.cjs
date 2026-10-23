'use strict';
const {_electron:electron,expect}=require('@playwright/test'),{clickFolderAction}=require('./folder-context-helper.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-filtered-ui-')));let app,page;
 try{
  const left=path.join(base,'left'),right=path.join(base,'right'),out=path.join(base,'out');for(const root of [left,right,out])await fs.mkdir(root);
  for(const name of ['copy','move','delete','external-copy','external-move','all']){await fs.mkdir(path.join(left,name));await fs.writeFile(path.join(left,name,'take.txt'),name+' text');await fs.writeFile(path.join(left,name,'keep.bak'),name+' backup');}
  const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({dialog},choices)=>{globalThis.filteredChoices=choices;dialog.showOpenDialog=async()=>{const p=globalThis.filteredChoices.shift();return {canceled:!p,filePaths:p?[p]:[]};};dialog.showMessageBox=async()=>({response:1});},[left,right]);
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  await expect(page.locator('#folderOperationScope')).toHaveValue('filtered');await page.locator('#folderExclude').fill('*.bak');
  const context=async(name,label)=>{await ready();await page.locator('#folderRowsA .folder-entry[data-path="'+name+'"]').click({button:'right'});await clickFolderAction(page,label);await expect(page.locator('#planDialog')).toBeVisible();await ready();};
  const apply=async()=>{await page.locator('#applyPlan').click();await expect(page.locator('#planDialog')).toBeHidden();await ready();};
  const absent=file=>assert.rejects(()=>fs.access(file),{code:'ENOENT'}),read=(root,p)=>fs.readFile(path.join(root,p),'utf8');
  for(const [name,label,destination,remove] of [['copy','Copy to right',right,false],['move','Move left → right…',right,true],['delete','Delete selected',null,true],['external-copy','Copy to folder…',out,false],['external-move','Move to folder…',out,true]]){
   if(name.startsWith('external'))await app.evaluate((_,out)=>globalThis.filteredChoices.push(out),out);
   await context(name,label);await expect(page.locator('#planDescription')).toContainText('exclude *.bak');await expect(page.locator('#planDescription')).toContainText('Hidden descendants outside this scope are retained.');await expect(page.locator('#planOperations')).toContainText(name+'/take.txt');await expect(page.locator('#planOperations')).not.toContainText('keep.bak');
   if(name==='copy')await page.screenshot({path:path.join(os.tmpdir(),'further-filtered-operations.png')});
   await apply();assert.equal(await read(left,name+'/keep.bak'),name+' backup');if(remove)await absent(path.join(left,name,'take.txt'));else assert.equal(await read(left,name+'/take.txt'),name+' text');if(destination){assert.equal(await read(destination,name+'/take.txt'),name+' text');await absent(path.join(destination,name,'keep.bak'));}
  }
  await ready();await page.locator('#folderRowsA [data-path="all"]').click({button:'right'});await clickFolderAction(page,'File action history…');
  const history=page.locator('#folderOperationHistory');await expect(history).toBeVisible();await expect(history.locator('li[data-status="Completed"]')).toHaveCount(5);await expect(history).toContainText('exclude *.bak');await expect(history).not.toContainText('keep.bak');await expect(history).toContainText('Backup:');
  await history.locator('[data-close]').click();
  // A native cancellation and a stale-plan failure are recorded distinctly.
  await fs.writeFile(path.join(left,'cancel-log.txt'),'cancel');await fs.writeFile(path.join(left,'stale-log.txt'),'before');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','folder:refresh'));await ready();await expect(page.locator('#folderRowsA [data-path="cancel-log.txt"]')).toBeVisible();
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0});});await context('cancel-log.txt','Copy to right');await page.locator('#applyPlan').click();await ready();await page.locator('#cancelPlan').click();await absent(path.join(right,'cancel-log.txt'));
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});await context('stale-log.txt','Copy to right');await fs.writeFile(path.join(left,'stale-log.txt'),'changed after preview');await page.locator('#applyPlan').click();await expect(page.locator('#planDialog')).toBeHidden();await ready();await absent(path.join(right,'stale-log.txt'));
  await app.evaluate(({Menu})=>{const view=Menu.getApplicationMenu().items.find(item=>item.label==='View');view.submenu.items.find(item=>item.label==='File Action History…').click();});await expect(history).toBeVisible();await expect(history.locator('li[data-status="Completed"]')).toHaveCount(5);await expect(history.locator('li[data-status="Cancelled"]')).toHaveCount(1);await expect(history.locator('li[data-status="Failed"]')).toHaveCount(1);await expect(history).toContainText('Check the files');await expect(history).not.toContainText('remote method');
  await page.evaluate(()=>{const blobs=new Map(),create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click;URL.createObjectURL=blob=>{const url=create(blob);blobs.set(url,blob);return url;};URL.revokeObjectURL=url=>{blobs.delete(url);revoke(url);};HTMLAnchorElement.prototype.click=function(){const blob=blobs.get(this.href);if(this.download&&blob){window.historyExport=blob.text();return;}return click.call(this);};});
  await history.locator('[data-export]').click();const log=JSON.parse(await page.evaluate(()=>window.historyExport));assert.equal(log.entries.length,7);assert.equal(log.entries[0].status,'Failed');assert.ok(log.entries[0].paths.some(p=>p.includes('stale-log.txt')));
  for(const theme of ['light','dark']){await history.locator('[data-close]').click();await page.getByRole('button',{name:'Display',exact:true}).click();await page.getByLabel('Theme',{exact:true}).selectOption(theme);await page.getByRole('button',{name:'Done',exact:true}).click();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','folder:operation-history'));await expect(history).toBeVisible();const listBox=await history.locator('[data-entries]').boundingBox(),actionsBox=await history.locator('.dialog-actions').boundingBox();assert.ok(listBox.y+listBox.height<=actionsBox.y,'History list must not overlap action buttons');await page.screenshot({path:'/private/tmp/further-operation-history-'+theme+'.png'});}
  await history.locator('[data-clear]').click();await expect(history.locator('[data-empty]')).toBeVisible();await expect(history.locator('[data-export]')).toBeDisabled();await history.locator('[data-close]').click();
  const setScopeFromContext=async(label,value)=>{
   await ready();await page.locator('#folderRowsA .folder-entry[data-path="all"]').click({button:'right'});
   await page.locator('#folderContext').getByRole('menuitem',{name:'File-action scope',exact:true}).click();
   await page.locator('#folderContext').getByRole('menuitem',{name:label,exact:true}).click();
   await expect(page.locator('#folderOperationScope')).toHaveValue(value);
  };
  await setScopeFromContext('Include all contents','all');
  await setScopeFromContext('Use current filters','filtered');
  await context('all','Copy to right');await expect(page.locator('#planDescription')).toContainText('exclude *.bak');await expect(page.locator('#planOperations')).not.toContainText('all/keep.bak');await page.locator('#cancelPlan').click();
  await setScopeFromContext('Include all contents','all');await context('all','Copy to right');await expect(page.locator('#planDescription')).toContainText('exclude none');await expect(page.locator('#planOperations')).toContainText('all/keep.bak');await apply();assert.equal(await read(right,'all/keep.bak'),'all backup');await expect(page.locator('#folderExclude')).toHaveValue('*.bak');await expect(page.locator('#pathA')).toHaveValue(left);await expect(page.locator('#pathB')).toHaveValue(right);assert.deepEqual(errors,[]);
  // Operation overrides belong to the comparison that chose them.
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','new:folder-compare'));
  await expect(page.getByRole('tab')).toHaveCount(2);await ready();await expect(page.locator('#folderOperationScope')).toHaveValue('filtered');
  await page.getByRole('tab').first().click();await ready();await expect(page.locator('#folderOperationScope')).toHaveValue('all');
  await page.getByRole('tab').nth(1).click();await ready();await expect(page.locator('#folderOperationScope')).toHaveValue('filtered');
  await page.getByRole('tab').first().click();await ready();
  const saved=path.join(base,'comparison.fcompare');
  await app.evaluate(({dialog,BrowserWindow},saved)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:saved});BrowserWindow.getAllWindows()[0].webContents.send('menu-action','save-session');},saved);
  await expect.poll(async()=>{try{return JSON.parse(await fs.readFile(saved,'utf8')).options.folderExclude;}catch{return null;}}).toBe('*.bak');await ready();
  assert.equal(Object.hasOwn(JSON.parse(await fs.readFile(saved,'utf8')).options,'folderOperationScope'),false);
  await app.evaluate(({BrowserWindow},saved)=>{globalThis.filteredChoices.push(saved);BrowserWindow.getAllWindows()[0].webContents.send('menu-action','open-session');},saved);
  await expect(page.getByRole('tab')).toHaveCount(3);await ready();await expect(page.locator('#folderExclude')).toHaveValue('*.bak');await expect(page.locator('#folderOperationScope')).toHaveValue('filtered');
  console.log('Filtered operations UI passed: default matching scope, right-click scope switching in both directions, explicit all contents, context copy/move/delete, external copy/move, preview scope, hidden source retention, destination exclusions, independent tab scope and safe saved-session reopen; operation history outcomes, native/context routes, JSON export, clearing and both themes.');
 }catch(error){if(page&&!page.isClosed())console.error('Filtered operations notice:',await page.locator('#notice').textContent());throw error;}finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
