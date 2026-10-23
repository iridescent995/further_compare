'use strict';
const {_electron:electron,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:20000});
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');

(async()=>{
  const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-shell-selected-')));
  const repo=path.resolve(__dirname,'..'),executable=process.env.FC_TEST_EXECUTABLE||require('electron');
  const baseArgs=process.env.FC_TEST_EXECUTABLE?[]:[repo];
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  let app,page;const children=new Set(),errors=[];
  const launch=async (args,response=1)=>{
    app=await electron.launch({executablePath:executable,args:[...baseArgs,...args],env});
    await app.evaluate(({dialog},response)=>{
      global.selectedReviews=[];global.selectedResponse=response;
      dialog.showMessageBox=async(...args)=>{const options=args.at(-1);if(options.message!=='Compare selected items')throw Error('Unexpected native review: '+options.message);global.selectedReviews.push(options);return {response:global.selectedResponse};};
    },response);
    page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
    await app.evaluate(({app})=>{global.folderShellArgv=[];app.on('second-instance',(_event,args)=>global.folderShellArgv.push(args));});
  };
  const close=async()=>{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}app=null;page=null;};
  const invoke=args=>new Promise((resolve,reject)=>{
    const child=spawn(executable,[...baseArgs,...args],{env,stdio:['ignore','pipe','pipe']});children.add(child);
    let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
    const timer=setTimeout(()=>{child.kill();reject(Error('Second instance did not exit: '+output));},20000);
    child.once('error',error=>{clearTimeout(timer);children.delete(child);reject(error);});
    child.once('exit',(code,signal)=>{clearTimeout(timer);children.delete(child);code===0?resolve():reject(Error(`Second instance failed (${code}/${signal}): ${output}`));});
  });
  const tabs=()=>page.locator('#sessionTabs [role="tab"]');
  const active=()=>page.locator('#sessionTabs .session-tab.active').getAttribute('data-session-id');
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const at=async(left,right,kind)=>{await expect(page.locator('#sessionKind')).toHaveText(kind);await expect(page.locator('#pathA')).toHaveValue(left);await expect(page.locator('#pathB')).toHaveValue(right);await ready();};
  const command=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  const review=async(left,right,count)=>{
    await expect.poll(()=>app.evaluate(()=>global.selectedReviews.length)).toBe(count);
    const result=await app.evaluate(()=>global.selectedReviews.at(-1));
    assert.equal(result.type,'question');assert.equal(result.message,'Compare selected items');
    assert.deepEqual(result.buttons,['Cancel','Compare','Swap and Compare']);assert.equal(result.cancelId,0);assert.equal(result.defaultId,1);
    assert.ok(result.detail.includes(left),'Review must show complete left path');assert.ok(result.detail.includes(right),'Review must show complete right path');
    assert.match(result.detail,/Left/);assert.match(result.detail,/Right/);
  };
  const response=value=>app.evaluate(({},value)=>{global.selectedResponse=value;},value);
  try{
    const left=path.join(temp,'left α & $.txt'),right=path.join(temp,'right β (copy).txt'),folders=[path.join(temp,'left folder'),path.join(temp,'right folder')];
    await fs.writeFile(left,'left original\n');await fs.writeFile(right,'right original\n');
    for(const [index,root]of folders.entries()){await fs.mkdir(root);await fs.writeFile(path.join(root,'item.txt'),`folder ${index}\n`);}
    // A real cold launch reaches the native ordering review before opening the comparison.
    await launch(['--fc-compare-selected',left,right],1);await review(left,right,1);await at(left,right,'Text Compare');
    await expect(page.locator('#textA')).toHaveValue('left original\n');await expect(page.locator('#textB')).toHaveValue('right original\n');
    await page.locator('#sessionName').fill('Unsaved selected draft');await page.locator('#textA').fill('Keep my dirty selection draft\n');
    const dirtyId=await active(),dirtyTabs=await tabs().count();
    await response(0);await invoke(['--fc-compare-selected',...folders]);await review(...folders,2);await ready();
    assert.equal(await active(),dirtyId);await expect(tabs()).toHaveCount(dirtyTabs);await expect(page.locator('#textA')).toHaveValue('Keep my dirty selection draft\n');await expect(page.locator('#dirtyIndicator')).toBeVisible();
    await response(2);await invoke(['--fc-compare-selected',left,right]);await review(left,right,3);await at(right,left,'Text Compare');
    await expect(page.locator('#textA')).toHaveValue('right original\n');await expect(page.locator('#textB')).toHaveValue('left original\n');await expect(tabs()).toHaveCount(dirtyTabs+1);
    await response(1);await invoke(['--fc-compare-selected',...folders]);await review(...folders,4);await at(...folders,'Folder Compare');await expect(page.locator('#folderRowsA [data-path="item.txt"]')).toHaveClass(/changed/);
    await response(2);await invoke(['--fc-compare-selected',...folders]);await review(...folders,5);await at(folders[1],folders[0],'Folder Compare');
    await page.locator('#sessionTabs [data-session-id="'+dirtyId+'"] [role="tab"]').click();await expect(page.locator('#textA')).toHaveValue('Keep my dirty selection draft\n');
    // Cancellation for files also leaves active renderer and native authority untouched.
    const beforeCancel=await tabs().count(),nativeBefore=await page.evaluate(()=>window.desktop.folderNavigation());
    await response(0);await invoke(['--fc-compare-selected',left,right]);await review(left,right,6);await ready();assert.equal(await active(),dirtyId);await expect(tabs()).toHaveCount(beforeCancel);await expect(page.locator('#textA')).toHaveValue('Keep my dirty selection draft\n');assert.deepEqual(await page.evaluate(()=>window.desktop.folderNavigation()),nativeBefore);
    await close();await launch(['--fc-compare-selected',...folders],2);await review(...folders,1);await at(folders[1],folders[0],'Folder Compare');
    assert.equal(await fs.readFile(left,'utf8'),'left original\n');assert.equal(await fs.readFile(right,'utf8'),'right original\n');
    for(const [index,root]of folders.entries())assert.equal(await fs.readFile(path.join(root,'item.txt'),'utf8'),`folder ${index}\n`);
    assert.deepEqual(errors,[]);console.log('Selected shell desktop passed: cold and second-instance review, file/folder compare and swap, complete paths and safe default/cancel choices, cancellation preserves exact active dirty tab and native authority, original files unchanged.');
  }catch(error){console.error('Selected shell diagnostics:',await page?.locator('#notice').textContent().catch(()=>''),await app?.evaluate(()=>global.selectedReviews).catch(()=>[]));throw error;}finally{for(const child of children)child.kill();await close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
