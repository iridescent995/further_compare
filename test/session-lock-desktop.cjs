'use strict';
const {_electron:electron,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:20000});
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fc-lock-'));let app,page;try{
 const original=path.join(temp,'original.fcompare'),copy=path.join(temp,'copy.fcompare');
 const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[process.cwd()]}),env});page=await app.firstWindow();page.setDefaultTimeout(20000);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.hide()));
 const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
 const menu=async action=>{await app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
 const destination=file=>app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>file?{canceled:false,filePath:file}:{canceled:true};},file);
 const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
 await page.locator('#welcome [data-command="new:text-compare"]').click();await ready();await expect(page.locator('#sessionLock')).toBeHidden();
 await page.locator('#sessionName').fill('Protected comparison');await page.locator('#textA').fill('saved original');await destination(original);await menu('save-session');await expect(page.locator('#sessionLocation')).toHaveText('original.fcompare');await ready();
 await page.locator('#textA').fill('unsaved change');await menu('lock-session');await ready();await expect(page.locator('#sessionLock')).toHaveAttribute('aria-label','Unlock saved session');
 assert.equal((await read(original)).locked,true);assert.equal((await read(original)).text.a,'saved original');await expect(page.locator('#textA')).toHaveValue('unsaved change');
 // Saved protection survives tab switches without discarding local edits.
 await page.locator('#newTab').click();await ready();await page.getByRole('tab',{name:/Protected comparison/}).click();await ready();await expect(page.locator('#sessionLock')).toHaveAttribute('aria-label','Unlock saved session');await expect(page.locator('#textA')).toHaveValue('unsaved change');
 await destination(null);await menu('save-session');await ready();assert.equal((await read(original)).text.a,'saved original');await expect(page.locator('#dirtyIndicator')).toBeVisible();
 // Save As cannot bypass protection by choosing the locked original.
 await destination(original);await menu('save-session-as');await ready();await expect(page.locator('#notice')).toContainText(/locked/i);assert.equal((await read(original)).text.a,'saved original');
 await destination(copy);await menu('save-session');await expect(page.locator('#sessionLocation')).toHaveText('copy.fcompare');await ready();assert.equal((await read(copy)).text.a,'unsaved change');assert.notEqual((await read(copy)).locked,true);assert.equal((await read(original)).locked,true);await expect(page.locator('#sessionLock')).toHaveAttribute('aria-label','Lock saved session');
 // Reopening the protected session restores its lock, then explicit unlock permits Save.
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},original);await menu('open-session');await expect(page.locator('#sessionLocation')).toHaveText('original.fcompare');await ready();await expect(page.locator('#sessionLock')).toHaveAttribute('aria-label','Unlock saved session');await expect(page.locator('#textA')).toHaveValue('saved original');
 await menu('unlock-session');await ready();await expect(page.locator('#sessionLock')).toHaveAttribute('aria-label','Lock saved session');await page.locator('#textA').fill('explicit update');await menu('save-session');await ready();await expect.poll(async()=>(await read(original)).text.a).toBe('explicit update');
 // Compared text remains editable throughout; clear starts an unlocked unsaved session.
 await menu('clear-session');await ready();await expect(page.locator('#sessionLock')).toBeHidden();await expect(page.locator('#textA')).toHaveValue('');

 await menu('new:folder-compare');await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');await ready();await destination(path.join(temp,'folders.fcompare'));await menu('save-session');await expect(page.locator('#sessionLocation')).toHaveText('folders.fcompare');await ready();
 await page.locator('#folderRowsA').click({button:'right',position:{x:10,y:10}});await require('./folder-context-helper.cjs').clickFolderAction(page,'Lock saved session');await ready();await expect(page.locator('#sessionLock')).toHaveAttribute('aria-label','Unlock saved session');
 await page.getByRole('tab',{name:'Folder Compare',exact:true}).click({button:'right'});await page.locator('#tabContext').getByRole('menuitem',{name:'Unlock saved session',exact:true}).click();await ready();await expect(page.locator('#sessionLock')).toHaveAttribute('aria-label','Lock saved session');
 console.log('Session lock passed: preserved saved payload/unsaved edits, tab restoration, cancel, overwrite rejection, unlocked Save As copy, reopen, explicit unlock and clear.');
}finally{if(page)await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
