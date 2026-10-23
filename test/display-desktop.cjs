'use strict';
const {_electron:electron,expect}=require('@playwright/test');const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'further-display-'));let app,page;
 try{
  for(const side of ['left','right']){await fs.mkdir(path.join(dir,side));await fs.writeFile(path.join(dir,side,'same.txt'),'matching\n');await fs.writeFile(path.join(dir,side,'changed.txt'),side+' changed\n');}await fs.writeFile(path.join(dir,'left','left-only.txt'),'left\n');await fs.writeFile(path.join(dir,'right','right-only.txt'),'right\n');
  const env={...process.env,FC_USER_DATA_DIR:path.join(dir,'profile')};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[process.cwd()]}),env});page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({dialog},files)=>{global.files=files;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.files.shift()]});},['left','right'].map(side=>path.join(dir,side)));
  const appearance=()=>app.evaluate(({Menu})=>{const view=Menu.getApplicationMenu().items.find(item=>item.label==='View');const item=view.submenu.items.find(item=>item.label==='Display Preferences…');if(!item)throw Error('Native display menu missing');item.click();});
  await expect(page.locator('#welcome [data-command="new:folder-compare"]')).toBeVisible();await appearance();await expect(page.getByRole('dialog',{name:'Display preferences'})).toBeVisible();await page.getByLabel('Theme',{exact:true}).selectOption('dark');await page.getByLabel('Density',{exact:true}).selectOption('compact');await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.locator('#welcome [data-command="new:folder-compare"]').click();await page.locator('#openA').click();await page.locator('#openB').click();await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');await expect(page.locator('#folderRowsA .different,#folderRowsA .changed')).toHaveCount(1);
  const selected=page.locator('#folderRowsA [data-path="changed.txt"]');await selected.click();await expect(selected).toHaveClass(/selected/);assert.equal(await selected.evaluate(e=>e.getBoundingClientRect().height),23);await expect(page.locator('body')).toHaveAttribute('data-theme','dark');
  await expect(page.locator('#folderSummary')).toContainText('1 different');await expect(page.locator('#folderRowsA .equal')).toHaveCount(1);await expect(page.locator('#folderSummary')).toContainText('1 identical');
  const colors=await page.locator('#folderRowsB [data-path="changed.txt"],#folderRowsA [data-path="same.txt"],#folderRowsA [data-path="left-only.txt"],#folderRowsB [data-path="right-only.txt"]').evaluateAll(rows=>rows.map(row=>getComputedStyle(row).color));assert.equal(new Set(colors).size,4);await page.screenshot({path:'/private/tmp/further-dark-native.png'});
  // Selection retains semantic filename/icon colors in both appearances.
  for(const theme of ['light','dark']){
   await appearance();await page.getByLabel('Theme',{exact:true}).selectOption(theme);await page.getByRole('button',{name:'Done',exact:true}).click();
   const states=[['A','changed.txt'],['A','same.txt'],['A','left-only.txt'],['B','right-only.txt']],seen=[];
   for(const [side,name]of states){
    const entry=page.locator('#folderRows'+side+' [data-path="'+name+'"]');await entry.click(seen.length?{modifiers:[process.platform==='darwin'?'Meta':'Control']}:{});await expect(entry).toHaveClass(/selected/);
    const style=await entry.evaluate(el=>{const label=getComputedStyle(el.querySelector('.entry-label')),icon=getComputedStyle(el.querySelector('.entry-icon')),row=getComputedStyle(el);return {label:label.color,icon:icon.color,background:row.backgroundColor,selection:row.getPropertyValue('--ui-selected').trim(),height:el.getBoundingClientRect().height};});
    assert.equal(style.label,style.icon);assert.equal(style.height,23);seen.push(style.label);
    const rgb=color=>color.match(/[\d.]+/g).slice(0,3).map(Number),lum=color=>rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const a=lum(style.label),b=lum(style.background);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,theme+' selected '+name+' contrast');
   }
   assert.equal(new Set(seen).size,4);await expect(page.locator('.folder-entry.selected')).toHaveCount(4);await page.screenshot({path:'/private/tmp/further-selected-'+theme+'.png'});
  }
  await page.locator('#newTab').click();await page.locator('#welcome [data-command="new:text-compare"]').click();await page.locator('#textA').fill('alpha beta\nlast\tline');await page.locator('#textB').fill('alpha changed\nlast\tline');await page.getByLabel('Spaces',{exact:true}).check();const mirror=page.locator('.text-whitespace-mirror').first();await expect(mirror).toBeVisible();await expect(mirror).toContainText('alpha·beta');const darkColor=await mirror.evaluate(e=>getComputedStyle(e).color);
  await appearance();await page.getByLabel('Theme',{exact:true}).selectOption('light');await page.getByRole('button',{name:'Done',exact:true}).click();const lightColor=await mirror.evaluate(e=>getComputedStyle(e).color);assert.notEqual(lightColor,darkColor);assert.equal(lightColor,await page.locator('#textA').evaluate(e=>getComputedStyle(e).caretColor));await expect(page.locator('#textA')).toHaveValue('alpha beta\nlast\tline');
  await appearance();await page.getByLabel('Theme',{exact:true}).selectOption('dark');await page.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await mirror.evaluate(e=>getComputedStyle(e).color),darkColor);assert.deepEqual(errors,[]);
  console.log('Display desktop passed: native View action, real folder rows/colors, compact selection, dark screenshot and whitespace overlay theme refresh.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true);if(app)await app.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
