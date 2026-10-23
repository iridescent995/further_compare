'use strict';
const {_electron:electron,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:15000});
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');

(async()=>{
  const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-shell-')));
  const repo=path.resolve(__dirname,'..'),executable=process.env.FC_TEST_EXECUTABLE||require('electron');
  const baseArgs=process.env.FC_TEST_EXECUTABLE?[]:[repo];
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  let app,page;const children=new Set(),errors=[];
  const launch=async args=>{
    app=await electron.launch({executablePath:executable,args:[...baseArgs,...args],env});
    page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
    await app.evaluate(({app})=>{global.shellTestArgv=[];app.on('second-instance',(_event,args)=>global.shellTestArgv.push(args));});
  };
  const close=async()=>{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();app=null;page=null;};
  // Invoke the real executable with argument arrays: spaces, Unicode and shell punctuation must stay literal.
  const invoke=args=>new Promise((resolve,reject)=>{
    const child=spawn(executable,[...baseArgs,...args],{env,stdio:['ignore','pipe','pipe']});children.add(child);
    let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
    const timer=setTimeout(()=>{child.kill();reject(Error('Second instance did not exit: '+output));},20000);
    child.once('error',error=>{clearTimeout(timer);children.delete(child);reject(error);});
    child.once('exit',(code,signal)=>{clearTimeout(timer);children.delete(child);code===0?resolve():reject(Error(`Second instance failed (${code}/${signal}): ${output}`));});
  });
  const state=()=>page.evaluate(()=>window.desktop.shellState());
  const at=async(a,b)=>{await expect(page.locator('#pathA')).toHaveValue(a);await expect(page.locator('#pathB')).toHaveValue(b);};
  try{
    const left=path.join(temp,'left α & literal $ name.txt'),right=path.join(temp,'right β (copy).txt'),third=path.join(temp,'third.txt');
    await fs.writeFile(left,'left original\n');await fs.writeFile(right,'right original\n');await fs.writeFile(third,'third original\n');
    await launch(['--fc-set-left',left]);
    await expect(page.locator('#textA')).toHaveValue('left original\n');await expect(page.locator('#pathA')).toHaveValue(left);
    await expect(page.locator('#shellLeftName')).toContainText(path.basename(left));
    assert.equal((await state()).left.path,left);
    await page.locator('#sessionName').fill('Keep my unsaved work');await expect(page.locator('#textA')).toBeVisible();await expect(page.locator('#textA')).toBeEditable();await page.locator('#textA').fill('my unsaved edit\n');
    const tabs=await page.getByRole('tab').count();
    await invoke(['--fc-compare-left',right]);await at(left,right);
    await expect(page.locator('#textA')).toHaveValue('left original\n');await expect(page.locator('#textB')).toHaveValue('right original\n');
    await expect(page.getByRole('tab')).toHaveCount(tabs+1);
    await page.getByRole('tab',{name:'Keep my unsaved work',exact:false}).click();await expect(page.locator('#textA')).toHaveValue('my unsaved edit\n');
    assert.equal(await fs.readFile(left,'utf8'),'left original\n');
    await invoke(['--fc-compare',right,third]);await at(right,third);await expect(page.locator('#textB')).toHaveValue('third original\n');
    assert.equal((await state()).left.path,left,'Explicit pair comparison must not replace the remembered left');
    await page.locator('#textOptions').click();await page.locator('#shellRememberLeft').click();await expect(page.locator('#shellLeftName')).toContainText(path.basename(right));assert.equal((await state()).left.path,right);await page.locator('#textOptionsDialog [data-done]').click();
    await close();await launch(['--fc-compare-left',third]);await at(right,third);
    assert.equal((await state()).left.path,right,'Remembered selection must survive a process restart');
    const countBeforeMissing=await page.getByRole('tab').count();
    await invoke(['--fc-compare-left',path.join(temp,'does not exist.txt')]);
    await expect(page.locator('#notice')).toContainText(/exist|found|ENOENT|file/i);await at(right,third);
    await expect(page.getByRole('tab')).toHaveCount(countBeforeMissing);
    assert.equal((await state()).left.path,right,'A failed comparison must preserve remembered selection');
    // Keep the missing remembered file out of the active disk watch so its error cannot replace the shell notice.
    await page.locator('#newTab').click();await page.locator('#welcome [data-command="new:text-compare"]').click();
    const countBeforeUnavailable=await page.getByRole('tab').count();
    await fs.rename(right,right+'.moved');
    await invoke(['--fc-compare-left',third]);await expect(page.locator('#notice')).toContainText(/no longer available|left file/i);
    assert.equal((await state()).available,false);await expect(page.getByRole('tab')).toHaveCount(countBeforeUnavailable);
    await fs.rename(right+'.moved',right);
    await page.getByRole('tab',{name:path.basename(right)+' ↔ '+path.basename(third),exact:false}).click();await at(right,third);
    await page.locator('#textOptions').click();await page.locator('#shellClearLeft').click();await expect.poll(async()=>(await state()).left).toBeNull();await page.locator('#textOptionsDialog [data-done]').click();
    await invoke(['--fc-compare-left',third]);await expect(page.locator('#notice')).toContainText(/left|select|remember/i);await at(right,third);
    await invoke(['--fc-set-left',left]);await expect(page.locator('#pathA')).toHaveValue(left);await expect.poll(async()=>(await state()).left?.path).toBe(left);
    await invoke(['--fc-clear-left']);await expect.poll(async()=>(await state()).left).toBeNull();
    const binaryLeft=path.join(temp,'unknown left.blob'),binaryRight=path.join(temp,'unknown right.blob');
    await fs.writeFile(binaryLeft,Buffer.from([0,1,2,255]));await fs.writeFile(binaryRight,Buffer.from([0,1,3,255]));
    await invoke(['--fc-compare',binaryLeft,binaryRight]);await expect(page.locator('#sessionKind')).toHaveText('Binary Compare');
    await expect(page.locator('.advanced-byte.changed')).not.toHaveCount(0);
    // Installer verification is isolated: never install Services in the actual user's home.
    const isolatedHome=path.join(temp,'home');await fs.mkdir(isolatedHome,{recursive:true});
    await app.evaluate(({app},home)=>app.setPath('home',home),isolatedHome);
    await app.evaluate(({Menu})=>{const file=Menu.getApplicationMenu().items.find(item=>item.label==='File');const item=file.submenu.items.find(item=>item.label==='File Manager Integration…');if(!item)throw Error('Missing native shell setup action');item.click();});
    await expect(page.locator('#shellSetupDialog')).toBeVisible();
    if(process.env.FC_TEST_EXECUTABLE&&process.platform==='darwin'){
      const services=path.join(isolatedHome,'Library','Services');
      await expect(page.locator('#shellSetupStatus')).toHaveText('Not enabled.');
      await page.locator('#shellSetupInstall').click();await expect(page.locator('#shellSetupStatus')).toHaveText('Integration files installed for your account.');
      assert.deepEqual((await fs.readdir(services)).sort(),['Further Compare — Compare Selected.workflow','Further Compare — Compare with Left.workflow','Further Compare — Set as Left.workflow']);
      for(const name of await fs.readdir(services)){
        const contents=path.join(services,name,'Contents');
        assert.match(await fs.readFile(path.join(contents,'Info.plist'),'utf8'),/com\.furthercompare\.finder-services\.v1/);
        assert.match(await fs.readFile(path.join(contents,'document.wflow'),'utf8'),/--fc-(set-left|compare-left|compare-selected)/);
      }
      await expect(page.locator('#shellSetupInstall')).toBeDisabled();await expect(page.locator('#shellSetupRemove')).toBeEnabled();
      // Corrupt an owned service's dispatch metadata, then repair through the actual dialog.
      const metadata=path.join(services,'Further Compare — Set as Left.workflow','Contents','Info.plist');
      await fs.writeFile(metadata,(await fs.readFile(metadata,'utf8')).replace('runWorkflowAsService','brokenWorkflowService'));
      await page.locator('#shellSetupClose').click();
      await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.find(item=>item.label==='File').submenu.items.find(item=>item.label==='File Manager Integration…').click());
      await expect(page.locator('#shellSetupInstall')).toHaveText('Repair integration');
      await page.locator('#shellSetupInstall').click();await expect(page.locator('#shellSetupStatus')).toHaveText('Integration files installed for your account.');
      assert.match(await fs.readFile(metadata,'utf8'),/runWorkflowAsService/);
      await page.screenshot({path:'/private/tmp/further-shell-setup.png',fullPage:true});
      await page.locator('#shellSetupRemove').click();await expect(page.locator('#shellSetupStatus')).toHaveText('Not enabled.');assert.deepEqual(await fs.readdir(services),[]);
      await expect(page.locator('#shellSetupRemove')).toBeDisabled();
    }else if(!process.env.FC_TEST_EXECUTABLE){
      await expect(page.locator('#shellSetupStatus')).toContainText('packaged Mac or Windows app');
      await expect(page.locator('#shellSetupInstall')).toBeDisabled();await expect(page.locator('#shellSetupRemove')).toBeDisabled();
    }
    await page.locator('#shellSetupClose').click();
    assert.deepEqual(errors,[]);await page.screenshot({path:'/private/tmp/further-shell-desktop.png',fullPage:true});
    console.log('Shell desktop passed: startup selection, actual single-instance argv delivery, literal Unicode paths, dirty tab preservation, explicit pairs, remembered selection restart, missing files, clear actions, binary fallback and isolated shell setup UI.');
  }catch(error){console.error('Shell diagnostics:',await page?.locator('#notice').textContent().catch(()=>''),await app?.evaluate(()=>global.shellTestArgv).catch(()=>[]));throw error;}finally{for(const child of children)child.kill();await close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
