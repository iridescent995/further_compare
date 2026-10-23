'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fc-mirror-menu-'));let app,page;
 try{
  const roots=['left','right'].map(name=>path.join(temp,name));
  for(const root of roots)await fs.mkdir(path.join(root,'selected'),{recursive:true});
  const originals=[{'selected/shared.txt':'left replacement','selected/left-only.txt':'left addition','outside.txt':'left untouched','selected/hidden.bak':'excluded left'},{'selected/shared.txt':'right original','selected/right-only.txt':'right deletion','outside.txt':'right untouched','selected/hidden.bak':'excluded right','selected/orphan.bak':'excluded orphan'}];
  for(let side=0;side<2;side++)for(const [name,value] of Object.entries(originals[side]))await fs.writeFile(path.join(roots[side],name),value);
  const snapshot=async()=>Promise.all(roots.map(async root=>{const files=await fs.readdir(root,{recursive:true});const values={};for(const name of files.sort())if((await fs.stat(path.join(root,name))).isFile())values[name]=await fs.readFile(path.join(root,name),'utf8');return values;}));
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(30000);
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const menu=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  await app.evaluate(({dialog},roots)=>{global.mirrorConfirm=0;global.mirrorConfirmations=[];dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});dialog.showMessageBox=async(...args)=>{global.mirrorConfirmations.push(args.at(-1));return {response:global.mirrorConfirm};};},[...roots]);
  await ready();await menu('new:folder-compare');await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  await page.locator('#folderExclude').fill('*.bak');await ready();await expect(page.locator('#folderExclude')).toHaveValue('*.bak');
  const row=page.locator('#folderRowsA [data-path="selected"]');await expect(row).toBeVisible();await row.click();await ready();await expect(row).toHaveClass(/selected/);
  const initialDirection=await page.locator('#folderDirection').inputValue();
  const unchanged=async()=>{assert.deepEqual(await snapshot(),originals);await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');await expect(page.locator('#folderDirection')).toHaveValue(initialDirection);};
  const context=async direction=>{await row.click({button:'right'});const context=page.locator('#folderContext');await context.getByRole('menuitem',{name:'Synchronize',exact:true}).click();await context.getByRole('menuitem',{name:'Mirror to '+direction+'…',exact:true}).click();};
  const native=direction=>app.evaluate(({Menu,BrowserWindow},direction)=>{BrowserWindow.getAllWindows()[0].focus();const actions=Menu.getApplicationMenu().items.find(item=>item.label==='Actions');const sync=actions?.submenu.items.find(item=>item.label==='Synchronize');const item=sync?.submenu.items.find(item=>item.label==='Mirror to '+direction+'…');if(!item)throw Error('Missing native mirror command: '+direction);if(!item.enabled)throw Error('Disabled native mirror command: '+direction);item.click(item,BrowserWindow.getAllWindows()[0],{});},direction);
  const preview=async direction=>{await expect(page.locator('#planDialog')).toBeVisible();await expect(page.locator('#planDescription')).toContainText(direction==='right'?'Left → Right':'Right → Left');await expect(page.locator('#planTitle')).toHaveText('3 planned operations');const operations=await page.locator('#planOperations').innerText();assert.match(operations,/copy.*selected\/shared\.txt/);assert.match(operations,new RegExp('copy.*selected/'+(direction==='right'?'left':'right')+'-only\\.txt'));assert.match(operations,new RegExp('delete.*selected/'+(direction==='right'?'right':'left')+'-only\\.txt'));assert.doesNotMatch(operations,/outside\.txt|\.bak/);};
  for(const direction of ['right','left']){await context(direction);await preview(direction);await page.locator('#cancelPlan').click();await ready();await unchanged();}
  for(const direction of ['Right','Left']){await native(direction);await preview(direction.toLowerCase());await page.locator('#cancelPlan').click();await ready();await unchanged();}
  await native('Right');await preview('right');const originalTheme=await page.evaluate(()=>document.body.dataset.theme);
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.body.dataset.theme=theme,theme);
   const colors=await page.locator('#planDialog').evaluate(dialog=>{const style=getComputedStyle(dialog);return {background:style.backgroundColor,borders:[style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth],inks:[...dialog.querySelectorAll('p')].map(p=>getComputedStyle(p).color)};});
   const luminance=color=>{const c=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
   assert.ok(colors.inks.length>=2,'Check description and backup note');const bg=luminance(colors.background);for(const ink of colors.inks){const fg=luminance(ink),ratio=(Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05);assert.ok(ratio>=4.5,theme+' mirror explanatory text contrast: '+ratio);}assert.deepEqual(colors.borders,['0px','0px','0px','0px'],theme+' mirror dialog is borderless');
   if(process.env.FC_MIRROR_SCREENSHOT)await page.screenshot({path:process.env.FC_MIRROR_SCREENSHOT.replace(/\.png$/,'-'+theme+'.png')});
  }
  await page.evaluate(theme=>{if(theme===undefined)delete document.body.dataset.theme;else document.body.dataset.theme=theme;},originalTheme);await page.locator('#applyPlan').click();await ready();await expect(page.locator('#planDialog')).toBeVisible();await unchanged();assert.equal(await app.evaluate(()=>global.mirrorConfirmations.length),1);
  await app.evaluate(()=>{global.mirrorConfirm=1;});await page.locator('#applyPlan').click();await expect(page.locator('#planDialog')).toBeHidden();await ready();
  assert.deepEqual(await snapshot(),[originals[0],{'outside.txt':'right untouched','selected/left-only.txt':'left addition','selected/shared.txt':'left replacement','selected/hidden.bak':'excluded right','selected/orphan.bak':'excluded orphan'}]);await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');await expect(page.locator('#folderDirection')).toHaveValue(initialDirection);assert.equal(await app.evaluate(()=>global.mirrorConfirmations.length),2);
  const afterApply=await snapshot();
  for(const type of ['folder-merge','folder-sync']){
   await app.evaluate(({dialog},roots)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});},[...roots]);
   await menu('new:'+type);const title=type==='folder-merge'?'Folder Merge':'Folder Sync';await expect(page.locator('#sessionKind')).toHaveText(title);await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
   await page.locator('#folderExclude').fill('*.bak');await row.click();await ready();
   await page.locator('#folderOptions').click();await page.locator('#folderDirection').selectOption('b-to-a');await page.locator('#folderOptionsDialog [data-done]').click();
   for(const direction of ['right','left']){await context(direction);await expect(page.locator('#planDialog')).toBeVisible();await expect(page.locator('#planTitle')).toHaveText('0 planned operations');await expect(page.locator('#planDescription')).toContainText(direction==='right'?'Left → Right':'Right → Left');await page.locator('#cancelPlan').click();await ready();await expect(page.locator('#sessionKind')).toHaveText(title);await expect(page.locator('#folderDirection')).toHaveValue('b-to-a');}
   assert.deepEqual(await snapshot(),afterApply);
  }
  console.log('Folder mirror menus passed: both context and native directions, selected-subtree copy/overwrite/delete preview, cancellation, native confirmation, exact applied bytes, and unchanged sibling/session.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
