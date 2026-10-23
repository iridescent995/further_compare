'use strict';
const {chromium}=require('@playwright/test'),{build}=require('esbuild'),assert=require('node:assert/strict');
const {wav16}=require('./audio-fixtures.cjs');
(async()=>{
 const bundle=await build({entryPoints:['src/media-compare.js'],bundle:true,write:false,format:'iife',globalName:'MediaHarness',platform:'browser',plugins:[{name:'gate-mp3-decoder',setup(build){build.onResolve({filter:/mp3\.cjs$/},()=>({path:'mock-mp3',namespace:'mock'}));build.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const isMp3=bytes=>bytes[0]===77;export const decodeMp3=bytes=>new Promise((resolve,reject)=>window.decodes.push({resolve:()=>resolve({container:'MP3',format:'MPEG Layer III',lossy:true,bits:null,sampleRate:32000,channels:1,frames:4,duration:4/32000,samples:new Float64Array([0,.25,-.25,0]),mpegVersion:'1',variableBitrate:false,gaplessTrimmedFrames:0}),reject}));`,loader:'js'}));}}]});
 const browser=await chromium.launch({channel:'chrome',headless:true});try{
  const page=await browser.newPage();await page.setContent('<main id="host"></main>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(()=>{window.decodes=[];window.picks=[];window.saved=[];window.mime=[];const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{mime.push(blob.type);return create(blob);};window.controller=MediaHarness.createMediaCompare({host:document.querySelector('#host'),desktop:{openData:async()=>picks.shift(),saveData:async(data,name)=>{saved.push({data,name});return {cancelled:true};}}});});
  const wav={name:'original.wav',data:wav16([0,8192,-8192,0],{rate:32000}).toString('base64')},mp3={name:'track.mp3',data:Buffer.from('MP3').toString('base64')};
  await page.evaluate(wav=>controller.setState({inputs:{a:wav,b:wav}}),wav);
  await page.evaluate(mp3=>{picks.push(mp3);window.pending=controller.openSide('a').catch(error=>error.message);},mp3);await page.waitForFunction(()=>decodes.length===1);
  assert.equal(await page.evaluate(()=>controller.getState().inputs.a.name),'original.wav');
  await page.evaluate(async()=>{decodes.shift().reject(Error('Rejected MP3'));await pending;});assert.equal(await page.evaluate(()=>controller.getState().inputs.a.name),'original.wav');
  await page.evaluate(mp3=>{picks.push(mp3);window.pending=controller.openSide('a');},mp3);await page.waitForFunction(()=>decodes.length===1);await page.evaluate(async()=>{decodes.shift().resolve();await pending;});
  assert.match(await page.locator('.media-meta').first().textContent(),/MP3.*32,000 Hz.*lossy.*decoded samples/);assert.doesNotMatch(await page.locator('.media-meta').first().textContent(),/null-bit|32-bit|64-bit/);assert.equal(await page.evaluate(()=>mime.at(-1)),'audio/mpeg');assert.match(await page.locator('.media-status').textContent(),/Decoded samples match.*MP3 \(lossy\)/);assert.match(await page.locator('.media-status').getAttribute('title'),/MP3 is lossy/);
  await page.evaluate(()=>controller.saveResult());const report=await page.evaluate(()=>JSON.parse(atob(saved.at(-1).data)));assert.equal(report.comparisonBasis,'decoded samples');assert.equal(report.leftAudio.lossy,true);assert.equal(report.leftAudio.sourceFormat,'MPEG Layer III');assert.equal(Object.hasOwn(report.leftAudio,'bits'),false);assert.match(report.leftAudio.note,/Decoder delay/);assert.equal(report.rightAudio.bits,16);
  await page.evaluate(mp3=>{picks.push(mp3);window.pending=controller.openSide('a');},mp3);await page.waitForFunction(()=>decodes.length===1);await page.evaluate(async()=>{controller.reset();decodes.shift().resolve();await pending;});assert.equal(await page.evaluate(()=>controller.getState().inputs.a),null);assert.equal(await page.locator('#host').getAttribute('aria-busy'),'false');
  console.log('MP3 media UI passed: MIME, lossy metadata/report, preserved input on decode failure, pending state and stale reset completion.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
