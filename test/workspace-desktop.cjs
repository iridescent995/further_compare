'use strict';
const {_electron:electron,expect}=require('@playwright/test'),{clickFolderAction}=require('./folder-context-helper.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-workspace-')));let app,page;try{
 const left=path.join(base,'left'),right=path.join(base,'right'),file=path.join(base,'saved.fcworkspace');for(const root of [left,right]){await fs.mkdir(root);await fs.writeFile(path.join(root,'item.txt'),'content');}
 const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[process.cwd()]}),env});page=await app.firstWindow();page.setDefaultTimeout(20000);
 await app.evaluate(({BrowserWindow,dialog},values)=>{BrowserWindow.getAllWindows().forEach(w=>w.hide());const savePath=values[2];globalThis.workspacePaths=[...values];dialog.showOpenDialog=async()=>{const p=globalThis.workspacePaths.shift();return {canceled:!p,filePaths:p?[p]:[]};};dialog.showSaveDialog=async()=>({canceled:false,filePath:savePath});},[left,right,file]);
 const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
 const native=label=>app.evaluate(({Menu},label)=>{const find=m=>{for(const item of m.items){if(item.label===label)return item;if(item.submenu){const found=find(item.submenu);if(found)return found;}}};find(Menu.getApplicationMenu()).click();},label);
 await page.locator('#welcome [data-command="new:text-compare"]').click();await ready();await page.locator('#sessionName').fill('Draft text');await page.locator('#textA').fill('unsaved left');await page.locator('#textB').fill('unsaved right');await page.getByLabel('Wrap',{exact:true}).check();
 await native('New Folder Compare');await ready();
 await page.locator('#sessionName').fill('Folder set');await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();await page.locator('#folderExclude').fill('*.bak');
 await page.locator('#folderRowsA [data-path="item.txt"]').click({button:'right'});await clickFolderAction(page,'Save workspace as…');await ready();
 await expect.poll(async()=>{try{return JSON.parse(await fs.readFile(file,'utf8')).sessions.length;}catch{return 0;}}).toBe(2);
 const saved=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(saved.activeIndex,1);assert.equal(saved.sessions[0].text.a,'unsaved left');assert.equal(saved.sessions[1].options.folderExclude,'*.bak');
 await native('Open Workspace…');await expect(page.getByRole('tab')).toHaveCount(4);await ready();await expect(page.locator('#pathA')).toHaveValue(left);await expect(page.locator('#folderRowsA [data-path="item.txt"]')).toBeVisible();
 await page.getByRole('tab').nth(2).click();await ready();await expect(page.locator('#textA')).toHaveValue('unsaved left');await expect(page.getByLabel('Wrap',{exact:true})).toBeChecked();
 await page.getByRole('tab').first().click();await ready();await expect(page.locator('#textA')).toHaveValue('unsaved left');await expect(page.locator('#dirtyIndicator')).toBeVisible();
 // Cancelling, then a missing root, must add no partial tabs.
 await native('Open Workspace…');await ready();await expect(page.getByRole('tab')).toHaveCount(4);
 saved.sessions[1].folders.a.path=path.join(base,'missing');const broken=path.join(base,'broken.fcworkspace');await fs.writeFile(broken,JSON.stringify(saved));
 await app.evaluate((_,p)=>globalThis.workspacePaths.push(p),broken);await native('Open Workspace…');await expect(page.locator('#notice')).toContainText(/ENOENT|exist|found/i);await ready();await expect(page.getByRole('tab')).toHaveCount(4);await expect(page.locator('#textA')).toHaveValue('unsaved left');
 console.log('Workspace desktop passed: mixed tab snapshot, context save, native open, active tab, wrap/filter restoration, existing dirty tabs preserved, cancellation and atomic missing-root rejection.');
}finally{if(page)await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(base,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
