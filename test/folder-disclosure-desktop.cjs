'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-disclosure-')));let app,page;
 try{
  const roots=[path.join(base,'left'),path.join(base,'right')];for(const root of roots){await fs.mkdir(path.join(root,'branch'),{recursive:true});await fs.writeFile(path.join(root,'branch','child.txt'),'child');await fs.writeFile(path.join(root,'root.txt'),'root');}
  const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(15000);
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));await app.evaluate(({dialog},roots)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});},[...roots]);
  await page.locator('#welcome [data-command="new:folder-compare"]').click();await page.locator('#openA').click();await page.locator('#openB').click();
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false'),row=side=>page.locator('#folderRows'+side+' .folder-entry[data-path="branch"]');await ready();const tabs=await page.getByRole('tab').count();
  await page.evaluate(()=>{window.disclosureEvents=[];document.addEventListener('click',event=>{if(event.target.closest('.tree-toggle'))disclosureEvents.push(event.detail);},true);});
  const observations=[];
  for(const side of ['A','B']){
   // Warm the direct node cache, then start each gesture from a known collapsed state.
   if(await row(side).getAttribute('aria-expanded')==='false'){await row(side).locator('.tree-toggle').click();await expect(row(side)).toHaveAttribute('aria-expanded','true');await ready();}
   for(const expected of [false,true]){
    const initial=!expected;if((await row(side).getAttribute('aria-expanded'))!==String(initial)){await row(side).locator('.tree-toggle').click();await expect(row(side)).toHaveAttribute('aria-expanded',String(initial));await ready();}
    await page.evaluate(()=>{disclosureEvents=[];});await row(side).locator('.tree-toggle').dblclick({delay:80});await ready();
    // Both clicks have completed, and any queued folder action must finish before observing.
    await page.waitForTimeout(150);await ready();
    const observation=await page.evaluate(({side,expected,tabs})=>{const entry=document.querySelector('#folderRows'+side+' .folder-entry[data-path="branch"]');return {side,expected,expanded:entry.getAttribute('aria-expanded')==='true',otherExpanded:document.querySelector('#folderRows'+(side==='A'?'B':'A')+' .folder-entry[data-path="branch"]').getAttribute('aria-expanded')==='true',focused:document.activeElement===entry,selected:entry.classList.contains('selected'),tabCount:document.querySelectorAll('[role="tab"]').length,tabs,clickDetails:[...disclosureEvents]};},{side,expected,tabs});observations.push(observation);
   }
  }
  console.log(JSON.stringify(observations,null,2));for(const result of observations){assert.deepEqual(result.clickDetails,[1,2],'Real disclosure double-click must deliver both click events');assert.equal(result.expanded,result.expected,result.side+' disclosure double-click must toggle exactly once');assert.equal(result.otherExpanded,result.expected,'Both panes share inline expansion');assert.equal(result.focused,true,'Disclosure keeps its row focused');assert.equal(result.selected,true,'Disclosure selects its row');assert.equal(result.tabCount,result.tabs,'Disclosure must not open a child comparison');}
  console.log('Folder disclosure passed: both panes, cached expand/collapse double-click toggles once, inline expansion, row selection/focus, no child comparison.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
