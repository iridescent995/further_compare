'use strict';
const {chromium}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const {saved,scheme,theme,density,fontSize} of [
  {saved:null,scheme:'light',theme:'light',density:'compact',fontSize:'13'},
  {saved:{theme:'dark',density:'comfortable',fontSize:15},scheme:'light',theme:'dark',density:'comfortable',fontSize:'15'},
  {saved:{theme:'system',density:'compact',fontSize:12},scheme:'dark',theme:'dark',density:'compact',fontSize:'12'},
  {saved:{theme:'invalid',density:'invalid',fontSize:99},scheme:'dark',theme:'light',density:'compact',fontSize:'13'}]){
  const page=await browser.newPage({colorScheme:scheme});await page.addInitScript(value=>localStorage.setItem('further-compare.display.v1',JSON.stringify(value)),saved);
  // Serve source assets directly. The heavy application bundle deliberately never
  // initializes: palette and geometry must already be correct without it.
  await page.route('http://startup.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(name==='app.js')return route.fulfill({contentType:'application/javascript',body:''});const file=process.env.FC_TEST_BUILT?path.join('dist',name):name==='compare.html'||name==='style.css'?name:path.join('public',name);try{await route.fulfill({body:await fs.readFile(file),contentType:name.endsWith('.css')?'text/css':name.endsWith('.js')?'application/javascript':'text/html'});}catch{await route.fulfill({status:404,body:''});}});
  await page.goto('http://startup.test/compare.html');
  const before=await page.evaluate(()=>{const body=document.body,button=document.querySelector('#swap'),style=getComputedStyle(button);return {theme:body.dataset.theme,density:body.dataset.density,fontSize:body.dataset.fontSize,bg:style.backgroundColor,border:style.borderTopWidth,borderColor:style.borderTopColor,transition:style.transitionDuration,inert:body.inert,palette:getComputedStyle(body).getPropertyValue('--pastel-lilac')};});
  assert.equal(before.theme,theme);assert.equal(before.density,density);assert.equal(before.fontSize,fontSize);assert.equal(before.inert,true);assert.notEqual(before.bg,'rgba(0, 0, 0, 0)');assert.ok(before.border==='0px'||before.borderColor==='rgba(0, 0, 0, 0)','Button border must not be visible');assert.equal(before.transition,'0s');assert.ok(before.palette.trim());
  const colors=await page.evaluate(()=>{const button=document.querySelector('#swap'),result=[];for(let i=0;i<8;i++){button.disabled=!!(i%2);result.push({disabled:button.disabled,background:getComputedStyle(button).backgroundColor,animations:button.getAnimations().length});}return result;});assert.ok(colors.every(value=>value.animations===0),'Busy state changes must not queue button color animations');
  await page.close();
 }
 console.log('Startup appearance passed: light/dark/system/invalid preferences apply without app bundle; pastel borderless buttons have no busy-state cross-fade.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
