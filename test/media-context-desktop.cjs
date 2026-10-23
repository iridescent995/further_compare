'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
function wav(samples,rate=8000){
 const bytes=Buffer.alloc(44+samples.length*2);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples.length*2,40);samples.forEach((value,index)=>bytes.writeInt16LE(value,44+index*2));return bytes;
}
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-media-context-')));let app,page;
 try{
  const left=path.join(root,'left.wav'),right=path.join(root,'right.wav'),report=path.join(root,'audio.json');
  const samples=Array.from({length:16000},(_,index)=>Math.round(Math.sin(index/12)*4000)),other=samples.slice();other[8000]+=1000;
  const originalLeft=wav(samples),originalRight=wav(other);await Promise.all([fs.writeFile(left,originalLeft),fs.writeFile(right,originalRight)]);
  const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env,timeout:30000});
  page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({dialog},files)=>{
   global.__mediaContextDialogs={queue:[files.left,files.right],opened:[],saved:[]};
   dialog.showOpenDialog=async()=>{const file=global.__mediaContextDialogs.queue.shift();if(!file)throw Error('Unexpected extra audio picker');global.__mediaContextDialogs.opened.push(file);return {canceled:false,filePaths:[file]};};
   dialog.showSaveDialog=async(_window,options)=>{global.__mediaContextDialogs.saved.push(options.defaultPath);return {canceled:false,filePath:files.report};};
   dialog.showMessageBox=async()=>({response:1});
  },{left,right,report});
  await page.locator('#welcome [data-command="new:audio-compare"]').click();
  const media=page.locator('#mediaWorkspace'),leftPane=media.getByRole('group',{name:'Left audio comparison',exact:true}),rightPane=media.getByRole('group',{name:'Right audio comparison',exact:true}),menu=page.locator('#mediaContext');
  const item=name=>menu.getByRole('menuitem',{name,exact:true});
  async function context(pane=leftPane,keyboard=false){if(keyboard){await pane.focus();await page.keyboard.press('Shift+F10');}else await pane.locator('.media-wave').click({button:'right'});await expect(menu).toBeVisible();}
  await context(leftPane,true);await expect(item('Listen together')).toBeDisabled();await expect(item('Save audio report')).toBeDisabled();await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(leftPane).toBeFocused();
  await context();await item('Open left audio').click();await expect(leftPane.locator('h3')).toContainText('left.wav');await expect(media).toHaveAttribute('aria-busy','false');
  await context(rightPane);await item('Open right audio').click();await expect(media.locator('.media-status')).toContainText('1 different samples');await expect(rightPane.locator('h3')).toContainText('right.wav');
  await context(rightPane,true);await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(rightPane).toBeFocused();
  for(const [label,value]of [['Right offset (seconds)','0.000125'],['Sample tolerance','0.1']]){
   await context(rightPane,true);await item(label).click();const input=media.getByLabel(label,{exact:true});await expect(input).toBeFocused();await input.fill(value);await input.dispatchEvent('change');
   if(label==='Right offset (seconds)')await expect(media.locator('.media-status')).toContainText('2 unmatched');else await expect(media.locator('.media-status')).toHaveText('Audio samples are identical.');
   await input.fill('0');await input.dispatchEvent('change');await expect(media.locator('.media-status')).toContainText('1 different samples');
  }
  await expect.poll(()=>media.locator('audio').evaluateAll(elements=>elements.every(element=>element.readyState>=2))).toBe(true);
  await media.locator('audio').evaluateAll(elements=>elements.forEach(element=>element.muted=true));
  await context();await item('Listen together').click();await expect.poll(()=>media.locator('audio').evaluateAll(elements=>elements.every(element=>!element.paused))).toBe(true);
  await context(rightPane);await item('Pause both').click();await expect.poll(()=>media.locator('audio').evaluateAll(elements=>elements.every(element=>element.paused))).toBe(true);
  await expect(page.locator('#notice')).toBeHidden();
  await context(rightPane,true);await item('Save audio report').click();await expect.poll(()=>fs.readFile(report,'utf8').then(JSON.parse).catch(()=>null)).not.toBe(null);
  const saved=JSON.parse(await fs.readFile(report,'utf8'));assert.equal(saved.type,'audio-compare');assert.equal(saved.left,'left.wav');assert.equal(saved.right,'right.wav');assert.equal(saved.differentSamples,1);assert.equal(saved.missingSamples,0);assert.equal(saved.equal,false);assert.equal(saved.leftAudio.frames,16000);assert.equal(saved.rightAudio.sampleRate,8000);
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.body.dataset.theme=theme,theme);
   const bounds=await rightPane.boundingBox();await page.mouse.click(bounds.x+bounds.width-3,bounds.y+bounds.height-3,{button:'right'});await expect(menu).toBeVisible();
   const panel=await menu.locator('.folder-context-panel').first().boundingBox(),viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));assert.ok(panel.x>=0&&panel.y>=0&&panel.x+panel.width<=viewport.width&&panel.y+panel.height<=viewport.height,'Context menu stays inside viewport');
   await page.screenshot({path:'/private/tmp/fc-media-context-'+theme+'.png'});await page.keyboard.press('Escape');
  }
  const dialogs=await app.evaluate(()=>global.__mediaContextDialogs);assert.deepEqual(dialogs.opened,[left,right]);assert.deepEqual(dialogs.saved,['audio-comparison.json']);assert.deepEqual(dialogs.queue,[]);
  assert.deepEqual(await fs.readFile(left),originalLeft);assert.deepEqual(await fs.readFile(right),originalRight);assert.deepEqual(errors,[]);
  console.log('Audio context desktop workflow passed: native pickers, keyboard focus, controls, playback and filesystem report');
 }finally{
  if(page)await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
  await fs.rm(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
