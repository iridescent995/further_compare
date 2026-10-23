'use strict';
// Real main/preload/renderer and temporary filesystem; only native dialogs are stubbed.
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-copy-destination-')));let app,page;
 try{
  const left=path.join(temp,'left'),right=path.join(temp,'right'),destination=path.join(temp,'chosen destination'),profile=path.join(temp,'profile');
  for(const root of [left,right,destination])await fs.mkdir(root);
  await fs.mkdir(path.join(left,'nested'));await fs.writeFile(path.join(left,'nested','child.txt'),'nested left');
  await fs.writeFile(path.join(left,'a.txt'),'left replacement');await fs.writeFile(path.join(left,'b.txt'),'left b');
  await fs.writeFile(path.join(right,'right-only.txt'),'right source');await fs.writeFile(path.join(destination,'a.txt'),'original destination');
  const env={...process.env,FC_USER_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({dialog},roots)=>{globalThis.copyTestChoices=[...roots];globalThis.copyTestConfirm=0;dialog.showOpenDialog=async()=>{const selected=globalThis.copyTestChoices.shift();return {canceled:!selected,filePaths:selected?[selected]:[]};};dialog.showMessageBox=async()=>({response:globalThis.copyTestConfirm});},[left,right]);
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const row=(side,relative)=>page.locator('#folderRows'+side+' .folder-entry[data-path="'+relative+'"]');
  const choose=selected=>app.evaluate((_,selected)=>globalThis.copyTestChoices.push(selected),selected);
  const confirm=value=>app.evaluate((_,value)=>globalThis.copyTestConfirm=value,value);
  const context=async(side,relative)=>{await ready();await row(side,relative).click({button:'right'});await page.locator('#folderContext').getByRole('menuitem',{name:'Transfer to folder',exact:true}).click();await page.locator('#folderContext').getByRole('menuitem',{name:'Copy to folder…',exact:true}).click();await ready();};
  const original=()=>fs.readFile(path.join(destination,'a.txt'),'utf8');
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  // Canceling the native destination picker performs no writes and opens no preview.
  await choose(null);await context('A','a.txt');await expect(page.locator('#planDialog')).toBeHidden();assert.equal(await original(),'original destination');
  await choose(destination);await context('A','a.txt');await expect(page.locator('#planDialog')).toBeVisible();await expect(page.locator('#planDescription')).toContainText(destination);await page.locator('#cancelPlan').click();assert.equal(await original(),'original destination');
  // Multiple selected rows include a directory; its nested paths must be retained.
  await row('A','a.txt').click();await row('A','nested').click({modifiers:[process.platform==='darwin'?'Meta':'Control']});await choose(destination);await context('A','a.txt');await expect(page.locator('#planDialog')).toBeVisible();await expect(page.locator('#planOperations')).toContainText('nested/child.txt');await expect(page.locator('#planOperations')).toContainText('a.txt');await expect(page.locator('#planDescription')).toContainText(destination);
  await page.screenshot({path:'/private/tmp/further-copy-destination.png'});
  await page.locator('#applyPlan').click();await ready();await expect(page.locator('#planDialog')).toBeVisible();assert.equal(await original(),'original destination');await assert.rejects(fs.access(path.join(destination,'nested')),{code:'ENOENT'});
  await confirm(1);await page.locator('#applyPlan').click();await expect(page.locator('#planDialog')).toBeHidden();await ready();assert.equal(await original(),'left replacement');assert.equal(await fs.readFile(path.join(destination,'nested','child.txt'),'utf8'),'nested left');await assert.rejects(fs.access(path.join(destination,'child.txt')),{code:'ENOENT'});await assert.rejects(fs.access(path.join(destination,'b.txt')),{code:'ENOENT'});
  await expect(page.locator('#pathA')).toHaveValue(left);await expect(page.locator('#pathB')).toHaveValue(right);
  const walk=async root=>{const paths=[];for(const entry of await fs.readdir(root,{withFileTypes:true})){const file=path.join(root,entry.name);if(entry.isDirectory())paths.push(...await walk(file));else paths.push(file);}return paths;};
  const backups=(await walk(profile)).filter(file=>file.endsWith(path.join('files','a.txt')));assert.ok(backups.length,'overwrite creates recoverable backup');assert.equal(await fs.readFile(backups[0],'utf8'),'original destination');
  // Native Actions menu uses the focused right side.
  await row('B','right-only.txt').click();await choose(destination);await app.evaluate(({Menu})=>{const find=menu=>{for(const item of menu.items){if(/^Copy to Folder/i.test(item.label))return item;if(item.submenu){const found=find(item.submenu);if(found)return found;}}};const item=find(Menu.getApplicationMenu());if(!item)throw Error('Missing Copy to Folder native menu');item.click();});await expect(page.locator('#planDialog')).toBeVisible();await page.locator('#applyPlan').click();await expect(page.locator('#planDialog')).toBeHidden();await ready();assert.equal(await fs.readFile(path.join(destination,'right-only.txt'),'utf8'),'right source');
  // A child selected by itself also keeps its root-relative parent path.
  const nestedDestination=path.join(temp,'nested destination');await fs.mkdir(nestedDestination);await choose(nestedDestination);
  const childPlan=await page.evaluate(()=>window.desktop.previewCopyToFolder('a',['nested/child.txt']));await page.evaluate(id=>window.desktop.executeFolders(id),childPlan.id);
  assert.equal(await fs.readFile(path.join(nestedDestination,'nested','child.txt'),'utf8'),'nested left');await assert.rejects(fs.access(path.join(nestedDestination,'child.txt')),{code:'ENOENT'});
  // Preview snapshots are enforced even if source/destination change outside the app.
  const preview=async relative=>{await choose(destination);return page.evaluate(relative=>window.desktop.previewCopyToFolder('a',[relative]),relative);};
  const executeFailure=async id=>{const error=await page.evaluate(async id=>{try{await window.desktop.executeFolders(id);return null;}catch(error){return error.message;}},id);assert.ok(error,'stale preview must reject');};
  const sourcePlan=await preview('b.txt');await fs.writeFile(path.join(left,'b.txt'),'changed after preview');await executeFailure(sourcePlan.id);await assert.rejects(fs.access(path.join(destination,'b.txt')),{code:'ENOENT'});
  const targetPlan=await preview('a.txt');await fs.writeFile(path.join(destination,'a.txt'),'destination changed after preview');await executeFailure(targetPlan.id);assert.equal(await original(),'destination changed after preview');
  await choose(left);const overlap=await page.evaluate(async()=>{try{await window.desktop.previewCopyToFolder('a',['a.txt']);return null;}catch(error){return error.message;}});assert.ok(overlap,'overlapping destination must reject');assert.equal(await fs.readFile(path.join(left,'a.txt'),'utf8'),'left replacement');
  await expect(page.locator('#pathA')).toHaveValue(left);await expect(page.locator('#pathB')).toHaveValue(right);assert.deepEqual(errors,[]);
  console.log('Copy to folder passed: picker/preview/native cancellation, explicit destination, multi-selection, nested paths, overwrite backup, right-side native menu, unchanged roots, stale snapshots and overlap rejection.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
