'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {zip}=require('./archive-fixture.cjs'),{parseArchive}=require('../src/archive-core.cjs');
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-table-history-tabs-')));let app,page;
 try{
  const fixtures={'left.csv':'id,value\r\n1,left\r\n2,last','right.csv':'id,value\r\n1,right\r\n2,last','other.csv':'key,value\r\nx,other','replacement.csv':'key,value\r\nr,replaced','other.bin':Buffer.from([1,2,3])};
  for(const [name,data] of Object.entries(fixtures))await fs.writeFile(path.join(root,name),data);
  const archiveBytes=zip([{name:'entry.csv',data:Buffer.from(fixtures['right.csv']),deflate:true}]);
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
  const newSession=async type=>{const previous=await active();await command('new:'+type);await expect.poll(active).not.toBe(previous);await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await expect(page.locator('#sessionKind')).toHaveText(({'binary-compare':'Binary Compare','table-compare':'Table Compare','archive-compare':'Archive Compare','text-compare':'Text Compare'})[type]);return active();};
  const open=async(side,name)=>{await queue(name);await button('Open '+side).click();};
  const cell=(row,column)=>page.getByLabel(`Result row ${row} column ${column}`,{exact:true});
  const grid=()=>page.locator('input[aria-label^="Result row "]');
  const left=[['id','value'],['1','left'],['2','last']],right=[['id','value'],['1','right'],['2','last']];
  const csv=rows=>rows.map(row=>row.map(value=>'"'+value.replace(/"/g,'""')+'"').join(',')).join('\r\n');
  let serial=0;
  const saved=async rows=>{const file=path.join(root,'result-'+serial+++'.csv');await destination(file);await button('Export result CSV').click();await expect.poll(()=>fs.readFile(file,'utf8').catch(()=>null)).toBe(csv(rows));};
  const edit=async(row,column,value)=>{await cell(row,column).fill(value);await cell(row,column).blur();};
  const structural=async(name,position)=>{await page.getByLabel(name.includes('column')?'Result column number':'Result row number',{exact:true}).fill(String(position));await button(name).click();};
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#welcome [data-command="new:table-compare"]').click();
  await open('left','left.csv');await open('right','right.csv');const first=await active();
  await expect(button('Undo edit')).toBeDisabled();await button('Use left as result').click();await saved(left);
  await undo();await expect(grid()).toHaveCount(0);await expect(button('Undo edit')).toBeDisabled();await redo();await saved(left);
  await button('Use right as result').click();await saved(right);await undo();await saved(left);await redo();await saved(right);
  // Successive input events within one focus gesture form a single comparison edit.
  await cell(2,2).focus();await cell(2,2).fill('');await cell(2,2).pressSequentially('typed, café "quoted"');await cell(2,2).blur();
  const typed=right.map(row=>row.slice());typed[1][1]='typed, café "quoted"';await saved(typed);await undo();await saved(right);await redo();await saved(typed);
  await structural('Insert row before',2);const inserted=[typed[0],['',''],...typed.slice(1)];await saved(inserted);
  await structural('Insert column before',2);const widened=inserted.map(row=>[row[0],'',row[1]]);await saved(widened);
  await edit(2,2,'new value');const edited=widened.map(row=>row.slice());edited[1][1]='new value';
  await saved(edited);if(process.env.FC_TABLE_HISTORY_SCREENSHOT)await page.screenshot({path:process.env.FC_TABLE_HISTORY_SCREENSHOT});await structural('Delete row',4);const shortened=edited.slice(0,3);await saved(shortened);
  await structural('Delete column',3);const narrowed=shortened.map(row=>row.slice(0,2));await saved(narrowed);
  await undo();await saved(shortened);await undo();await saved(edited);await undo();await saved(widened);await undo();await saved(inserted);await undo();await saved(typed);
  await redo();await saved(inserted);await expect(button('Redo edit')).toBeEnabled();
  const second=await newSession('table-compare');await open('right','other.csv');await button('Use right as result').click();await edit(2,2,'second');await undo();await saved([['key','value'],['x','other']]);
  const binary=await newSession('binary-compare');await open('right','other.bin');await page.getByLabel('Byte offset (hex)',{exact:true}).fill('0');await page.getByLabel('Right byte (hex)',{exact:true}).fill('aa');await button('Apply byte').click();await undo();
  const text=await newSession('text-compare');await undo();await redo();assert.equal(await active(),text);
  await switchTo(first);await saved(inserted);await redo();await saved(widened);
  await switchTo(second);await redo();await saved([['key','value'],['x','second']]);await undo();await saved([['key','value'],['x','other']]);
  // Choosing an identical side is a no-op and preserves the existing redo branch.
  await button('Use right as result').click();await expect(button('Redo edit')).toBeEnabled();await redo();await saved([['key','value'],['x','second']]);
  await switchTo(binary);await expect(button('Redo edit')).toBeEnabled();await redo();await expect(button('Redo edit')).toBeDisabled();
  await switchTo(first);await redo();await saved(edited);await undo();await edit(2,2,'branch');const branched=widened.map(row=>row.slice());branched[1][1]='branch';await saved(branched);await expect(button('Redo edit')).toBeDisabled();
  const session=path.join(root,'table.fcompare');await destination(session);await command('save-session');await expect(page.locator('#dirtyIndicator')).toBeHidden();
  const persisted=JSON.parse(await fs.readFile(session,'utf8'));assert.deepEqual(persisted.advanced.options.tableResult,branched);assert.equal(/tableRuntime|tableHistory|"undo"|"redo"/.test(JSON.stringify(persisted)),false);
  const old=await active();await queue('table.fcompare');await command('open-session');await expect.poll(active).not.toBe(old);await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await expect(button('Undo edit')).toBeDisabled();await expect(button('Redo edit')).toBeDisabled();await saved(branched);
  await edit(2,2,'changed');await open('right','replacement.csv');await expect(button('Undo edit')).toBeDisabled();await expect(button('Redo edit')).toBeDisabled();
  // Applying an archive child keeps its own history; parent undo is independent.
  const parent=await newSession('archive-compare'),host=page.locator('#archiveWorkspace');await queue('archive.zip');await host.getByRole('button',{name:'Open right archive',exact:true}).click();await expect(host).toHaveAttribute('aria-busy','false');
  await page.evaluate(()=>{window.archiveBeforeClick={row:document.querySelector('.archive-row[data-path]')?.getBoundingClientRect().toJSON(),busy:document.body.getAttribute('aria-busy')};window.archiveClickTrace=[];for(const type of ['click','dblclick'])document.addEventListener(type,event=>window.archiveClickTrace.push({type,target:event.target.outerHTML.slice(0,200),busy:document.body.getAttribute('aria-busy'),row:document.querySelector('.archive-row[data-path]')?.getBoundingClientRect().toJSON()}),true);});await host.locator('.archive-row[data-path="entry.csv"]').dblclick();await expect(page.locator('#sessionKind')).toHaveText('Table Compare');const child=await active();await button('Use right as result').click();await edit(2,2,'archived');
  const review=page.locator('#archiveEntryEditDialog');const apply=async()=>{await page.locator('#applyTableArchiveEntryB').click();await expect(review).toBeVisible();await expect(review.locator('[data-apply]')).toBeEnabled();await review.locator('[data-apply]').click();await expect(review).not.toBeVisible();};
  const archiveCheck=async(rows,original=false)=>{const file=path.join(root,'archive-'+serial+++'.zip');await destination(file);await host.locator('summary').filter({hasText:'Save archive…'}).click();await host.getByRole('button',{name:'Save right archive…',exact:true}).click();const dialog=page.locator('#archiveEditDialog');await expect(dialog.locator('[data-apply]')).toBeEnabled();await dialog.locator('[data-apply]').click();await expect(dialog).not.toBeVisible();await expect.poll(()=>fs.stat(file).then(s=>s.size).catch(()=>0)).toBeGreaterThan(0);const archive=parseArchive(await fs.readFile(file));assert.equal(Buffer.from(await archive.read('entry.csv')).toString('utf8'),original?fixtures['right.csv']:csv(rows));};
  const archived=right.map(row=>row.slice());archived[1][1]='archived';await apply();await switchTo(parent);await archiveCheck(archived);await switchTo(child);await undo();await saved(right);
  await switchTo(parent);await archiveCheck(archived);await undo();await archiveCheck(right,true);await redo();await archiveCheck(archived);
  await switchTo(child);await expect(button('Redo edit')).toBeEnabled();await redo();await saved(archived);await undo();await apply();await switchTo(parent);await archiveCheck(right);await undo();await archiveCheck(archived);
  for(const [name,data]of Object.entries(fixtures))assert.deepEqual(await fs.readFile(path.join(root,name)),Buffer.from(data));assert.deepEqual(await fs.readFile(path.join(root,'archive.zip')),archiveBytes);assert.deepEqual(errors,[]);
  console.log('Table runtime history passed: native undo/redo, choose-side/null result, grouped typing, row/column edits and exact CSV, independent table/binary/text tabs, no-op/branch handling, session/input reset, archive child local edits and independent parent history.');
 }catch(error){if(page&&!page.isClosed())console.error('Archive diagnostics',await page.evaluate(()=>({before:window.archiveBeforeClick,events:window.archiveClickTrace,busy:document.body.getAttribute('aria-busy'),notice:document.body.innerText.slice(-600)})));if(page&&!page.isClosed())await page.screenshot({path:path.join(os.tmpdir(),'table-history-failure.png')}).catch(()=>{});throw error;}finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
