'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const Excel=require('exceljs');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'further-workbook-formulas-'));let app,page;
 try{
  const originals=new Map();
  for(const side of ['left','right']){
   const a=side==='left',book=new Excel.Workbook();book.addWorksheet('Records').addRows([['id','value'],['changed-expression',{formula:a?'1+1':'4/2',result:2}],['changed-cache',{formula:'2+2',result:a?4:5}],['formula-literal',a?{formula:'3+3',result:6}:6]]);
   const file=path.join(dir,side+'.xlsx');await book.xlsx.writeFile(file);originals.set(file,await fs.readFile(file));
  }
  const env={...process.env,FC_USER_DATA_DIR:path.join(dir,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({dialog},files)=>{globalThis.formulaFiles=files;globalThis.formulaDestination='';dialog.showOpenDialog=async()=>({canceled:false,filePaths:[globalThis.formulaFiles.shift()]});dialog.showSaveDialog=async()=>({canceled:false,filePath:globalThis.formulaDestination});},[...originals.keys()]);
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const command=async action=>{await ready();await app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);};
  const mode=page.getByLabel('Workbook comparison',{exact:true}),workspace=page.locator('#dataWorkspace');
  const table=()=>workspace.locator('table').first();
  const dataRow=id=>table().locator('tr').filter({hasText:id});
  await ready();await page.locator('#welcome [data-command="new:table-compare"]').click();await page.locator('#sessionName').fill('Formula workbook');
  await page.getByRole('button',{name:'Open left',exact:true}).click();await expect(page.getByLabel('Left sheet')).toBeVisible();await page.getByRole('button',{name:'Open right',exact:true}).click();await expect(page.getByLabel('Right sheet')).toBeVisible();
  await page.getByLabel('First row is header').check();await page.getByLabel('Key columns (1,2…)').fill('1');await page.getByLabel('Key columns (1,2…)').press('Tab');
  await expect(mode).toHaveValue('values');await expect(workspace).toContainText('1 changed or unmatched');await expect(dataRow('changed-expression')).toHaveClass('equal');await expect(dataRow('changed-cache')).toHaveClass('changed');await expect(workspace.locator('.workbook-formula')).toHaveCount(0);
  await mode.selectOption('formulas');await expect(workspace).toContainText('2 changed or unmatched');await expect(dataRow('changed-expression')).toHaveClass('changed');await expect(dataRow('changed-cache')).toHaveClass('equal');await expect(dataRow('formula-literal')).toHaveClass('changed');await expect(dataRow('changed-expression').getByLabel('Left formula',{exact:true})).toHaveText('=1+1');await expect(dataRow('changed-expression').getByLabel('Right formula',{exact:true})).toHaveText('=4/2');
  await mode.selectOption('values');await expect(workspace).toContainText('1 changed or unmatched');await mode.selectOption('formulas');await expect(workspace).toContainText('2 changed or unmatched');
  const session=path.join(dir,'formulas.fcompare');await app.evaluate((_,file)=>globalThis.formulaDestination=file,session);await command('save-session-as');await expect(page.locator('#dirtyIndicator')).toBeHidden();const saved=JSON.parse(await fs.readFile(session,'utf8'));assert.equal(saved.advanced.options.workbookMode,'formulas');
  await mode.selectOption('values');await app.evaluate((_,file)=>globalThis.formulaFiles.push(file),session);await command('open-session');await expect(page.getByRole('tab',{name:/Formula workbook/})).toHaveCount(2);await expect(mode).toHaveValue('formulas');await expect(workspace).toContainText('2 changed or unmatched');
  await command('swap');await expect(dataRow('changed-expression').getByLabel('Left formula',{exact:true})).toHaveText('=4/2');await expect(dataRow('changed-expression').getByLabel('Right formula',{exact:true})).toHaveText('=1+1');await expect(dataRow('changed-cache')).toHaveClass('equal');await expect(workspace).toContainText('2 changed or unmatched');
  // Export preserves cached values as literal strings, never executable formula expressions.
  await page.getByRole('button',{name:'Use left as result',exact:true}).click();const exported=path.join(dir,'result.xlsx');await app.evaluate((_,file)=>globalThis.formulaDestination=file,exported);await page.getByRole('button',{name:'Export result XLSX',exact:true}).click();await expect.poll(async()=>{try{return (await fs.stat(exported)).size>0;}catch{return false;}}).toBe(true);
  const result=new Excel.Workbook();await result.xlsx.readFile(exported);assert.equal(result.worksheets.length,1);const sheet=result.worksheets[0];assert.equal(sheet.getCell('B2').value,'2');assert.equal(sheet.getCell('B3').value,'5');assert.equal(sheet.getCell('B4').value,'6');sheet.eachRow(row=>row.eachCell(cell=>assert.equal(cell.formula,undefined)));
  for(const [file,bytes]of originals)assert.deepEqual(await fs.readFile(file),bytes);assert.deepEqual(errors,[]);
  console.log('Workbook formulas desktop passed: real XLSX values/formulas toggle, same-result expression changes, stale cached results, formula/literal differences, persisted mode, native swap, literal cached-value export and untouched originals.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
