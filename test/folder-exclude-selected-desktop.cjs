'use strict';
const {_electron:electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {clickFolderAction}=require('./folder-context-helper.cjs');
(async()=>{const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fc-exclude-'));let app,page;try{
 const roots=['left','right'].map(name=>path.join(temp,name));for(const root of roots){await fs.mkdir(path.join(root,'nested'),{recursive:true});for(const name of ['a.txt','semi;colon.txt','nested/a.txt'])await fs.writeFile(path.join(root,name),name);}
 const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[process.cwd()]}),env});page=await app.firstWindow();
 await app.evaluate(({dialog},roots)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});},[...roots]);
 await page.locator('#welcome [data-command="new:folder-compare"]').click();await page.locator('#openA').click();await page.locator('#openB').click();
 const row=(side,name)=>page.locator('#folderRows'+side+' .folder-entry').filter({has:page.locator('.entry-label',{hasText:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})});
 const native=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','folder:'+action),action);
 await row('A','nested').getByRole('button',{name:'Expand nested',exact:true}).click();await expect(page.locator('#folderRowsA [data-path="nested/a.txt"]')).toBeVisible();
 await page.locator('#folderRowsA [data-path="a.txt"]').click();await row('A','semi;colon.txt').click({modifiers:[process.platform==='darwin'?'Meta':'Control']});await row('A','semi;colon.txt').click({button:'right'});await clickFolderAction(page,'Exclude selected');
 for(const side of ['A','B']){await expect(page.locator('#folderRows'+side+' [data-path="a.txt"]')).toHaveCount(0);await expect(row(side,'semi;colon.txt')).toHaveCount(0);await expect(page.locator('#folderRows'+side+' [data-path="nested/a.txt"]')).toBeVisible();}
 await expect(page.locator('.folder-entry.selected')).toHaveCount(0);await expect(page.locator('#folderExclude')).toHaveValue('"a.txt";"semi;colon.txt"');
 await native('reset-masks');await expect(row('B','semi;colon.txt')).toBeVisible();await row('B','nested').click();await native('exclude-selected');
 await expect(page.locator('#folderRowsA [data-path="nested/a.txt"]')).toHaveCount(0);await expect(row('A','nested')).toHaveCount(0);await expect(page.locator('#folderRowsA [data-path="a.txt"]')).toBeVisible();
 await native('reset-masks');await expect(page.locator('#folderRowsB [data-path="nested/a.txt"]')).toBeVisible();assert.equal(await page.getByRole('tab').count(),1);
 for(const root of roots)for(const name of ['a.txt','semi;colon.txt','nested/a.txt'])assert.equal(await fs.readFile(path.join(root,name),'utf8'),name);
 console.log('Exclude selected passed: context and native actions, exact paths, semicolon names, nested names retained, both panes, subtree exclusion, selection pruning, reset and unchanged files.');
}finally{if(page)await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
