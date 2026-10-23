'use strict';
const {selectFolderOption,clickFolderOption}=require('./folder-options-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const {clickFolderAction,folderContextItem}=require('./folder-context-helper.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-text-file-report-')));let app,page;
 try{
  const roots=['left','right'].map(name=>path.join(temp,name));
  for(const root of roots){
   await fs.mkdir(path.join(root,'closed'),{recursive:true});
   await fs.writeFile(path.join(root,'closed','hidden.txt'),'UNREAD_CLOSED_CONTENT');
   await fs.writeFile(path.join(root,'untouched.txt'),'UNREAD_SIBLING_CONTENT');
   await fs.writeFile(path.join(root,'binary.bin'),Buffer.from([0,1,2,0,255]));
   for(let i=0;i<21;i++)await fs.writeFile(path.join(root,'limit'+i+'.txt'),'limit');
  }
  await fs.writeFile(path.join(roots[0],'pair<&.txt'),'start\r\nold value\r\nend\r\n');
  await fs.writeFile(path.join(roots[1],'pair<&.txt'),'start\nnew value\nend\n');
  await fs.writeFile(path.join(roots[1],'only.txt'),'one sided\n');
  await fs.writeFile(path.join(roots[0],'rules.txt'),'Hello World\r\n');
  await fs.writeFile(path.join(roots[1],'rules.txt'),'hello\tworld\n');
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
  page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.hide()));page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));
  await app.evaluate(({dialog,ipcMain},roots)=>{
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});global.textReportCalls=[];
   for(const channel of ['folders:tree-text-report','folders:tree-list','folders:tree-compare','folders:tree-compare-selected']){
    const original=ipcMain._invokeHandlers.get(channel);if(!original)throw Error('Missing IPC '+channel);ipcMain.removeHandler(channel);
    ipcMain.handle(channel,async(...args)=>{global.textReportCalls.push([channel,...args.slice(1)]);return original(...args);});
   }
  },[...roots]);
  const entry=(name,side='A')=>page.locator('#folderRows'+side+' .folder-entry[data-path='+JSON.stringify(name)+']');
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const call=(name,...args)=>page.evaluate(({name,args})=>window.desktop[name](...args),{name,args});
  const modifier=process.platform==='darwin'?'Meta':'Control';
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();
  await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  await expect(entry('pair<&.txt')).toHaveClass(/changed/);await expect(page.locator('#folderSummary')).not.toContainText('Comparing');
  await page.evaluate(()=>{
   window.__textReportDownloads=[];const blobs=new Map(),create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click;
   URL.createObjectURL=blob=>{const url=create(blob);blobs.set(url,blob);return url;};
   URL.revokeObjectURL=url=>{blobs.delete(url);revoke(url);};
   HTMLAnchorElement.prototype.click=function(){const blob=blobs.get(this.href);if(this.download&&blob){const filename=this.download;window.__textReportDownloads.push(blob.text().then(text=>({filename,text})));return;}return click.call(this);};
  });
  const dialog=page.locator('#fileContentReport');
  const nativeReport=()=>app.evaluate(({Menu})=>{const view=Menu.getApplicationMenu().items.find(item=>item.label==='View');const item=view?.submenu.items.find(item=>item.label==='Text File Report…');if(!item)throw Error('Missing View > Text File Report…');item.click();});
  const download=async format=>{
   await dialog.locator('select').selectOption(format);const before=await page.evaluate(()=>window.__textReportDownloads.length);
   await dialog.getByRole('button',{name:/^Export/}).click();await expect.poll(()=>page.evaluate(()=>window.__textReportDownloads.length)).toBe(before+1);
   const result=await page.evaluate(index=>window.__textReportDownloads[index],before);assert.ok(result.filename.endsWith('.'+(format==='text'?'txt':format)));return result.text;
  };
  const tabs=await page.getByRole('tab').count();
  await entry('pair<&.txt').click();await entry('pair<&.txt','B').click({modifiers:[modifier]});await entry('only.txt','B').click({modifiers:[modifier]});
  const ids=[await entry('pair<&.txt').getAttribute('data-id'),await entry('only.txt','B').getAttribute('data-id')];
  await entry('only.txt','B').click({button:'right'});await app.evaluate(()=>{global.textReportCalls=[];});await clickFolderAction(page,'Text file report…');
  await expect(dialog).toBeVisible();assert.equal(await page.getByRole('tab').count(),tabs);
  const calls=await app.evaluate(()=>global.textReportCalls);assert.equal(calls.length,1);assert.equal(calls[0][0],'folders:tree-text-report');assert.deepEqual([...calls[0][1]].sort(),ids.sort());
  const json=JSON.parse(await download('json'));const serialized=JSON.stringify(json);
  assert.match(serialized,/old value/);assert.match(serialized,/new value/);assert.match(serialized,/one sided/);assert.match(serialized,/CRLF/i);assert.match(serialized,/utf-?8/i);
  assert.ok(!serialized.includes('UNREAD_'));assert.equal(json.files.length,2);
  const changed=json.files.find(file=>file.pathA==='pair<&.txt'),only=json.files.find(file=>file.pathB==='only.txt');
  assert.equal(changed.status,'different');assert.equal(changed.hunks.length,1);assert.ok(changed.rows.some(line=>line.a==='old value'&&line.ai===1));assert.ok(changed.rows.some(line=>line.b==='new value'&&line.bi===1));
  assert.equal(only.status,'right-only');assert.equal(only.left,null);assert.ok(only.rows.some(line=>line.b==='one sided'));
  await dialog.locator('[data-differences]').check();const filtered=JSON.parse(await download('json'));assert.equal(filtered.differencesOnly,true);assert.ok(filtered.files.flatMap(file=>file.rows).every(line=>line.type!=='equal'||line.minor));await dialog.locator('[data-differences]').uncheck();
  for(const format of ['html','text']){const output=await download(format);assert.match(output,/old value/);assert.match(output,/new value/);assert.match(output,/one sided/);assert.ok(!output.includes('UNREAD_'));if(format==='html'){assert.ok(output.includes('pair&lt;&amp;.txt'));assert.ok(!output.includes('pair<&.txt'));}}
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await expect(dialog).toBeHidden();await expect(entry('only.txt','B')).toBeFocused();
  await expect(entry('pair<&.txt')).toHaveAttribute('aria-selected','true');await expect(entry('pair<&.txt','B')).toHaveAttribute('aria-selected','true');await expect(entry('only.txt','B')).toHaveAttribute('aria-selected','true');
  await selectFolderOption(page,'folderCompareMode','text-whitespace-case');await ready();await expect(page.locator('#folderSummary')).not.toContainText('Comparing');
  await entry('rules.txt').click();await app.evaluate(()=>{global.textReportCalls=[];});await nativeReport();await expect(dialog).toBeVisible();
  const normalized=JSON.parse(await download('json'));assert.match(JSON.stringify(normalized),/Hello World/);assert.match(JSON.stringify(normalized),/hello/);assert.deepEqual(normalized.rules,{mode:'text-whitespace-case',ignoreWhitespace:true,ignoreCase:true});assert.equal(normalized.files[0].hunks.length,0);assert.ok(normalized.files[0].ignoredLineCount>0);assert.equal(normalized.files[0].status,'text-match-with-minor-differences');
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(entry('rules.txt')).toBeFocused();
  await entry('binary.bin').click();await nativeReport();await ready();await expect(page.locator('#notice')).toBeVisible();await expect(dialog).toBeHidden();
  await entry('closed').click({button:'right'});await expect(await folderContextItem(page,'Text file report…')).toBeDisabled();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await nativeReport();await ready();await expect(dialog).toBeHidden();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','folder:clear-selection'));await ready();await nativeReport();await ready();await expect(dialog).toBeHidden();
  for(let i=0;i<21;i++)await entry('limit'+i+'.txt').click({modifiers:i?[modifier]:[]});
  await entry('limit0.txt').click({button:'right'});await expect(await folderContextItem(page,'Text file report…')).toBeDisabled();await page.keyboard.press('Escape');await page.keyboard.press('Escape');await nativeReport();await ready();await expect(dialog).toBeHidden();
  // The raw bridge must reject untrusted row IDs, directories, and stale authority.
  const tree=await call('listFolderTree'),file=tree.rows.find(item=>item.pathA==='rules.txt'),directory=tree.rows.find(item=>item.pathA==='closed');
  await assert.rejects(()=>call('readFolderTextReport',['forged'],tree.revision));
  await assert.rejects(()=>call('readFolderTextReport',[directory.id],tree.revision),/file|folder/i);
  await assert.rejects(()=>call('readFolderTextReport',[file.id],String(tree.revision)+'stale'),/revision/i);
  const direct=await call('readFolderTextReport',[file.id],tree.revision);assert.equal(direct.files.length,1);assert.equal(direct.files[0].left.content,'Hello World\r\n');
  assert.equal(await page.getByRole('tab').count(),tabs);await expect(entry('closed')).toHaveAttribute('aria-expanded','false');assert.deepEqual(errors,[]);
  console.log('Detailed selected text report passed: exact/deduplicated selected IPC, native/context routes, HTML/JSON/text exports, one-sided content and encoding/EOL metadata, text rules, binary/empty/folder/limit guards, forged/stale authority, preserved selection/focus and no extra tabs.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
