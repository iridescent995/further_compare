'use strict';
const {_electron:electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const base=await fs.mkdtemp(path.join(os.tmpdir(),'fc-idle-toolbar-'));let app;try{
 const file=path.join(base,'large.txt');await fs.writeFile(file,Array.from({length:1500},(_,i)=>'Line '+i+' for scrolling').join('\n'));
 const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[process.cwd()]}),env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 await app.evaluate(({dialog,ipcMain},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});global.idlePolls=0;ipcMain.removeHandler('text:changes');ipcMain.handle('text:changes',()=>{global.idlePolls++;return {a:false,b:false};});},file);
 await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#welcome [data-command="new:text-compare"]').click();await expect(page.locator('#textA')).toBeVisible();await page.locator('#openA').click();await expect(page.locator('#textA')).toHaveValue(/Line 1499/);await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
 await expect(page.locator('#next')).toBeEnabled();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.evaluate(()=>{window.idleMutations=[];window.idleObserver=new MutationObserver(records=>{for(const record of records)window.idleMutations.push({id:record.target.id||record.target.tagName,attribute:record.attributeName,old:record.oldValue,value:record.target.getAttribute(record.attributeName)});});window.idleObserver.observe(document.body,{attributes:true,attributeFilter:['aria-busy'],attributeOldValue:true});for(const node of document.querySelectorAll('.toolbar button,.path-row button'))window.idleObserver.observe(node,{attributes:true,attributeFilter:['disabled'],attributeOldValue:true});});
 const before=await app.evaluate(()=>global.idlePolls);
 await expect.poll(()=>app.evaluate(()=>global.idlePolls),{timeout:8000}).toBeGreaterThanOrEqual(before+3);
 const area=page.locator('#textA');await area.hover();await page.mouse.wheel(0,600);await expect.poll(()=>area.evaluate(node=>node.scrollTop),{timeout:1500}).toBeGreaterThan(0);
 const mutations=await page.evaluate(()=>{window.idleObserver.disconnect();return window.idleMutations;});assert.deepEqual(mutations.filter(record=>record.old!==record.value),[],'Idle disk/shell checks must not toggle global busy or toolbar disabled attributes');
 console.log('Idle toolbar passed: three disk-poll cycles without busy/disabled mutations; wheel scroll responds while polling.');
}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(base,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
