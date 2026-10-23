'use strict';
const {_electron:electron,expect}=require('@playwright/test'),{clickFolderAction}=require('./folder-context-helper.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-parent-pair-')));let app,page;
 try{
  const parents=['left','right'].map(n=>path.join(base,n)),children=parents.map(p=>path.join(p,'child'));
  for(const child of children){await fs.mkdir(child,{recursive:true});await fs.writeFile(path.join(child,'inside.txt'),'inside');}
  const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[process.cwd()]}),env});page=await app.firstWindow();page.setDefaultTimeout(20000);
  await app.evaluate(({BrowserWindow,dialog},children)=>{BrowserWindow.getAllWindows().forEach(w=>w.hide());globalThis.parentChoices=children;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[globalThis.parentChoices.shift()]});},children);
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const roots=async values=>{await ready();for(const [i,side]of ['A','B'].entries())await expect(page.locator('#path'+side)).toHaveValue(values[i]);};
  await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();
  await page.locator('#openA').click();await ready();await page.locator('#openB').click();await roots(children);
  await page.locator('#folderRowsA [data-path="inside.txt"]').click({button:'right'});await clickFolderAction(page,'Go to both parent folders');await roots(parents);
  for(const side of ['A','B'])await expect(page.locator('#folderRows'+side+' [data-path="child"]')).toBeVisible();
  assert.equal(await page.getByRole('tab').count(),1);
  for(const side of ['A','B']){await page.locator('#folderBack'+side).click();await ready();}await roots(children);
  const native=()=>app.evaluate(({Menu})=>{const visit=m=>{for(const item of m.items){if(item.label==='Parent Folders (Both Sides)')return item;if(item.submenu){const found=visit(item.submenu);if(found)return found;}}};visit(Menu.getApplicationMenu()).click();});
  await native();await roots(parents);
  await native();await expect(page.locator('#notice')).toContainText(/overlap|ancestor|contain|nested|separate/i);await roots(parents);
  for(const side of ['A','B']){await page.locator('#folderBack'+side).click();await ready();}await roots(children);
  assert.equal(await fs.readFile(path.join(children[0],'inside.txt'),'utf8'),'inside');
  console.log('Paired parent navigation passed: context/native routes, one tab, both roots, independent Back histories, rejected overlap leaves both unchanged.');
 }finally{if(page)await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
