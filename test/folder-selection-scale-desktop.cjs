'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-selection-scale-')));let app,page;
 try{
  const count=1500,roots=['left','right'].map(name=>path.join(root,name));for(const directory of roots)await fs.mkdir(directory);
  // Bounded file creation keeps the fixture from consuming thousands of descriptors.
  let next=0;await Promise.all(Array.from({length:16},async()=>{for(;;){const i=next++;if(i>=count)return;const name='file-'+String(i).padStart(4,'0')+'.txt';for(const directory of roots)await fs.writeFile(path.join(directory,name),'same\n');}}));
  await fs.writeFile(path.join(roots[0],'only-left.txt'),'left');await fs.writeFile(path.join(roots[1],'only-right.txt'),'right');
  const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env,timeout:30000});page=await app.firstWindow();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));await app.evaluate(({BrowserWindow,dialog},roots)=>{BrowserWindow.getAllWindows().forEach(window=>window.hide());dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});dialog.showMessageBox=async()=>({response:1});},roots);
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false',{timeout:60000}),row=(index,side='A')=>page.locator('#folderRows'+side+' .folder-entry[data-path="'+(typeof index==='number'?'file-'+String(index).padStart(4,'0')+'.txt':index)+'"]');
  const selected=side=>page.locator('#folderRows'+side+' .folder-entry[aria-selected="true"]');
  const command=async action=>{await app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);await ready();};
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();await expect(page.locator('#folderRowsA .folder-entry')).toHaveCount(count+2);await expect(row(count-1)).toHaveClass(/equal/,{timeout:60000});await expect(page.locator('#folderSummary')).not.toContainText('Comparing',{timeout:60000});
  await page.evaluate(()=>{window.scaleMutations=[];window.scaleObserver=new MutationObserver(records=>{for(const record of records)window.scaleMutations.push({attribute:record.attributeName,path:record.target.dataset.path||record.target.id});});for(const id of ['folderRowsA','folderRowsB'])window.scaleObserver.observe(document.getElementById(id),{attributes:true,subtree:true});});
  const results=[];
  const measure=async(name,action,check,limit)=>{await page.evaluate(()=>{window.scaleObserver.takeRecords();window.scaleMutations=[];});const start=Date.now();await action();await check();const data=await page.evaluate(()=>{const records=window.scaleObserver.takeRecords();for(const record of records)window.scaleMutations.push({attribute:record.attributeName,path:record.target.dataset.path||record.target.id});return {count:window.scaleMutations.length,attributes:window.scaleMutations.reduce((out,record)=>(out[record.attribute]=(out[record.attribute]||0)+1,out),{})};});results.push({name,ms:Date.now()-start,...data,limit});};
  const modifier=process.platform==='darwin'?'Meta':'Control',initialTabs=await page.getByRole('tab').count();
  await measure('single click',()=>row(0).click(),async()=>{await expect(selected('A')).toHaveCount(1);await expect(selected('B')).toHaveCount(0);await expect(row(0)).toBeFocused();},40);
  await measure('modifier toggle add',()=>row(2).click({modifiers:[modifier]}),async()=>{await expect(selected('A')).toHaveCount(2);await expect(row(0)).toHaveAttribute('aria-selected','true');await expect(row(2)).toHaveAttribute('aria-selected','true');},40);
  await measure('modifier focus arrow',()=>page.keyboard.press(modifier+'+ArrowDown'),async()=>{await expect(row(3)).toBeFocused();await expect(row(3)).toHaveAttribute('aria-selected','false');await expect(selected('A')).toHaveCount(2);},40);
  await measure('shift range',()=>row(6).click({modifiers:['Shift']}),async()=>{await expect(selected('A')).toHaveCount(5);for(let i=2;i<=6;i++)await expect(row(i)).toHaveAttribute('aria-selected','true');await expect(row(0)).toHaveAttribute('aria-selected','false');},60);
  await measure('clear small selection',()=>command('folder:clear-selection'),()=>expect(selected('A')).toHaveCount(0),40);
  await measure('select all left',()=>page.keyboard.press(modifier+'+a'),async()=>{await expect(selected('A')).toHaveCount(count+1);await expect(selected('B')).toHaveCount(0);await expect(page.locator('#folderRowsA .folder-entry.missing')).toHaveAttribute('aria-selected','false');},3*(count+1)+20);
  await measure('clear all',()=>command('folder:clear-selection'),async()=>{await expect(selected('A')).toHaveCount(0);await expect(selected('B')).toHaveCount(0);},3*(count+1)+20);
  await measure('select right only file',()=>row('only-right.txt','B').click(),async()=>{await expect(selected('B')).toHaveCount(1);await expect(selected('A')).toHaveCount(0);await expect(row('only-right.txt','B')).toBeFocused();await expect(page.locator('#folderRowsA .folder-entry.missing')).toHaveCount(1);},40);
  await measure('modifier toggle remove',()=>row('only-right.txt','B').click({modifiers:[modifier]}),async()=>{await expect(selected('B')).toHaveCount(0);await expect(row('only-right.txt','B')).toBeFocused();},40);
  for(const side of ['A','B']){await expect(page.locator('#folderRows'+side+' .folder-entry[tabindex="0"]')).toHaveCount(1);await expect(page.locator('#folderRows'+side+' .missing[tabindex="0"]')).toHaveCount(0);}
  assert.equal(await page.getByRole('tab').count(),initialTabs,'Selection must not open comparisons');assert.deepEqual(errors,[]);console.log('Folder selection scale measurements:',JSON.stringify({pairedFiles:count,renderedRows:2*(count+2),results},null,2));
  for(const result of results)assert.ok(result.count<result.limit,result.name+': '+result.count+' attribute mutations should be below '+result.limit);
  console.log('Folder selection scale passed: mutation work follows changed selection, with native selection semantics, range/focus modifiers, one-sided rows and roving tabindex preserved. Timings are informational only.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
