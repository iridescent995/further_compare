'use strict';
// Real XLSX imports through the browser loader. No operating-system font/glyph
// assumptions: this verifies workbook font definitions and comparison semantics.
const {chromium,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:20000});
const {build}=require('esbuild'),Excel=require('exceljs'),Zip=require('jszip'),assert=require('node:assert/strict');
const {fixture,invalidFixtures}=require('./workbook-theme-fonts-fixtures.cjs');
(async()=>{
 const left=await fixture(false),right=await fixture(true),script=await fixture(true,{scriptOnly:true});
 const bundle=await build({entryPoints:['src/advanced.js'],bundle:true,write:false,format:'iife',globalName:'AdvancedHarness',platform:'browser'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://workbook.test/**',route=>route.fulfill({contentType:'text/html',body:'<main id="host"></main>'}));await page.goto('https://workbook.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(()=>{window.queue=[];window.editor=AdvancedHarness.createAdvanced({host:document.querySelector('#host'),desktop:{openData:async()=>queue.shift()},notify:()=>{}});});
  const open=async(side,name,bytes)=>page.evaluate(async({side,name,data})=>{queue.push({name,data,diskToken:'token-'+name});await editor.openSide(side);},{side,name,data:bytes.toString('base64')});
  await page.evaluate(()=>editor.setType('table-compare'));
  await open('a','left.xlsx',left);await open('b','right.xlsx',right);await page.getByLabel('First row is header').check();
  const host=page.locator('#host'),toggle=page.getByLabel('Compare formatting',{exact:true}),grid=host.locator('.advanced-table-scroll').first();
  const row=key=>grid.locator('tr').filter({has:page.locator('td span').filter({hasText:new RegExp('^'+key+'$')})});
  await expect(host).toContainText('7 rows · 0 changed or unmatched');await toggle.check();await expect(host).toContainText('7 rows · 2 changed or unmatched');
  for(const key of ['major','rich'])await expect(row(key)).toHaveClass('changed');
  for(const key of ['minor','equivalent','literal','rich-literal','none'])await expect(row(key)).toHaveClass('equal');
  await row('major').locator('summary').click();await expect(row('major').locator('details pre').first()).toContainText('Aptos');await expect(row('major').locator('details pre').last()).toContainText('Aptos Display');await expect(row('major').locator('details pre').first()).not.toContainText('stale-left');
  // A change in a supplemental script definition matters even with the same
  // Latin face; comparison never needs installed fonts to discover it.
  await open('b','script.xlsx',script);await expect(host).toContainText('7 rows · 2 changed or unmatched');await expect(row('major')).toHaveClass('changed');await expect(row('rich')).toHaveClass('changed');await expect(row('literal')).toHaveClass('equal');
  await row('major').locator('summary').click();await expect(row('major').locator('details pre').last()).toContainText('Meiryo');
  const saved=await page.evaluate(()=>editor.getState());await page.evaluate(state=>editor.setType('table-compare',state),saved);await expect(toggle).toBeChecked();await expect(host).toContainText('7 rows · 2 changed or unmatched');
  await page.getByRole('button',{name:'Use left as result',exact:true}).click();const pristine=await page.evaluate(()=>editor.getArchiveResult('a'));assert.deepEqual(Buffer.from(pristine.data,'base64'),left,'Unedited workbook export must preserve original bytes');
  await page.getByLabel('Result row 2 column 2',{exact:true}).fill('edited');const output=await page.evaluate(()=>editor.getArchiveResult('a'));const outputZip=await Zip.loadAsync(Buffer.from(output.data,'base64')),inputZip=await Zip.loadAsync(left);
  for(const name of ['xl/theme/theme1.xml','xl/styles.xml'])assert.equal(await outputZip.file(name).async('string'),await inputZip.file(name).async('string'),'Preserved export must retain '+name);
  const reloaded=new Excel.Workbook();await reloaded.xlsx.load(Buffer.from(output.data,'base64'));assert.equal(reloaded.worksheets[0].getCell('B2').value,'edited');
  const baseline=await page.evaluate(()=>editor.getState());assert.equal(baseline.inputs.a.diskToken,'token-left.xlsx');assert.ok(Array.isArray(baseline.options.tableResult));
  for(const [kind,bytes]of Object.entries(await invalidFixtures(left))){
   const error=await page.evaluate(async({name,data})=>{queue.push({name,data});try{await editor.openSide('a');return '';}catch(error){return error.message;}},{name:kind+'.xlsx',data:bytes.toString('base64')});
   assert.match(error,/font|theme|scheme/i,kind+' must be rejected');assert.deepEqual(await page.evaluate(()=>editor.getState()),baseline,kind+' cannot change sources, disk token, options, or result');await expect(host).toContainText('7 rows · 2 changed or unmatched');
  }
  await toggle.uncheck();await expect(host).toContainText('7 rows · 0 changed or unmatched');
  // A theme may omit the optional font scheme. Preserve unresolved references
  // and authored fallback names instead of injecting platform/default faces.
  for(const [side,original]of [['a',left],['b',right]]){
   const zip=await Zip.loadAsync(original);zip.file('xl/theme/theme1.xml',(await zip.file('xl/theme/theme1.xml').async('string')).replace(/<a:fontScheme[\s\S]*?<\/a:fontScheme>/,''));await open(side,'fallback-'+side+'.xlsx',await zip.generateAsync({type:'nodebuffer'}));
  }
  await toggle.check();await expect(host).toContainText('7 rows · 4 changed or unmatched');
  for(const key of ['major','minor','equivalent','rich'])await expect(row(key)).toHaveClass('changed');
  for(const key of ['literal','rich-literal','none'])await expect(row(key)).toHaveClass('equal');
  await row('major').locator('summary').click();await expect(row('major').locator('details pre').first()).toContainText('stale-left');await expect(row('major').locator('details pre').last()).toContainText('stale-right');assert.deepEqual(errors,[]);
  console.log('Workbook theme fonts browser passed: Latin/script definitions, equivalent major/minor collections, stale names, literal/rich text, formatting opt-out/session restoration, byte-preserving export, and atomic invalid imports.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
