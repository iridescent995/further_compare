'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-difference-nav-')));let app,page;
 try{
  const left=path.join(base,'left'),right=path.join(base,'right');for(const root of [left,right]){await fs.mkdir(root);await fs.writeFile(path.join(root,'same.txt'),'same');}
  for(const name of ['a.txt','b.txt','c.txt'])await fs.writeFile(path.join(left,name),'left only');
  const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();
  await app.evaluate(({dialog},roots)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});},[left,right]);
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  const row=name=>page.locator('#folderRowsA .folder-entry[data-path="'+name+'"]');
  const current=async(name,position)=>{await expect(row(name)).toHaveAttribute('aria-current','true');const id=await row(name).getAttribute('data-id');await expect(page.locator('#folderRowsB .folder-entry[data-id="'+id+'"]')).toHaveAttribute('aria-current','true');await expect(page.locator('.folder-entry.current-difference')).toHaveCount(2);await expect(page.locator('#changePosition')).toHaveText(position);await expect(row('same.txt')).toHaveClass(/selected/);};
  await expect(row('same.txt')).toHaveClass(/equal/);await row('same.txt').click();await expect(page.locator('#changePosition')).toHaveText('0 / 3');
  await page.locator('#previous').click();await current('c.txt','3 / 3');
  await page.locator('#next').click();await current('a.txt','1 / 3');
  await page.locator('#next').click();await current('b.txt','2 / 3');await page.locator('#next').click();await current('c.txt','3 / 3');
  await page.locator('#folderSortOrder').click();await current('c.txt','1 / 3');
  await page.locator('#next').click();await current('b.txt','2 / 3');await page.locator('#previous').click();await current('c.txt','1 / 3');
  for(const theme of ['light','dark']){await page.getByRole('button',{name:'Display',exact:true}).click();await page.getByLabel('Theme',{exact:true}).selectOption(theme);await page.getByRole('button',{name:'Done',exact:true}).click();assert.notEqual(await row('c.txt').evaluate(el=>getComputedStyle(el).boxShadow),'none');await page.screenshot({path:path.join(os.tmpdir(),'further-difference-'+theme+'.png')});}
  await page.locator('#folderExclude').fill('c.txt');await expect(page.locator('.folder-entry.current-difference')).toHaveCount(0);await expect(page.locator('#changePosition')).toHaveText('0 / 2');
  await page.locator('#previous').click();await current('a.txt','2 / 2');
  await page.locator('#folderExclude').fill('*.txt');await expect(page.locator('.folder-entry.current-difference')).toHaveCount(0);await expect(page.locator('#changePosition')).toHaveText('0 / 0');await expect(page.locator('#previous')).toBeDisabled();await expect(page.locator('#next')).toBeDisabled();
  console.log('Folder difference navigation passed: paired accessible marker, initial Previous, wrapping, stable identity on sorting, filtering, preserved selection and both theme styles.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
