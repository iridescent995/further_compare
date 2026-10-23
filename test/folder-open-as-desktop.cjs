'use strict';
const {clickFolderAction}=require('./folder-context-helper.cjs');
// Real native menus, main/preload IPC and renderer; dialogs use isolated fixtures.
const {_electron:electron,expect}=require('@playwright/test');
const {zip}=require('./archive-fixture.cjs');
function wav(samples){const b=Buffer.alloc(44+samples.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples.length*2,40);samples.forEach((v,i)=>b.writeInt16LE(v,44+i*2));return b;}
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-folder-open-as-')));let app,page;
 try{
  const left=path.join(temp,'left'),right=path.join(temp,'right');
  for(const root of [left,right]){
   await fs.mkdir(root);await fs.mkdir(path.join(root,'directory'));
   await fs.writeFile(path.join(root,'sound.payload'),wav(root===left?[0,100,200]:[0,100,300]));
   await fs.writeFile(path.join(root,'archive.payload'),zip([{name:'entry.txt',data:root===left?'left':'right'}]));
   await fs.writeFile(path.join(root,'registry.payload'),'Windows Registry Editor Version 5.00\r\n\r\n[HKEY_CURRENT_USER\\Software\\Test]\r\n"Value"="'+(root===left?'left':'right')+'"\r\n');
   await fs.writeFile(path.join(root,'words.bin'),root===left?'left text\n':'right text\n');
   await fs.writeFile(path.join(root,'records.txt'),root===left?'id,value\n1,left\n':'id,value\n1,right\n');
   await fs.writeFile(path.join(root,'automatic.csv'),root===left?'id,value\n1,left\n':'id,value\n1,right\n');
  }
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(15000);
  const images=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=2;c.height=1;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,2,1);const a=c.toDataURL().split(',')[1];x.fillStyle='green';x.fillRect(0,0,1,1);return [a,c.toDataURL().split(',')[1]];});await fs.writeFile(path.join(left,'image.payload'),Buffer.from(images[0],'base64'));await fs.writeFile(path.join(right,'image.payload'),Buffer.from(images[1],'base64'));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({dialog},roots)=>{let index=0;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots[index++]]});dialog.showSaveDialog=async()=>({canceled:false,filePath:roots[0]+'/words.bin'});dialog.showMessageBox=async()=>({response:1});},[left,right]);
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const row=(name,side='A')=>page.locator('#folderRows'+side+' .folder-entry[data-path="'+name+'"]');
  const kind=value=>expect(page.locator('#sessionKind')).toHaveText(value);
  const menu=async(label,parent)=>{await ready();await app.evaluate(({Menu},{label,parent})=>{
   const find=(menu,label)=>{for(const item of menu.items){if(item.label===label)return item;if(item.submenu){const found=find(item.submenu,label);if(found)return found;}}};
   const root=parent?find(Menu.getApplicationMenu(),parent)?.submenu:Menu.getApplicationMenu();if(!root)throw Error('Missing native menu '+parent);const item=find(root,label);if(!item)throw Error('Missing native action '+label);item.click();
  },{label,parent});};
  const context=async name=>{await ready();await row(name).click({button:'right'});};
  const back=async()=>{await ready();await page.locator('#backToFolder').click();await kind('Folder Compare');await ready();await expect(page.locator('#pathA')).toHaveValue(left);await expect(page.locator('#pathB')).toHaveValue(right);};
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  const initialTabs=await page.getByRole('tab').count();
  await row('words.bin').click();await kind('Folder Compare');assert.equal(await page.getByRole('tab').count(),initialTabs);await expect(row('words.bin')).toHaveClass(/selected/);
  await context('words.bin');await clickFolderAction(page,'Open as text comparison');await kind('Text Compare');await ready();
  await expect(page.locator('#textA')).toHaveValue('left text\n');await expect(page.locator('#textB')).toHaveValue('right text\n');assert.equal(await page.getByRole('tab').count(),initialTabs+1);
  // Save back to the fixture, then reload an external edit: forced text keeps its real file authority.
  await expect(page.locator('#textA')).toBeVisible();await expect(page.locator('#textA')).toBeEditable();await page.locator('#textA').fill('saved as text\n');await page.locator('#saveA').click();await ready();assert.equal(await fs.readFile(path.join(left,'words.bin'),'utf8'),'saved as text\n');
  await fs.writeFile(path.join(left,'words.bin'),'external text\n');await menu('Reload Files');await page.locator('#discardSession').click();await expect(page.locator('#textA')).toHaveValue('external text\n');await back();
  await context('records.txt');await clickFolderAction(page,'Open as table comparison');await kind('Table Compare');await expect(page.locator('.advanced-note').first()).toContainText('1 changed');await back();
  // The native submenu follows the focused side and opens the requested mode despite .txt.
  await row('records.txt','B').click();await menu('Binary Comparison','Open As');await kind('Binary Compare');await expect(page.locator('.advanced-note').first()).toContainText('differing byte');await back();
  for(const [file,mode,title,selector,expected] of [
   ['image.payload','picture','Picture Compare','.picture-status','1 of 2 pixels differ'],
   ['sound.payload','audio','Audio Compare','.media-status','1 different samples'],
   ['archive.payload','archive','Archive Compare','#archiveWorkspace .archive-row[data-path="entry.txt"]','entry.txt'],
   ['registry.payload','registry','Registry Compare','#registryWorkspace .registry-row.changed','Value']
  ]){await context(file);await clickFolderAction(page,'Open as '+mode+' comparison');await kind(title);await expect(page.locator(selector)).toContainText(expected);if(mode==='archive')await expect(page.locator(selector)).toHaveClass(/changed/);await back();}
  // Automatic double-click dispatch is unchanged, and the folder session remains available.
  await row('automatic.csv').click();await kind('Folder Compare');await row('automatic.csv').dblclick();await kind('Table Compare');await back();
  // Moving focus with the selection modifier must not silently compare an unselected row.
  await row('records.txt').click();await row('records.txt').press((process.platform==='darwin'?'Meta':'Control')+'+ArrowDown');
  await expect(row('registry.payload')).toBeFocused();await expect(row('registry.payload')).not.toHaveClass(/selected/);const beforeRefused=await page.getByRole('tab').count();await menu('Binary Comparison','Open As');await expect(page.locator('#notice')).toContainText('Select one file');await kind('Folder Compare');assert.equal(await page.getByRole('tab').count(),beforeRefused);
  const labels=['text','binary','table','picture','audio','archive','registry'];
  await context('directory');await page.locator('#folderContext').getByRole('menuitem',{name:'Open as',exact:true}).click();for(const label of labels)await expect(page.locator('#folderContext').getByRole('menuitem',{name:'Open as '+label+' comparison',exact:true,includeHidden:true})).toBeDisabled();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await row('words.bin').click();await row('records.txt').click({modifiers:[process.platform==='darwin'?'Meta':'Control']});await context('words.bin');await page.locator('#folderContext').getByRole('menuitem',{name:'Open as',exact:true}).click();for(const label of labels)await expect(page.locator('#folderContext').getByRole('menuitem',{name:'Open as '+label+' comparison',exact:true,includeHidden:true})).toBeDisabled();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await row('words.bin').click();await context('words.bin');await page.locator('#folderContext').getByRole('menuitem',{name:'Open as',exact:true}).focus();await page.keyboard.press('ArrowRight');for(const [index,label] of labels.entries()){if(index)await page.keyboard.press('ArrowDown');await expect(page.locator('#folderContext').getByRole('menuitem',{name:'Open as '+label+' comparison',exact:true,includeHidden:true})).toBeFocused();}await page.keyboard.press('Home');await page.screenshot({path:path.join(os.tmpdir(),'further-folder-open-as.png')});
  assert.deepEqual(errors,[]);console.log('Folder Open As passed: forced text save/reload, table, picture, audio, archive, registry and native binary modes, keyboard menu traversal, single-click selection, automatic double-click routing, retained parent session, and disabled directory/multiple selections.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
