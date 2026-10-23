'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const {clickFolderAction}=require('./folder-context-helper.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-context-menu-')));let app,page;
 try{
  const left=path.join(temp,'left'),right=path.join(temp,'right');
  for(const root of [left,right]){await fs.mkdir(path.join(root,'nested'),{recursive:true});await fs.writeFile(path.join(root,'nested','child.txt'),'child');for(const name of ['a.txt','b.txt'])await fs.writeFile(path.join(root,name),name);}
  await fs.writeFile(path.join(right,'right-only.txt'),'right only');
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({dialog,clipboard},roots)=>{let i=0;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots[i++]]});global.menuWrites=[];clipboard.writeText=value=>global.menuWrites.push(value);},[left,right]);
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const row=name=>page.locator('#folderRowsA .folder-entry[data-path="'+name+'"]');
  const root=page.locator('#folderContext');
  const item=label=>root.getByRole('menuitem',{name:label,exact:true});
  const open=async(name='a.txt')=>{await ready();await row(name).click({button:'right'});await expect(root).toBeVisible();};
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  const inventory={
   Synchronize:['Update left…','Update right…','Update both sides…','Mirror to left…','Mirror to right…'],'File-action scope':['Use current filters','Include all contents'],'Transfer to folder':['Copy to folder…','Move to folder…'],
   'Session & tools':['New Window','Open workspace…','Save workspace as…','Clear session…','Lock saved session','Import / export settings…','Session defaults…','Keyboard shortcuts…','Apply patch to folder…','Open session…','Save session','Save session as…','Close session','Close other sessions','Batch comparisons…','File manager integration…','External editor settings…'],
   'Open as':['text','binary','table','picture','audio','archive','registry'].map(mode=>'Open as '+mode+' comparison'),
   New:['New folder…','New file…'],Properties:['View properties…','Change attributes…','Change modified time…','Reveal in file manager','Copy paths','Copy relative paths','Copy filenames'],
   Tree:['Expand all','Stop expanding','Collapse all'],
   Selection:['Select all','Select files','Select files on both sides','Select newer on both sides','Select one-sided on both sides','Select matching files','Invert selection','Select changed','Select left only','Select right only','Select newer left','Select newer right','Clear selection'],
   View:['Filters & options…','Automatic refresh…','Show folder tree','Show loaded files','Show all files recursively','Match filenames across folders','Always show folders','Show hidden entries','Reset column widths','Hide color legend','Show all','Show differences','Show differences with parents','Show identical','Edit filename filters…','Exclude file types…','Reset masks','Display preferences…'],
   Sort:['Sort by name','Sort by path','Sort by left size','Sort by right size','Sort by left last modified','Sort by right last modified','Reverse sort'],
   Compare:['Filename matching…','Metadata options…','Timestamp options…','Ignore selected differences','Restore selected differences','Restore all ignored differences','Quick comparison…','Refresh selected','Compare selected pair','Align selected pair','Clear alignment','Compare by content','Compare text preserving case and spaces','Compare text ignoring whitespace','Compare text ignoring case','Compare text ignoring case and whitespace','Compare by size','Compare by modified time','Compare by size and modified time','Text encoding…','Timestamp tolerance…','Compare / Refresh','Swap left and right'],
   Navigate:['Back to parent comparison','Compare parent folders','Go to both parent folders','Find filename…','Next filename match','Previous filename match','Choose left folder…','Choose right folder…','Recent left folders','Recent right folders','Previous difference','Next difference','Back to previous folder','Forward to next folder','Go to parent folder'],
   Reports:['File action history…','Comparison report…','Selected entries report…','Text file report…','Save left folder snapshot…','Save right folder snapshot…','Compare snapshots…']
  };
  await open();
  for(const label of ['Open comparison','Compare selected files','Move left → right…','Copy to right','Transfer to folder','Open in external editor…','Delete selected','Rename file…'])await expect(item(label)).toBeVisible();
  assert.ok(await root.getByRole('menuitem').count()<=22,'Top level should stay compact');
  for(const [group,labels]of Object.entries(inventory)){
   await item(group).click();for(const label of labels)await expect(item(label)).toBeVisible();
   await page.keyboard.press('Escape');await expect(root).toBeVisible();await expect(item(group)).toBeFocused();
  }
  await page.keyboard.press('Escape');await expect(root).toBeHidden();await expect(row('a.txt')).toBeFocused();
  // The overview opens through both menus and returns focus without changing selection.
  for(const native of [false,true]){
   await open();
   if(native){await page.keyboard.press('Escape');await app.evaluate(({Menu,BrowserWindow})=>{const find=menu=>{for(const item of menu.items){if(item.label==='Folder Filters & Options…')return item;if(item.submenu){const found=find(item.submenu);if(found)return found;}}};const item=find(Menu.getApplicationMenu());if(!item)throw Error('Missing folder options menu');item.click(item,BrowserWindow.getAllWindows()[0],{});});}
   else await clickFolderAction(page,'Filters & options…');
   await expect(page.locator('#folderOptionsDialog')).toBeVisible();await expect(row('a.txt')).toHaveClass(/selected/);await page.keyboard.press('Escape');await expect(page.locator('#folderOptionsDialog')).toBeHidden();await expect(row('a.txt')).toBeFocused();
  }
  // New Window is reachable from the same right-click workflow without replacing the parent.
  const parentTabs=await page.getByRole('tab').count();
  await open();const newWindow=app.waitForEvent('window');await clickFolderAction(page,'New Window');
  const child=await newWindow;await expect(child.locator('#welcome')).toBeVisible();await expect(child.getByRole('tab')).toHaveCount(0);
  await expect(row('a.txt')).toHaveClass(/selected/);await expect(page.getByRole('tab')).toHaveCount(parentTabs);
  await child.evaluate(()=>window.__fcAllowClose=true);await child.close();await expect.poll(()=>app.windows().length).toBe(1);
  // Context tools reach the real dialogs without changing settings or folder selection.
  for(const [label,id,close]of [['Batch comparisons…','batchDialog','[data-close]'],['File manager integration…','shellSetupDialog','#shellSetupClose'],['External editor settings…','editorSettingsDialog','#editorSettingsClose']]){
   await open();await clickFolderAction(page,label);await expect(page.locator('#'+id)).toBeVisible();await page.locator('#'+id+' '+close).click();await ready();await expect(row('a.txt')).toHaveClass(/selected/);
  }
  // Session commands use their normal dispatcher, without nesting an operation lock.
  const saved=path.join(temp,'context-session.fcsession');
  await app.evaluate(({dialog},saved)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:saved});dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});},saved);
  await open();await clickFolderAction(page,'Save session as…');await ready();await expect.poll(()=>fs.readFile(saved,'utf8').catch(()=>'' )).not.toBe('');
  const tabCount=await page.getByRole('tab').count();await open();await clickFolderAction(page,'Open session…');await ready();await expect(page.getByRole('tab')).toHaveCount(tabCount);await expect(row('a.txt')).toBeVisible();
  await open('nested');await item('Tree').click();for(const label of ['Expand folder','Expand subtree','Collapse subtree'])await expect(item(label)).toBeVisible();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await open('nested');await expect(item('Rename folder…')).toBeVisible();await clickFolderAction(page,'Expand folder');await expect(row('nested/child.txt')).toBeVisible();await open('nested');await item('Tree').click();await expect(item('Collapse folder')).toBeVisible();await item('Collapse folder').click();await expect(row('nested/child.txt')).toHaveCount(0);
  await page.locator('#folderRowsB .folder-entry[data-path="a.txt"]').click({button:'right'});await expect(item('Copy to left')).toBeVisible();await page.keyboard.press('Escape');
  // Typing locates enabled actions without executing them; repeated initials cycle.
  await open();await page.keyboard.type('p');await expect(item('Properties')).toBeFocused();await page.keyboard.press('ArrowRight');
  for(const label of ['Change attributes…','Change modified time…','Copy paths','Copy relative paths','Copy filenames','Change attributes…']){await page.keyboard.type('c');await expect(item(label)).toBeFocused();}
  await page.keyboard.press('Home');await page.keyboard.type('copy paths');await expect(item('Copy paths')).toBeFocused();assert.deepEqual(await app.evaluate(()=>global.menuWrites),[]);
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');await expect(row('a.txt')).toBeFocused();
  await open();await item('Compare').click();await page.keyboard.type('compare by');await expect(item('Compare by size')).toBeFocused();await expect(item('Compare by content')).toBeDisabled();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  // Real keyboard traversal stays in the child until Left/Escape returns to its owner.
  await open();await item('Open as').focus();await page.keyboard.press('ArrowRight');await expect(item('Open as text comparison')).toBeFocused();await page.keyboard.press('End');await expect(item('Open as registry comparison')).toBeFocused();await page.keyboard.press('Home');await expect(item('Open as text comparison')).toBeFocused();await page.keyboard.press('ArrowLeft');await expect(item('Open as')).toBeFocused();await expect(root.getByRole('menuitem',{name:'Open as text comparison',exact:true})).toBeHidden();
  await item('Compare').focus();await page.keyboard.press('ArrowRight');await expect(item('Ignore selected differences')).toBeFocused();await page.keyboard.press('ArrowDown');await expect(item('Quick comparison…')).toBeFocused();await page.keyboard.press('ArrowDown');await expect(item('Refresh selected')).toBeFocused();await page.keyboard.press('ArrowDown');await expect(item('Filename matching…')).toBeFocused();await page.keyboard.press('ArrowDown');await expect(item('Compare text preserving case and spaces')).toBeFocused();await page.keyboard.press('Home');await expect(item('Ignore selected differences')).toBeFocused();await page.keyboard.press('End');await expect(item('Swap left and right')).toBeFocused();await page.keyboard.press('Escape');await expect(item('Compare')).toBeFocused();await page.keyboard.press('Escape');await expect(row('a.txt')).toBeFocused();
  await open('nested');await item('Open as').click();for(const label of inventory['Open as'])await expect(item(label)).toBeDisabled();await page.keyboard.press('Escape');await expect(root).toBeVisible();await expect(item('Open as')).toBeFocused();await page.keyboard.press('Escape');await expect(row('nested')).toBeFocused();
  await open();await item('Open as').hover();await expect(item('Open as text comparison')).toBeVisible();await page.keyboard.press('ArrowDown');await expect(item('Open in external editor…')).toBeFocused();await expect(root.getByRole('menuitem',{name:'Open as text comparison',exact:true})).toBeHidden();await page.keyboard.press('Escape');
  // Mouse hover changes the active child, then an outside click dismisses all menus.
  await open();await item('Open as').hover();await expect(item('Open as text comparison')).toBeVisible();await item('Selection').hover();await expect(item('Select all')).toBeVisible();await expect(root.getByRole('menuitem',{name:'Open as text comparison',exact:true})).toBeHidden();await page.locator('#sessionKind').click();await expect(root).toBeHidden();
  await open();await page.keyboard.press('Tab');await expect(root).toBeHidden();
  // Actions preserve multi-selection and act on that selection, not an unrelated row.
  await row('a.txt').click();await row('b.txt').click({modifiers:[process.platform==='darwin'?'Meta':'Control']});await open();await clickFolderAction(page,'Copy paths');await expect.poll(()=>app.evaluate(()=>global.menuWrites)).toEqual([[path.join(left,'a.txt'),path.join(left,'b.txt')].join('\n')]);await expect(row('a.txt')).toHaveClass(/selected/);await expect(row('b.txt')).toHaveClass(/selected/);await expect(row('a.txt')).toBeFocused();
  await open();await clickFolderAction(page,'Copy filenames');await expect.poll(()=>app.evaluate(()=>global.menuWrites.at(-1))).toBe('a.txt\nb.txt');
  await app.evaluate(({Menu})=>{const find=m=>{for(const item of m.items){if(item.label==='Copy Relative Paths')return item;if(item.submenu){const match=find(item.submenu);if(match)return match;}}};find(Menu.getApplicationMenu()).click();});await expect.poll(()=>app.evaluate(()=>global.menuWrites.length)).toBe(3);await expect.poll(()=>app.evaluate(()=>global.menuWrites.at(-1))).toBe('a.txt\nb.txt');await expect(row('a.txt')).toBeFocused();
  await open();await clickFolderAction(page,'Clear selection');await expect(page.locator('#folderRowsA .selected')).toHaveCount(0);await expect(row('a.txt')).toBeFocused();await page.keyboard.press('ArrowDown');await expect(row('b.txt')).toBeFocused();await expect(row('b.txt')).toHaveClass(/selected/);
  // An already-open menu cannot use its old captured selection after a native command.
  await open();const writesBefore=await app.evaluate(()=>global.menuWrites.length);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','folder:select-all'));
  await expect(row('a.txt')).toHaveClass(/selected/);await expect(row('b.txt')).toHaveClass(/selected/);
  await clickFolderAction(page,'Copy paths');await expect(root).toBeHidden();await expect(page.locator('#notice')).toContainText('Open the menu again');
  assert.equal(await app.evaluate(()=>global.menuWrites.length),writesBefore);
  await open();await clickFolderAction(page,'Copy paths');await expect.poll(()=>app.evaluate(()=>global.menuWrites.length)).toBe(writesBefore+1);
  const copied=await app.evaluate(()=>global.menuWrites.at(-1));assert.ok(copied.includes(path.join(left,'a.txt')));assert.ok(copied.includes(path.join(left,'b.txt')));
  await open();await clickFolderAction(page,'Clear selection');
  // Selection criteria that switch sides must move keyboard focus to a real selected row.
  await open();await clickFolderAction(page,'Select right only');
  const rightOnly=page.locator('#folderRowsB .folder-entry[data-path="right-only.txt"]');
  await expect(rightOnly).toHaveClass(/selected/);await expect(rightOnly).toBeFocused();
  await page.keyboard.press('ArrowUp');await expect(page.locator('#folderRowsB .folder-entry[data-path="b.txt"]')).toBeFocused();
  await expect(page.locator('#folderRowsB .folder-entry[data-path="b.txt"]')).toHaveClass(/selected/);await expect(page.locator('#folderRowsA .selected')).toHaveCount(0);
  await page.locator('#folderSelectRule').selectOption('right-only');await expect(rightOnly).toBeFocused();
  await page.keyboard.press('Shift+ArrowUp');await expect(rightOnly).toHaveClass(/selected/);await expect(page.locator('#folderRowsB .selected')).toHaveCount(2);
  // No matching entries: keep focus on a real row in the requested side, with no manufactured selection.
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','folder:select-left-only'));
  await expect(row('b.txt')).toBeFocused();await expect(page.locator('#folderRowsA .selected')).toHaveCount(0);await expect(page.locator('#folderRowsB .selected')).toHaveCount(0);
  await open();await clickFolderAction(page,'Clear selection');
  // Alignment gaps are empty panel space, not real files on this side.
  const gapId=await page.locator('#folderRowsB .folder-entry[data-path="right-only.txt"]').getAttribute('data-id');const gap=page.locator('#folderRowsA .folder-entry[data-id="'+gapId+'"]');await expect(gap).toHaveClass(/missing/);
  await gap.click({button:'right'});await expect(root).toBeVisible();
  await expect(item('Open comparison')).toBeDisabled();await expect(item('Delete selected')).toBeDisabled();await expect(item('Rename folder…')).toBeDisabled();
  await item('New').click();await expect(item('New file…')).toBeEnabled();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await expect(page.locator('#folderRowsA')).toBeFocused();await expect(page.locator('#folderRowsA .selected')).toHaveCount(0);
  await page.keyboard.press('Shift+F10');await expect(root).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#folderRowsA')).toBeFocused();
  // A gap must not manufacture a selection or discard actual selected files.
  await row('a.txt').click();await gap.click({button:'right'});await clickFolderAction(page,'Copy paths');
  await expect.poll(()=>app.evaluate(()=>global.menuWrites.at(-1))).toBe(path.join(left,'a.txt'));await expect(row('a.txt')).toHaveClass(/selected/);
  // Toolbar-only controls are also usable from grouped context menus.
  await open();await clickFolderAction(page,'Next difference');await expect(page.locator('#changePosition')).toHaveText('1 / 1');
  await expect(row('a.txt')).toHaveClass(/selected/);
  await open();await clickFolderAction(page,'Previous difference');await expect(page.locator('#changePosition')).toHaveText('1 / 1');
  await open();await clickFolderAction(page,'Display preferences…');await expect(page.getByRole('dialog',{name:'Display preferences'})).toBeVisible();await page.getByRole('button',{name:'Done',exact:true}).click();await expect(row('a.txt')).toBeFocused();
  await expect(row('a.txt')).toHaveClass(/selected/);
  await open();await clickFolderAction(page,'Show identical');await expect(row('a.txt')).toBeVisible();
  await open();await item('Navigate').click();await expect(item('Previous difference')).toBeDisabled();await expect(item('Next difference')).toBeDisabled();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await open();await clickFolderAction(page,'Show differences with parents');await expect(row('a.txt')).toHaveCount(0);
  await page.locator('#folderRowsB .folder-entry[data-path="right-only.txt"]').click({button:'right'});await clickFolderAction(page,'Show all');await expect(row('a.txt')).toBeVisible();
  // Filter editing shares the toolbar state; Cancel/Escape do not apply drafts.
  const filterDialog=page.getByRole('dialog',{name:'Folder filename filters',exact:true});
  await open();await clickFolderAction(page,'Edit filename filters…');await expect(filterDialog).toBeVisible();
  await filterDialog.getByLabel('Include patterns').fill('*.json');await page.keyboard.press('Escape');await expect(page.locator('#folderInclude')).toHaveValue('*');await expect(row('a.txt')).toBeFocused();
  await open();await clickFolderAction(page,'Edit filename filters…');await filterDialog.getByLabel('Include patterns').fill('*.txt');await filterDialog.getByLabel('Exclude patterns').fill('a.txt');await filterDialog.getByLabel('Path contains').fill('b.txt');await filterDialog.getByRole('button',{name:'Apply filters',exact:true}).click();await ready();
  await expect(row('a.txt')).toHaveCount(0);await expect(row('b.txt')).toBeVisible();await expect(page.locator('#folderInclude')).toHaveValue('*.txt');await expect(page.locator('#folderExclude')).toHaveValue('a.txt');await expect(page.locator('#folderSearch')).toHaveValue('b.txt');await expect(row('b.txt')).toBeFocused();
  await open('b.txt');await clickFolderAction(page,'Edit filename filters…');await expect(filterDialog.getByLabel('Path contains')).toHaveValue('b.txt');await filterDialog.getByRole('button',{name:'Reset fields',exact:true}).click();await filterDialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('#folderExclude')).toHaveValue('a.txt');await expect(row('b.txt')).toBeFocused();
  await open('b.txt');await clickFolderAction(page,'Edit filename filters…');await filterDialog.getByRole('button',{name:'Reset fields',exact:true}).click();await filterDialog.getByRole('button',{name:'Apply filters',exact:true}).click();await ready();await expect(row('a.txt')).toBeVisible();await expect(page.locator('#folderSearch')).toHaveValue('');
  await app.evaluate(({Menu})=>{const find=menu=>{for(const item of menu.items){if(item.label==='Folder Filename Filters…')return item;if(item.submenu){const found=find(item.submenu);if(found)return found;}}};const item=find(Menu.getApplicationMenu());if(!item)throw Error('Missing filters menu');item.click();});await expect(filterDialog).toBeVisible();await page.keyboard.press('Escape');await ready();
  for(const theme of ['light','dark']){
   await page.getByRole('button',{name:'Display',exact:true}).click();await page.getByLabel('Theme',{exact:true}).selectOption(theme);await page.getByRole('button',{name:'Done',exact:true}).click();
   await page.setViewportSize({width:1000,height:700});
   await open();await clickFolderAction(page,'Edit filename filters…');await page.screenshot({path:path.join(os.tmpdir(),'further-filters-'+theme+'.png')});await page.keyboard.press('Escape');await ready();
   // Dispatch a contextmenu with edge coordinates while retaining a real row target.
   await row('a.txt').evaluate(el=>el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:995,clientY:695})));await expect(root).toBeVisible();await item('Selection').click();
   const boxes=await root.evaluate(el=>[...el.querySelectorAll('[role="menu"]')].filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom};}));
   assert.ok(boxes.length>=2);assert.ok(boxes[0].x>700&&boxes[0].y>100,'Root must be placed at the requested bottom-right edge');for(const b of boxes){assert.ok(b.x>=0&&b.y>=0&&b.right<=1000.5&&b.bottom<=700.5,JSON.stringify(b));}
   await page.screenshot({path:path.join(os.tmpdir(),'further-context-'+theme+'.png')});await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  }
  // Root pickers are accessible from either pane's context menu. Cancellation
  // preserves both roots; changing one root leaves the opposite pane unchanged.
  await app.evaluate(({dialog})=>{global.rootPickerCalls=0;dialog.showOpenDialog=async()=>{global.rootPickerCalls++;return {canceled:true,filePaths:[]};};});
  for(const label of ['Choose left folder…','Choose right folder…']){await open();await clickFolderAction(page,label);await ready();await expect(page.locator('#pathA')).toHaveValue(left);await expect(page.locator('#pathB')).toHaveValue(right);}
  assert.equal(await app.evaluate(()=>global.rootPickerCalls),2);
  const replacement=path.join(temp,'replacement');await fs.mkdir(replacement);await fs.writeFile(path.join(replacement,'new.txt'),'new');
  await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},replacement);
  await open();await clickFolderAction(page,'Choose right folder…');await ready();await expect(page.locator('#pathA')).toHaveValue(left);await expect(page.locator('#pathB')).toHaveValue(replacement);await expect(page.locator('#folderRowsB .folder-entry[data-path="new.txt"]')).toBeVisible();
  // A menu opened on the right can choose the left root, including from empty space.
  await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},right);
  await page.locator('#folderRowsB').evaluate(el=>el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:750,clientY:450})));
  await clickFolderAction(page,'Choose left folder…');await ready();await expect(page.locator('#pathA')).toHaveValue(right);await expect(page.locator('#pathB')).toHaveValue(replacement);await expect(row('right-only.txt')).toBeVisible();
  assert.deepEqual(errors,[]);console.log('Grouped context menus passed: expanded action inventory, compact root, keyboard navigation and disabled skips, focus restoration, hover switching, dismissal, multi-selection, selection-rule side focus/Shift anchors/empty matches, root picker cancellation/side routing, and light/dark edge placement.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
