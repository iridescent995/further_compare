'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),Excel=require('exceljs');
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-table-context-')));let app,page;
 try{
  const original={left:'id,value\r\n1,left\r\n2,last',right:'id,value\r\n1,right\r\n2,last'};for(const [side,text]of Object.entries(original))await fs.writeFile(path.join(root,side+'.csv'),text);
  const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env,timeout:30000});page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({dialog},files)=>{global.tableContext={files,opened:[],output:'',saved:[]};dialog.showOpenDialog=async()=>{const file=global.tableContext.files.shift();if(!file)throw Error('Unexpected table picker');global.tableContext.opened.push(file);return {canceled:false,filePaths:[file]};};dialog.showSaveDialog=async(_window,options)=>{global.tableContext.saved.push(options.defaultPath);return {canceled:false,filePath:global.tableContext.output};};dialog.showMessageBox=async()=>({response:1});},['left','right'].map(side=>path.join(root,side+'.csv')));
  await page.locator('#welcome [data-command="new:table-compare"]').click();
  const host=page.locator('#dataWorkspace'),menu=page.locator('#tableContext');
  async function context(target=host){await page.mouse.move(0,0);await target.focus();await page.keyboard.press('Shift+F10');await expect(menu).toBeVisible();}
  async function item(name){const leaf=menu.getByRole('menuitem',{name,exact:true});if(await leaf.count())return leaf;for(const group of await menu.locator('.folder-context-panel').first().locator('button[aria-haspopup="menu"]').all()){await group.focus();await group.press('ArrowRight');if(await leaf.count())return leaf;}throw Error('Missing table context action '+name);}
  async function action(name){await (await item(name)).click();await expect(menu).toBeHidden();}
  async function close(){await page.keyboard.press('Escape');if(await menu.isVisible())await page.keyboard.press('Escape');await expect(menu).toBeHidden();}
  const cell=(row,column)=>host.getByLabel(`Result row ${row} column ${column}`,{exact:true}),csv=rows=>rows.map(row=>row.map(value=>'"'+value.replace(/"/g,'""')+'"').join(',')).join('\r\n');
  let serial=0;async function saved(rows,format='CSV'){const output=path.join(root,'result-'+serial+++'.'+format.toLowerCase());await app.evaluate(({},output)=>global.tableContext.output=output,output);await context();await action('Export result '+format);if(format==='CSV')await expect.poll(()=>fs.readFile(output,'utf8').catch(()=>null)).toBe(csv(rows));else{await expect.poll(()=>fs.stat(output).then(stat=>stat.size).catch(()=>0)).toBeGreaterThan(0);const book=new Excel.Workbook();await book.xlsx.readFile(output);assert.equal(book.worksheets.length,1);const sheet=book.worksheets[0];for(let r=0;r<rows.length;r++)for(let c=0;c<rows[r].length;c++)assert.equal(sheet.getCell(r+1,c+1).value??'',rows[r][c]);assert.equal(sheet.rowCount,rows.length);}}
  await context();for(const name of ['Export result CSV','Export result XLSX','Use left as result','Use right as result','Undo edit','Redo edit'])await expect(await item(name)).toBeDisabled();await close();
  await context();await action('Open left');await expect(host).toContainText('left.csv');await context();await action('Open right');await expect(host).toContainText('right.csv');await context();await action('Use right as result');
  const baseline=[['id','value'],['1','right'],['2','last']];await saved(baseline);const row2=host.locator('[data-result-row="2"]');await row2.locator('th').click({button:'right'});await expect(menu).toBeVisible();await close();await expect(row2).toBeFocused();
  // Editable cell keeps the operating system text context menu.
  await cell(2,2).focus();const prevented=await cell(2,2).evaluate(element=>{const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});element.dispatchEvent(event);return event.defaultPrevented;});assert.equal(prevented,false);await expect(menu).toBeHidden();
  await cell(2,2).fill('café, "quoted"');await cell(2,2).blur();const typed=[baseline[0],['1','café, "quoted"'],baseline[2]];await saved(typed);
  async function structure(name,position){const column=name.includes('column'),target=column?host.locator('[data-result-row="1"] [data-result-column="'+position+'"]'):host.locator('[data-result-row="'+position+'"]');await context(target);await action(name);}
  await structure('Insert row before',2);const inserted=[typed[0],['',''],...typed.slice(1)];await saved(inserted);
  await structure('Insert column before',2);const widened=inserted.map(row=>[row[0],'',row[1]]);await saved(widened);
  await cell(2,2).fill('new value');await cell(2,2).blur();const edited=widened.map(row=>row.slice());edited[1][1]='new value';await saved(edited,'XLSX');
  await structure('Delete row',4);const shortened=edited.slice(0,3);await saved(shortened);await structure('Delete column',3);const narrowed=shortened.map(row=>row.slice(0,2));await saved(narrowed);
  for(const rows of [shortened,edited,widened,inserted,typed]){await context();await action('Undo edit');await saved(rows);}
  for(const rows of [inserted,widened,edited,shortened,narrowed]){await context();await action('Redo edit');await saved(rows);}
  await saved(narrowed,'XLSX');await context();await expect(await item('Redo edit')).toBeDisabled();await close();
  for(const theme of ['light','dark']){await page.evaluate(theme=>document.body.dataset.theme=theme,theme);await context();await item('Insert row before');const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));for(const panel of await menu.locator('.folder-context-panel').all()){const box=await panel.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height);}await page.screenshot({path:'/private/tmp/fc-table-context-'+theme+'.png'});await close();}
  const dialogs=await app.evaluate(()=>global.tableContext);assert.deepEqual(dialogs.opened,['left','right'].map(side=>path.join(root,side+'.csv')));assert.deepEqual(dialogs.files,[]);assert.equal(dialogs.saved.length,serial);for(const [side,text]of Object.entries(original))assert.equal(await fs.readFile(path.join(root,side+'.csv'),'utf8'),text);assert.deepEqual(errors,[]);
  console.log('Table context desktop passed: native CSV inputs, native editable-cell context, row/column edits and undo/redo, exact CSV and XLSX values, keyboard menus, unchanged sources');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
