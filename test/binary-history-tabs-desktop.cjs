'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {zip}=require('./archive-fixture.cjs'),{parseArchive}=require('../src/archive-core.cjs');
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-binary-history-tabs-')));let app,page;
 try{
  const fixtures={'left.bin':[1,2,99,3,4],'right.bin':[1,2,3,4],'other.bin':[10,20,30],'replacement.bin':[8,9]};
  for(const [name,bytes] of Object.entries(fixtures))await fs.writeFile(path.join(root,name),Buffer.from(bytes));
  const archiveBytes=zip([{name:'entry.bin',data:Buffer.from([0,255,9,128]),deflate:true}]);
  await fs.writeFile(path.join(root,'archive.zip'),archiveBytes);
  const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env,timeout:30000});
  page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({BrowserWindow,dialog})=>{
   BrowserWindow.getAllWindows().forEach(window=>window.hide());global.historyFiles=[];global.historyDestination='';
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.historyFiles.shift()]});
   dialog.showSaveDialog=async()=>({canceled:false,filePath:global.historyDestination});dialog.showMessageBox=async()=>({response:1});
  });
  const command=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  const nativeHistory=async label=>{
   await app.evaluate(({Menu,BrowserWindow},label)=>{
    const find=menu=>{for(const item of menu.items){if(item.label===label)return item;if(item.submenu){const found=find(item.submenu);if(found)return found;}}};
    const item=find(Menu.getApplicationMenu());if(!item)throw Error('Missing native menu '+label);item.click(item,BrowserWindow.getAllWindows()[0],{});
   },label);
   await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  };
  const undo=()=>nativeHistory('Undo Comparison Edit'),redo=()=>nativeHistory('Redo Comparison Edit');
  const button=name=>page.getByRole('button',{name,exact:true});
  const queue=name=>app.evaluate(({},file)=>{global.historyFiles.push(file);},path.join(root,name));
  const destination=file=>app.evaluate(({},file)=>{global.historyDestination=file;},file);
  const active=()=>page.locator('#sessionTabs [role="tab"][aria-selected="true"]').evaluate(el=>el.parentElement.dataset.sessionId);
  const switchTo=async id=>{const tab=page.locator('#sessionTabs [data-session-id="'+id+'"] [role="tab"]');await tab.click();await expect(tab).toHaveAttribute('aria-selected','true');await expect(page.locator('body')).toHaveAttribute('aria-busy','false');};
  const newSession=async type=>{const previous=await active();await command('new:'+type);await expect.poll(active).not.toBe(previous);await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await expect(page.locator('#sessionKind')).toHaveText(type==='binary-compare'?'Binary Compare':type==='archive-compare'?'Archive Compare':'Text Compare');return active();};
  const open=async(side,name)=>{await queue(name);await button('Open '+side).click();};
  const edit=async(offset,value)=>{await page.getByLabel('Byte offset (hex)',{exact:true}).fill(offset);await page.getByLabel('Right byte (hex)',{exact:true}).fill(value);await button('Apply byte').click();};
  const range=async(operation,start,end,bytes)=>{
   await button('Edit byte range…').click();const dialog=page.getByRole('dialog',{name:'Edit right byte range',exact:true});
   await dialog.getByLabel('Operation',{exact:true}).selectOption(operation);await dialog.getByLabel('Start offset (hex)',{exact:true}).fill(start);
   if(operation!=='insert')await dialog.getByLabel('End offset (hex, exclusive)',{exact:true}).fill(end);
   if(operation!=='delete')await dialog.getByLabel('Replacement bytes (hex)',{exact:true}).fill(bytes);
   await dialog.getByRole('button',{name:'Apply range edit',exact:true}).click();await expect(dialog).not.toBeVisible();
  };
  let serial=0;
  const saved=async bytes=>{const file=path.join(root,'result-'+serial+++'.bin');await destination(file);await button('Save result').click();await expect.poll(()=>fs.readFile(file).then(b=>[...b]).catch(()=>null)).toEqual(bytes);};
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#welcome [data-command="new:binary-compare"]').click();
  await open('left','left.bin');await open('right','right.bin');const first=await active();
  await button('Next difference').click();await button('Copy difference to right').click();await saved([1,2,99,3,4]);
  await edit('0','aa');await range('insert','5','','bb cc');await range('delete','1','3','');await saved([170,3,4,187,204]);
  // Actual native menu handlers traverse byte, structural and copied-range checkpoints.
  await undo();await saved([170,2,99,3,4,187,204]);await undo();await saved([170,2,99,3,4]);
  await undo();await saved([1,2,99,3,4]);await undo();await saved([1,2,3,4]);await expect(button('Undo edit')).toBeDisabled();
  await redo();await redo();await saved([170,2,99,3,4]);await expect(button('Redo edit')).toBeEnabled();
  const second=await newSession('binary-compare');await open('right','other.bin');await expect(button('Undo edit')).toBeDisabled();await expect(button('Redo edit')).toBeDisabled();
  await edit('1','ee');await saved([10,238,30]);await undo();await saved([10,20,30]);
  const text=await newSession('text-compare');await undo();await redo();assert.equal(await active(),text);
  await switchTo(first);await saved([170,2,99,3,4]);await expect(button('Redo edit')).toBeEnabled();await redo();await saved([170,2,99,3,4,187,204]);
  await switchTo(second);await expect(button('Redo edit')).toBeEnabled();await redo();await saved([10,238,30]);await undo();await saved([10,20,30]);
  await switchTo(first);await redo();await saved([170,3,4,187,204]);await undo();await edit('0','dd');await saved([221,2,99,3,4,187,204]);await expect(button('Redo edit')).toBeDisabled();
  // Durable sessions persist current bytes, never transient undo snapshots.
  const session=path.join(root,'binary.fcompare');await destination(session);await command('save-session');await expect(page.locator('#dirtyIndicator')).toBeHidden();
  const persisted=JSON.parse(await fs.readFile(session,'utf8'));assert.deepEqual([...Buffer.from(persisted.advanced.inputs.b.data,'base64')],[221,2,99,3,4,187,204]);
  assert.equal(/binaryRuntime|binaryHistory|"undo"|"redo"/.test(JSON.stringify(persisted.advanced)),false);
  await queue('binary.fcompare');await command('open-session');await expect(page.locator('#sessionKind')).toHaveText('Binary Compare');await expect(button('Undo edit')).toBeDisabled();await expect(button('Redo edit')).toBeDisabled();await saved([221,2,99,3,4,187,204]);
  await edit('0','fe');await open('right','replacement.bin');await expect(button('Undo edit')).toBeDisabled();await expect(button('Redo edit')).toBeDisabled();await undo();await saved([8,9]);
  // A linked child retains its own history after applying; undo is local until another apply.
  const parent=await newSession('archive-compare'),host=page.locator('#archiveWorkspace');await queue('archive.zip');await host.getByRole('button',{name:'Open right archive',exact:true}).click();
  await page.evaluate(()=>{window.archiveClickTrace=[];for(const type of ['click','dblclick'])document.addEventListener(type,event=>window.archiveClickTrace.push({type,target:event.target.outerHTML.slice(0,300),busy:document.body.getAttribute('aria-busy')}),true);});await host.locator('.archive-row[data-path="entry.bin"]').dblclick();await expect(page.locator('#sessionKind')).toHaveText('Binary Compare',{timeout:20000});const child=await active();
  await edit('2','aa');const review=page.locator('#archiveEntryEditDialog');
  await page.locator('#applyBinaryArchiveEntryB').click();await expect(review).toBeVisible();await expect(review.locator('[data-apply]')).toBeEnabled();await review.locator('[data-apply]').click();await expect(review).not.toBeVisible();
  const archiveCheck=async expected=>{
   const file=path.join(root,'archive-result-'+serial+++'.zip');await destination(file);await host.locator('summary').filter({hasText:'Save archive…'}).click();await host.getByRole('button',{name:'Save right archive…',exact:true}).click();
   const dialog=page.locator('#archiveEditDialog');await expect(dialog.locator('[data-apply]')).toBeEnabled();await dialog.locator('[data-apply]').click();await expect(dialog).not.toBeVisible();
   await expect.poll(()=>fs.stat(file).then(s=>s.size).catch(()=>0)).toBeGreaterThan(0);const archive=parseArchive(await fs.readFile(file));assert.deepEqual([...await archive.read('entry.bin')],expected);
  };
  await switchTo(parent);await archiveCheck([0,255,170,128]);await switchTo(child);await expect(button('Undo edit')).toBeEnabled();await undo();await saved([0,255,9,128]);
  await switchTo(parent);await archiveCheck([0,255,170,128]);await undo();await archiveCheck([0,255,9,128]);await redo();await archiveCheck([0,255,170,128]);
  await switchTo(child);await expect(button('Redo edit')).toBeEnabled();await redo();await saved([0,255,170,128]);
  for(const [name,bytes] of Object.entries(fixtures))assert.deepEqual([...await fs.readFile(path.join(root,name))],bytes);assert.deepEqual(await fs.readFile(path.join(root,'archive.zip')),archiveBytes);assert.deepEqual(errors,[]);
  console.log('Binary runtime history passed: native undo/redo, byte/insert/delete/copied-range edits, exact bytes, isolated tab undo and redo branches, text switching, redo invalidation, session/replacement reset, archive child history and independent parent history.');
 }catch(error){if(page&&!page.isClosed()){console.error('Archive click diagnostics:',await page.evaluate(()=>({events:window.archiveClickTrace,busy:document.body.getAttribute('aria-busy'),text:document.body.innerText.slice(-3000)})));await page.screenshot({path:path.join(os.tmpdir(),'binary-history-failure.png')}).catch(()=>{});}throw error;}finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
