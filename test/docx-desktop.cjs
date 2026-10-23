'use strict';
const {_electron:electron,expect:baseExpect}=require('@playwright/test'),expect=baseExpect.configure({timeout:25000}),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {documentBytes}=require('./docx-ui-fixture.cjs');
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-docx-native-')));let app;
 try{
  const source=path.join(root,'Original α.docx'),plain=path.join(root,'plain.txt'),alias=path.join(root,'document-hardlink.txt'),session=path.join(root,'projection.fcompare'),output=path.join(root,'result.txt');
  const zip=await require('jszip').loadAsync(await documentBytes('Original document α'));zip.file('word/media/unused.bin',Buffer.alloc(11*1024*1024,7));const original=await zip.generateAsync({type:'nodebuffer',compression:'STORE'});assert(original.length>10*1024*1024);await fs.writeFile(source,original);await fs.writeFile(plain,'Plain text\n');await fs.link(source,alias);
  const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({BrowserWindow,dialog})=>{BrowserWindow.getAllWindows().forEach(window=>{window.hide();window.webContents.setBackgroundThrottling(false);});global.docxOpen='';global.docxSave='';global.docxSaveOptions=[];dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.docxOpen]});dialog.showSaveDialog=async(...args)=>{global.docxSaveOptions.push(args.at(-1));return {canceled:false,filePath:global.docxSave};};});
  const open=filename=>app.evaluate((_,value)=>{global.docxOpen=value;},filename),save=filename=>app.evaluate((_,value)=>{global.docxSave=value;},filename);
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#welcome [data-command="new:text-compare"]').click();
  await open(source);await page.locator('#openA').click();await expect(page.locator('#textA')).toHaveValue('Original document α\n');await expect(page.locator('#sizeA')).toContainText('DOCX text projection');await expect(page.locator('#reopenEncodingA')).toBeDisabled();
  await open(plain);await page.locator('#openB').click();await expect(page.locator('#textB')).toHaveValue('Plain text\n');
  await page.locator('[data-command="swap"]').first().evaluate(button=>button.click());await expect(page.locator('#pathB')).toHaveValue(source);await expect(page.locator('#sizeB')).toContainText('DOCX text projection');await expect(page.locator('#sizeA')).not.toContainText('DOCX');
  await page.locator('#textB').fill('Edited extracted result');await save(session);await page.locator('.session-bar [data-command="save-session"]').click();
  await expect.poll(async()=>{try{return JSON.parse(await fs.readFile(session,'utf8')).files.b.documentProjection.kind;}catch{return null;}}).toBe('docx');const saved=JSON.parse(await fs.readFile(session,'utf8'));assert.equal(saved.files.b.path,source);assert.equal(saved.text.b,'Edited extracted result');assert.equal(saved.files.a.documentProjection,undefined);
  await open(session);await page.locator('[data-command="open-session"]').first().evaluate(button=>button.click());await expect(page.locator('#textB')).toHaveValue('Edited extracted result');await expect(page.locator('#pathB')).toHaveValue(source);await expect(page.locator('#sizeB')).toContainText('DOCX text projection');
  const firstWindowId=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].id);
  const nextWindow=app.waitForEvent('window');await page.evaluate(()=>window.desktop.newWindow());const second=await nextWindow;second.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>{window.hide();window.webContents.setBackgroundThrottling(false);}));
  await expect(second.locator('body')).toHaveAttribute('aria-busy','false');await second.locator('#welcome [data-command="new:text-compare"]').click();await second.locator('#textA').fill('Separate window text');
  await save(alias);const crossWindowFailure=await second.evaluate(async()=>{try{await window.desktop.saveText('must not overwrite from another window','other.txt','a',{encoding:'utf8',bom:false,lineEnding:'none'});return '';}catch(error){return error.message;}});assert.match(crossWindowFailure,/document|DOCX|source/i);assert.deepEqual(await fs.readFile(source),original);assert.deepEqual(await fs.readFile(alias),original);
  for(const target of [source,alias,path.join(root,'new.DOCX')]){
   await save(target);const failure=await page.evaluate(async()=>{try{await window.desktop.saveText('must not overwrite','Original.docx','b',{encoding:'utf8',bom:false,lineEnding:'none'});return '';}catch(error){return error.message;}});assert.match(failure,/document|DOCX|source/i);assert.deepEqual(await fs.readFile(source),original);assert.deepEqual(await fs.readFile(alias),original);
  }
  assert.equal((await fs.stat(path.join(root,'new.DOCX')).catch(()=>null)),null);
  await save(output);await page.locator('#saveB').click();await expect.poll(()=>fs.readFile(output,'utf8').catch(()=>null)).toBe('Edited extracted result');await expect(page.locator('#pathB')).toHaveValue(output);await expect(page.locator('#sizeB')).not.toContainText('DOCX');
  assert.equal((await app.evaluate(()=>global.docxSaveOptions)).at(-1).defaultPath,'Original α.txt');assert.deepEqual(await fs.readFile(source),original);assert.deepEqual(await fs.readFile(alias),original);assert.deepEqual(errors,[]);
  await app.evaluate(({BrowserWindow},id)=>BrowserWindow.fromId(id).destroy(),firstWindowId);await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)).toBe(1);
  const unrelated=path.join(root,'separate-window.txt');await save(unrelated);await second.locator('#saveA').click();await expect.poll(()=>fs.readFile(unrelated,'utf8').catch(()=>null)).toBe('Separate window text');assert.deepEqual(await fs.readFile(source),original);assert.deepEqual(errors,[]);
  console.log('DOCX native passed: actual open/extraction, side swap, saved-session projection/draft restoration, original path and hardlink overwrite rejection, DOCX destination rejection, .txt export, cross-window source protection and safe source-window cleanup with original bytes preserved.');
 }finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
