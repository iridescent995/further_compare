'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-filter-session-')));let app,page;
 try{
  const left=path.join(temp,'left'),right=path.join(temp,'right'),saved=path.join(temp,'filters.fcompare');
  for(const root of [left,right]){await fs.mkdir(root);await fs.writeFile(path.join(root,'keep.txt'),'keep');await fs.writeFile(path.join(root,'other.txt'),'other');await fs.writeFile(path.join(root,'skip.log'),'skip');}
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(15000);
  await app.evaluate(({dialog},v)=>{let i=0;dialog.showOpenDialog=async(_w,o)=>({canceled:false,filePaths:[o.properties.includes('openDirectory')?[v.left,v.right][i++]:v.saved]});dialog.showSaveDialog=async()=>({canceled:false,filePath:v.saved});}, {left,right,saved});
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const menu=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  const row=name=>page.locator('#folderRowsA .folder-entry[data-path="'+name+'"]');
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  await page.locator('#folderInclude').fill('*.txt');await page.locator('#folderExclude').fill('skip*;"semi;colon.txt"');await page.locator('#folderSearch').fill('keep');await expect(row('keep.txt')).toBeVisible();await expect(row('other.txt')).toHaveCount(0);
  await row('keep.txt').dblclick();await expect(page.locator('#sessionKind')).toHaveText('Text Compare');await page.locator('#backToFolder').click();await ready();await expect(page.locator('#folderSearch')).toHaveValue('keep');await expect(row('other.txt')).toHaveCount(0);
  await menu('save-session');await expect.poll(async()=>{try{return JSON.parse(await fs.readFile(saved,'utf8')).options.folderSearch;}catch{return null;}}).toBe('keep');await ready();
  // Direct toolbar edits must mark a saved session dirty and reach its next save.
  await page.locator('#folderSearch').fill('other');await expect(page.getByRole('tab',{selected:true})).toContainText('•');await menu('save-session');await expect.poll(async()=>JSON.parse(await fs.readFile(saved,'utf8')).options.folderSearch).toBe('other');await ready();
  await menu('new:folder-compare');await ready();await expect(page.locator('#folderSearch')).toHaveValue('');await expect(page.locator('#folderInclude')).toHaveValue('*');
  await menu('open-session');await ready();await expect(page.locator('#folderSearch')).toHaveValue('other');await expect(page.locator('#folderInclude')).toHaveValue('*.txt');await expect(page.locator('#folderExclude')).toHaveValue('skip*;"semi;colon.txt"');await expect(row('other.txt')).toBeVisible();await expect(row('keep.txt')).toHaveCount(0);
  for(const root of [left,right])assert.equal(await fs.readFile(path.join(root,'keep.txt'),'utf8'),'keep');
  console.log('Folder filter session passed: child/parent restoration, independent new session, dirty tracking, save/reopen and filtered rows.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
