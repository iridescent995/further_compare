'use strict';
const {selectFolderOption,clickFolderOption}=require('./folder-options-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-matching-'));let app,page;try{
 const left=path.join(root,'left'),right=path.join(root,'right');for(const [side,dir]of [['a',left],['b',right]]){await fs.mkdir(dir);await fs.writeFile(path.join(dir,'same.txt'),'same');await fs.writeFile(path.join(dir,'different.txt'),side==='a'?'one':'two');await fs.mkdir(path.join(dir,'unopened'));await fs.writeFile(path.join(dir,'unopened','hidden.txt'),'same');}
 await fs.writeFile(path.join(left,'only.txt'),'only');const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(15000);
 await app.evaluate(({dialog},roots)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});},[left,right]);
 await page.locator('#welcome [data-command="new:folder-compare"]').click();await page.locator('#openA').click();await page.locator('#openB').click();
 const row=(side,name)=>page.locator('#folderRows'+side+' [data-path="'+name+'"]'),selected=side=>page.locator('#folderRows'+side+' .selected').evaluateAll(rows=>rows.map(r=>r.dataset.path));
 await expect(row('A','same.txt')).toHaveClass(/equal/);await expect(row('A','different.txt')).toHaveClass(/changed|different/);
 await row('A','different.txt').click();await page.locator('#folderSelectRule').selectOption('matching');assert.deepEqual(await selected('A'),['same.txt']);assert.deepEqual(await selected('B'),[]);
 await row('B','different.txt').click({button:'right'});await page.getByRole('menuitem',{name:'Selection',exact:true}).hover();await page.getByRole('menuitem',{name:'Select matching files',exact:true}).click();assert.deepEqual(await selected('B'),['same.txt']);assert.deepEqual(await selected('A'),[]);
 await selectFolderOption(page,'folderCompareMode','size');await expect(row('B','different.txt')).toHaveClass(/metadata-match/);
 await app.evaluate(({Menu})=>{const actions=Menu.getApplicationMenu().items.find(item=>item.label==='Actions');const select=actions.submenu.items.find(item=>item.label==='Select by');select.submenu.items.find(item=>item.label==='Matching Files (Current Rules)').click();});
 await expect.poll(()=>selected('B')).toEqual(['different.txt','same.txt']);
 await page.locator('#folderExclude').fill('same.txt');await expect(row('B','same.txt')).toHaveCount(0);await page.locator('#folderSelectRule').selectOption('matching');assert.deepEqual(await selected('B'),['different.txt']);
 assert.equal(await page.locator('[data-path="unopened/hidden.txt"]').count(),0);await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');assert.equal(await page.getByRole('tab').count(),1);
 console.log('Matching selection passed: toolbar, right-click, native menu, both sides, active rules, masks, unopened nodes and no child tabs.');
 }finally{if(page)await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
