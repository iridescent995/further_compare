'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fc-refresh-focus-'));let app,page;
 try{
  const roots=[path.join(temp,'left'),path.join(temp,'right')],names=Array.from({length:40},(_,i)=>String(i).padStart(2,'0')+'.txt');
  for(const root of roots){await fs.mkdir(root);await Promise.all(names.map(name=>fs.writeFile(path.join(root,name),'same '+name)));}
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(12000);
  if(process.env.FC_TEST_SOURCE){const output=await require('esbuild').build({entryPoints:['src/app.js'],bundle:true,format:'iife',write:false,target:'es2022'});await page.route('**/app.js',route=>route.fulfill({body:output.outputFiles[0].text,contentType:'text/javascript'}));await page.reload();}
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));
  await app.evaluate(({dialog},roots)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});},roots);
  await page.locator('#welcome [data-command="new:folder-compare"]').click();await page.locator('#openA').click();await page.locator('#openB').click();
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false',{timeout:60000}),pane=side=>page.locator('#folderRows'+side),row=(side,name)=>pane(side).locator('.folder-entry[data-path="'+name+'"]'),selected=side=>pane(side).locator('.selected').evaluateAll(rows=>rows.map(r=>r.dataset.path));
  const menu=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  await expect(row('B','39.txt')).toHaveClass(/equal/,{timeout:60000});await ready();
  await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers.get('folders:tree-list');ipcMain.removeHandler('folders:tree-list');global.refreshFocusGate={armed:false,held:false};ipcMain.handle('folders:tree-list',async(...args)=>{if(refreshFocusGate.armed){refreshFocusGate.armed=false;refreshFocusGate.held=true;await new Promise(resolve=>refreshFocusGate.release=()=>{refreshFocusGate.held=false;resolve();});}return original(...args);});});
  const hold=async()=>{await ready();await app.evaluate(()=>refreshFocusGate.armed=true);await menu('folder:refresh');await expect.poll(()=>app.evaluate(()=>refreshFocusGate.held)).toBe(true);};
  const release=async()=>{await app.evaluate(()=>refreshFocusGate.release());await ready();};
  const remove=async name=>Promise.all(roots.map(root=>fs.rm(path.join(root,name))));
  const modifier=process.platform==='darwin'?'Meta':'Control';
  for(const [side,middle,next,last,previous] of [['A','20.txt','21.txt','39.txt','38.txt'],['B','24.txt','25.txt','38.txt','37.txt']]){
   await row(side,'02.txt').click();await row(side,middle).click({modifiers:[modifier]});assert.deepEqual(await selected(side),['02.txt',middle]);
   await hold();await remove(middle);await release();await expect(row(side,middle)).toHaveCount(0);console.log('After removal, focused:',await page.evaluate(()=>({path:document.activeElement.dataset.path,id:document.activeElement.id})));await expect(row(side,next)).toBeFocused();assert.deepEqual(await selected(side),['02.txt']);
   await row(side,last).click({modifiers:[modifier]});await hold();await remove(last);await release();await expect(row(side,previous)).toBeFocused();assert.deepEqual(await selected(side),['02.txt']);
   console.log(side+' middle and final row removal retained nearest focus and surviving selection.');
  }
  await row('A','02.txt').click();await row('A','30.txt').click({modifiers:[modifier]});await hold();await fs.rm(path.join(roots[0],'30.txt'));await fs.rm(path.join(roots[0],'31.txt'));await release();await expect(row('A','30.txt')).toHaveCount(0);await expect(row('A','32.txt')).toBeFocused();assert.deepEqual(await selected('A'),['02.txt']);await page.keyboard.press('ArrowDown');await expect(row('A','33.txt')).toBeFocused();assert.deepEqual(await selected('A'),['33.txt']);console.log('Missing-side rows skipped; subsequent keyboard navigation continues from fallback.');
  // Refresh may replace all row elements, but must never pull focus from another control.
  for(const selector of ['#pathA','#folderSearch','#sessionName']){
   await row('A','15.txt').focus();await hold();const control=page.locator(selector);await control.focus();await release();await expect(control).toBeFocused();
  }
  await row('B','15.txt').focus();await hold();await page.getByRole('button',{name:'Display',exact:true}).evaluate(el=>el.click());const done=page.getByRole('button',{name:'Done',exact:true});await done.focus();await release();await expect(done).toBeFocused();await done.click();await expect(done).toBeHidden();await expect(row('B','15.txt')).toBeFocused();
  // With no surviving row, focus falls back to the pane, not the document body.
  await row('B','37.txt').focus();await expect(row('B','37.txt')).toBeFocused();await hold();await expect(row('B','37.txt')).toBeFocused();for(const root of roots)for(const name of await fs.readdir(root))await fs.rm(path.join(root,name));await release();await expect(pane('B').locator('.folder-entry')).toHaveCount(0);console.log('Empty focus:',await page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id})));await expect(pane('B')).toBeFocused();assert.deepEqual(await selected('A'),[]);assert.deepEqual(await selected('B'),[]);
  assert.equal(await page.getByRole('tab').count(),1);console.log('Folder refresh focus passed: both panes, middle/last deletion, retained selection, no automatic selection, control/modal focus and empty-pane fallback.');
 }catch(error){console.error('Regression failed before cleanup:',error);throw error;}finally{if(app)await app.evaluate(()=>{if(global.refreshFocusGate?.held)refreshFocusGate.release();}).catch(()=>{});if(page)await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
