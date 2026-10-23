'use strict';
const {_electron: electron, expect} = require('@playwright/test');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-binary-copy-')); let app, page;
  try {
    const fixtures = {'insert.bin': Buffer.from([1,2,99,3,4]), 'base.bin': Buffer.from([1,2,3,4]), 'replace.bin': Buffer.from([1,9,3,4]), 'empty.bin': Buffer.alloc(0), 'multi-left.bin': Buffer.from([1,2,3,4,5]), 'multi-right.bin': Buffer.from([1,9,3,8,5])};
    let seed = 987654321;
    const base = Buffer.from(Array.from({length: 4200}, () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed & 255;}));
    fixtures['page-right.bin'] = base;
    fixtures['page-left.bin'] = Buffer.concat([base.subarray(0,4095), Buffer.from([base[4095]^255,base[4095]^127,base[4095]^63]),base.subarray(4095)]);
    for (const [name,data] of Object.entries(fixtures)) await fs.writeFile(path.join(dir,name),data);
    const env={...process.env,FC_USER_DATA_DIR:path.join(dir,'profile')}; delete env.ELECTRON_RUN_AS_NODE; delete env.FC_SMOKE;
    app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
    page=await app.firstWindow(); page.setDefaultTimeout(15000);
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await app.evaluate(({dialog})=>{global.binaryFiles=[];global.binaryDestination='';dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.binaryFiles.shift()]});dialog.showSaveDialog=async()=>({canceled:false,filePath:global.binaryDestination});dialog.showMessageBox=async()=>({response:1});});
    const queue=names=>app.evaluate(({},names)=>global.binaryFiles=names,names.map(name=>path.join(dir,name)));
    const open=async(left,right)=>{await queue([left,right]);await page.getByRole('button',{name:'Open left',exact:true}).click();await page.getByRole('button',{name:'Open right',exact:true}).click();};
    const copy=page.getByRole('button',{name:'Copy difference to right',exact:true}), next=page.getByRole('button',{name:'Next difference',exact:true}),undo=page.getByRole('button',{name:'Undo edit',exact:true}),note=page.locator('.advanced-note').first();
    let saveIndex=0;
    const saved=async expected=>{const file=path.join(dir,`result-${saveIndex++}.bin`);await app.evaluate(({},file)=>global.binaryDestination=file,file);await page.getByRole('button',{name:'Save result',exact:true}).click();await expect.poll(async()=>{try{return [...await fs.readFile(file)];}catch(error){if(error.code==='ENOENT')return null;throw error;}}).toEqual([...expected]);};
    const edit=async(offset,value)=>{await page.getByLabel('Byte offset (hex)').fill(offset);await page.getByLabel('Right byte (hex)').fill(value);await page.getByRole('button',{name:'Apply byte',exact:true}).click();};
    await page.locator('#welcome [data-command="new:binary-compare"]').click();
    await expect(copy).toBeDisabled();
    await queue(['insert.bin']);await page.getByRole('button',{name:'Open left',exact:true}).click();await next.click();await expect(copy).toBeDisabled();
    await open('insert.bin','base.bin'); await expect(copy).toBeDisabled();
    await next.click();await expect(copy).toBeEnabled();await copy.click();
    await expect(note).toContainText('0 differing byte');await saved(fixtures['insert.bin']);
    // Undo records both structural edits and byte replacements in chronological order.
    await edit('0','ff');await saved([255,2,99,3,4]);
    await undo.click();await saved(fixtures['insert.bin']);
    await undo.click();await saved(fixtures['base.bin']);
    await next.click();await copy.click();await expect(note).toContainText('0 differing byte');
    // Copying an absent left range deletes the corresponding right bytes.
    await open('base.bin','insert.bin');await next.click();await copy.click();await saved(fixtures['base.bin']);await expect(note).toContainText('0 differing byte');
    await undo.click();await saved(fixtures['insert.bin']);
    await open('replace.bin','base.bin');await next.click();await copy.click();await saved(fixtures['replace.bin']);await expect(note).toContainText('0 differing byte');
    await open('empty.bin','base.bin');await next.click();await expect(copy).toBeEnabled();await copy.click();await saved([]);await expect(note).toContainText('0 differing byte');await undo.click();await saved(fixtures['base.bin']);
    // Separate ranges on the same page must remain independently editable.
    await open('multi-left.bin','multi-right.bin');await page.getByLabel('Binary comparison',{exact:true}).selectOption('offset');
    await next.click();await copy.click();await saved([1,2,3,8,5]);await expect(note).toContainText('1 differing byte');
    await next.click();await copy.click();await saved(fixtures['multi-left.bin']);await expect(note).toContainText('0 differing byte');
    await undo.click();await saved([1,2,3,8,5]);
    // Opening a different right input invalidates the previous selected range.
    await next.click();await expect(copy).toBeEnabled();await queue(['base.bin']);await page.getByRole('button',{name:'Open right',exact:true}).click();await expect(copy).toBeDisabled();
    // A selected insertion spans the 4096-byte page boundary and must copy in full.
    await open('page-left.bin','page-right.bin');await page.getByLabel('Binary comparison',{exact:true}).selectOption('aligned');await next.click();await copy.click();await saved(fixtures['page-left.bin']);await expect(note).toContainText('0 differing byte');await undo.click();await saved(fixtures['page-right.bin']);
    for(const [name,data] of Object.entries(fixtures)) assert.deepEqual(await fs.readFile(path.join(dir,name)),data,`Source fixture changed: ${name}`);
    assert.deepEqual(errors,[]);
    console.log('Binary copy desktop passed: insert/delete/replace, empty output, mixed undo, selected-range-only copy, input reset, cross-page range, Save As bytes and unchanged originals.');
  } finally {if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true);if(app)await app.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
