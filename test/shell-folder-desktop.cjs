'use strict';
const {_electron:electron,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:20000});
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');

(async()=>{
  const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-shell-folders-')));
  const repo=path.resolve(__dirname,'..'),executable=process.env.FC_TEST_EXECUTABLE||require('electron');
  const baseArgs=process.env.FC_TEST_EXECUTABLE?[]:[repo];
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  let app,page;const children=new Set(),errors=[];
  const launch=async args=>{
    app=await electron.launch({executablePath:executable,args:[...baseArgs,...args],env});
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
  const state=()=>page.evaluate(()=>window.desktop.shellState());
  const tabs=()=>page.locator('#sessionTabs [role="tab"]');
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const roots=async(a,b)=>{await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');await expect(page.locator('#pathA')).toHaveValue(a);await expect(page.locator('#pathB')).toHaveValue(b);await ready();};
  const row=(side,name)=>page.locator('#folderRows'+side+' .folder-entry[data-path="'+name+'"]');
  const command=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  try{
    const left=path.join(temp,'left α & literal $ folder'),right=path.join(temp,'right β (copy)'),third=path.join(temp,'third folder'),file=path.join(temp,'ordinary.txt');
    for(const root of [left,right,third]){await fs.mkdir(root);await fs.writeFile(path.join(root,'item.txt'),path.basename(root)+'\n');}
    await fs.writeFile(file,'file remains unchanged\n');
    // Cold selection opens a genuine one-sided folder session, not a text placeholder.
    await launch(['--fc-set-left',left]);await roots(left,'');await expect(row('A','item.txt')).toBeVisible();
    assert.equal((await state()).left.path,left);assert.equal((await state()).left.kind,'folder');
    await command('new:text-compare');await expect(page.locator('#sessionKind')).toHaveText('Text Compare');await ready();
    await page.locator('#sessionName').fill('Unsaved shell draft');await page.locator('#textA').fill('Do not replace my unsaved work\n');
    const originalTabs=await tabs().count();
    await invoke(['--fc-compare-left',right]);await roots(left,right);await expect(tabs()).toHaveCount(originalTabs+1);
    await expect(row('A','item.txt')).toHaveClass(/changed/);
    await page.getByRole('tab',{name:'Unsaved shell draft',exact:false}).click();await expect(page.locator('#textA')).toHaveValue('Do not replace my unsaved work\n');
    // A mismatched file/folder request is rejected before creating/replacing a tab or changing selection.
    const beforeMismatch=await tabs().count();
    await invoke(['--fc-compare-left',file]);await expect(page.locator('#notice')).toContainText(/file.*folder|folder.*file|same.*type|same.*kind/i);
    await expect(tabs()).toHaveCount(beforeMismatch);await expect(page.locator('#textA')).toHaveValue('Do not replace my unsaved work\n');assert.equal((await state()).left.path,left);
    await page.locator('#notice').evaluate(element=>{element.textContent='';});
    await invoke(['--fc-compare',file,right]);await expect(page.locator('#notice')).toContainText(/file.*folder|folder.*file|same.*type|same.*kind/i);
    await expect(tabs()).toHaveCount(beforeMismatch);await expect(page.locator('#textA')).toHaveValue('Do not replace my unsaved work\n');assert.equal((await state()).left.path,left);
    // Validation must finish before a new native context or renderer tab is created.
    // Exercise same-root and both parent/child orders while an unsaved text tab is active.
    const nested=path.join(left,'nested');await fs.mkdir(nested);
    const nativeBefore=await page.evaluate(()=>window.desktop.folderNavigation());
    const selectedBefore=await page.locator('#sessionTabs .session-tab.active').getAttribute('data-session-id');
    for(const pair of [[left,left],[left,nested],[nested,left]]){
      await page.locator('#notice').evaluate(element=>{element.textContent='';});
      await invoke(['--fc-compare',...pair]);await expect(page.locator('#notice')).toContainText(/separate|contain each other|overlap/i);
      await expect(tabs()).toHaveCount(beforeMismatch);await expect(page.locator('#sessionKind')).toHaveText('Text Compare');
      await expect(page.locator('#textA')).toHaveValue('Do not replace my unsaved work\n');
      assert.equal(await page.locator('#sessionTabs .session-tab.active').getAttribute('data-session-id'),selectedBefore);
      assert.deepEqual(await page.evaluate(()=>window.desktop.folderNavigation()),nativeBefore,'Failed folder pair must preserve native root authority');
      assert.equal((await state()).left.path,left);
    }
    // Actual second-instance explicit pair and set-left routes preserve existing dirty tabs.
    await invoke(['--fc-compare',right,third]);await roots(right,third);await expect(row('B','item.txt')).toBeVisible();assert.equal((await state()).left.path,left);
    await invoke(['--fc-set-left',third]);await roots(third,'');await expect(row('A','item.txt')).toBeVisible();assert.equal((await state()).left.path,third);
    await page.getByRole('tab',{name:'Unsaved shell draft',exact:false}).click();await expect(page.locator('#textA')).toHaveValue('Do not replace my unsaved work\n');
    // Keep missing directory away from active folder polling, then remove remembered target.
    const beforeUnavailable=await tabs().count();await fs.rename(third,third+'.moved');
    await invoke(['--fc-compare-left',left]);await expect(page.locator('#notice')).toContainText(/no longer available|left folder|not available/i);
    await expect(tabs()).toHaveCount(beforeUnavailable);await expect(page.locator('#textA')).toHaveValue('Do not replace my unsaved work\n');assert.equal((await state()).available,false);assert.equal((await state()).left.path,third);
    await fs.rename(third+'.moved',third);
    // Persisted folder kind survives restart and drives the cold comparison route.
    await close();await launch(['--fc-compare-left',left]);await roots(third,left);await expect(row('A','item.txt')).toBeVisible();assert.equal((await state()).left.kind,'folder');
    await close();await launch(['--fc-compare',left,right]);await roots(left,right);await expect(row('A','item.txt')).toHaveClass(/changed/);assert.equal((await state()).left.path,third);
    assert.equal(await fs.readFile(file,'utf8'),'file remains unchanged\n');
    for(const root of [left,right,third])assert.equal(await fs.readFile(path.join(root,'item.txt'),'utf8'),path.basename(root)+'\n');
    assert.deepEqual(errors,[]);
    console.log('Folder shell desktop passed: cold/second-instance folder selection and comparison, one-sided roots, literal Unicode paths, dirty text preservation, mixed-type/same-root/overlapping-root rejection with unchanged native authority, unavailable remembered folder, persisted kind and explicit folder pairs.');
  }catch(error){console.error('Folder shell diagnostics:',await page?.locator('#notice').textContent().catch(()=>''),await app?.evaluate(()=>global.folderShellArgv).catch(()=>[]));throw error;}finally{for(const child of children)child.kill();await close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
