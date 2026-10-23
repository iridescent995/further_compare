'use strict';
const {selectFolderOption,clickFolderOption,fillFolderOption}=require('./folder-options-helper.cjs');
const {clickFolderAction}=require('./folder-context-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-folder-times-')));let app,page;
 try{
  const left=path.join(temp,'left'),right=path.join(temp,'right'),initial=1700000000000;
  for(const root of [left,right]){await fs.mkdir(root);for(const name of ['a.txt','b.txt']){const file=path.join(root,name);await fs.writeFile(file,'same bytes');await fs.utimes(file,(initial-86400000)/1000,initial/1000);}}
  await fs.mkdir(path.join(left,'nested'));await fs.writeFile(path.join(left,'nested','child.txt'),'child');await fs.utimes(path.join(left,'nested','child.txt'),initial/1000,initial/1000);
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const row=(side,name)=>page.locator('#folderRows'+side+' .folder-entry[data-path="'+name+'"]');
  const status=(name,value)=>expect(row('A',name)).toHaveClass(new RegExp('\\b'+value+'\\b'));
  const openContext=async(side,name)=>{await ready();await row(side,name).click({button:'right'});await clickFolderAction(page,'Change modified time…');await expect(page.locator('#folderModifiedDialog')).toBeVisible();};
  const setValue=async value=>{await page.locator('#folderModifiedValue').fill(value);return page.locator('#folderModifiedValue').evaluate(input=>new Date(input.value).getTime());};
  const apply=async()=>{await page.locator('#folderModifiedApply').click();await expect(page.locator('#folderModifiedDialog')).toBeHidden();await ready();};
  await app.evaluate(({dialog},roots)=>{let i=0;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots[i++]]});},[left,right]);
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();await status('a.txt','equal');await status('b.txt','equal');
  // Metadata mode avoids background reads while checking that atime survives mutation.
  await selectFolderOption(page,'folderCompareMode','modified');await ready();await fillFolderOption(page,'folderTimeTolerance','0');await ready();
  await openContext('A','a.txt');await setValue('2024-06-15T12:34');await page.locator('#folderModifiedCancel').click();await expect(page.locator('#folderModifiedDialog')).toBeHidden();assert.equal((await fs.stat(path.join(left,'a.txt'))).mtimeMs,initial);
  const beforeA=await fs.stat(path.join(left,'a.txt'));
  await openContext('A','a.txt');await page.locator('#folderModifiedValue').fill('');await page.locator('#folderModifiedApply').click();await expect(page.locator('#folderModifiedDialog')).toBeVisible();assert.equal((await fs.stat(path.join(left,'a.txt'))).mtimeMs,initial);
  const epoch=await setValue('2024-06-15T12:34');await apply();const afterA=await fs.stat(path.join(left,'a.txt'));assert.equal(afterA.mtimeMs,epoch);assert.ok(Math.abs(afterA.atimeMs-beforeA.atimeMs)<0.001,'atime preserved within filesystem microsecond precision');assert.equal((await fs.stat(path.join(right,'a.txt'))).mtimeMs,initial);await status('a.txt','changed');
  const displayed=await page.evaluate(epoch=>new Date(epoch).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}),epoch);await expect(row('A','a.txt').locator('.entry-modified')).toHaveText(displayed);
  // A native menu action follows the focused right side and applies to the selected set.
  await row('B','a.txt').click();await row('B','b.txt').click({modifiers:[process.platform==='darwin'?'Meta':'Control']});
  const beforeRight=await Promise.all(['a.txt','b.txt'].map(name=>fs.stat(path.join(right,name))));
  await app.evaluate(({Menu})=>{const find=menu=>{for(const item of menu.items){if(/^(Change|Set) Modified Time/i.test(item.label))return item;if(item.submenu){const found=find(item.submenu);if(found)return found;}}};const item=find(Menu.getApplicationMenu());if(!item)throw Error('Missing native Change Modified Time menu');item.click();});
  await expect(page.locator('#folderModifiedDialog')).toBeVisible();await expect(page.locator('#folderModifiedSummary')).toContainText('2');await page.screenshot({path:'/private/tmp/further-folder-modified.png'});await setValue('2024-06-15T12:34');await apply();
  for(const [i,name]of ['a.txt','b.txt'].entries()){const stat=await fs.stat(path.join(right,name));assert.equal(stat.mtimeMs,epoch);assert.ok(Math.abs(stat.atimeMs-beforeRight[i].atimeMs)<0.001,'atime preserved within filesystem microsecond precision');}assert.equal((await fs.stat(path.join(left,'b.txt'))).mtimeMs,initial);await status('a.txt','equal');await status('b.txt','changed');
  await selectFolderOption(page,'folderCompareMode','content');await ready();await status('a.txt','equal');await status('b.txt','equal');
  await openContext('A','nested');await setValue('2024-06-15T12:34');await apply();assert.equal((await fs.stat(path.join(left,'nested'))).mtimeMs,epoch);assert.equal((await fs.stat(path.join(left,'nested','child.txt'))).mtimeMs,initial);
  for(const [paths,value]of [[['../outside.txt'],epoch],[['a.txt'],null],[['a.txt'],'bad']]){const result=await page.evaluate(async({paths,value})=>{try{await window.desktop.setFolderModified('a',paths,value);return 'accepted';}catch(error){return error.message;}},{paths,value});assert.notEqual(result,'accepted');}
  assert.equal((await fs.stat(path.join(left,'a.txt'))).mtimeMs,epoch);assert.deepEqual(errors,[]);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','folder:operation-history'));const history=page.locator('#folderOperationHistory');await expect(history).toBeVisible();await expect(history.locator('li[data-status="Completed"]')).toHaveCount(3);await expect(history.locator('li[data-status="Failed"]')).toHaveCount(0);await expect(history).toContainText(new Date(epoch).toISOString());await expect(history).toContainText('2 operations completed.');await expect(history).toContainText('Change modified time on right');await history.locator('[data-close]').click();
  console.log('Folder modified time passed: context cancel/apply, invalid input, focused native multi-selection, side isolation, preserved atime, refreshed metadata, comparison rules and traversal rejection.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
