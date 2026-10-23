'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-alignment-')));let app,page;
try{
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'data')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
  page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const menu=action=>app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);
  const pairs=page.locator('#alignmentPairs .alignment-pair');
  const add=async(a,b)=>{await page.locator('#alignmentA').fill(String(a));await page.locator('#alignmentB').fill(String(b));await page.locator('#alignmentForm button').click();};
  await page.locator('#welcome [data-command="new:text-merge"]').click();await page.locator('#sessionName').fill('Anchored session');
  const a='start\nrepeat\nleft\nrepeat\nend',b='start\nright\nrepeat\nrepeat\nend';
  await page.locator('#textA').fill(a);await page.locator('#textB').fill(b);await expect(page.locator('#changeCount')).not.toHaveText('0');
  await page.locator('#textOptions').click();await page.locator('#alignLines').click();await add(2,4);await expect(pairs).toHaveCount(1);
  await add(4,2);await expect(page.locator('#alignmentError')).toContainText('without crossing');await expect(pairs).toHaveCount(1);
  await page.locator('#alignmentClose').click();await expect(page.locator('#textA ~ .live-text-gutter .alignment-anchor')).toHaveText('2');await expect(page.locator('#textB ~ .live-text-gutter .alignment-anchor')).toHaveText('4');
  // The prefix insertion is a separate global hunk; merging it cannot replace the forced repeated line.
  await page.locator('#textB ~ .live-text-gutter .live-text-number').filter({hasText:/^2$/}).click();await page.locator('#mergeToB').click();await expect(page.locator('#textB')).toHaveValue('start\nrepeat\nend');await expect(page.locator('.alignment-anchor')).toHaveCount(0);
  await menu('edit:undo');await expect(page.locator('#textB')).toHaveValue(b);await expect(page.locator('#textA ~ .live-text-gutter .alignment-anchor')).toHaveText('2');
  // Exercise the actual native menu callback and bridge allowlist.
  await app.evaluate(({Menu})=>{const view=Menu.getApplicationMenu().items.find(item=>item.label==='View');const item=view.submenu.items.find(item=>item.label==='Align Text Lines…');if(!item)throw new Error('Missing native alignment action');item.click();});
  await expect(page.locator('#alignmentDialog')).toBeVisible();await expect(pairs).toHaveCount(1);await page.locator('#alignmentClose').click();
  await page.locator('#swap').click();await expect(page.locator('#textA')).toHaveValue(b);await expect(page.locator('#textA ~ .live-text-gutter .alignment-anchor')).toHaveText('4');await expect(page.locator('#textB ~ .live-text-gutter .alignment-anchor')).toHaveText('2');
  await page.locator('#newTab').click();await page.locator('#welcome [data-command="new:text-compare"]').click();await page.locator('#textOptions').click();await page.locator('#alignLines').click();await expect(pairs).toHaveCount(0);await page.locator('#alignmentClose').click();
  await page.getByRole('tab',{name:'Anchored session',exact:false}).click();await expect(page.locator('#textA ~ .live-text-gutter .alignment-anchor')).toHaveText('4');
  const sessionPath=path.join(temp,'aligned.fcompare');await app.evaluate(({dialog},file)=>{global.alignmentFile=file;dialog.showSaveDialog=async()=>({canceled:false,filePath:global.alignmentFile});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.alignmentFile]});},sessionPath);
  await menu('save-session');await expect(page.locator('#sessionLocation')).toHaveText('aligned.fcompare');const saved=JSON.parse(await fs.readFile(sessionPath,'utf8'));assert.deepEqual(saved.options.textAlignment,[{a:3,b:1}]);
  await page.locator('#textA').fill(b+'\nedit');await page.locator('#textOptions').click();await page.locator('#alignLines').click();await expect(pairs).toHaveCount(0);await page.locator('#alignmentClose').click();
  await menu('open-session');if(await page.locator('#unsavedDialog').isVisible())await page.locator('#discardSession').click();await expect(page.locator('#textA')).toHaveValue(b);await expect(page.locator('#textA ~ .live-text-gutter .alignment-anchor')).toHaveText('4');
  // Line-number selection pre-fills both sides without changing file contents.
  await page.locator('#textA ~ .live-text-gutter .live-text-number').filter({hasText:/^1$/}).click();await page.locator('#textB ~ .live-text-gutter .live-text-number').filter({hasText:/^1$/}).click();await page.locator('#textOptions').click();await page.locator('#alignLines').click();await expect(page.locator('#alignmentA')).toHaveValue('1');await expect(page.locator('#alignmentB')).toHaveValue('1');await page.locator('#alignmentForm button').click();await expect(pairs).toHaveCount(2);await page.locator('#alignmentClear').click();await expect(pairs).toHaveCount(0);await page.locator('#alignmentClose').click();await menu('edit:undo');await expect(page.locator('#textA ~ .live-text-gutter .alignment-anchor')).toHaveCount(2);
  // Undo while the dialog remains open must refresh both rows and their removal callbacks.
  await page.locator('#textOptions').click();await page.locator('#alignLines').click();await expect(pairs).toHaveCount(2);
  await page.getByRole('button',{name:'Remove pair 1 and 1',exact:true}).click();await expect(pairs).toHaveCount(1);
  await menu('edit:undo');await expect(pairs).toHaveCount(2);
  await menu('edit:redo');await expect(pairs).toHaveCount(1);
  await menu('edit:undo');await expect(pairs).toHaveCount(2);
  // Focused numeric inputs must not undo or redo alignment history.
  await page.locator('#alignmentA').focus();await page.locator('#alignmentA').fill('3');
  await menu('edit:undo');await page.waitForTimeout(100);await expect(pairs).toHaveCount(2);
  await menu('edit:redo');await page.waitForTimeout(100);await expect(pairs).toHaveCount(2);
  await page.screenshot({path:'/private/tmp/further-alignment-dialog.png',fullPage:true});
  await page.getByRole('button',{name:'Remove pair 4 and 2',exact:true}).click();await expect(pairs).toHaveCount(1);
  await expect(pairs.locator('span')).toHaveText('1 ↔ 1');await page.locator('#alignmentClose').click();
  await expect(page.locator('#textA ~ .live-text-gutter .alignment-anchor')).toHaveText('1');await expect(page.locator('#textB ~ .live-text-gutter .alignment-anchor')).toHaveText('1');
  await page.locator('#textOptions').click();await page.locator('#textOptionsDialog').evaluate(el=>el.focus());
  await menu('edit:undo');await page.waitForTimeout(100);
  await expect(page.locator('#textA ~ .live-text-gutter .alignment-anchor')).toHaveText('1');
  await menu('edit:redo');await page.waitForTimeout(100);
  await expect(page.locator('#textA ~ .live-text-gutter .alignment-anchor')).toHaveText('1');
  await page.locator('#textOptionsDialog').evaluate(el=>el.close());
  assert.deepEqual(errors,[]);await page.screenshot({path:'/private/tmp/further-text-alignment.png',fullPage:true});console.log('Text alignment desktop passed: ordered pairs, crossing validation, forced rows, global merge and undo, native menu, swap, tabs, sessions, edit invalidation, line selection and clear undo.');
}finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
