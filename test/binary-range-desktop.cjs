'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-binary-range-'));let app,page;
 try{
  const original=Buffer.from([1,2,3,4,5]);await fs.writeFile(path.join(dir,'base.bin'),original);await fs.writeFile(path.join(dir,'empty.bin'),Buffer.alloc(0));await fs.writeFile(path.join(dir,'paged.bin'),Buffer.alloc(4200,7));
  const env={...process.env,FC_USER_DATA_DIR:path.join(dir,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({dialog})=>{global.rangeFiles=[];global.rangeOutput='';dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.rangeFiles.shift()]});dialog.showSaveDialog=async()=>({canceled:false,filePath:global.rangeOutput});dialog.showMessageBox=async()=>({response:1});});
  const openRight=async name=>{await app.evaluate(({},file)=>global.rangeFiles=[file],path.join(dir,name));await page.getByRole('button',{name:'Open right',exact:true}).click();};
  const editor=page.getByRole('dialog',{name:'Edit right byte range',exact:true});
  const rangeButton=page.getByRole('button',{name:'Edit byte range…',exact:true});
  const undo=page.getByRole('button',{name:'Undo edit',exact:true}),redo=page.getByRole('button',{name:'Redo edit',exact:true});
  const start=()=>editor.getByLabel('Start offset (hex)',{exact:true}),end=()=>editor.getByLabel('End offset (hex, exclusive)',{exact:true}),replacement=()=>editor.getByLabel('Replacement bytes (hex)',{exact:true});
  const apply=()=>editor.getByRole('button',{name:'Apply range edit',exact:true}).click();
  const configure=async(operation,a,b,data)=>{await rangeButton.click();await editor.getByLabel('Operation',{exact:true}).selectOption(operation);await start().fill(a);if(operation!=='insert')await end().fill(b);if(operation!=='delete')await replacement().fill(data);};
  const edit=async(...args)=>{await configure(...args);await apply();await expect(editor).toBeHidden();};
  let saveIndex=0;
  const saved=async bytes=>{const file=path.join(dir,`range-${saveIndex++}.bin`);await app.evaluate(({},file)=>global.rangeOutput=file,file);await page.getByRole('button',{name:'Save result',exact:true}).click();await expect.poll(async()=>{try{return [...await fs.readFile(file)];}catch(error){if(error.code==='ENOENT')return null;throw error;}}).toEqual(bytes);};
  await page.locator('#welcome [data-command="new:binary-compare"]').click();await expect(rangeButton).toBeDisabled();await openRight('base.bin');
  // A physical right-byte selection seeds the dialog, including Shift extension.
  const rightByte=offset=>page.locator('.advanced-hex').nth(1).locator(`.advanced-byte[data-offset="${offset}"]`);
  await rightByte(1).click();await rightByte(3).click({modifiers:['Shift']});
  await expect(page.locator('.advanced-hex').nth(1).locator('.binary-selected')).toHaveCount(3);
  await rangeButton.click();await expect(editor.getByLabel('Operation',{exact:true})).toHaveValue('replace');
  assert.equal(parseInt(await start().inputValue(),16),1);assert.equal(parseInt(await end().inputValue(),16),4);
  await replacement().fill('aa bb');await page.screenshot({path:path.join(os.tmpdir(),'further-binary-range.png')});await editor.getByRole('button',{name:'Cancel',exact:true}).click();await expect(editor).toBeHidden();await saved([1,2,3,4,5]);
  // Validation retains the dialog and original content, without adding undo history.
  await configure('replace','1','3','f');await apply();await expect(editor).toBeVisible();await expect(editor.getByRole('alert')).not.toBeEmpty();
  await replacement().fill('');await apply();await expect(editor).toBeVisible();await expect(editor.getByRole('alert')).not.toBeEmpty();
  await replacement().fill('aa');await end().fill('ff');await apply();await expect(editor).toBeVisible();await expect(editor.getByRole('alert')).not.toBeEmpty();
  await start().fill('4');await end().fill('1');await apply();await expect(editor).toBeVisible();await expect(editor.getByRole('alert')).not.toBeEmpty();
  await editor.getByRole('button',{name:'Cancel',exact:true}).click();await saved([1,2,3,4,5]);await expect(undo).toBeDisabled();
  await edit('replace','1','4','aa bb');await saved([1,170,187,5]);
  await configure('insert','4','','cc dd');await expect(end()).toBeDisabled();await apply();await expect(editor).toBeHidden();await saved([1,170,187,5,204,221]);
  await configure('delete','1','3','');await expect(replacement()).toBeDisabled();await apply();await expect(editor).toBeHidden();await saved([1,5,204,221]);
  await undo.click();await saved([1,170,187,5,204,221]);await undo.click();await saved([1,170,187,5]);await undo.click();await saved([1,2,3,4,5]);
  await redo.click();await saved([1,170,187,5]);await redo.click();await saved([1,170,187,5,204,221]);await redo.click();await saved([1,5,204,221]);await expect(redo).toBeDisabled();
  // Byte and range edits share history. A no-op preserves a pending redo; a new edit invalidates it.
  await page.getByLabel('Byte offset (hex)',{exact:true}).fill('0');await page.getByLabel('Right byte (hex)',{exact:true}).fill('ff');await page.getByRole('button',{name:'Apply byte',exact:true}).click();await saved([255,5,204,221]);
  await undo.click();await saved([1,5,204,221]);await expect(redo).toBeEnabled();
  await edit('replace','0','1','01');await expect(redo).toBeEnabled();await redo.click();await saved([255,5,204,221]);
  await undo.click();await edit('insert','4','','ee');await saved([1,5,204,221,238]);await expect(redo).toBeDisabled();
  await openRight('empty.bin');await expect(undo).toBeDisabled();await expect(redo).toBeDisabled();await edit('insert','0','','00 ff 10');await saved([0,255,16]);await undo.click();await saved([]);await redo.click();await saved([0,255,16]);
  await page.getByRole('button',{name:'Display',exact:true}).click();await page.getByLabel('Theme',{exact:true}).selectOption('dark');await page.getByRole('button',{name:'Done',exact:true}).click();
  await openRight('paged.bin');await rightByte(4095).click();await page.getByRole('button',{name:'Next page',exact:true}).click();await rightByte(4100).click({modifiers:['Shift']});await rangeButton.click();
  await expect(start()).toHaveValue('fff');await expect(end()).toHaveValue('1005');await page.screenshot({path:path.join(os.tmpdir(),'further-binary-range-dark.png')});await editor.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual(await fs.readFile(path.join(dir,'base.bin')),original);assert.equal((await fs.stat(path.join(dir,'empty.bin'))).size,0);assert.deepEqual(errors,[]);
  console.log('Binary range desktop passed: mouse range selection, insert/delete/replace, validation and cancel, exact saved bytes, mixed undo/redo, no-op history preservation, redo invalidation, and empty-file insertion.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true);if(app)await app.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
