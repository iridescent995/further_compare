'use strict';
const {chromium,expect}=require('@playwright/test');
const Excel=require('exceljs');
const assert=require('node:assert/strict');
(async()=>{
 const book=new Excel.Workbook(),sheet=book.addWorksheet('Data');sheet.addRows([['id','value'],['a',1],['b',{formula:'1+1',result:2}]]);book.addWorksheet('Other').addRow(['hello','world']);
 const data=Buffer.from(await book.xlsx.writeBuffer()).toString('base64');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({data})=>{window.dataQueue={a:[{name:'sample.xlsx',data}],b:[{name:'right.csv',data:btoa('id,value\na,1\nb,3')}]};window.saved=null;window.desktop={platform:'darwin',onMenuAction:fn=>window.menuAction=fn,createSession:async()=>({id:crypto.randomUUID()}),activateSession:async()=>{},closeSession:async()=>{},openData:async side=>window.dataQueue[side].shift(),saveData:async(data,name)=>window.saved={data,name}};},{data});
  await page.goto(process.env.FC_TEST_URL||'http://127.0.0.1:4173/compare.html');
  await page.locator('#welcome [data-command="new:table-compare"]').click();
  await page.getByRole('button',{name:'Open left',exact:true}).click();await expect(page.locator('#dataWorkspace')).toContainText('cached results');
  await page.getByRole('button',{name:'Open right',exact:true}).click();await page.getByLabel('First row is header').check();await page.getByLabel('Key columns (1,2…)').fill('1');await page.getByLabel('Key columns (1,2…)').press('Tab');
  await expect(page.locator('#dataWorkspace')).toContainText('1 changed, unmatched or unavailable');
  await expect(page.getByLabel('Left sheet')).toHaveValue('0');await page.getByLabel('Left sheet').selectOption('1');await expect(page.locator('#dataWorkspace table')).toContainText('hello');await page.getByLabel('Left sheet').selectOption('0');
  await page.getByRole('button',{name:'Use left as result'}).click();await page.getByLabel('Result row 3 column 2').fill('edited');await page.getByRole('button',{name:'Export result CSV'}).click();
  await expect(page.locator('#notice')).toContainText('Formula results require recalculation');assert.equal(await page.evaluate(()=>window.saved),null);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Use values only',exact:true}).click();await page.getByRole('button',{name:'Export result CSV',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.saved?.name)).toBe('table-result.csv');const exported=await page.evaluate(()=>window.saved);assert.equal(exported.name,'table-result.csv');assert.match(Buffer.from(exported.data,'base64').toString(),/"b","edited"/);
  await page.evaluate(()=>{window.dataQueue.a.push({name:'many.csv',data:btoa(Array.from({length:2200},(_,i)=>String(i)).join('\n'))});window.dataQueue.b.push({name:'empty.csv',data:''});});
  await page.getByRole('button',{name:'Open left',exact:true}).click();await page.getByRole('button',{name:'Open right',exact:true}).click();await page.getByLabel('First row is header').uncheck();await page.getByLabel('Key columns (1,2…)').fill('');await page.getByLabel('Key columns (1,2…)').press('Tab');
  await page.getByLabel('Page',{exact:true}).fill('22');await page.getByLabel('Page',{exact:true}).press('Tab');await expect(page.locator('#dataWorkspace table')).toContainText('2199');
  const bad=Buffer.from(data,'base64');for(let i=0;i<bad.length-46;i++)if(bad.readUInt32LE(i)===0x02014b50){bad.writeUInt32LE(100*1024*1024,i+24);break;}
  await page.evaluate(data=>window.dataQueue.a.push({name:'oversized.xlsx',data}),bad.toString('base64'));await page.getByRole('button',{name:'Open left',exact:true}).click();await expect(page.locator('#notice')).toHaveText('ZIP entry exceeds archive size limits.');await expect(page.locator('#dataWorkspace table')).toContainText('2199');
  assert.deepEqual(errors,[]);console.log('Workbook browser passed: XLSX sheets, cached formulas, table editing/CSV export, paging beyond 2,000 rows, expansion limits.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
