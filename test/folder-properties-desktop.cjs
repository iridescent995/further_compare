'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const {clickFolderAction}=require('./folder-context-helper.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-properties-')));let app,page;
 try{
  const left=path.join(temp,'left'),right=path.join(temp,'right'),modified=1700000000000;
  for(const root of [left,right]){await fs.mkdir(path.join(root,'nested'),{recursive:true});await fs.writeFile(path.join(root,'nested','child.txt'),'unselected descendant');await fs.writeFile(path.join(root,'a.txt'),root===left?'left':'right content');await fs.writeFile(path.join(root,'b.txt'),'second');await fs.utimes(path.join(root,'a.txt'),modified/1000,modified/1000);}
  for(let i=0;i<26;i++)await fs.writeFile(path.join(left,`page-${String(i).padStart(2,'0')}.txt`),'x');
  await fs.writeFile(path.join(left,'local.txt'),'local');await fs.writeFile(path.join(right,'remote.txt'),'remote');
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const row=(side,name)=>page.locator('#folderRows'+side+' .folder-entry[data-path="'+name+'"]');
  const dialog=page.getByRole('dialog',{name:'File and folder properties',exact:true});
  const call=(name,...args)=>page.evaluate(({name,args})=>window.desktop[name](...args),{name,args});
  await app.evaluate(({dialog},roots)=>{let i=0;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots[i++]]});},[left,right]);
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  // Inspect selected metadata without expanding or summing descendants.
  await row('A','a.txt').click({button:'right'});await clickFolderAction(page,'View properties…');await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(path.join(left,'a.txt'));await expect(dialog).toContainText('Modified');await expect(dialog).toContainText('2023-11-14');
  const entry=page.locator('#folderPropertiesEntries article[data-path="a.txt"]');await expect(entry).toHaveCount(1);
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await ready();await expect(row('A','a.txt')).toBeFocused();
  // Native application menu uses the focused side and current modifier selection.
  await row('B','a.txt').click();await row('B','b.txt').click({modifiers:[process.platform==='darwin'?'Meta':'Control']});await row('B','nested').click({modifiers:[process.platform==='darwin'?'Meta':'Control']});
  await app.evaluate(({Menu})=>{const find=menu=>{for(const item of menu.items){if(/^View Properties/i.test(item.label))return item;if(item.submenu){const result=find(item.submenu);if(result)return result;}}};const item=find(Menu.getApplicationMenu());if(!item)throw Error('Missing native View Properties menu');item.click();});
  await expect(dialog).toBeVisible();await expect(page.locator('#folderPropertiesEntries article')).toHaveCount(3);await expect(page.locator('#folderPropertiesSummary')).toContainText('Right');await expect(dialog).not.toContainText('child.txt');
  await expect(page.locator('#folderPropertiesEntries article[data-path="nested"]')).toContainText('not');
  await dialog.getByRole('button',{name:'Calculate folder size for nested',exact:true}).click();await expect(page.locator('#folderPropertiesEntries article[data-path="nested"]')).toContainText('21 bytes · 1 file · 0 folders');await expect(row('B','nested/child.txt')).toHaveCount(0);await expect(row('B','nested')).toHaveAttribute('aria-expanded','false');await page.screenshot({path:'/private/tmp/further-folder-size.png'});
  await page.locator('#folderPropertiesClose').click();await expect(dialog).toBeHidden();await ready();
  // Hold actual directory enumeration; Close must cancel without waiting on the folder queue.
  await app.evaluate(({ipcMain},directory)=>{const fs=process.getBuiltinModule('fs/promises'),original=fs.opendir;global.sizeGate={armed:true,held:false,cancelled:false};fs.opendir=async(...args)=>{if(global.sizeGate.armed&&args[0]===directory){global.sizeGate.armed=false;global.sizeGate.held=true;await new Promise(resolve=>global.sizeGate.release=resolve);}return original(...args);};const cancel=ipcMain._invokeHandlers.get('folders:cancel-size');ipcMain.removeHandler('folders:cancel-size');ipcMain.handle('folders:cancel-size',(...args)=>{const result=cancel(...args);if(result)global.sizeGate.cancelled=true;return result;});},path.join(right,'nested'));
  await row('B','nested').click({button:'right'});await clickFolderAction(page,'View properties…');await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Calculate folder size for nested',exact:true}).click();await expect.poll(()=>app.evaluate(()=>sizeGate.held)).toBe(true);await page.locator('#folderPropertiesClose').click();await expect(dialog).toBeHidden();await expect.poll(()=>app.evaluate(()=>sizeGate.cancelled)).toBe(true);await app.evaluate(()=>sizeGate.release());await ready();
  let tree=await call('listFolderTree'),id=tree.rows.find(r=>r.pathA==='a.txt').id;
  const details=await call('getFolderTreeProperties','a',[id],tree.revision);assert.equal(details.entries[0].absolutePath,path.join(left,'a.txt'));assert.equal(details.entries[0].sizeBytes,'4');assert.equal(details.totalFileBytes,'4');assert.equal(details.entries[0].modifiedMs,modified);const repeated=await call('getFolderTreeProperties','a',[id],tree.revision);assert.notEqual(repeated.sizeRequestToken,details.sizeRequestToken);assert.equal(await call('cancelFolderSize',details.sizeRequestToken),false);assert.equal(await call('cancelFolderSize','forged'),false);assert.deepEqual({...repeated,sizeRequestToken:null},{...details,sizeRequestToken:null},'Read-only properties must retain metadata and row authority');
  if(process.platform!=='win32'){assert.equal(typeof details.entries[0].permissions,'string');assert.ok(details.entries[0].permissions.length>=9);assert.ok(details.entries[0].mode);assert.notEqual(details.entries[0].ownerId,null);}
  await assert.rejects(()=>call('getFolderTreeSize','a',id,tree.revision));await assert.rejects(()=>call('getFolderTreeSize','a','../outside',tree.revision));await assert.rejects(()=>call('getFolderTreeSize','b',tree.rows.find(r=>r.pathB==='nested').id,'stale-revision'));
  const nested=await call('getFolderTreeProperties','b',[tree.rows.find(r=>r.pathB==='nested').id],tree.revision);assert.equal(nested.entries[0].sizeBytes,null);assert.equal(nested.totalFileBytes,'0');assert.equal(nested.entries.length,1);assert.equal(nested.folders,1);const nestedId=tree.rows.find(r=>r.pathB==='nested').id;await assert.rejects(()=>call('getFolderTreeSize','a',id,tree.revision,nested.sizeRequestToken),/Properties/);assert.equal(await call('cancelFolderSize',nested.sizeRequestToken),true);await assert.rejects(()=>call('getFolderTreeSize','b',nestedId,tree.revision,nested.sizeRequestToken),/Properties/);
  for(const [side,ids,revision]of [['a',['../outside'],tree.revision],['a',[id],'stale-revision'],['z',[id],tree.revision],['a',[],tree.revision]])await assert.rejects(()=>call('getFolderTreeProperties',side,ids,revision));
  for(const theme of ['light','dark']){
   await page.getByRole('button',{name:'Display',exact:true}).click();await page.getByLabel('Theme',{exact:true}).selectOption(theme);await page.getByRole('button',{name:'Done',exact:true}).click();
   await row('A','a.txt').click({button:'right'});await clickFolderAction(page,'View properties…');await expect(dialog).toBeVisible();await page.screenshot({path:path.join(os.tmpdir(),'further-properties-'+theme+'.png')});await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await ready();
  }
  // Large selections are paginated without losing the selected file total.
  await row('A','a.txt').click({button:'right'});await clickFolderAction(page,'Select all');await row('A','a.txt').click({button:'right'});await clickFolderAction(page,'View properties…');await expect(dialog).toBeVisible();
  await expect(page.locator('#folderPropertiesEntries article')).toHaveCount(25);await expect(page.locator('#folderPropertiesPage')).toContainText('Page 1 of 2');await expect(page.locator('#folderPropertiesSummary')).toContainText('41 bytes');
  await page.locator('#folderPropertiesNext').click();await expect(page.locator('#folderPropertiesPage')).toContainText('Page 2 of 2');await expect(page.locator('#folderPropertiesEntries article')).toHaveCount(5);await expect(page.locator('#folderPropertiesNext')).toBeDisabled();await page.locator('#folderPropertiesPrevious').click();await expect(page.locator('#folderPropertiesEntries article')).toHaveCount(25);await page.keyboard.press('Escape');await ready();
  // Manually aligned entries keep native side-specific paths, even with different names.
  await row('A','local.txt').click();await row('B','remote.txt').click({modifiers:[process.platform==='darwin'?'Meta':'Control']});
  await row('A','local.txt').click({button:'right'});await clickFolderAction(page,'Align selected pair');await ready();
  await expect(page.locator('#folderStop')).toBeDisabled();
  await row('B','remote.txt').click({button:'right'});await clickFolderAction(page,'View properties…');await expect(dialog).toBeVisible();
  const alignedEntry=page.locator('#folderPropertiesEntries article[data-path="remote.txt"]');await expect(alignedEntry).toHaveCount(1);await expect(alignedEntry).toContainText(path.join(right,'remote.txt'));
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await ready();
  await assert.rejects(()=>call('getFolderTreeProperties','a',[id],tree.revision),/revision changed/);
  for(const root of [left,right]){assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),root===left?'left':'right content');assert.equal((await fs.stat(path.join(root,'a.txt'))).mtimeMs,modified);assert.equal(await fs.readFile(path.join(root,'nested','child.txt'),'utf8'),'unselected descendant');}
  assert.deepEqual(errors,[]);console.log('Folder properties passed: context and native menus, side-specific multiselection, exact sizes/times, nonrecursive directories, POSIX metadata, Escape focus, stale/invalid requests, aligned paths, unchanged files and both themes.');
 }finally{if(app)await app.evaluate(()=>global.sizeGate?.release?.()).catch(()=>{});if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
