'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const {clickFolderAction,folderContextItem}=require('./folder-context-helper.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-selected-refresh-')));let app,page;
 try{
  const roots=['left','right'].map(name=>path.join(temp,name));
  for(const root of roots){
   for(const dir of ['branch/nested','other','closed/deep','deleted-folder/deep','replaced-folder/deep','converted-folder/deep','conflict-folder/deep'])await fs.mkdir(path.join(root,dir),{recursive:true});
   for(const file of ['branch/file.txt','branch/nested/child.txt','other/untouched.txt','closed/deep/hidden.txt','root.txt','sibling.txt','removed.txt','replaced.txt','type.txt','deleted-folder/deep/old.txt','replaced-folder/deep/old.txt','converted-folder/deep/old.txt','conflict-folder/deep/old.txt'])await fs.writeFile(path.join(root,file),'same');
  }
  await fs.writeFile(path.join(roots[0],'counterpart.txt'),'same');
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(20000);
  console.log('Selected refresh: desktop window connected');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));
  await app.evaluate(({dialog,ipcMain},roots)=>{
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});global.refreshCalls=[];
   for(const channel of ['folders:tree-list','folders:tree-compare','folders:tree-compare-selected','folders:tree-refresh-selected']){
    const original=ipcMain._invokeHandlers.get(channel);ipcMain.removeHandler(channel);
    ipcMain.handle(channel,async(...args)=>{global.refreshCalls.push([channel,args[1]]);return original(...args);});
   }
  },[...roots]);
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const row=name=>page.locator('#folderRowsA [data-path="'+name+'"]');
  const settled=()=>expect(page.locator('#folderSummary')).not.toContainText('Comparing');
  const reset=()=>app.evaluate(()=>{global.refreshCalls=[];});
  const calls=()=>app.evaluate(()=>global.refreshCalls);
  const modifier=process.platform==='darwin'?'Meta':'Control';
  async function nativeRefresh(){await app.evaluate(({Menu})=>{
   const find=menu=>{for(const item of menu.items){if(item.label==='Refresh Selected')return item;if(item.submenu){const found=find(item.submenu);if(found)return found;}}};
   const item=find(Menu.getApplicationMenu());if(!item)throw Error('Missing Refresh Selected menu');item.click();
  });}
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();
  await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();await expect(row('root.txt')).toHaveClass(/equal/);await settled();
  await row('other').getByRole('button').click();await ready();await expect(row('other/untouched.txt')).toHaveClass(/equal/);await settled();
  const tabs=await page.getByRole('tab').count(),branchId=await row('branch').getAttribute('data-id'),rootId=await row('root.txt').getAttribute('data-id');
  console.log('Selected refresh: fixtures loaded');
  // Refreshing a mixed selection reads only the selected directory and exact file pair.
  await fs.writeFile(path.join(roots[1],'branch/file.txt'),'different branch');
  await fs.writeFile(path.join(roots[1],'root.txt'),'different root');
  await fs.writeFile(path.join(roots[1],'sibling.txt'),'unselected sibling change');
  await fs.writeFile(path.join(roots[1],'other/untouched.txt'),'unselected expanded change');
  await row('branch').click();await row('root.txt').click({modifiers:[modifier]});await row('root.txt').click({button:'right'});await reset();await clickFolderAction(page,'Refresh selected');await ready();
  await expect(row('root.txt')).toHaveClass(/changed/);await expect(row('branch/file.txt')).toHaveClass(/changed/);
  await expect(row('branch/nested')).toHaveAttribute('aria-expanded','false');await expect(row('branch/nested/child.txt')).toHaveCount(0);
  await expect(row('sibling.txt')).toHaveClass(/equal/);await expect(row('other/untouched.txt')).toHaveClass(/equal/);
  await expect(row('closed')).toHaveAttribute('aria-expanded','false');await expect(row('closed/deep')).toHaveCount(0);
  await expect(row('branch')).toHaveAttribute('aria-selected','true');await expect(row('root.txt')).toHaveAttribute('aria-selected','true');await expect(row('root.txt')).toBeFocused();
  assert.equal(await page.getByRole('tab').count(),tabs);
  assert.deepEqual(await calls(),[['folders:tree-refresh-selected',[branchId]],['folders:tree-compare',branchId],['folders:tree-refresh-selected',[rootId]]]);
  // Native command uses the same exact-file route and keeps unrelated expanded nodes stale.
  await row('sibling.txt').click();const siblingId=await row('sibling.txt').getAttribute('data-id');await reset();await nativeRefresh();await expect(row('sibling.txt')).toHaveClass(/changed/);await ready();
  assert.deepEqual(await calls(),[['folders:tree-refresh-selected',[siblingId]]]);await expect(row('sibling.txt')).toBeFocused();await expect(row('other/untouched.txt')).toHaveClass(/equal/);
  // Standalone refresh re-stats selected paths, including removed entries and new counterparts.
  async function refreshFile(name,change){
   await row(name).click();const id=await row(name).getAttribute('data-id');await change();await reset();await nativeRefresh();await ready();
   assert.deepEqual(await calls(),[['folders:tree-refresh-selected',[id]]]);
   await expect(row('other/untouched.txt')).toHaveClass(/equal/);
   await expect(row('closed')).toHaveAttribute('aria-expanded','false');
   assert.equal(await page.getByRole('tab').count(),tabs);
  }
  await refreshFile('removed.txt',async()=>{for(const root of roots)await fs.rm(path.join(root,'removed.txt'));});
  await expect(row('removed.txt')).toHaveCount(0);await expect(page.locator('#folderRowsB [data-path="removed.txt"]')).toHaveCount(0);
  await refreshFile('replaced.txt',async()=>{await fs.rm(path.join(roots[1],'replaced.txt'));await fs.writeFile(path.join(roots[1],'replaced.txt'),'replacement content');});
  await expect(row('replaced.txt')).toHaveClass(/changed/);await expect(row('replaced.txt')).toHaveAttribute('aria-selected','true');await expect(row('replaced.txt')).toBeFocused();
  await expect(row('counterpart.txt')).toHaveClass(/left/);
  await refreshFile('counterpart.txt',()=>fs.writeFile(path.join(roots[1],'counterpart.txt'),'same'));
  await expect(row('counterpart.txt')).toHaveClass(/equal/);await expect(row('counterpart.txt')).toHaveAttribute('aria-selected','true');
  await refreshFile('type.txt',async()=>{await fs.rm(path.join(roots[1],'type.txt'));await fs.mkdir(path.join(roots[1],'type.txt'));await fs.writeFile(path.join(roots[1],'type.txt','hidden.txt'),'not scanned');});
  await expect(row('type.txt')).toHaveClass(/conflict/);await expect(row('type.txt')).toHaveAttribute('aria-selected','true');await expect(row('type.txt/hidden.txt')).toHaveCount(0);
  const labelColor=entry=>entry.locator('.entry-label').evaluate(el=>getComputedStyle(el).color);
  assert.equal(await labelColor(row('type.txt')),await labelColor(row('replaced.txt')),'Type conflict uses the difference color');
  assert.notEqual(await labelColor(row('type.txt')),await labelColor(row('counterpart.txt')),'Conflict color differs from matching files');
  // A previously conflicting entry can recover through the same native command.
  await refreshFile('type.txt',async()=>{await fs.rm(path.join(roots[1],'type.txt'),{recursive:true});await fs.writeFile(path.join(roots[1],'type.txt'),'same');});
  await expect(row('type.txt')).toHaveClass(/equal/);await expect(row('type.txt')).not.toHaveClass(/conflict/);
  console.log('Selected refresh: file recovery passed');
  // Refresh directory identity before reading its contents: deleted/replaced trees must drop loaded descendants.
  async function refreshFolder(name,change,{compare=false,context=false}={}){
   await row(name).getByRole('button').click();await ready();await expect(row(name+'/deep/old.txt')).toHaveClass(/equal/);await settled();
   const siblingClass=await row('other/untouched.txt').getAttribute('class');
   await row(name).click();const id=await row(name).getAttribute('data-id');await change();await reset();
   if(context){await row(name).click({button:'right'});await clickFolderAction(page,'Refresh selected');}else await nativeRefresh();
   await ready();
   assert.deepEqual(await calls(),[['folders:tree-refresh-selected',[id]],...(compare?[['folders:tree-compare',id]]:[])]);
   await expect(row(name+'/deep')).toHaveCount(0);await expect(row(name+'/deep/old.txt')).toHaveCount(0);
   await expect(row('other/untouched.txt')).toHaveAttribute('class',siblingClass);await expect(row('closed')).toHaveAttribute('aria-expanded','false');
   assert.equal(await page.getByRole('tab').count(),tabs);
  }
  await refreshFolder('deleted-folder',async()=>{for(const root of roots)await fs.rm(path.join(root,'deleted-folder'),{recursive:true});},{context:true});
  await expect(row('deleted-folder')).toHaveCount(0);await expect(page.locator('#folderRowsB [data-path="deleted-folder"]')).toHaveCount(0);
  await refreshFolder('replaced-folder',async()=>{for(const root of roots){await fs.rm(path.join(root,'replaced-folder'),{recursive:true});await fs.mkdir(path.join(root,'replaced-folder'));await fs.writeFile(path.join(root,'replaced-folder/new.txt'),root===roots[0]?'left replacement':'right replacement');}},{compare:true});
  await expect(row('replaced-folder/new.txt')).toHaveClass(/changed/);await expect(row('replaced-folder')).toHaveAttribute('aria-selected','true');await expect(row('replaced-folder')).toBeFocused();
  await refreshFolder('converted-folder',async()=>{for(const root of roots){await fs.rm(path.join(root,'converted-folder'),{recursive:true});await fs.writeFile(path.join(root,'converted-folder'),'now a file');}},{context:true});
  await expect(row('converted-folder')).toHaveClass(/equal/);await expect(row('converted-folder')).toHaveAttribute('aria-selected','true');await expect(row('converted-folder')).toBeFocused();
  await refreshFolder('conflict-folder',async()=>{await fs.rm(path.join(roots[1],'conflict-folder'),{recursive:true});await fs.writeFile(path.join(roots[1],'conflict-folder'),'now conflicting');});
  await expect(row('conflict-folder')).toHaveClass(/conflict/);await expect(row('conflict-folder')).toHaveAttribute('aria-selected','true');
  const conflictId=await row('conflict-folder').getAttribute('data-id'),conflictSiblingClass=await row('other/untouched.txt').getAttribute('class');
  await fs.rm(path.join(roots[1],'conflict-folder'));await fs.mkdir(path.join(roots[1],'conflict-folder'));
  for(const root of roots)await fs.writeFile(path.join(root,'conflict-folder/recovered.txt'),'recovered');
  await reset();await row('conflict-folder').click({button:'right'});await clickFolderAction(page,'Refresh selected');await ready();
  assert.deepEqual(await calls(),[['folders:tree-refresh-selected',[conflictId]],['folders:tree-compare',conflictId]]);
  await expect(row('conflict-folder')).not.toHaveClass(/conflict/);await expect(row('conflict-folder/recovered.txt')).toHaveClass(/equal/);
  await expect(row('conflict-folder/deep')).toHaveClass(/left/);await expect(row('conflict-folder/deep/old.txt')).toHaveCount(0);
  await expect(row('conflict-folder')).toBeFocused();await expect(row('other/untouched.txt')).toHaveAttribute('class',conflictSiblingClass);
  console.log('Selected refresh: folder recovery passed');
  // Parent-first refresh must not attempt stale selected descendants or reread direct files.
  await row('branch/nested').getByRole('button').click();await ready();await expect(row('branch/nested/child.txt')).toHaveClass(/equal/);await settled();
  await row('branch/nested').click();await row('branch/file.txt').click({modifiers:[modifier]});await row('branch').click({modifiers:[modifier]});
  for(const root of roots){await fs.rm(path.join(root,'branch/nested'),{recursive:true});await fs.writeFile(path.join(root,'branch/added.txt'),'new');}
  await fs.writeFile(path.join(roots[1],'branch/file.txt'),'same');
  const currentBranchId=await row('branch').getAttribute('data-id');await reset();await nativeRefresh();await expect(row('branch/added.txt')).toHaveClass(/equal/);await ready();
  await expect(row('branch/file.txt')).toHaveClass(/equal/);await expect(row('branch/nested')).toHaveCount(0);await expect(row('branch/nested/child.txt')).toHaveCount(0);
  assert.deepEqual(await calls(),[['folders:tree-refresh-selected',[currentBranchId]],['folders:tree-compare',currentBranchId]]);
  await expect(row('branch')).toHaveAttribute('aria-selected','true');await expect(row('branch/file.txt')).toHaveAttribute('aria-selected','true');await expect(row('branch')).toBeFocused();
  assert.equal(await page.getByRole('tab').count(),tabs);
  // Empty selection is disabled in the context menu and cannot issue native reads.
  await row('branch').click({button:'right'});await clickFolderAction(page,'Clear selection');await ready();
  await page.locator('#folderRowsA').dispatchEvent('contextmenu',{button:2,bubbles:true,clientX:100,clientY:200});await expect(await folderContextItem(page,'Refresh selected')).toBeDisabled();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await reset();await nativeRefresh();await expect(page.locator('#notice')).toContainText('Select files or folders');await ready();assert.deepEqual(await calls(),[]);assert.deepEqual(errors,[]);
  console.log('Selected refresh passed: mixed folders/files, exact node reads, native/context routes, standalone deletion/replacement/new counterpart/type conflict, folder deletion/replacement/conversion and conflict recovery, parent-first deletion and overlap, retained selection/focus, untouched closed/expanded siblings and no extra tabs.');
 }catch(error){if(page&&!page.isClosed())console.error('Selected refresh diagnostics:',await page.locator('#notice').textContent(),await app.evaluate(()=>global.refreshCalls));throw error;}
 finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
