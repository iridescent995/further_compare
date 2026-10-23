'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fc-display-focus-'));let app,page;
 try{
  const roots=[path.join(temp,'left'),path.join(temp,'right')];for(const root of roots){await fs.mkdir(root);await fs.writeFile(path.join(root,'a.txt'),'a');await fs.writeFile(path.join(root,'b.txt'),'b');}
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
  page=await app.firstWindow();page.setDefaultTimeout(15000);
  if(process.env.FC_TEST_SOURCE){const {build}=require('esbuild');const output=await build({entryPoints:['src/app.js'],bundle:true,format:'iife',write:false,target:'es2022'});await page.route('**/app.js',route=>route.fulfill({body:output.outputFiles[0].text,contentType:'text/javascript'}));await page.reload();}
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const menu=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  const row=(side,name='a.txt')=>page.locator('#folderRows'+side+' .folder-entry[data-path="'+name+'"]');
  const dialog=page.getByRole('dialog',{name:'Display preferences'}),done=dialog.getByRole('button',{name:'Done',exact:true});
  await app.evaluate(({dialog},roots)=>{let i=0;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots[i++]]});},roots);
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  for(const side of ['A','B']){
   await row(side).click();await row(side).evaluate(el=>window.displayOldRow=el);await menu('appearance');await expect(dialog).toBeVisible();
   await fs.appendFile(path.join(roots[side==='A'?0:1],'a.txt'),'changed');await ready();
   await expect.poll(()=>page.evaluate(()=>window.displayOldRow.isConnected)).toBe(false);
   await expect(dialog.getByLabel('Theme',{exact:true})).toBeFocused();
   await done.click();await expect(row(side)).toBeFocused();await expect(row(side)).toHaveClass(/selected/);
   await row(side).evaluate(el=>window.displayOldRow=el);await menu('appearance');await expect(dialog).toBeVisible();await fs.appendFile(path.join(roots[side==='A'?0:1],'a.txt'),'again');await expect.poll(()=>page.evaluate(()=>window.displayOldRow.isConnected)).toBe(false);await page.keyboard.press('Escape');await expect(row(side)).toBeFocused();
  }
  // A removed entry falls back to its pane without selecting an unrelated file.
  await row('A').click();await menu('appearance');await expect(dialog).toBeVisible();await fs.unlink(path.join(roots[0],'a.txt'));await ready();await expect(row('A')).toHaveCount(0);await done.click();await expect(page.locator('#folderRowsA')).toBeFocused();await expect(row('A','b.txt')).not.toHaveClass(/selected/);
  // Native commands are suppressed by the modal; force the real session handler
  // to exercise the defensive session identity guard.
  await row('A','b.txt').click();await menu('appearance');await expect(dialog).toBeVisible();await page.locator('[data-command="new:text-compare"]').first().evaluate(el=>el.click());await expect(page.locator('[role=tab]')).toHaveCount(2);await expect(page.locator('#textA')).toBeVisible();await ready();await done.click();assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#folderRowsA,#folderRowsB')),false);
  // Ordinary browser/text controls still restore the exact focused element.
  await page.locator('#textA').focus();await menu('appearance');await expect(dialog).toBeVisible();await done.click();await expect(page.locator('#textA')).toBeFocused();
  console.log('Display focus refresh passed: genuine disk/background refresh, both panes, modal focus, Done/Escape, removed-row fallback, session isolation and text focus.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
