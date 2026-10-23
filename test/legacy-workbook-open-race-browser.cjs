'use strict';
// Real createAdvanced + production parser worker; only dialog completion and
// worker message delivery are controlled to make the stale-open order exact.
const {chromium,expect}=require('@playwright/test'),{build}=require('esbuild'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const source=await fs.readFile(path.join(root,'src/advanced.js'),'utf8'),guard='if(requestedGeneration!==generation||requestedState!==state||request!==openSerial[side])return;';
 assert.ok(source.includes(guard));
 const bundle=async mutant=>(await build({entryPoints:[path.join(root,'src/advanced.js')],bundle:true,write:false,format:'iife',globalName:'AdvancedHarness',platform:'browser',...(mutant?{plugins:[{name:'restore-prior-stale-open-guard',setup(b){b.onLoad({filter:/\/src\/advanced\.js$/},()=>({contents:source.replace(guard,'if(requestedGeneration!==generation)return;'),loader:'js',resolveDir:path.join(root,'src')}));}}]}:{})})).outputFiles[0].text;
 const [fixed,mutant,worker,bytes]=await Promise.all([bundle(false),bundle(true),build({entryPoints:[path.join(root,'src/legacy-workbook-browser-worker.js')],bundle:true,write:false,platform:'browser',format:'iife'}),fs.readFile(path.join(__dirname,'xls-fixtures/libreoffice-control.xls'))]);
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const isMutant of [true,false]){
   const page=await browser.newPage(),pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
   try{
    await page.route('http://localhost:4197/**',route=>{const name=new URL(route.request().url()).pathname;return route.fulfill({contentType:name.endsWith('.js')?'application/javascript':'text/html',body:name==='/advanced.js'?(isMutant?mutant:fixed):name==='/legacy-workbook-browser-worker.js'?worker.outputFiles[0].text:'<!doctype html><main id="host"></main><script src="/advanced.js"></script>'});});
    await page.goto('http://localhost:4197/');
    await page.evaluate(data=>{
     const NativeWorker=window.Worker;window.workerInstances=[];window.notices=[];window.requests=[];window.outcomes=[];
     window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.sent=[];this.terminated=false;workerInstances.push(this);}postMessage(...args){this.sent.push(args);}release(){for(const args of this.sent.splice(0))super.postMessage(...args);}terminate(){this.terminated=true;return super.terminate();}};
     window.sourceBytes=data;
     window.editor=AdvancedHarness.createAdvanced({host:document.querySelector('#host'),desktop:{openData:()=>new Promise(resolve=>requests.push(resolve))},notify:(m,error)=>{if(error)notices.push(m);}});
     editor.setType('table-compare');
     window.first=editor.openSide('a').then(()=>outcomes.push('first done'),e=>outcomes.push('first error '+e.message));
     window.second=editor.openSide('a').then(()=>outcomes.push('second done'),e=>outcomes.push('second error '+e.message));
     requests[1]({name:'newest.xls',data:sourceBytes});
    },bytes.toString('base64'));
    await expect.poll(()=>page.evaluate(()=>workerInstances.length)).toBe(1);
    await page.evaluate(async()=>{requests[0]({name:'older.xls',data:sourceBytes});await first;});
    const cancelled=await page.evaluate(()=>workerInstances[0].terminated);
    if(isMutant){assert.equal(cancelled,true,'Regression oracle: old implementation must cancel the newer worker');await page.evaluate(()=>editor.reset());continue;}
    assert.equal(cancelled,false,'Stale picker must not cancel the newest parser');
    assert.equal(await page.evaluate(()=>workerInstances.length),1,'Stale picker must not start a redundant worker');
    await page.evaluate(async()=>{workerInstances[0].release();await second;});
    assert.equal(await page.evaluate(()=>editor.getState().inputs.a.name),'newest.xls');
    await expect(page.getByLabel('Left sheet')).toHaveValue('0');
    assert.deepEqual(await page.evaluate(()=>outcomes),['first done','second done']);
    await expect(page.locator('#host')).toContainText('Café Ω中🚀');
    // Reset while an actual worker exists must terminate it and prevent publication.
    await page.evaluate(()=>{window.third=editor.openSide('a').then(()=>outcomes.push('third done'),e=>outcomes.push('third error '+e.message));requests[2]({name:'cancelled.xls',data:sourceBytes});});
    await expect.poll(()=>page.evaluate(()=>workerInstances.length)).toBe(2);
    await page.evaluate(async()=>{editor.reset();await third;});
    assert.equal(await page.evaluate(()=>workerInstances[1].terminated),true);
    assert.equal(await page.evaluate(()=>editor.getState().inputs.a),null);
    // A delayed picker after reset must not even create a parser worker.
    await page.evaluate(async()=>{editor.setType('table-compare');const pending=editor.openSide('a');editor.reset();requests[3]({name:'late.xls',data:sourceBytes});await pending;});
    assert.equal(await page.evaluate(()=>workerInstances.length),2);
    assert.equal(await page.evaluate(()=>editor.getState().inputs.a),null);
    assert.deepEqual(await page.evaluate(()=>notices),[]);assert.deepEqual(pageErrors,[]);
   }finally{await page.close();}
  }
  console.log('Real Chrome race regression passed: prior guard reproduces cancellation; current guard preserves newest parse; reset terminates active worker and suppresses delayed picker publication.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
