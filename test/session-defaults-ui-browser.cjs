'use strict';
const {chromium,expect}=require('@playwright/test');
const {build}=require('esbuild');
const assert=require('node:assert/strict');
(async()=>{
 const bundle=await build({entryPoints:['src/session-defaults-ui.js'],bundle:true,write:false,format:'iife',globalName:'DefaultsUI'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<button id="launch">Defaults</button>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(()=>{
   window.calls=[];window.saved=null;window.fail=false;window.unsupported=false;
   const profile={type:'text-compare',options:{ignoreCase:true}};
   const desktop={
    async previewSessionDefaults(data){calls.push(['preview',data]);if(unsupported)throw Error('This comparison type has no defaults');return{profile,existing:structuredClone(saved)};},
    async saveSessionDefaults(value,expected){calls.push(['save',value,expected]);if(fail)throw Error('Defaults changed');saved=structuredClone(value);},
    async resetSessionDefaults(type,expected){calls.push(['reset',type,expected]);saved=null;}
   };
   window.ui=DefaultsUI.createSessionDefaults({desktop,getSessionData:()=>({type:'text-compare',text:{a:'private current contents'}}),notify:message=>calls.push(['notify',message])});document.querySelector('#launch').onclick=()=>ui.open();
  });
  await page.locator('#launch').click();const dialog=page.getByRole('dialog',{name:'Session defaults'});await expect(dialog).toBeVisible();await expect(dialog.locator('[data-summary]')).toContainText('Ignore letter case');await expect(dialog.locator('[data-summary]')).toContainText('On');await expect(dialog.locator('[data-profile]')).not.toBeVisible();await dialog.getByText('Exact configuration',{exact:true}).click();await expect(dialog.locator('[data-profile]')).toContainText('ignoreCase');await dialog.getByText('Exact configuration',{exact:true}).click();await expect(dialog).not.toContainText('private current contents');await expect(dialog.locator('[data-reset]')).toBeDisabled();
  await dialog.locator('[data-save]').click();await expect(dialog.locator('[data-result]')).toContainText('Defaults saved');assert.equal(await page.evaluate(()=>calls.find(c=>c[0]==='save')[2]),null);
  await dialog.locator('[data-reset]').click();await expect(dialog.locator('[data-result]')).toContainText('Saved defaults removed');assert.equal(await page.evaluate(()=>calls.find(c=>c[0]==='reset')[2].options.ignoreCase),true);
  await page.evaluate(()=>fail=true);await dialog.locator('[data-save]').click();await expect(dialog.getByRole('alert')).toContainText('Defaults changed');await expect(dialog.locator('[data-save]')).toBeDisabled();await dialog.locator('[data-refresh]').click();await expect(dialog.locator('[data-save]')).toBeEnabled();
  await dialog.locator('[data-close]').click();await expect(page.locator('#launch')).toBeFocused();await page.evaluate(()=>unsupported=true);await page.locator('#launch').click();await expect(dialog.getByRole('alert')).toContainText('no defaults');await expect(dialog.locator('[data-save]')).toBeDisabled();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  console.log('Session defaults UI passed: sanitized preview, explicit save/reset, expected-profile guards, refresh after failure, unsupported types and focus restoration.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
