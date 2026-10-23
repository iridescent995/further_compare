'use strict';
const {_electron:electron,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
(async()=>{
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-server-save-ui-'))),root=path.join(base,'remote'),controls={};let app,server,releaseRename,releaseComparison;
 try{
  for(const side of ['left','right']){await fs.mkdir(path.join(root,side),{recursive:true});await fs.writeFile(path.join(root,side,'sample.txt'),(side==='left'?'left':'rght')+' original\n');}
  server=await createSftpServer({root,writes:true,extensions:{'posix-rename@openssh.com':'1','fsync@openssh.com':'1'},controls});
  const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
  await app.evaluate(({app})=>{process.removeAllListeners('uncaughtException');process.on('uncaughtException',error=>{require('node:fs').writeFileSync('/private/tmp/fc-save-test-uncaught.log',error.stack||String(error));app.exit(1);});});
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));await expect(page.locator('#welcome')).toBeVisible();
  const menu=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  const idle=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const confirm=async response=>app.evaluate(({dialog},response)=>{global.saveReviews=[];dialog.showMessageBox=async(_,options)=>{global.saveReviews.push(options);return {response};};},response);
  let comparisonReadHeld=false;controls.onRequest=async name=>{if(name==='READ'&&!comparisonReadHeld){comparisonReadHeld=true;await new Promise(resolve=>{releaseComparison=resolve;});}};
  await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers.get('folders:tree-open-files');global.remoteTextOpenCalls=0;ipcMain.removeHandler('folders:tree-open-files');ipcMain.handle('folders:tree-open-files',(...args)=>{global.remoteTextOpenCalls++;return original(...args);});});
  await idle();await menu('new:folder-compare');await expect(page.locator('#folderWorkspace')).toBeVisible();await idle();
  const dialog=page.locator('#sftpConnectionDialog');
  for(const [side,folder] of [['A','left'],['B','right']]){
   await page.locator('#folderRemote'+side).click();await expect(dialog).toBeVisible();
   for(const [field,value] of [['host',server.host],['port',String(server.port)],['username','fixture-user'],['password','fixture-secret'],['root','/'+folder]])await dialog.locator('[name='+field+']').fill(value);
   await dialog.getByRole('button',{name:'Review server key',exact:true}).click();await expect(dialog.locator('code')).toHaveText(server.fingerprint);await dialog.getByRole('checkbox',{name:'I recognize this server key',exact:true}).check();await dialog.getByRole('button',{name:'Approve and connect',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(page.locator('#folderRows'+side+' .folder-entry[data-path="sample.txt"]')).toBeVisible();
  }
  await idle();const parentId=await page.locator('#sessionTabs [role=tab][aria-selected=true]').evaluate(el=>el.parentElement.dataset.sessionId);
  await expect.poll(()=>comparisonReadHeld).toBe(true);
  await page.locator('#folderRowsA .folder-entry[data-path="sample.txt"]').dblclick();
  await page.waitForTimeout(150);assert.equal(await app.evaluate(()=>global.remoteTextOpenCalls),0,'Opening waits for the held background comparison before resolving a row');
  releaseComparison();releaseComparison=null;delete controls.onRequest;
  await expect(page.locator('#textWorkspace')).toBeVisible({timeout:30000});await idle();assert.equal(await app.evaluate(()=>global.remoteTextOpenCalls),1);

  const childId=await page.locator('#sessionTabs [role=tab][aria-selected=true]').evaluate(el=>el.parentElement.dataset.sessionId);
  const sourceLabel='sftp://127.0.0.1:'+server.port+'/left/sample.txt';
  await expect(page.locator('#saveServerA')).toBeVisible();await expect(page.locator('#saveServerB')).toBeVisible();await expect(page.locator('#pathA')).toHaveValue(sourceLabel);
  await page.locator('#pathA').click({button:'right'});await expect(page.getByRole('menuitem',{name:'Save to server…',exact:true})).toBeVisible();await expect(page.getByRole('menuitem',{name:'Save local copy…',exact:true})).toBeVisible();await page.keyboard.press('Escape');
  await page.locator('#textA').fill('cancelled change\n');await confirm(0);await page.locator('#saveServerA').click();await idle();assert.equal(await fs.readFile(path.join(root,'left/sample.txt'),'utf8'),'left original\n');assert.equal(server.events.requests.some(row=>row[0]==='write'),false);
  const reviews=await app.evaluate(()=>global.saveReviews);assert.equal(reviews.length,1);assert.ok(reviews[0].detail.includes(sourceLabel));
  await confirm(1);await page.locator('#textA').fill('first server save é\n');await page.locator('#saveServerA').click();await idle();assert.deepEqual(await fs.readFile(path.join(root,'left/sample.txt')),Buffer.from('first server save é\n'));await expect(page.locator('#pathA')).toHaveValue(sourceLabel);await expect(page.locator('#saveServerA')).toBeVisible();
  // Pause immediately before publication, then type another edit while save is in flight.
  let renameStarted=false;controls.beforeRename=()=>new Promise(resolve=>{renameStarted=true;releaseRename=resolve;});
  await page.locator('#textA').fill('submitted revision\n');await page.locator('#saveServerA').click();await expect.poll(()=>renameStarted).toBe(true);await expect(page.locator('#clearA')).toBeDisabled();await expect(page.locator('#clearB')).toBeDisabled();
  await page.locator('#textA').fill('newer unsaved revision\n');releaseRename();releaseRename=null;delete controls.beforeRename;await idle();await expect(page.locator('#clearA')).toBeEnabled();await expect(page.locator('#clearB')).toBeEnabled();
  assert.equal(await fs.readFile(path.join(root,'left/sample.txt'),'utf8'),'submitted revision\n');await expect(page.locator('#textA')).toHaveValue('newer unsaved revision\n');await expect(page.locator('#notice')).toContainText('newer edits are still unsaved');
  await page.locator('#sessionTabs [data-session-id="'+parentId+'"] [role=tab]').click();await expect(page.locator('#folderWorkspace')).toBeVisible();await idle();await page.locator('#sessionTabs [data-session-id="'+childId+'"] [role=tab]').click();await idle();await expect(page.locator('#saveServerA')).toBeVisible();await expect(page.locator('#textA')).toHaveValue('newer unsaved revision\n');
  await page.locator('#saveServerA').click();await idle();assert.equal(await fs.readFile(path.join(root,'left/sample.txt'),'utf8'),'newer unsaved revision\n');
  await menu('swap');await idle();await expect(page.locator('#pathB')).toHaveValue(sourceLabel);await page.locator('#textB').fill('saved after swap\n');await page.locator('#saveServerB').click();await idle();assert.equal(await fs.readFile(path.join(root,'left/sample.txt'),'utf8'),'saved after swap\n');assert.equal(await fs.readFile(path.join(root,'right/sample.txt'),'utf8'),'rght original\n');
  await page.locator('#textOptions').click();await page.locator('#encodingB').selectOption('utf16le');await page.locator('#bomB').check();await page.locator('#textOptionsDialog [data-close]').click();
  await page.locator('#textB').fill('Unicode café Ω\n');await page.locator('#saveServerB').click();await idle();assert.deepEqual(await fs.readFile(path.join(root,'left/sample.txt')),Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('Unicode café Ω\n','utf16le')]));
  // Explicit legacy bytes that look like a UTF-8 signature must remain legacy text.
  await page.locator('#textOptions').click();await page.locator('#encodingB').selectOption('gb18030');await page.locator('#textOptionsDialog [data-close]').click();
  await page.locator('#textB').fill('锘緼');await page.locator('#saveServerB').click();await idle();await expect(page.locator('#notice')).toContainText(/saved/i);assert.deepEqual(await fs.readFile(path.join(root,'left/sample.txt')),Buffer.from('efbbbf41','hex'));
  await page.locator('#textB').fill('锘緼!');await page.locator('#saveServerB').click();await idle();assert.deepEqual(await fs.readFile(path.join(root,'left/sample.txt')),Buffer.from('efbbbf4121','hex'));
  await page.locator('#textOptions').click();await page.locator('#encodingB').selectOption('utf8');await page.locator('#bomB').uncheck();await page.locator('#textOptionsDialog [data-close]').click();
  await page.locator('#textB').fill('\ufeffA');await page.locator('#saveServerB').click();await idle();await expect(page.locator('#notice')).toContainText('Enable BOM');assert.deepEqual(await fs.readFile(path.join(root,'left/sample.txt')),Buffer.from('efbbbf4121','hex'));
  const buttonBounds=await page.locator('.path-field .icon-button:visible').evaluateAll(buttons=>buttons.map(button=>({id:button.id,width:button.clientWidth,scroll:button.scrollWidth,left:button.getBoundingClientRect().left,right:button.getBoundingClientRect().right,parent:button.parentElement.id})));
  for(const button of buttonBounds)assert.ok(button.scroll<=button.width+1,button.id+' text must fit');
  for(let i=1;i<buttonBounds.length;i++)if(buttonBounds[i].parent===buttonBounds[i-1].parent)assert.ok(buttonBounds[i].left>=buttonBounds[i-1].right-1,'Adjacent path buttons must not overlap');
  await page.screenshot({path:'/private/tmp/fc-server-save-light.png'});await page.evaluate(()=>document.body.dataset.theme='dark');await page.screenshot({path:'/private/tmp/fc-server-save-dark.png'});await page.evaluate(()=>document.body.dataset.theme='light');
  // External content changes must be rejected without publishing editor content.
  await fs.writeFile(path.join(root,'left/sample.txt'),'external change\n');await page.locator('#textB').fill('must not overwrite\n');await page.locator('#saveServerB').click();await idle();assert.equal(await fs.readFile(path.join(root,'left/sample.txt'),'utf8'),'external change\n');await expect(page.locator('#notice')).toContainText(/changed|reopen|stale/i);
  await page.locator('#textOptions').click();await page.locator('#encodingB').selectOption('utf8');await page.locator('#bomB').uncheck();await page.locator('#textOptionsDialog [data-close]').click();
  const localCopy=path.join(base,'saved-local.txt');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},localCopy);
  await page.locator('#pathB').click({button:'right'});await page.getByRole('menuitem',{name:'Save local copy…',exact:true}).click();await idle();assert.equal(await fs.readFile(localCopy,'utf8'),'must not overwrite\n');await expect(page.locator('#saveServerB')).toBeHidden();await expect(page.locator('#pathB')).toHaveValue(localCopy);await expect(page.locator('#saveServerA')).toBeVisible();
  assert.deepEqual(errors,[]);console.log('Remote text save UI passed: native cancellation/commit, exact UTF-8/UTF-16 BOM bytes, path context actions, newer edits retained, tabs, repeat save, swap routing, stale rejection and local-copy revocation.');
 }finally{releaseComparison?.();releaseRename?.();if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}if(server)await server.close();await fs.rm(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
