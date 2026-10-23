'use strict';
const {chromium,expect}=require('@playwright/test');
const {build}=require('esbuild');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
(async()=>{
 const bundle=await build({stdin:{contents:"import {createPictureCompare} from './src/picture-compare.js';window.createPictureCompare=createPictureCompare;",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:750}});await page.setContent('<main id="host" style="height:680px"></main>');await page.addStyleTag({content:await fs.readFile('public/picture-compare.css','utf8')});await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(()=>{
   window.errors=[];window.dirty=0;window.saved=null;
   window.makeImage=(colors,width=2,height=1)=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');const pixels=context.createImageData(width,height);pixels.data.set(colors);context.putImageData(pixels,0,0);return canvas.toDataURL('image/png').split(',')[1];};
   window.left={name:'left.png',data:makeImage([255,0,0,255,0,0,0,0])};window.right={name:'right.png',data:makeImage([255,0,0,255,0,0,0,255])};
   window.picture=createPictureCompare({host:document.getElementById('host'),desktop:{openData:async side=>side==='a'?left:right,saveData:async(data,name)=>{saved={data,name};}},notify:(message,error)=>errors.push({message,error}),onDirty:()=>dirty++});
  });
  await page.getByRole('button',{name:'Open left image',exact:true}).click();await page.getByRole('button',{name:'Open right image',exact:true}).click();
  await expect(page.locator('.picture-status')).toContainText('1 of 2 pixels differ (50.00%)');
  await page.getByLabel('View',{exact:true}).selectOption('difference');await expect(page.locator('.picture-single canvas')).toBeVisible();
  await page.getByRole('button',{name:'Save difference PNG'}).click();assert.equal(await page.evaluate(()=>saved.name),'image-difference.png');assert.ok((await page.evaluate(()=>saved.data)).startsWith('iVBOR'));
  await page.getByLabel('Pixel tolerance').fill('255');await expect(page.locator('.picture-status')).toContainText('0 of 2 pixels differ');
  await page.getByLabel('View',{exact:true}).selectOption('overlay');await expect(page.getByLabel('Right image opacity')).toBeVisible();await page.getByLabel('Right image opacity').fill('0.25');await page.getByLabel('Zoom',{exact:true}).selectOption('2');
  const state=await page.evaluate(()=>picture.getState());assert.equal(state.options.opacity,0.25);assert.equal(state.options.zoom,'2');assert.equal(state.inputs.a.name,'left.png');
  await page.evaluate(async()=>{await picture.setState({inputs:{a:left,b:{name:'larger.png',data:makeImage([255,0,0,255,0,0,0,0,0,0,0,0],3)}},options:{}});});
  await expect(page.locator('.picture-status')).toContainText('1 of 3 pixels differ'); // Extra transparent pixels still mark dimension differences.
  await page.evaluate(async()=>{const old=picture.setState({inputs:{a:left,b:right},options:{}});const next=picture.reset();await Promise.all([old,next]);});
  await expect(page.locator('.picture-status')).toContainText('Open two images');assert.equal(await page.evaluate(()=>picture.getState().inputs.a),null);
  await page.evaluate(async()=>{try{await picture.setState({inputs:{a:{name:'invalid.png',data:'AAAA'}},options:{}});}catch{}});assert.match(await page.evaluate(()=>errors.at(-1).message),/Choose a PNG/);
  await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=4097;canvas.height=4096;try{await picture.setState({inputs:{a:{name:'too-large.png',data:canvas.toDataURL().split(',')[1]}},options:{}});}catch{}});assert.match(await page.evaluate(()=>errors.at(-1).message),/16 megapixels/);
  await page.evaluate(async()=>{await picture.setState({inputs:{a:left,b:right},options:{view:'split'}});});await page.screenshot({path:'/private/tmp/further-picture.png',fullPage:true});
  console.log('Picture browser passed: RGBA transparency, pixel counts, dimensions, tolerance, overlay, zoom, export, state restore/cancellation, invalid and oversized images.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
