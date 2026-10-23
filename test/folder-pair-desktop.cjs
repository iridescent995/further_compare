'use strict';
const {openFolderOptions,selectFolderOption,clickFolderOption}=require('./folder-options-helper.cjs');
// Real renderer, native menus and IPC against isolated file/folder fixtures.
const {clickFolderAction,folderContextItem}=require('./folder-context-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-folder-pair-')));let app,page;
 try{
  const left=path.join(temp,'left'),right=path.join(temp,'right');
  const leftName='old name $ literal.txt',rightName='new name (copy).txt';
  for(const root of [left,right])await fs.mkdir(root);
  await fs.writeFile(path.join(left,leftName),'left original\n');await fs.writeFile(path.join(right,rightName),'right original\n');
  await fs.writeFile(path.join(left,'extra.txt'),'extra');
  await fs.writeFile(path.join(left,'table left.csv'),'id,value\n1,old\n');await fs.writeFile(path.join(right,'table right.tsv'),'id\tvalue\n1\tnew\n');
  await fs.writeFile(path.join(left,'opaque left.payload'),'unknown text left');await fs.writeFile(path.join(right,'opaque right.payload'),'unknown text right');
  await fs.writeFile(path.join(left,'raw left.payload'),Buffer.from([0,1,255]));await fs.writeFile(path.join(right,'raw right.payload'),Buffer.from([0,2,255]));
  await fs.mkdir(path.join(left,'old folder'));await fs.mkdir(path.join(right,'new folder'));
  await fs.writeFile(path.join(left,'old folder','child.txt'),'AAAA');await fs.writeFile(path.join(right,'new folder','child.txt'),'BBBB');
  await fs.writeFile(path.join(temp,'outside.txt'),'outside');
  let symlink=false;try{await fs.symlink(path.join(temp,'outside.txt'),path.join(left,'linked.txt'));symlink=true;}catch(error){if(!['EPERM','EACCES'].includes(error.code))throw error;}
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({dialog},{roots,savePaths})=>{let index=0,saveIndex=0;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots[index++]]});dialog.showSaveDialog=async()=>({canceled:false,filePath:savePaths[saveIndex++]});dialog.showMessageBox=async()=>({response:1});},{roots:[left,right],savePaths:[path.join(left,leftName),path.join(right,rightName)]});
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const row=(name,side='A')=>page.locator('#folderRows'+side+' .folder-entry').and(page.locator('[data-path='+JSON.stringify(name)+']'));
  const kind=value=>expect(page.locator('#sessionKind')).toHaveText(value);
  const modifier=process.platform==='darwin'?'Meta':'Control';
  const select=async(a,b,enabled=true)=>{await ready();await row(a).click();await row(b,'B').click({modifiers:[modifier]});await expect(row(a)).toHaveClass(/selected/);await expect(row(b,'B')).toHaveClass(/selected/);if(enabled)await expect(page.locator('#comparePair')).toBeEnabled();};
  const menu=async label=>{await ready();await app.evaluate(({Menu},label)=>{const find=menu=>{for(const item of menu.items){if(item.label===label)return item;if(item.submenu){const result=find(item.submenu);if(result)return result;}}};const item=find(Menu.getApplicationMenu());if(!item)throw Error('Missing native action '+label);item.click();},label);};
  const back=async(a,b)=>{await ready();await page.locator('#backToFolder').click();await kind('Folder Compare');await ready();await expect(page.locator('#pathA')).toHaveValue(left);await expect(page.locator('#pathB')).toHaveValue(right);if(a)await expect(row(a)).toHaveClass(/selected/);if(b)await expect(row(b,'B')).toHaveClass(/selected/);};
  const contextState=async(name,enabled)=>{await row(name).click({button:'right'});const item=await folderContextItem(page,'Compare selected pair');if(enabled)await expect(item).toBeEnabled();else await expect(item).toBeDisabled();await page.keyboard.press('Escape');await page.keyboard.press('Escape');};
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  const initialTabs=await page.getByRole('tab').count();
  await expect(page.locator('#comparePair')).toBeDisabled();await row(leftName).click();await expect(page.locator('#comparePair')).toBeDisabled();await contextState(leftName,false);
  await select(leftName,rightName);await row('extra.txt').click({modifiers:[modifier]});await expect(page.locator('#comparePair')).toBeDisabled();await contextState(leftName,false);
  await select(leftName,'new folder',false);await expect(page.locator('#comparePair')).toBeDisabled();
  await contextState(leftName,false);
  // Rejected IPC requests must leave the parent roots and subsequent pair authority intact.
  for(const pair of [['../outside.txt',rightName],[path.join(temp,'outside.txt'),rightName],['missing.txt',rightName],[leftName,'new folder'],...(symlink?[['linked.txt',rightName]]:[])]){
   const error=await page.evaluate(async pair=>{try{await window.desktop.openFolderPair(...pair);return null;}catch(error){return error.message;}},pair);assert.ok(error,'Invalid pair must be rejected: '+JSON.stringify(pair));
  }
  await select(leftName,rightName);await contextState(leftName,true);await clickFolderOption(page,'comparePair');await kind('Text Compare');await ready();
  await expect(page.locator('#textA')).toHaveValue('left original\n');await expect(page.locator('#textB')).toHaveValue('right original\n');assert.equal(await page.getByRole('tab').count(),initialTabs+1);
  await expect(page.locator('#textA')).toBeVisible();await expect(page.locator('#textA')).toBeEditable();await page.locator('#textA').fill('left saved\n');await page.locator('#saveA').click();await ready();await page.locator('#textB').fill('right saved\n');await page.locator('#saveB').click();await ready();
  assert.equal(await fs.readFile(path.join(left,leftName),'utf8'),'left saved\n');assert.equal(await fs.readFile(path.join(right,rightName),'utf8'),'right saved\n');
  await fs.writeFile(path.join(left,leftName),'left external\n');await fs.writeFile(path.join(right,rightName),'right external\n');await menu('Reload Files');await page.locator('#discardSession').click();await expect(page.locator('#textA')).toHaveValue('left external\n');await expect(page.locator('#textB')).toHaveValue('right external\n');await back(leftName,rightName);
  await select('table left.csv','table right.tsv');await row('table left.csv').click({button:'right'});await clickFolderAction(page,'Compare selected pair');await kind('Table Compare');await expect(page.locator('.advanced-note').first()).toContainText('1 changed');await back('table left.csv','table right.tsv');
  await select('opaque left.payload','opaque right.payload');await menu('Compare Selected Pair');await kind('Text Compare');await expect(page.locator('#textA')).toHaveValue('unknown text left');await expect(page.locator('#textB')).toHaveValue('unknown text right');await back();
  await select('raw left.payload','raw right.payload');await clickFolderOption(page,'comparePair');await kind('Binary Compare');await expect(page.locator('.advanced-note').first()).toContainText('differing byte');await back();
  await select('table left.csv',rightName);await clickFolderOption(page,'comparePair');await kind('Binary Compare');await back();
  await selectFolderOption(page,'folderCompareMode','size');await ready();await select('old folder','new folder');await menu('Compare Selected Pair');await kind('Folder Compare');await ready();
  await expect(page.locator('#pathA')).toHaveValue(path.join(left,'old folder'));await expect(page.locator('#pathB')).toHaveValue(path.join(right,'new folder'));await expect(page.locator('#folderCompareMode')).toHaveValue('size');await expect(row('child.txt')).toHaveClass(/equal/);await expect(row('child.txt')).toHaveClass(/metadata-match/);
  await row('child.txt').click({button:'right'});await clickFolderAction(page,'Back to parent comparison');await ready();await expect(page.locator('#pathA')).toHaveValue(left);await expect(page.locator('#pathB')).toHaveValue(right);await expect(row('old folder')).toHaveClass(/selected/);await expect(row('new folder','B')).toHaveClass(/selected/);
  await row('old folder').click({button:'right'});await expect(await folderContextItem(page,'Back to parent comparison')).toBeDisabled();await page.keyboard.press('Escape');await page.keyboard.press('Escape');await expect(page.locator('#folderCompareMode')).toHaveValue('size');await page.screenshot({path:path.join(os.tmpdir(),'further-folder-pair.png')});assert.deepEqual(errors,[]);
  console.log('Selected folder pairs passed: toolbar/context/native routes, disabled invalid selections, literal arbitrary file paths, save/reload, automatic table/text/binary modes, separate folder roots, inherited rules, retained parent selection, and rejected unsafe IPC paths.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
