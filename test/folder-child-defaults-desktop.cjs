'use strict';
const {selectFolderOption,clickFolderOption}=require('./folder-options-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test'),{clickFolderAction}=require('./folder-context-helper.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-child-defaults-')));let app,page;
 try{
  const roots=[path.join(base,'left'),path.join(base,'right')];for(const root of roots)await fs.mkdir(root);await fs.writeFile(path.join(roots[0],'sample.txt'),'HELLO \tWorld');await fs.writeFile(path.join(roots[1],'sample.txt'),'helloworld');
  const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(15000);
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));await app.evaluate(({dialog},roots)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});},[...roots]);
  const defaults={type:'text-compare',options:{ignoreCase:true,ignoreWhitespace:true,whitespaceScope:'all',showMinor:false}};await page.evaluate(value=>window.desktop.saveSessionDefaults(value,null),defaults);
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false'),row=(side='A')=>page.locator('#folderRows'+side+' .folder-entry[data-path="sample.txt"]');
  await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  const back=async()=>{await page.locator('#backToFolder').click();await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');await ready();};
  const child=async({ignoreCase=false,ignoreWhitespace=false,count='1',scope=null}={})=>{await expect(page.locator('#sessionKind')).toHaveText('Text Compare');await ready();await expect(page.locator('#textA')).toHaveValue('HELLO \tWorld');await expect(page.locator('#textB')).toHaveValue('helloworld');await expect(page.locator('#ignoreCase')).toBeChecked({checked:ignoreCase});await expect(page.locator('#ignoreWhitespace')).toBeChecked({checked:ignoreWhitespace});if(scope)await expect(page.locator('#whitespaceScope')).toHaveValue(scope);await expect(page.locator('#changeCount')).toHaveText(count);};
  // Exact content semantics override permissive standalone defaults through all child-opening routes.
  await expect(row()).toHaveClass(/changed/);await row().dblclick();await child();await back();
  await row().click({button:'right'});await clickFolderAction(page,'Open as text comparison');await child();await back();
  await row('A').click();await row('B').click({modifiers:[process.platform==='darwin'?'Meta':'Control']});await row('A').click({button:'right'});await clickFolderAction(page,'Compare selected pair');await child();await back();
  // Each normalized mode supplies its own exact flags, rather than mixing with saved defaults.
  for(const [mode,ignoreCase,ignoreWhitespace,count] of [['text-content',false,false,'1'],['text-case',true,false,'1'],['text-whitespace',false,true,'1'],['text-whitespace-case',true,true,'0']]){
   await selectFolderOption(page,'folderCompareMode',mode);await ready();await expect(row()).toHaveClass(count==='0'?/equal/:/changed/);await row().dblclick();await child({ignoreCase,ignoreWhitespace,count,scope:'horizontal'});await back();
  }
  assert.deepEqual(await page.evaluate(()=>window.desktop.getSessionDefaults('text-compare')),defaults,'Opening children must not modify saved defaults');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','new:text-compare'));await expect(page.locator('#sessionKind')).toHaveText('Text Compare');await ready();await expect(page.locator('#ignoreCase')).toBeChecked();await expect(page.locator('#ignoreWhitespace')).toBeChecked();await expect(page.locator('#whitespaceScope')).toHaveValue('all');await expect(page.locator('#showMinor')).not.toBeChecked();
  await page.locator('#textA').fill('HELLO \tWorld');await page.locator('#textB').fill('helloworld');await expect(page.locator('#changeCount')).toHaveText('0');
  console.log('Folder child defaults passed: Content double-click, explicit text and selected-pair routes preserve strict case/spaces; all normalized modes set exact flags; standalone defaults remain saved and active.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
