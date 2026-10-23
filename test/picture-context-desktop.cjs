'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-picture-context-')));let app,page;
 try{
  const left=path.join(root,'left.png'),right=path.join(root,'right.png'),output=path.join(root,'difference.png');
  const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env,timeout:30000});
  page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const fixtures=await page.evaluate(()=>{
   const png=colors=>{const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;const context=canvas.getContext('2d'),pixels=context.createImageData(2,2);pixels.data.set(colors);context.putImageData(pixels,0,0);return canvas.toDataURL('image/png').split(',')[1];};
   return {left:png([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]),right:png([255,0,0,255,0,255,0,255,0,0,255,255,155,255,255,255])};
  });
  const originalLeft=Buffer.from(fixtures.left,'base64'),originalRight=Buffer.from(fixtures.right,'base64');await Promise.all([fs.writeFile(left,originalLeft),fs.writeFile(right,originalRight)]);
  await app.evaluate(({dialog},files)=>{
   global.__pictureContextDialogs={queue:[files.left,files.right],opened:[],saved:[]};
   dialog.showOpenDialog=async()=>{const file=global.__pictureContextDialogs.queue.shift();if(!file)throw Error('Unexpected extra image picker');global.__pictureContextDialogs.opened.push(file);return {canceled:false,filePaths:[file]};};
   dialog.showSaveDialog=async(_window,options)=>{global.__pictureContextDialogs.saved.push(options.defaultPath);return {canceled:false,filePath:files.output};};
   dialog.showMessageBox=async()=>({response:1});
  },{left,right,output});
  await page.locator('#welcome [data-command="new:picture-compare"]').click();
  const picture=page.locator('#pictureWorkspace'),leftPane=picture.getByRole('group',{name:'Left image comparison',exact:true}),rightPane=picture.getByRole('group',{name:'Right image comparison',exact:true}),combined=picture.getByRole('group',{name:'Combined image comparison',exact:true}),menu=page.locator('#pictureContext');
  const item=name=>menu.getByRole('menuitem',{name,exact:true});
  async function context(pane=leftPane,keyboard=false){if(keyboard){await page.mouse.move(0,0);await pane.focus();await page.keyboard.press('Shift+F10');}else await pane.click({button:'right',position:{x:8,y:8}});await expect(menu).toBeVisible();}
  async function choose(group,label,pane=leftPane){await context(pane,true);await item(group).focus();await page.keyboard.press('ArrowRight');await expect(item(label)).toBeVisible();await item(label).click();await expect(menu).toBeHidden();}
  await context(leftPane,true);await expect(item('Save difference PNG')).toBeDisabled();await expect(item('Right image opacity')).toBeDisabled();await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(leftPane).toBeFocused();
  await context();await item('Open left image').click();await expect(leftPane.locator('header')).toContainText('left.png');await expect(picture).toHaveAttribute('aria-busy','false');
  await context(rightPane);await item('Open right image').click();await expect(rightPane.locator('header')).toContainText('right.png');await expect(picture.locator('.picture-status')).toContainText('1 of 4 pixels differ (25.00%)');
  await context(rightPane,true);await page.keyboard.press('Escape');await expect(rightPane).toBeFocused();
  await choose('Zoom','200%',rightPane);await expect(picture.getByLabel('Zoom',{exact:true})).toHaveValue('2');await expect(rightPane.locator('canvas')).toHaveCSS('width','4px');
  await choose('View','Difference');await expect(combined).toBeVisible();await expect(leftPane).toBeHidden();await expect(picture.getByLabel('View',{exact:true})).toHaveValue('difference');
  await choose('View','Overlay',combined);await expect(picture.getByLabel('View',{exact:true})).toHaveValue('overlay');
  await context(combined,true);await item('Right image opacity').click();const opacity=picture.getByLabel('Right image opacity',{exact:true});await expect(opacity).toBeFocused();await opacity.fill('0.25');await expect(picture.locator('output').last()).toHaveText('25%');
  await context(combined,true);await item('Pixel tolerance').click();const tolerance=picture.getByLabel('Pixel tolerance',{exact:true});await expect(tolerance).toBeFocused();await tolerance.fill('100');await expect(picture.locator('.picture-status')).toContainText('0 of 4 pixels differ (0.00%)');await tolerance.fill('0');await expect(picture.locator('.picture-status')).toContainText('1 of 4 pixels differ (25.00%)');
  await context(combined,true);await item('Save difference PNG').click();await expect.poll(()=>fs.readFile(output).then(bytes=>bytes.length).catch(()=>0)).toBeGreaterThan(0);
  const saved=await page.evaluate(async base64=>{const image=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'})),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);const result={width:image.width,height:image.height,pixels:[...context.getImageData(0,0,image.width,image.height).data]};image.close();return result;},(await fs.readFile(output)).toString('base64'));
  assert.deepEqual(saved,{width:2,height:2,pixels:[30,30,30,255,30,30,30,255,30,30,30,255,238,48,149,255]});
  await choose('View','Side by side',combined);await choose('Zoom','Fit');await expect(leftPane).toBeVisible();await expect(picture.getByLabel('Zoom',{exact:true})).toHaveValue('fit');
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.body.dataset.theme=theme,theme);
   const bounds=await rightPane.boundingBox();await page.mouse.click(bounds.x+bounds.width-3,bounds.y+bounds.height-3,{button:'right'});await expect(menu).toBeVisible();
   await item('View').hover();await expect(item('Overlay')).toBeVisible();const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
   for(const panel of await menu.locator('.folder-context-panel').all()){const box=await panel.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height,'Menu and submenu remain inside viewport');}
   await page.screenshot({path:'/private/tmp/fc-picture-context-'+theme+'.png'});await page.keyboard.press('Escape');await page.keyboard.press('Escape');await expect(menu).toBeHidden();
  }
  await expect(page.locator('#notice')).toBeHidden();const dialogs=await app.evaluate(()=>global.__pictureContextDialogs);assert.deepEqual(dialogs.opened,[left,right]);assert.deepEqual(dialogs.saved,['image-difference.png']);assert.deepEqual(dialogs.queue,[]);
  assert.deepEqual(await fs.readFile(left),originalLeft);assert.deepEqual(await fs.readFile(right),originalRight);assert.deepEqual(errors,[]);
  console.log('Picture context desktop workflow passed: native image pickers, keyboard and submenus, view/zoom/settings, exact difference PNG pixels, unchanged source files');
 }finally{
  if(page)await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
  await fs.rm(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
