'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const Excel=require('exceljs');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'further-workbook-'));let app,page;
 try{
  for(const [side,value]of [['left',2],['right',3]]){
   await fs.mkdir(path.join(dir,side));const workbook=new Excel.Workbook();workbook.addWorksheet('Records').addRows([['id','value'],['a',{formula:'1+1',result:value}]]);workbook.addWorksheet('Notes').addRow(['shared']);await workbook.xlsx.writeFile(path.join(dir,side,'book.xlsx'));
  }
  const env={...process.env,FC_USER_DATA_DIR:path.join(dir,'profile')};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({args:[process.cwd()],env});page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({dialog})=>{global.fileQueue=[];global.destination='';dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.fileQueue.shift()]});dialog.showSaveDialog=async()=>({canceled:false,filePath:global.destination});});
  const queue=names=>app.evaluate(({},files)=>global.fileQueue=files,names.map(n=>path.join(dir,n)));
  await page.locator('#welcome [data-command="new:table-compare"]').click();await queue(['left/book.xlsx','right/book.xlsx']);
  await page.getByRole('button',{name:'Open left',exact:true}).click();await expect(page.getByLabel('Left sheet')).toBeVisible();await page.getByRole('button',{name:'Open right',exact:true}).click();await expect(page.getByLabel('Right sheet')).toBeVisible();
  await page.getByLabel('First row is header').check();await page.getByLabel('Key columns (1,2…)').fill('1');await page.getByLabel('Key columns (1,2…)').press('Tab');await expect(page.locator('#dataWorkspace')).toContainText('1 changed or unmatched');await expect(page.locator('#dataWorkspace')).toContainText('cached results');
  await page.getByLabel('Left sheet').selectOption('1');await page.getByLabel('Right sheet').selectOption('1');await expect(page.locator('#dataWorkspace')).toContainText('0 changed or unmatched');await page.getByLabel('Left sheet').selectOption('0');await page.getByLabel('Right sheet').selectOption('0');
  await page.getByRole('button',{name:'Use left as result'}).click();await page.getByLabel('Result row 2 column 2').fill('resolved');await app.evaluate(({},file)=>global.destination=file,path.join(dir,'result.csv'));await page.getByRole('button',{name:'Export result CSV'}).click();await expect.poll(()=>fs.readFile(path.join(dir,'result.csv'),'utf8')).toContain('"a","resolved"');
  await page.getByLabel('Result row number',{exact:true}).fill('2');await page.getByRole('button',{name:'Insert row before',exact:true}).click();await page.getByLabel('Result row 2 column 1').fill('inserted');await page.getByLabel('Result row 2 column 2').fill('=literal text');
  await page.getByLabel('Result column number',{exact:true}).fill('2');await page.getByRole('button',{name:'Insert column before',exact:true}).click();await page.getByLabel('Result row 2 column 2').fill('new column');await page.getByRole('button',{name:'Delete column',exact:true}).click();
  await app.evaluate(({},file)=>global.destination=file,path.join(dir,'result.xlsx'));await page.getByRole('button',{name:'Export result XLSX',exact:true}).click();await expect.poll(async()=>{try{return (await fs.stat(path.join(dir,'result.xlsx'))).size>0;}catch{return false;}}).toBe(true);
  const roundtrip=new Excel.Workbook();await roundtrip.xlsx.readFile(path.join(dir,'result.xlsx'));assert.equal(roundtrip.worksheets.length,1);assert.equal(roundtrip.worksheets[0].getCell('A2').value,'inserted');assert.equal(roundtrip.worksheets[0].getCell('B2').value,'=literal text');assert.equal(roundtrip.worksheets[0].getCell('B3').value,'resolved');
  await page.getByRole('button',{name:'Delete row',exact:true}).click();await expect(page.getByLabel('Result row 2 column 2')).toHaveValue('resolved');
  await queue(['result.xlsx']);await page.getByRole('button',{name:'Open left',exact:true}).click();await expect(page.getByLabel('Left sheet')).toHaveValue('0');await expect(page.locator('#dataWorkspace table').first()).toContainText('=literal text');
  await page.locator('#newTab').click();await page.locator('#welcome [data-command="new:folder-compare"]').click();await queue(['left','right']);await page.locator('#openA').click();await page.locator('#openB').click();const row=page.locator('#folderRowsA [data-path="book.xlsx"]');await row.click();await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');await row.dblclick();await expect(page.locator('#sessionKind')).toHaveText('Table Compare');await expect(page.getByLabel('Left sheet')).toBeVisible();await expect(page.getByLabel('Right sheet')).toBeVisible();await expect(page.locator('#dataWorkspace')).toContainText('1 changed or unmatched');assert.deepEqual(errors,[]);
  console.log('Workbook desktop passed: real XLSX/native file IPC, sheet selectors, cached values, editable CSV/XLSX roundtrip, structural edits and folder double-click routing.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true);if(app)await app.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
