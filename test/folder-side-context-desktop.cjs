'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {clickFolderAction}=require('./folder-context-helper.cjs');
(async()=>{const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fc-side-menu-'));let app,page;try{
 const roots=['left','right'].map(name=>path.join(temp,name));for(let side=0;side<2;side++){await fs.mkdir(roots[side]);for(const [index,name]of ['a.txt','b.txt'].entries()){await fs.writeFile(path.join(roots[side],name),'x'.repeat(side===index?1:10));await fs.utimes(path.join(roots[side],name),100000,side===index?100000:200000);}}
 const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
 await app.evaluate(({dialog},roots)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});dialog.showSaveDialog=async()=>({canceled:false,filePath:global.snapshotDestination});},[...roots]);
 await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#openA').click();await ready();
 const menu=page.locator('#folderContext'),item=name=>menu.getByRole('menuitem',{name,exact:true}),row=side=>page.locator('#folderRows'+side+' [data-path="a.txt"]');
 await row('A').click({button:'right'});await item('Reports').click();await expect(item('Save left folder snapshot…')).toBeEnabled();await expect(item('Save right folder snapshot…')).toBeDisabled();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await page.locator('#openB').click();await ready();
 for(const pane of ['A','B']){
  for(const [label,value,first]of [['Sort by left size','size-left','a.txt'],['Sort by right size','size-right','b.txt'],['Sort by left last modified','modified-left','a.txt'],['Sort by right last modified','modified-right','b.txt']]){
   await row(pane).click({button:'right'});await clickFolderAction(page,label);await ready();await expect(page.locator('#folderSort')).toHaveValue(value);for(const paired of ['A','B'])await expect(page.locator('#folderRows'+paired+' .folder-entry').first()).toHaveAttribute('data-path',first);await expect(row(pane)).toHaveClass(/selected/);await expect(row(pane)).toBeFocused();
  }
  for(const [index,side]of ['left','right'].entries()){
   const destination=path.join(temp,pane+'-'+side+'.json');await app.evaluate((_,destination)=>{global.snapshotDestination=destination;},destination);
   await row(pane).click({button:'right'});await clickFolderAction(page,'Save '+side+' folder snapshot…');await ready();await expect(page.locator('#notice')).toContainText('Snapshot saved');
   const snapshot=JSON.parse(await fs.readFile(destination,'utf8'));assert.equal(snapshot.kind,'folder-snapshot');assert.equal(snapshot.entries.find(entry=>entry.path==='a.txt').size,index===0?1:10);assert.equal(snapshot.entries.find(entry=>entry.path==='b.txt').size,index===0?10:1);await expect(row(pane)).toHaveClass(/selected/);
  }
 }
 // Pane focus may have no current row while its files remain selected.
 await app.evaluate(({clipboard})=>{global.copiedSelection=[];clipboard.writeText=value=>global.copiedSelection.push(value);});
 const native=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','folder:'+action),action);
 for(const pane of ['A','B']){
  await row(pane).click();await page.locator('#folderRows'+pane+' [data-path="b.txt"]').click({modifiers:[process.platform==='darwin'?'Meta':'Control']});
  await page.locator('#folderRows'+pane).focus();
  await native('copy-paths');await expect.poll(()=>app.evaluate(()=>global.copiedSelection.length)).toBe(pane==='A'?1:2);
  const copied=await app.evaluate(()=>global.copiedSelection.at(-1));for(const name of ['a.txt','b.txt'])assert.ok(copied.includes(path.join(await fs.realpath(roots[pane==='A'?0:1]),name)));
  await ready();await native('delete');await expect(page.locator('#planDialog')).toBeVisible();await expect(page.locator('#planDescription')).toHaveText('Delete from '+(pane==='A'?'left':'right'));await page.locator('#cancelPlan').click();await ready();
 }
 for(let side=0;side<2;side++)assert.equal((await fs.readFile(path.join(roots[side],'a.txt'))).length,side===0?1:10);
 console.log('Side-specific context commands passed: all four sorts from either pane, paired order, selection/focus, missing-root disablement, real snapshots of either root, and native copy/delete of selections with pane-only focus.');
}finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
