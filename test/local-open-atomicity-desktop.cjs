'use strict';
const {_electron:electron,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:20000});
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-open-atomic-ui-'))),repo=path.resolve(__dirname,'..');let app;const errors=[];
 try{
  const a=path.join(temp,'left'),b=path.join(temp,'right'),old=path.join(temp,'original.txt');await fs.mkdir(a);await fs.mkdir(b);await fs.writeFile(path.join(a,'pair.txt'),'left');await fs.writeFile(path.join(b,'pair.txt'),'right');await fs.writeFile(old,'original text');
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:process.env.FC_TEST_EXECUTABLE||require('electron'),args:[...(process.env.FC_TEST_EXECUTABLE?[]:[repo]),'--fc-compare',a,b],env});
  const page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  const command=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  const tabs=()=>page.locator('#sessionTabs [role="tab"]');const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');await ready();
  const folderId=await page.locator('#sessionTabs .session-tab.active').getAttribute('data-session-id');
  await command('new:text-compare');await expect(page.locator('#sessionKind')).toHaveText('Text Compare');await ready();
  await app.evaluate(({dialog},old)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[old]});},old);
  await command('open-a');await expect(page.locator('#textA')).toHaveValue('original text');await ready();
  await page.locator('#sessionName').fill('Dirty atomic opening draft');await page.locator('#textA').fill('unsaved content remains');
  const textId=await page.locator('#sessionTabs .session-tab.active').getAttribute('data-session-id'),count=await tabs().count();
  await page.locator(`[data-session-id="${folderId}"]`).click();await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');await ready();
  const beforeRoots=await page.evaluate(()=>window.desktop.folderNavigation());
  await app.evaluate(({app},right)=>{const require=process.mainModule.require.bind(process.mainModule);const helper=require(require('node:path').join(app.getAppPath(),'desktop/local-file-snapshot.cjs'));global.atomicOriginalRead=helper.read;global.atomicHelper=helper;helper.read=async(...args)=>{const value=await global.atomicOriginalRead(...args);if(args[0]===right){helper.read=global.atomicOriginalRead;throw Error('Injected second-side opening failure');}return value;};},path.join(b,'pair.txt'));
  try{await page.locator('#folderRowsA .folder-entry[data-path="pair.txt"]').dblclick();await expect(page.locator('#notice')).toContainText('Injected second-side opening failure');}
  finally{await app.evaluate(()=>{global.atomicHelper.read=global.atomicOriginalRead;});}
  await expect(tabs()).toHaveCount(count);assert.equal(await page.locator('#sessionTabs .session-tab.active').getAttribute('data-session-id'),folderId);assert.deepEqual(await page.evaluate(()=>window.desktop.folderNavigation()),beforeRoots);
  await page.locator(`[data-session-id="${textId}"]`).click();await expect(page.locator('#textA')).toHaveValue('unsaved content remains');await ready();
  await app.evaluate(({app},file)=>{const require=process.mainModule.require.bind(process.mainModule);const helper=require(require('node:path').join(app.getAppPath(),'desktop/local-file-snapshot.cjs'));global.atomicOriginalRead=helper.read;global.atomicHelper=helper;helper.read=async(...args)=>{const value=await global.atomicOriginalRead(...args);if(args[0]===file){helper.read=global.atomicOriginalRead;await require('node:fs/promises').writeFile(file,'changed after stable read');}return value;};},old);
  try{await command('reload');await expect(page.locator('#unsavedDialog')).toBeVisible();await page.locator('#discardSession').click();await expect(page.locator('#notice')).toContainText(/changed.*opening|open it again/i);}
  finally{await app.evaluate(()=>{global.atomicHelper.read=global.atomicOriginalRead;});}
  await expect(page.locator('#textA')).toHaveValue('unsaved content remains');await expect(tabs()).toHaveCount(count);assert.equal(await page.locator('#sessionTabs .session-tab.active').getAttribute('data-session-id'),textId);
  assert.equal((await page.evaluate(()=>window.desktop.checkChanges())).a,true);assert.deepEqual(errors,[]);
  console.log('PASS native opening failures preserve renderer tabs, dirty text, folder roots and original revision');
 }finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
