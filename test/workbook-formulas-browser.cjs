'use strict';
const {chromium,expect:baseExpect}=require('@playwright/test');const expect=baseExpect.configure({timeout:15000});
const Excel=require('exceljs'),assert=require('node:assert/strict');
async function fixture(right){
 const book=new Excel.Workbook(),sheet=book.addWorksheet('Data');sheet.addRow(['id','value']);
 const entries={changed:{formula:right?'2*1':'1+1',result:2},cached:{formula:'2+2',result:right?99:4},literal:right?'=token':{formula:'"=token"',result:'=token'}};
 for(const key of right?['literal','cached','changed']:['changed','cached','literal'])sheet.addRow([{formula:'"'+key+'"',result:key},entries[key]]);
 const shared=book.addWorksheet('Shared');shared.addRow(['id','value']);shared.addRow([10,{formula:'A2*2',result:20}]);shared.addRow([11,right?{formula:'A3*2',result:22}:{sharedFormula:'B2',result:22}]);
 return Buffer.from(await book.xlsx.writeBuffer()).toString('base64');
}
(async()=>{
 const data={a:await fixture(false),b:await fixture(true)},browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(data=>{window.dataQueue={a:[{name:'left.xlsx',data:data.a}],b:[{name:'right.xlsx',data:data.b}]};window.saved=null;window.desktop={platform:'darwin',onMenuAction:fn=>window.menuAction=fn,createSession:async()=>({id:crypto.randomUUID()}),activateSession:async()=>{},closeSession:async()=>{},openData:async side=>window.dataQueue[side].shift(),saveData:async(data,name)=>window.saved={data,name}};},data);
  await page.goto(process.env.FC_TEST_URL||'http://127.0.0.1:4173/compare.html');await page.locator('#welcome [data-command="new:table-compare"]').click();
  await page.getByRole('button',{name:'Open left',exact:true}).click();await expect(page.getByLabel('Left sheet')).toHaveValue('0');await page.getByRole('button',{name:'Open right',exact:true}).click();await expect(page.getByLabel('Right sheet')).toHaveValue('0');
  await page.getByLabel('First row is header').check();await page.getByLabel('Key columns (1,2…)').fill('1');await page.getByLabel('Key columns (1,2…)').press('Tab');
  const mode=page.getByLabel('Workbook comparison',{exact:true}),grid=page.locator('#dataWorkspace .advanced-table-scroll').first();
  const row=key=>grid.locator('tr').filter({has:page.locator('td span').filter({hasText:new RegExp('^'+key+'$')})});
  await expect(mode).toHaveValue('values');await expect(page.locator('#dataWorkspace')).toContainText('3 rows · 1 changed, unmatched or unavailable');await expect(row('changed')).toHaveClass('equal');await expect(row('cached')).toHaveClass('changed');await expect(row('literal')).toHaveClass('equal');
  await mode.selectOption('formulas');await expect(page.locator('#dataWorkspace')).toContainText('3 rows · 2 changed, unmatched or unavailable');await expect(row('changed')).toHaveClass('changed');await expect(row('cached')).toHaveClass('equal');await expect(row('literal')).toHaveClass('changed');
  await expect(row('changed').locator('small.workbook-formula').filter({hasText:/^=1\+1$/})).toHaveCount(1);await expect(row('changed').locator('small.workbook-formula').filter({hasText:/^=2\*1$/})).toHaveCount(1);
  const literalCell=row('literal').locator('td').nth(3);await expect(literalCell.locator('span')).toHaveText(['=token','=token']);await expect(literalCell.locator('small')).toHaveText(['="=token"','Literal value']);
  await expect(row('cached').locator('td').nth(3).locator('span')).toHaveText(['4','99']);
  // Header removal and reordered formula-valued keys still align by cached key values.
  await expect(row('changed').locator('td').nth(0)).toHaveText('2');await expect(row('changed').locator('td').nth(1)).toHaveText('4');await expect(grid.locator('tr')).toHaveCount(4);
  await page.locator('#dataWorkspace').getByLabel('Differences only',{exact:true}).check();await expect(grid.locator('tr')).toHaveCount(3);await expect(row('cached')).toHaveCount(0);await page.locator('#dataWorkspace').getByLabel('Differences only',{exact:true}).uncheck();
  await page.screenshot({path:'/private/tmp/further-workbook-formulas-light.png'});
  await page.getByRole('button',{name:'Display',exact:true}).click();await page.getByLabel('Theme',{exact:true}).selectOption('dark');await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.screenshot({path:'/private/tmp/further-workbook-formulas-dark.png'});
  // Results remain values, even when formulas are the comparison criterion.
  await page.getByRole('button',{name:'Use left as result',exact:true}).click();await page.getByRole('button',{name:'Export result CSV',exact:true}).click();let saved=await page.evaluate(()=>window.saved);assert.equal(saved.name,'table-result.csv');assert.equal(Buffer.from(saved.data,'base64').toString(),'"id","value"\r\n"changed","2"\r\n"cached","4"\r\n"literal","=token"');
  await page.getByRole('button',{name:'Export result XLSX',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.saved?.name)).toBe('table-result.xlsx');saved=await page.evaluate(()=>window.saved);const output=new Excel.Workbook();await output.xlsx.load(Buffer.from(saved.data,'base64'));assert.equal(output.worksheets.length,1);const result=output.worksheets[0];assert.equal(result.getCell('B2').value,'2');assert.equal(result.getCell('B3').value,'4');assert.equal(result.getCell('B4').value,'=token');result.eachRow(r=>r.eachCell(c=>assert.equal(c.formula,undefined,'Value export must not introduce executable formulas')));
  await page.getByLabel('Left sheet').selectOption('1');await page.getByLabel('Right sheet').selectOption('1');await expect(page.locator('#dataWorkspace')).toContainText('2 rows · 0 changed, unmatched or unavailable');await expect(grid.locator('small.workbook-formula').filter({hasText:/^=A3\*2$/})).toHaveCount(2);
  await page.locator('#sessionName').fill('Formula review');await page.locator('#newTab').click();await page.locator('#welcome [data-command="new:table-compare"]').click();await page.evaluate(data=>{window.dataQueue.a.push({name:'new.xlsx',data});},data.a);await page.getByRole('button',{name:'Open left',exact:true}).click();await expect(mode).toHaveValue('values');
  await page.getByRole('tab',{name:/^Formula review(?: •)?$/}).click();await expect(mode).toHaveValue('formulas');await expect(page.getByLabel('Left sheet')).toHaveValue('1');await expect(page.getByLabel('Right sheet')).toHaveValue('1');await expect(page.getByLabel('First row is header')).toBeChecked();await expect(page.getByLabel('Key columns (1,2…)')).toHaveValue('1');await expect(page.locator('#dataWorkspace')).toContainText('2 rows · 0 changed, unmatched or unavailable');
  assert.deepEqual(errors,[]);console.log('Workbook formula browser passed: expressions versus cached values, literal distinction, shared-reference expansion, header/key alignment, filtering, value-only CSV/XLSX export and tab persistence.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
