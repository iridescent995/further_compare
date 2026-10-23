'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fc-page-navigation-'));let app,page;
 try{
  const roots=[path.join(temp,'left'),path.join(temp,'right')];
  for(const root of roots){await fs.mkdir(root);for(let i=0;i<100;i++)if(root===roots[1]||i%3!==1)await fs.writeFile(path.join(root,`item-${String(i).padStart(3,'0')}.txt`),'same');}
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(15000);
  await app.evaluate(({dialog},roots)=>{let i=0;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots[i++]]});},roots);
  await page.locator('#welcome [data-command="new:folder-compare"]').click();await page.locator('#openA').click();await page.locator('#openB').click();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const modifier=process.platform==='darwin'?'Meta':'Control';
  for(const density of ['compact','comfortable']){
   await page.getByRole('button',{name:'Display',exact:true}).click();await page.getByLabel('Density',{exact:true}).selectOption(density);await page.getByRole('button',{name:'Done',exact:true}).click();
   for(const side of ['A','B']){
    const rows=page.locator(`#folderRows${side} .folder-entry:not(.missing)`),selected=page.locator(`#folderRows${side} .selected`);
    await rows.first().click();const first=await rows.first().getAttribute('data-id');
    await page.keyboard.press('PageDown');
    const state=await page.evaluate(side=>{const pane=document.querySelector('#folderRows'+side),focus=document.activeElement,viewport=focus.closest('.folder-panes');return {advance:focus.offsetTop-pane.firstElementChild.offsetTop,viewportHeight:viewport.clientHeight,id:focus.dataset.id,missing:focus.classList.contains('missing'),top:focus.getBoundingClientRect().top,bottom:focus.getBoundingClientRect().bottom,viewportTop:viewport.getBoundingClientRect().top,viewportBottom:viewport.getBoundingClientRect().bottom,scroll:viewport.scrollTop};},side);
    assert.notEqual(state.id,first);assert.ok(state.advance>state.viewportHeight/2,'Page Down must advance a page, not a single row');assert.equal(state.missing,false);assert.ok(state.bottom<=state.viewportBottom+1&&state.top>=state.viewportTop);await expect(selected).toHaveCount(1);
    const chosen=await selected.first().getAttribute('data-id');await page.keyboard.press(modifier+'+PageDown');assert.equal(await selected.first().getAttribute('data-id'),chosen);assert.notEqual(await page.evaluate(()=>document.activeElement.dataset.id),chosen);
    await rows.first().click();await page.keyboard.press('Shift+PageDown');assert.ok(await selected.count()>2);await page.keyboard.press('Shift+PageUp');await expect(rows.first()).toBeFocused();await expect(selected).toHaveCount(1);
    await page.keyboard.press('PageUp');await expect(rows.first()).toBeFocused();await page.keyboard.press('End');await expect(rows.last()).toBeFocused();await page.keyboard.press('PageDown');await expect(rows.last()).toBeFocused();await expect(selected).toHaveCount(1);
    await page.keyboard.press('PageUp');await page.keyboard.press('PageUp');
    assert.ok(await page.evaluate(()=>{const focus=document.activeElement,header=focus.closest('.folder-pane').querySelector('.folder-columns');return focus.getBoundingClientRect().top>=header.getBoundingClientRect().bottom-1;}),'Page Up focus must remain below the sticky headers');
   }
  }
  console.log('Folder page navigation passed: both panes, two densities, missing-side gaps, viewport visibility, modifier focus, Shift ranges and end bounds.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
