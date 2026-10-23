'use strict';
const {_electron:electron,expect:baseExpect}=require('@playwright/test'),expect=baseExpect.configure({timeout:30000});
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),Excel=require('exceljs'),Zip=require('jszip');
const {arrayWorkbook}=require('./workbook-array-fixture.cjs');
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-workbook-array-')));let app,page;
 try{
  const original=await arrayWorkbook(),input=path.join(root,'original.xlsx');await fs.writeFile(input,original);
  const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env,timeout:30000});page=await app.firstWindow();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({BrowserWindow,dialog})=>{BrowserWindow.getAllWindows().forEach(window=>{window.hide();window.webContents.setBackgroundThrottling(false);});global.arrayFiles=[];global.arrayOutput='';dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.arrayFiles.shift()]});dialog.showSaveDialog=async()=>({canceled:false,filePath:global.arrayOutput});dialog.showMessageBox=async()=>({response:1});});
  const button=name=>page.getByRole('button',{name,exact:true}),ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false'),queue=file=>app.evaluate((_,file)=>global.arrayFiles.push(file),file),destination=file=>app.evaluate((_,file)=>global.arrayOutput=file,file);
  const command=async action=>{await ready();await app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);};
  const active=()=>page.locator('#sessionTabs [role="tab"][aria-selected="true"]').evaluate(el=>el.parentElement.dataset.sessionId);
  const field=(row,col)=>page.getByLabel(`Result row ${row} column ${col}`,{exact:true}),position=async(axis,index)=>{const control=page.getByLabel(`Result ${axis} number`,{exact:true});await control.fill(String(index));await control.blur();};
  let serial=0;const save=async()=>{const file=path.join(root,'result-'+serial+++'.xlsx');await destination(file);await button('Save workbook copy').click();await expect.poll(()=>fs.stat(file).then(stat=>stat.size).catch(()=>0)).toBeGreaterThan(0);return fs.readFile(file);};
  const verify=async(bytes,ref,formula)=>{const z=await Zip.loadAsync(bytes),xml=await z.file('xl/worksheets/sheet1.xml').async('string');assert.ok(xml.includes('t="array"'));assert.ok(xml.includes('ref="'+ref+'"'));const workbook=new Excel.Workbook();await workbook.xlsx.load(bytes);const sheet=workbook.getWorksheet('Data'),[anchor,end]=ref.split(':');assert.equal(sheet.getCell(anchor).formula,formula);assert.equal(sheet.getCell(anchor).result,undefined);assert.equal(sheet.getCell(anchor).font.bold,true);assert.equal(sheet.getCell(end).value,null);assert.equal(sheet.getCell(end).numFmt,'0.00');assert.equal(workbook.getWorksheet('Other').getCell('A1').formula,'SUM(Data!'+ref+')');assert.equal(workbook.getWorksheet('Other').getCell('A1').result,undefined);};
  await ready();await page.locator('#welcome [data-command="new:table-compare"]').click();await queue(input);await button('Open left').click();await expect(page.getByLabel('Left sheet')).toBeVisible();await button('Use left as result').click();
  await position('row',2);await button('Insert row before').click();await expect(field(3,3)).toHaveValue('[recalculate] =A3:B4*2');await verify(await save(),'C3:D4','A3:B4*2');
  await position('column',3);await button('Insert column before').click();await expect(field(3,4)).toHaveValue('[recalculate] =A3:B4*2');await verify(await save(),'D3:E4','A3:B4*2');
  const first=await active(),session=path.join(root,'array.fcompare');await destination(session);await command('save-session-as');await expect(page.locator('#dirtyIndicator')).toBeHidden();const saved=JSON.parse(await fs.readFile(session,'utf8'));assert.equal(saved.advanced.options.tableStructure.operations.length,2);
  await queue(session);await command('open-session');await expect.poll(active).not.toBe(first);await expect(field(3,4)).toHaveValue('[recalculate] =A3:B4*2');await verify(await save(),'D3:E4','A3:B4*2');
  // Deleting the inserted empty row moves the whole group; no individual member is removed.
  await position('row',2);await button('Delete row').click();await expect(field(2,4)).toHaveValue('[recalculate] =A2:B3*2');await verify(await save(),'D2:E3','A2:B3*2');
  await button('Undo edit').click();await expect(field(3,4)).toHaveValue('[recalculate] =A3:B4*2');await verify(await save(),'D3:E4','A3:B4*2');await button('Redo edit').click();await expect(field(2,4)).toHaveValue('[recalculate] =A2:B3*2');await verify(await save(),'D2:E3','A2:B3*2');
  await position('column',3);await button('Delete column').click();await expect(field(2,3)).toHaveValue('[recalculate] =A2:B3*2');await verify(await save(),'C2:D3','A2:B3*2');
  assert.deepEqual(await fs.readFile(input),original);assert.deepEqual(errors,[]);console.log('Array workbook desktop passed: native open, whole-group row/column moves, cross-sheet references, invalidated caches, follower formatting, saved copies, native session restore, subsequent edits, undo/redo and unchanged original.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
