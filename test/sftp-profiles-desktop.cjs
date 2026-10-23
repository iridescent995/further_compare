'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-sftp-profiles-'))),profile=path.join(temp,'profile');let app;
 const launch=async()=>{
  const env={...process.env,FC_USER_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
  const page=await app.firstWindow();await expect(page.locator('#welcome')).toBeVisible();
  return page;
 };
 const close=async()=>{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});app=null;}};
 try{
  let page=await launch();
  const saved=await page.evaluate(()=>window.desktop.saveSftpProfile({name:'Build server',host:'EXAMPLE.test',port:2222,username:'developer',root:'/projects'}));
  assert.equal(saved.host,'example.test');assert.equal(saved.name,'Build server');
  await assert.rejects(()=>page.evaluate(()=>window.desktop.saveSftpProfile({name:'Secret',host:'example.test',port:22,username:'user',root:'/',password:'never-save-secret'})));
  assert.deepEqual(await page.evaluate(()=>window.desktop.listSftpProfiles()),[saved]);
  const disk=await fs.readFile(path.join(profile,'sftp-profiles.json'),'utf8');assert.equal(disk.includes('never-save-secret'),false);
  const parsed=JSON.parse(disk);assert.deepEqual(Object.keys(parsed.profiles[0]).sort(),['host','id','name','port','root','username']);
  await close();page=await launch();assert.deepEqual(await page.evaluate(()=>window.desktop.listSftpProfiles()),[saved]);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','new:folder-compare'));
  await page.locator('#folderRemoteA').click();const dialog=page.locator('#sftpConnectionDialog');await expect(dialog).toBeVisible();
  const profiles=dialog.locator('[name="profile"]');await expect(profiles.locator('option').filter({hasText:'Build server'})).toHaveCount(1);
  await profiles.selectOption(saved.id);
  for(const [name,value] of [['host','example.test'],['port','2222'],['username','developer'],['root','/projects'],['password','']])await expect(dialog.locator('[name="'+name+'"]')).toHaveValue(value);
  await dialog.locator('[name="password"]').fill('transient-secret');await dialog.locator('[name="root"]').fill('/updated');await dialog.getByRole('button',{name:'Save profile',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.desktop.listSftpProfiles())).toEqual([{...saved,root:'/updated'}]);
  assert.equal((await fs.readFile(path.join(profile,'sftp-profiles.json'),'utf8')).includes('transient-secret'),false);
  await dialog.locator('[name="password"]').fill('');await page.screenshot({path:'/private/tmp/fc-sftp-profiles-dialog.png'});
  await dialog.locator('[name=authentication]').selectOption('key');await page.screenshot({path:'/private/tmp/fc-sftp-key-dialog.png'});
  await dialog.getByRole('button',{name:'Delete profile',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.desktop.listSftpProfiles())).toEqual([]);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.desktop.listSftpProfiles()),[]);
  await close();page=await launch();assert.deepEqual(await page.evaluate(()=>window.desktop.listSftpProfiles()),[]);
  console.log('SFTP profiles desktop passed: persistence across restart, strict secret rejection, shared native store, removal persistence.');
 }finally{await close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
