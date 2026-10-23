'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fc-pastel-'));let app;
 try{
  const roots=['left','right'].map(n=>path.join(temp,n));
  for(const root of roots){await fs.mkdir(path.join(root,'src'),{recursive:true});await fs.writeFile(path.join(root,'src','app.js'),'export default true;');await fs.writeFile(path.join(root,'settings.json'),root===roots[0]?'old':'new');await fs.writeFile(path.join(root,'readme.md'),'same');}
  await fs.writeFile(path.join(roots[0],'left.txt'),'left');await fs.writeFile(path.join(roots[1],'right.txt'),'right');
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});const page=await app.firstWindow();page.setDefaultTimeout(15000);if(process.env.FC_TEST_SOURCE_CSS)await page.addStyleTag({path:path.resolve('public/display-settings.css')});
  await app.evaluate(({dialog},roots)=>{let i=0;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots[i++]]});},roots);
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');await ready();
  const borderless=async locator=>{assert.ok(await locator.count()>0);for(const border of await locator.evaluateAll(elements=>elements.map(e=>{const s=getComputedStyle(e);return ['Top','Right','Bottom','Left'].every(side=>s['border'+side+'Width']==='0px'||s['border'+side+'Style']==='none'||s['border'+side+'Color']==='rgba(0, 0, 0, 0)');})))assert.equal(border,true,'Resting action/card borders must be invisible');};
  for(const theme of ['light','dark']){
   await page.locator('body').evaluate((body,theme)=>body.dataset.theme=theme,theme);
   await borderless(page.locator('#welcome .choice-card'));
   await page.screenshot({path:'/private/tmp/further-pastel-welcome-'+theme+'.png'});
  }
  await page.locator('body').evaluate(body=>body.dataset.theme='light');
  await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  await expect(page.locator('#folderRowsA .folder-entry[data-path="settings.json"]')).toHaveClass(/changed/);
  for(const theme of ['light','dark']){
   await page.getByRole('button',{name:'Display',exact:true}).click();await page.getByLabel('Theme',{exact:true}).selectOption(theme);await page.getByRole('button',{name:'Done',exact:true}).click();await borderless(page.locator('.toolbar :is(.tool,.icon-button)'));await page.screenshot({path:'/private/tmp/further-pastel-folder-'+theme+'.png'});
  }
  const count=await page.getByRole('tab').count();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','new:text-compare'));await expect(page.getByRole('tab')).toHaveCount(count+1);await ready();
  for(const theme of ['light','dark']){
   await page.locator('body').evaluate((body,theme)=>body.dataset.theme=theme,theme);await borderless(page.locator('.session-tab,.session-tab button,#newTab,.toolbar button,label.text-comparison-rule'));
   const geometry=await page.evaluate(()=>({strip:document.querySelector('.tab-strip').getBoundingClientRect().height,tabs:[...document.querySelectorAll('.session-tab')].map(el=>{const s=getComputedStyle(el);return {height:el.getBoundingClientRect().height,image:s.backgroundImage,shadow:s.boxShadow,rgb:s.backgroundColor.match(/[\d.]+/g).slice(0,3).map(Number)};})}));
   await expect(page.locator('#editView')).toBeHidden();await expect(page.locator('#diffView')).toBeHidden();await expect(page.locator('#textOptions')).toHaveCSS('box-shadow','none');assert.ok(geometry.strip<=38,'Compact tab strip');for(const tab of geometry.tabs){assert.ok(tab.height<=30,'Compact tab');assert.equal(tab.image,'none');assert.equal(tab.shadow,'none');assert.ok(Math.max(...tab.rgb)-Math.min(...tab.rgb)<=20,'Neutral tab fill');}
   await page.screenshot({path:'/private/tmp/further-compact-text-tabs-'+theme+'.png'});
  }
  console.log('Pastel desktop checks passed: borderless controls/cards, compact neutral tabs, light/dark screenshots.');
 }finally{if(app){for(const window of app.windows())await window.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});}await app?.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
