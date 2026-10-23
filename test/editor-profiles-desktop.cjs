'use strict';
const {_electron:electron,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:15000});
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-editor-profiles-')));let app,page;
 const file=path.join(dir,'sample & literal.TXT'),other=path.join(dir,'records.csv'),log=path.join(dir,'editor-log.json'),script=path.join(dir,'editor fixture.cjs');
 const env={...process.env,FC_USER_DATA_DIR:path.join(dir,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 const launch=async()=>{app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await expect(page.locator('#welcome')).toBeVisible();await app.evaluate(({dialog,shell})=>{global.profileFiles=[];global.profileOpened=[];dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.profileFiles.shift()]});shell.openPath=async file=>{global.profileOpened.push(file);return '';};});};
 const close=async()=>{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();app=null;page=null;};
 const queue=files=>app.evaluate(({},files)=>global.profileFiles=files,files);
 const menu=async command=>{await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await app.evaluate(({BrowserWindow},command)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',command),command);};
 const settings=async()=>{await menu('editor:settings');await expect(page.locator('#editorSettingsDialog')).toBeVisible();};
 const save=async()=>{await page.locator('#editorSettingsSave').click();await expect(page.locator('#editorSettingsDialog')).toBeHidden();};
 const stored=()=>page.evaluate(()=>window.desktop.editorSettings());
 const cards=()=>page.locator('.editor-profile');
 const add=async(name,patterns,route)=>{await page.getByRole('button',{name:'Add profile',exact:true}).click();const card=cards().last();await card.getByLabel('Profile name',{exact:true}).fill(name);await card.getByLabel('Filename patterns',{exact:true}).fill(patterns);await card.getByLabel('Enabled',{exact:true}).check();await card.getByLabel('Open with',{exact:true}).selectOption('custom');await queue([process.execPath]);await card.getByRole('button',{name:'Choose application…',exact:true}).click();await card.getByLabel('Arguments (one per line)',{exact:true}).fill([script,route,'{file}'].join('\n'));};
 const customLaunch=async route=>{await fs.rm(log,{force:true});await menu('editor:left');await expect.poll(()=>fs.readFile(log,'utf8').then(JSON.parse).catch(()=>null)).toEqual([route,file]);};
 try{
  await fs.writeFile(file,'unchanged original');await fs.writeFile(other,'id,value\n1,a\n');await fs.writeFile(script,`require('node:fs').writeFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2)));`);
  await launch();await page.locator('#welcome [data-command="new:text-compare"]').click();await queue([file,other]);await page.locator('#openA').click();await page.locator('#openB').click();
  await settings();await add('Source files','*.txt','first');await add('Notes and source','*.txt; *.md','second');await save();
  const first=await stored();assert.equal(first.profiles.length,2);assert.deepEqual(first.profiles[1].patterns,['*.txt','*.md']);assert.equal(new Set(first.profiles.map(p=>p.id)).size,2);
  await customLaunch('first');await menu('editor:right');await expect.poll(()=>app.evaluate(()=>global.profileOpened)).toEqual([other]);
  await settings();await cards().nth(1).getByRole('button',{name:'Move up',exact:true}).click();await save();await customLaunch('second');
  await settings();await cards().first().getByLabel('Enabled',{exact:true}).uncheck();await save();await customLaunch('first');
  await settings();await cards().nth(1).getByRole('button',{name:'Remove profile',exact:true}).click();await save();await menu('editor:left');await expect.poll(()=>app.evaluate(()=>global.profileOpened)).toEqual([other,file]);
  await settings();await cards().first().getByLabel('Enabled',{exact:true}).check();await cards().first().getByLabel('Open with',{exact:true}).selectOption('system');await save();await menu('editor:left');await expect.poll(()=>app.evaluate(()=>global.profileOpened)).toEqual([other,file,file]);
  const good=await stored();await settings();await cards().first().getByLabel('Filename patterns',{exact:true}).fill('../*.txt');await page.locator('#editorSettingsSave').click();await expect(page.locator('#editorSettingsError')).not.toBeEmpty();await expect(page.locator('#editorSettingsDialog')).toBeVisible();assert.deepEqual(await stored(),good);await page.locator('#editorSettingsClose').click();
  await settings();await cards().first().getByRole('button',{name:'Remove profile',exact:true}).click();await page.locator('#editorSettingsClose').click();assert.deepEqual(await stored(),good,'Cancel preserves stored profiles');
  await settings();await page.screenshot({path:path.join(os.tmpdir(),'further-editor-profiles-light.png')});await page.locator('#editorSettingsClose').click();
  await page.getByRole('button',{name:'Display',exact:true}).click();await page.getByLabel('Theme',{exact:true}).selectOption('dark');await page.getByRole('button',{name:'Done',exact:true}).click();await settings();await page.screenshot({path:path.join(os.tmpdir(),'further-editor-profiles-dark.png')});await page.locator('#editorSettingsClose').click();
  assert.equal(await fs.readFile(file,'utf8'),'unchanged original');await close();await launch();assert.deepEqual(await stored(),good);await settings();await expect(cards()).toHaveCount(1);await expect(cards().first().getByLabel('Profile name',{exact:true})).toHaveValue('Notes and source');await cards().first().getByRole('button',{name:'Remove profile',exact:true}).click();await save();assert.deepEqual(await stored(),{mode:'system',executable:'',args:[]});
  console.log('Editor profiles desktop passed: creation, glob routing and precedence, ordering, disabled fallback, system override, validation atomicity, cancellation, persistence and removal; actual custom executable receives literal file paths.');
 }catch(error){if(page&&!page.isClosed()){console.error(await page.locator('#editorSettingsError').textContent().catch(()=>''));await page.screenshot({path:path.join(os.tmpdir(),'further-editor-profiles-failure.png')}).catch(()=>{});}throw error;}finally{await close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
