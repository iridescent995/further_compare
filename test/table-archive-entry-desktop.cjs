'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const Excel=require('exceljs');
const {parseDelimited}=require('../src/structured-diff.cjs');
const {zip}=require('./archive-fixture.cjs'),{parseArchive}=require('../src/archive-core.cjs');

(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-table-archive-entry-')));let app,page;
 try{
  const left=path.join(root,'left.zip'),right=path.join(root,'right.zip'),output=path.join(root,'output.zip'),session=path.join(root,'child.fcompare'),disk=path.join(root,'saved.csv');
  const rows=[['id','value','note'],['1','original','comma, tab\t and "quote"'],['2','café 東京','line one\nline two']];
  const delimited=delimiter=>Buffer.from(rows.map(row=>row.map(cell=>'"'+cell.replace(/"/g,'""')+'"').join(delimiter)).join('\r\n'));
  const workbook=new Excel.Workbook();workbook.addWorksheet('Data').addRows(rows);workbook.getWorksheet('Data').getCell('B2').font={bold:true};
  const workbookBytes=Buffer.from(await workbook.xlsx.writeBuffer());
  const initialA={'data.csv':delimited(','),'data.tsv':delimited('\t'),'data.xlsx':workbookBytes,'only.csv':delimited(',')};
  const initialB={'data.csv':delimited(','),'data.tsv':delimited('\t'),'data.xlsx':workbookBytes};
  const originalA=zip(Object.entries(initialA).map(([name,data])=>({name,data,deflate:true}))),originalB=zip(Object.entries(initialB).map(([name,data])=>({name,data,deflate:true})));
  await fs.writeFile(left,originalA);await fs.writeFile(right,originalB);
  const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env,timeout:30000});
  page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({BrowserWindow,dialog},files)=>{
   BrowserWindow.getAllWindows().forEach(window=>window.hide());global.entryFiles=[files.left,files.right];global.entryDestination=files.output;
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.entryFiles.shift()]});
   dialog.showSaveDialog=async()=>({canceled:false,filePath:global.entryDestination});dialog.showMessageBox=async()=>({response:1});
  },{left,right,output});
  const menu=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  const destination=file=>app.evaluate(({},file)=>{global.entryDestination=file;},file),queue=file=>app.evaluate(({},file)=>{global.entryFiles.push(file);},file);
  const active=()=>page.locator('#sessionTabs [role="tab"][aria-selected="true"]').evaluate(el=>el.parentElement.dataset.sessionId);
  const switchTo=async id=>{await page.locator('#sessionTabs [data-session-id="'+id+'"] [role="tab"]').click();await expect(page.locator('#sessionTabs [data-session-id="'+id+'"] [role="tab"]')).toHaveAttribute('aria-selected','true');await expect(page.locator('body')).toHaveAttribute('aria-busy','false');};
  const host=page.locator('#archiveWorkspace'),review=page.locator('#archiveEntryEditDialog'),archiveReview=page.locator('#archiveEditDialog');
  const row=name=>host.locator('.archive-row[data-path="'+name+'"]');
  const button=name=>host.getByRole('button',{name,exact:true});
  const openEntry=async name=>{for(const ancestor of ['nested','nested/deep'])if(name.startsWith(ancestor+'/')&&!await row(name).isVisible()){const folder=row(ancestor);await expect(folder).toBeVisible();{const expand=folder.getByRole('button',{name:'Expand '+ancestor.split('/').pop(),exact:true}).first();if(await expand.isVisible())await expand.click();}}await row(name).dblclick();await expect(page.locator('#sessionKind')).toHaveText('Table Compare');await expect(page.locator('body')).toHaveAttribute('aria-busy','false',{timeout:30000});await expect(page.getByRole('button',{name:'Use left as result',exact:true})).toBeEnabled({timeout:30000});return active();};
  const apply=async side=>{await page.locator('#applyTableArchiveEntry'+side).click();await expect(review).toBeVisible();await expect(review.locator('[data-apply]')).toBeEnabled();await review.locator('[data-apply]').click();await expect(review).not.toBeVisible();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');};
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#welcome [data-command="new:archive-compare"]').click();await button('Open left archive').click();await button('Open right archive').click();const parent=await active();
  const control=name=>page.getByRole('button',{name,exact:true});
  const edited=rows.map(row=>row.slice());edited[1][1]='updated, café "quoted"';
  const edit=async value=>{await page.getByLabel('Result row 2 column 2',{exact:true}).fill(value);};
  const exportArchive=async side=>{
   await destination(output);await fs.rm(output,{force:true});await host.locator('summary').filter({hasText:'Save archive…'}).click();await button('Save '+side+' archive…').click();
   await expect(archiveReview.locator('[data-apply]')).toBeEnabled();await archiveReview.locator('[data-apply]').click();await expect(archiveReview).not.toBeVisible();
   await expect.poll(()=>fs.stat(output).then(s=>s.size).catch(()=>0)).toBeGreaterThan(0);return parseArchive(await fs.readFile(output));
  };
  const checkTable=async(archive,name,expected)=>{
   const bytes=Buffer.from(await archive.read(name));
   if(name.endsWith('.xlsx')){const book=new Excel.Workbook();await book.xlsx.load(bytes);assert.equal(book.worksheets.length,1);assert.deepEqual(book.worksheets[0].getSheetValues().slice(1).map(row=>row.slice(1)),expected);assert.equal(book.worksheets[0].getCell('B2').font?.bold,true);}
   else assert.deepEqual(parseDelimited(bytes.toString('utf8'),name.endsWith('.tsv')?'\t':','),expected);
  };
  const saveCsv=async expected=>{await destination(disk);await fs.rm(disk,{force:true});await control('Export result CSV').click();await expect.poll(()=>fs.stat(disk).then(s=>s.size).catch(()=>0)).toBeGreaterThan(0);assert.deepEqual(parseDelimited(await fs.readFile(disk,'utf8'),','),expected);};
  let csvChild;
  for(const name of ['data.csv','data.tsv','data.xlsx']){
   await switchTo(parent);const child=await openEntry(name);if(name==='data.csv')csvChild=child;
   await expect(page.locator('#applyTableArchiveEntryB')).toBeDisabled();await control('Use right as result').click();await edit(edited[1][1]);
   await page.locator('#applyTableArchiveEntryB').click();await expect(review).toBeVisible();await expect(review.locator('[data-summary]')).toContainText(name);
   if(name.endsWith('.xlsx'))await expect(review.locator('[data-summary]')).toContainText(/Workbook copy from right input/i);
   if(name.endsWith('.xlsx')&&process.env.FC_TABLE_ARCHIVE_SCREENSHOT){await page.screenshot({path:process.env.FC_TABLE_ARCHIVE_SCREENSHOT});const theme=await page.locator('body').getAttribute('data-theme');await page.evaluate(()=>document.body.dataset.theme='dark');await page.screenshot({path:process.env.FC_TABLE_ARCHIVE_SCREENSHOT.replace(/\.png$/,'-dark.png')});await page.evaluate(theme=>document.body.dataset.theme=theme||'light',theme);}
   await review.locator('[data-cancel]').click();await expect(review).not.toBeVisible();await switchTo(parent);const unchanged=await exportArchive('right');assert.deepEqual(Buffer.from(await unchanged.read(name)),initialB[name]);await switchTo(child);
   await apply('B');assert.equal(await active(),child);await saveCsv(edited);await switchTo(parent);await checkTable(await exportArchive('right'),name,edited);
   await menu('undo');await expect(host.getByRole('button',{name:'Redo archive edit',exact:true,includeHidden:true})).toBeEnabled();assert.deepEqual(Buffer.from(await (await exportArchive('right')).read(name)),initialB[name]);
   await menu('redo');await expect(host.getByRole('button',{name:'Redo archive edit',exact:true,includeHidden:true})).toBeDisabled();await checkTable(await exportArchive('right'),name,edited);
   await switchTo(child);await expect(page.getByLabel('Result row 2 column 2',{exact:true})).toHaveValue(edited[1][1]);await edit('second Ω');await apply('B');const twice=edited.map(row=>row.slice());twice[1][1]='second Ω';await switchTo(parent);await checkTable(await exportArchive('right'),name,twice);await switchTo(child);
   await apply('A');await switchTo(parent);await checkTable(await exportArchive('left'),name,twice);
  }
  // Saved sessions preserve the result grid but cannot persist runtime parent authority.
  await switchTo(csvChild);await destination(session);await menu('save-session');await expect(page.locator('#dirtyIndicator')).toBeHidden();const saved=JSON.parse(await fs.readFile(session,'utf8'));assert.equal(Object.hasOwn(saved,'archiveEntryLink'),false);assert.equal(JSON.stringify(saved).includes(parent),false);
  await queue(session);await menu('open-session');await expect(page.locator('#sessionKind')).toHaveText('Table Compare');await expect(page.locator('#applyTableArchiveEntryA')).not.toBeVisible();await expect(page.locator('#applyTableArchiveEntryB')).not.toBeVisible();await expect(page.getByLabel('Result row 2 column 2',{exact:true})).toHaveValue('second Ω');
  await switchTo(parent);const missing=await openEntry('only.csv');await control('Use left as result').click();await expect(page.locator('#applyTableArchiveEntryA')).toBeEnabled();await expect(page.locator('#applyTableArchiveEntryB')).toBeDisabled();
  // A parent replacement invalidates the entry reference even if the pathname matches.
  await switchTo(parent);await queue(left);await button('Open left archive').click();await expect(row('only.csv')).toBeVisible();await switchTo(missing);await page.locator('#applyTableArchiveEntryA').click();await expect(review).toBeVisible();await review.locator('[data-apply]').click();await expect(review.locator('[data-error]')).toContainText(/changed|stale|reopen/i);await review.locator('[data-cancel]').click();
  await switchTo(parent);await openEntry('data.csv');await control('Use right as result').click();
  const sameName=path.join(root,'data.csv');await fs.writeFile(sameName,initialA['data.csv']);await queue(sameName);await control('Open right').click();await control('Use left as result').click();await expect(page.locator('#applyTableArchiveEntryB')).toBeDisabled();await expect(page.locator('#applyTableArchiveEntryA')).toBeEnabled();
  const orphan=await active();await switchTo(parent);await menu('close-session');if(await page.locator('#unsavedDialog').isVisible())await page.locator('#discardSession').click();await expect(page.locator('#sessionTabs [data-session-id="'+parent+'"]')).toHaveCount(0);await switchTo(orphan);await expect(page.locator('#applyTableArchiveEntryA')).toBeDisabled();await expect(page.locator('#applyTableArchiveEntryB')).toBeDisabled();
  assert.deepEqual(await fs.readFile(left),originalA);assert.deepEqual(await fs.readFile(right),originalB);assert.deepEqual(errors,[]);
  console.log('Table archive entry workflow passed: CSV/TSV quoted unicode/delimiter/newline cells, XLSX workbook-preserving result, cancel/apply, both sides and repeat edits, parent undo/redo, tab result restoration, standalone CSV export, session isolation, same-name replacement, stale/missing/closed parents and unchanged originals.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
