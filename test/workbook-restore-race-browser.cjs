'use strict';
const {chromium,expect}=require('@playwright/test'),{build}=require('esbuild'),assert=require('node:assert/strict'),Excel=require('exceljs');
(async()=>{
 const workbook=new Excel.Workbook();workbook.addWorksheet('Data').addRows([['id','value'],['a','archive right']]);const right={name:'right.xlsx',data:Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64')},bundle=await build({entryPoints:['src/advanced.js'],bundle:true,write:false,format:'iife',globalName:'Harness',platform:'browser'}),browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('https://further.test/**',route=>route.fulfill({contentType:'text/html',body:'<main id="host"></main>'}));await page.goto('https://further.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});await page.evaluate(()=>{window.calls=[];window.resolvers={};window.ui=Harness.createAdvanced({host:document.querySelector('#host'),desktop:{openData:async side=>{calls.push(side);return new Promise(resolve=>resolvers[side]=resolve);}},notify:()=>{}});});
  const button=name=>page.getByRole('button',{name,exact:true});
  for(const previous of ['binary-compare','table-compare']){
   await page.evaluate(type=>ui.setType(type),previous);
   await page.evaluate(input=>{const text=Blob.prototype.text;let held=false;Blob.prototype.text=async function(){if(!held){held=true;await new Promise(resolve=>window.releaseRead=resolve);}return text.call(this);};window.restore=ui.setType('table-compare',{inputs:{a:null,b:input},options:{}}).finally(()=>{Blob.prototype.text=text;});},right);
   await expect.poll(()=>page.evaluate(()=>typeof releaseRead)).toBe('function');await expect(button('Open left')).toBeDisabled();await expect(button('Open right')).toBeDisabled();
   assert.match(await page.evaluate(async()=>{try{await ui.openSide('a');return '';}catch(error){return error.message;}}),/finish restoring/);assert.deepEqual(await page.evaluate(()=>calls),[]);
   await page.evaluate(async()=>{releaseRead();await restore;delete window.releaseRead;});await expect(button('Open left')).toBeEnabled();await expect(button('Use right as result')).toBeEnabled();await button('Use right as result').click();assert.equal(await page.evaluate(()=>ui.getState().inputs.b.name),'right.xlsx');assert.equal(await page.evaluate(()=>ui.getState().options.tableResult[1][1]),'archive right');
  }
  // Ordinary independent side opens remain concurrent; resolving one never drops the other.
  await page.evaluate(()=>{window.leftOpen=ui.openSide('a');window.rightOpen=ui.openSide('b');});await expect.poll(()=>page.evaluate(()=>calls.length)).toBe(2);assert.deepEqual(await page.evaluate(()=>calls),['a','b']);await expect(button('Open left')).toBeEnabled();
  await page.evaluate(async()=>{resolvers.b({name:'new-right.csv',data:btoa('right')});await rightOpen;resolvers.a({name:'new-left.csv',data:btoa('left')});await leftOpen;});assert.deepEqual(await page.evaluate(()=>[ui.getState().inputs.a.name,ui.getState().inputs.b.name]),['new-left.csv','new-right.csv']);assert.deepEqual(errors,[]);
  console.log('Workbook restore race browser passed: gated restoration blocks UI/direct opens from binary and table states, retains restored archive side, and preserves concurrent independent side opens.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
