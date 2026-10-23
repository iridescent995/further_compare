'use strict';
const {_electron:electron,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:15000});
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
  const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-external-editor-')));
  const env={...process.env,FC_USER_DATA_DIR:path.join(dir,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  let app,page;const errors=[];
  const launch=async()=>{
    app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
    page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    await app.evaluate(({dialog,shell})=>{global.editorOpenQueue=[];global.editorLaunches=[];dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.editorOpenQueue.shift()]});shell.openPath=async file=>{global.editorLaunches.push(file);return '';};});
  };
  const close=async()=>{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();app=null;page=null;};
  const queue=files=>app.evaluate(({},files)=>global.editorOpenQueue=files,files);
  const menu=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  const launched=()=>app.evaluate(()=>global.editorLaunches);
  const openText=async files=>{await page.locator('#welcome [data-command="new:text-compare"]').click();await queue(files);await page.locator('#openA').click();if(files.length>1)await page.locator('#openB').click();await expect(page.locator('#openA')).toBeEnabled();};
  const rejected=async request=>page.evaluate(async request=>{try{await window.desktop.openExternalEditor(request);return false;}catch{return true;}},request);
  try{
    const left=path.join(dir,'left'),right=path.join(dir,'right'),file=path.join(dir,'source space & literal.txt'),other=path.join(dir,'right.txt');
    await fs.writeFile(file,'original source');await fs.writeFile(other,'right source');
    for(const root of [left,right]){await fs.mkdir(root);await fs.writeFile(path.join(root,'same.txt'),'same');}
    await fs.writeFile(path.join(left,'conflict'),'left file');await fs.mkdir(path.join(right,'conflict'));
    await launch();assert.equal((await page.evaluate(()=>window.desktop.editorSettings())).mode,'system');
    await openText([file,other]);await menu('editor:left');await expect.poll(launched).toEqual([file]);await expect(page.locator('#openA')).toBeEnabled();await menu('editor:right');await expect.poll(launched).toEqual([file,other]);
    await expect(page.locator('#textA')).toBeVisible();await expect(page.locator('#textA')).toBeEditable();await page.locator('#textA').fill('unsaved local edit');await expect(page.locator('#openA')).toBeEnabled();await menu('editor:left');await expect.poll(launched).toEqual([file,other,file]);await expect(page.locator('#textA')).toHaveValue('unsaved local edit');await expect(page.locator('#unsavedDialog')).toBeHidden();
    await fs.writeFile(file,'changed on disk');await expect(page.locator('#notice')).toContainText(/changed|unsaved/i);await expect(page.locator('#textA')).toHaveValue('unsaved local edit');
    await fs.rm(other);assert.equal(await rejected({source:'text',side:'b'}),true);assert.deepEqual(await launched(),[file,other,file]);
    await page.locator('#newTab').click();await page.locator('#welcome [data-command="new:folder-compare"]').click();await queue([left,right]);await page.locator('#openA').click();await page.locator('#openB').click();
    const row=(side,name)=>page.locator('#folderRows'+side+' .folder-entry[data-path="'+name+'"]');
    await row('B','same.txt').click({button:'right'});await page.locator('#folderContext').getByRole('menuitem',{name:'Open in external editor…',exact:true}).click();await expect.poll(async()=> (await launched()).at(-1)).toBe(path.join(right,'same.txt'));
    await row('A','conflict').click({button:'right'});await page.locator('#folderContext').getByRole('menuitem',{name:'Open in external editor…',exact:true}).click();await expect.poll(async()=> (await launched()).at(-1)).toBe(path.join(left,'conflict'));
    await row('B','conflict').click({button:'right'});await expect(page.locator('#folderContext').getByRole('menuitem',{name:'Open in external editor…',exact:true})).toBeDisabled();await page.keyboard.press('Escape');
    await row('A','same.txt').click();await expect(page.locator('#openA')).toBeEnabled();await menu('folder:external-editor');await expect.poll(async()=> (await launched()).at(-1)).toBe(path.join(left,'same.txt'));
    assert.equal(await rejected({source:'folder',side:'a',relative:'../source space & literal.txt'}),true);assert.equal(await rejected({source:'folder',side:'b',relative:'conflict'}),true);
    const launchCount=(await launched()).length;await fs.rm(path.join(left,'same.txt'));assert.equal(await rejected({source:'folder',side:'a',relative:'same.txt'}),true);assert.equal((await launched()).length,launchCount);
    // A real executable fixture receives literal argument arrays, then edits the file for the existing watcher.
    const editor=process.platform==='win32'?process.execPath:path.join(dir,'test editor'),log=path.join(dir,'arguments.log');
    if(process.platform!=='win32')await fs.writeFile(editor,'#!/bin/sh\nprintf "%s\\n" "$@" > '+"'"+log.replaceAll("'","'\\''")+"'"+'\nprintf "updated by editor" > "$2"\n',{mode:0o700});
    await expect(page.locator('#openA')).toBeEnabled();await menu('editor:settings');await expect(page.locator('#editorSettingsDialog')).toBeVisible();await page.locator('#editorMode').selectOption('custom');await queue([editor]);await page.locator('#editorChoose').click();await expect(page.locator('#editorExecutable')).toHaveValue(editor);
    const literal='--literal=$(touch should-not-exist) & "quoted"';await page.locator('#editorArguments').fill(literal+'\n{file}');await page.screenshot({path:process.platform==='win32'?path.join(os.tmpdir(),'further-external-editor.png'):'/private/tmp/further-external-editor.png'});await page.locator('#editorSettingsSave').click();await expect(page.locator('#editorSettingsDialog')).toBeHidden();
    assert.deepEqual(await page.evaluate(()=>window.desktop.editorSettings()),{mode:'custom',executable:editor,args:[literal,'{file}']});
    await close();await launch();assert.deepEqual(await page.evaluate(()=>window.desktop.editorSettings()),{mode:'custom',executable:editor,args:[literal,'{file}']});
    await openText([file]);
    if(process.platform!=='win32'){
      await menu('editor:left');await expect.poll(async()=>{try{return await fs.readFile(log,'utf8');}catch{return '';}}).toBe(literal+'\n'+file+'\n');await expect(page.locator('#textA')).toHaveValue('updated by editor',{timeout:10000});
      await expect(page.locator('#openA')).toBeEnabled();await expect(page.locator('#textA')).toBeVisible();await expect(page.locator('#textA')).toBeEditable();await page.locator('#textA').fill('second unsaved value');await fs.writeFile(file,'disk before editor');await expect(page.locator('#openA')).toBeEnabled();await menu('editor:left');await expect.poll(()=>fs.readFile(file,'utf8')).toBe('updated by editor');await expect(page.locator('#textA')).toHaveValue('second unsaved value');
    }
    await expect(page.locator('#openA')).toBeEnabled();await menu('editor:settings');await page.locator('#editorMode').selectOption('system');await page.locator('#editorSettingsSave').click();await expect(page.locator('#editorSettingsDialog')).toBeHidden();assert.equal((await page.evaluate(()=>window.desktop.editorSettings())).mode,'system');
    assert.deepEqual(errors,[]);console.log('External editor desktop passed: native commands, system launch routing, folder context and conflict sides, path authorization, missing files, settings dialog/persistence, literal custom arguments, watcher reload and unsaved text preservation.');
  }catch(error){if(page&&!page.isClosed()){await page.screenshot({path:path.join(os.tmpdir(),'further-external-editor-failure.png')}).catch(()=>{});console.error(await page.locator('#notice').textContent().catch(()=>''));}throw error;}finally{await close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
