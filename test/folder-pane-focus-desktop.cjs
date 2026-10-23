'use strict';
const {_electron:electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-pane-focus-'));let app,page;try{
 const left=path.join(root,'left'),right=path.join(root,'right');for(const dir of [left,right]){await fs.mkdir(dir);await fs.writeFile(path.join(dir,'same.txt'),'same');}await fs.writeFile(path.join(left,'only.txt'),'left');
 const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(12000);
 await app.evaluate(({dialog},roots)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});},[left,right]);
 await page.locator('#welcome [data-command="new:folder-compare"]').click();await page.locator('#openA').click();await page.locator('#openB').click();await expect(page.locator('#folderRowsA [data-path="same.txt"]')).toHaveClass(/equal/);
 const a=page.locator('#folderRowsA'),b=page.locator('#folderRowsB');const tabTo=async(target,key='Tab')=>{for(let i=0;i<8;i++){await page.keyboard.press(key);if(await target.evaluate(el=>el===document.activeElement))return;}await expect(target).toBeFocused();};await expect(a.locator('[tabindex="0"]')).toHaveCount(1);await expect(b.locator('[tabindex="0"]')).toHaveCount(1);
 await a.locator('[tabindex="0"]').focus();await tabTo(b.locator('[data-path="same.txt"]'));assert.equal(await page.locator('.folder-entry.selected').count(),0);
 await page.keyboard.press('Shift+F10');await expect(page.locator('#folderContext')).toBeVisible();await page.keyboard.press('Escape');await expect(b.locator('[data-path="same.txt"]')).toBeFocused();
 // Pane focus retains file selection shortcuts and can re-enter real rows.
 const modifier=process.platform==='darwin'?'Meta':'Control',chosen=pane=>pane.locator('.selected').evaluateAll(rows=>rows.map(row=>row.dataset.path));
 for(const [pane,names,side]of [[a,['only.txt','same.txt'],'left'],[b,['same.txt'],'right']]){
  await pane.focus();await page.keyboard.press(modifier+'+a');assert.deepEqual(await chosen(pane),names);await expect(pane).toBeFocused();
  await page.keyboard.press('ArrowDown');await expect(pane.locator('[data-path="'+names[0]+'"]')).toBeFocused();assert.deepEqual(await chosen(pane),[names[0]]);
  await pane.focus();await page.keyboard.press(modifier+'+End');await expect(pane.locator('[data-path="same.txt"]')).toBeFocused();assert.deepEqual(await chosen(pane),[names[0]]);
  await pane.focus();await page.keyboard.press('End');await expect(pane.locator('[data-path="same.txt"]')).toBeFocused();assert.deepEqual(await chosen(pane),['same.txt']);
  await pane.focus();await page.keyboard.press('Delete');await expect(page.locator('#planDialog')).toBeVisible();await expect(page.locator('#planDescription')).toHaveText(new RegExp('^Delete from '+side+'\\nFile-action scope:'));await page.locator('#cancelPlan').click();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
 }
 // A pane containing only missing-side placeholders remains reachable.
 await page.locator('#folderSearch').fill('only.txt');await expect(a.locator('.folder-entry')).toHaveCount(1);await expect(b).toHaveAttribute('tabindex','0');await expect(b.locator('[tabindex="0"]')).toHaveCount(0);
 await a.locator('[tabindex="0"]').focus();await tabTo(b);await page.keyboard.press('Shift+F10');await expect(page.locator('#folderContext')).toBeVisible();await expect(page.getByRole('menuitem',{name:'Open comparison',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(b).toBeFocused();
 await page.keyboard.press(modifier+'+a');await page.keyboard.press('ArrowDown');await page.keyboard.press('End');await page.keyboard.press('Delete');await expect(b).toBeFocused();assert.deepEqual(await chosen(b),[]);await expect(page.locator('#planDialog')).toBeHidden();
 // Both empty panes remain independent keyboard destinations after filtering.
 await page.locator('#folderSearch').fill('no-results');await expect(a).toHaveAttribute('tabindex','0');await expect(b).toHaveAttribute('tabindex','0');await a.focus();await tabTo(b);await tabTo(a,'Shift+Tab');
 for(const pane of [a,b]){await pane.focus();await page.keyboard.press(modifier+'+a');await page.keyboard.press('Home');await page.keyboard.press('ArrowUp');await page.keyboard.press('Delete');await expect(pane).toBeFocused();assert.deepEqual(await chosen(pane),[]);await expect(page.locator('#planDialog')).toBeHidden();}
 for(const dir of [left,right])assert.equal(await fs.readFile(path.join(dir,'same.txt'),'utf8'),'same');assert.equal(await fs.readFile(path.join(left,'only.txt'),'utf8'),'left');
 assert.equal(await page.getByRole('tab').count(),1);console.log('Pane keyboard focus passed: both panes, missing placeholders, empty results, context menus, pane-level select-all/navigation/delete previews, modifier focus, no placeholder selection, unchanged files and no child tabs.');
 }finally{if(page)await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
