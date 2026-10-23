'use strict';
const {chromium,_electron:electron,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:15000}),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{const native=process.env.FC_SYNTAX_DESKTOP==='1';let browser,app,root,page;if(native){root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-syntax-'));const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[process.cwd()]}),env});page=await app.firstWindow();await page.setViewportSize({width:1400,height:900});await app.evaluate(({BrowserWindow,dialog})=>{BrowserWindow.getAllWindows().forEach(w=>w.hide());dialog.showSaveDialog=async()=>({canceled:false,filePath:global.syntaxPath});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.syntaxPath]});});}else{browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1400,height:900}});}try{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 if(native)await page.locator('#welcome [data-command="new:text-compare"]').click();else await page.goto('http://127.0.0.1:4173/compare.html');
 const a=page.locator('#textA'),b=page.locator('#textB'),option=page.locator('#syntaxAlignment'),summary=page.locator('#diffSummary');
 const left='send("old");\nreturn 1;',right='audit();\nsend("new");\nreturn 2;';
 const options=async()=>{await page.locator('#textOptions').click();await expect(page.locator('#textOptionsDialog')).toBeVisible();};
 const done=async()=>{await page.locator('#textOptionsDialog [data-done]').click();await expect(summary).not.toHaveText(/^(?:Ready|Comparing…|Comparison unavailable)$/);await expect(page.locator('#changeCount')).toHaveText(/^[0-9]+$/);};
 let downloadIndex=0;
 const download=async selector=>{if(native){const file=path.join(root,'report-'+(++downloadIndex)+'.json');await app.evaluate(({BrowserWindow},file)=>BrowserWindow.getAllWindows()[0].webContents.session.once('will-download',(_event,item)=>item.setSavePath(file)),file);await page.locator(selector).evaluate(el=>el.click());await expect.poll(()=>fs.readFile(file,'utf8').then(s=>{try{JSON.parse(s);return true;}catch{return false;}}).catch(()=>false)).toBe(true);return fs.readFile(file,'utf8');}const pending=page.waitForEvent('download');await page.locator(selector).evaluate(el=>el.click());return fs.readFile(await(await pending).path(),'utf8');};
 const report=async()=>{await expect(summary).not.toHaveText(/^(?:Ready|Comparing…|Comparison unavailable)$/);await expect(page.locator('#changeCount')).toHaveText(/^[0-9]+$/);return JSON.parse(await download('#exportReport'));};
 await a.fill(left);await b.fill(right);await expect(page.locator('#changeCount')).toHaveText('1');
 await options();await expect(option).not.toBeChecked();assert.equal(await option.locator('..').evaluate(el=>el.closest('dialog')?.id),'textOptionsDialog');await page.locator('#textProfile').selectOption('java');await done();
 assert.equal((await report()).syntaxAlignmentEnabled,false);
 await options();await option.check();await done();
 assert.equal((await report()).syntaxAlignment?.alignedRuns,1);
 let info=await report();assert.equal(info.syntaxAlignmentEnabled,true);assert.equal(info.syntaxAlignment.profile,'java');assert.equal(info.syntaxAlignment.pairedLines,2);assert.equal(info.syntaxAlignment.fallbackReason,null);
 // Selecting one physical source line copies its lexical counterpart, leaving
 // the target-only audit call and the other changed line untouched.
 const gutter=a.locator('..').locator('.live-text-gutter');await gutter.locator('.live-text-number[data-line="1"]').click();
 const arrow=gutter.locator('.live-text-copy[data-side="a"]');await expect(arrow).toHaveAttribute('data-line','1');await arrow.click();
 await expect(b).toHaveValue('audit();\nsend("old");\nreturn 2;');await expect(a).toHaveValue(left);
 await page.locator('#undoMerge').click();await expect(b).toHaveValue(right);await expect(a).toHaveValue(left);
 await page.locator('#redoMerge').click();await expect(b).toHaveValue('audit();\nsend("old");\nreturn 2;');await page.locator('#undoMerge').click();await expect(b).toHaveValue(right);
 // Disabling restores ordinary positional pairing with the same source texts.
 await options();await option.uncheck();await done();info=await report();assert.equal(info.syntaxAlignmentEnabled,false);assert.equal(info.syntaxAlignment,undefined);
 await options();await option.check();await done();await page.locator('#sessionName').fill('Structured text');
 if(native){
 const sessionFile=path.join(root,'alignment.fcompare');await app.evaluate((_,file)=>global.syntaxPath=file,sessionFile);
 await page.locator('[data-command="save-session"]').first().evaluate(el=>el.click());await expect(page.locator('#dirtyIndicator')).toBeHidden();
 const saved=JSON.parse(await fs.readFile(sessionFile,'utf8'));assert.equal(saved.options.syntaxAlignment,true);assert.equal(saved.text.a,left);assert.equal(saved.text.b,right);
 await page.locator('#newTab').click();await page.locator('#welcome [data-command="new:text-compare"]').click();await expect(a).toBeVisible();await options();await expect(option).not.toBeChecked();await page.locator('#textOptionsDialog [data-done]').click();
 await page.getByRole('tab',{name:/^Structured text/}).click();await options();await expect(option).toBeChecked();await done();await expect(a).toHaveValue(left);await expect(b).toHaveValue(right);
 const active=()=>page.evaluate(()=>document.querySelector('#sessionTabs [role=tab][aria-selected=true]')?.parentElement.dataset.sessionId||'');const before=await active();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','open-session'));await expect.poll(active).not.toBe(before);await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
 await expect(a).toHaveValue(left);await expect(b).toHaveValue(right);await options();await expect(option).toBeChecked();await done();info=await report();assert.equal(info.syntaxAlignment.alignedRuns,1);
 }
 // Plain profiles explicitly report that ordinary pairing is being used.
 await options();await page.locator('#textProfile').selectOption('plain');await done();await expect(summary).toContainText('Code alignment: ordinary pairing used');info=await report();assert.equal(info.syntaxAlignment.profile,'plain');assert.equal(typeof info.syntaxAlignment.fallbackReason,'string');
 await options();await page.locator('#textProfile').selectOption('java');await done();await a.fill('send("unterminated);');await expect(summary).toContainText('Code alignment: ordinary pairing used');assert((await report()).syntaxAlignment.fallbackReason);
 assert.deepEqual(errors,[]);console.log((native?'Syntax alignment desktop':'Syntax alignment browser')+' passed: default/off/on, Java inserted statement pairing, selected physical line copy with undo/redo and fallback notices.'+(native?' Disk session and tab restore passed.':' Browser has no saved-session UI.')+'');
}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});await fs.rm(root,{recursive:true,force:true});}else await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
