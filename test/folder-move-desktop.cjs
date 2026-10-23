'use strict';
// Real main/preload/renderer and temporary filesystem; only native dialogs are stubbed.
const {_electron:electron,expect}=require('@playwright/test');
const {clickFolderAction}=require('./folder-context-helper.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-folder-move-')));let app,page;
 try{
  const left=path.join(temp,'left'),right=path.join(temp,'right'),destination=path.join(temp,'chosen destination'),profile=path.join(temp,'profile');
  for(const root of [left,right,destination])await fs.mkdir(root);
  await fs.mkdir(path.join(left,'nested','empty'),{recursive:true});
  const originals={'a.txt':'left move replacement','b.txt':'left move b','nested/child.txt':'nested move child','nested/zero.txt':''};
  for(const [name,content]of Object.entries(originals))await fs.writeFile(path.join(left,name),content);
  await fs.writeFile(path.join(left,'stay.txt'),'untouched left');
  await fs.writeFile(path.join(right,'a.txt'),'right original overwritten');
  for(const [name,content]of Object.entries({'r-one.txt':'right move one','r-two.txt':'right move two','to-chosen.txt':'chosen move source'}))await fs.writeFile(path.join(right,name),content);
  await fs.writeFile(path.join(destination,'to-chosen.txt'),'chosen original overwritten');
  const env={...process.env,FC_USER_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({dialog},roots)=>{
   globalThis.moveTestChoices=[...roots];globalThis.moveTestConfirm=0;globalThis.moveTestPickerTitles=[];globalThis.moveTestConfirmations=[];
   dialog.showOpenDialog=async(...args)=>{const options=args[args.length-1];globalThis.moveTestPickerTitles.push(options.title||'');const selected=globalThis.moveTestChoices.shift();return {canceled:!selected,filePaths:selected?[selected]:[]};};
   dialog.showMessageBox=async(...args)=>{globalThis.moveTestConfirmations.push(args[args.length-1]);return {response:globalThis.moveTestConfirm};};
  },[left,right]);
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const row=(side,relative)=>page.locator('#folderRows'+side+' .folder-entry[data-path="'+relative+'"]');
  const choose=selected=>app.evaluate((_,selected)=>globalThis.moveTestChoices.push(selected),selected);
  const confirm=value=>app.evaluate((_,value)=>globalThis.moveTestConfirm=value,value);
  const context=async(side,relative,label)=>{await ready();await row(side,relative).click({button:'right'});await clickFolderAction(page,label);await ready();};
  const native=label=>app.evaluate(({Menu},label)=>{const find=menu=>{for(const item of menu.items){if(item.label.replace(/…$/,'')===label)return item;if(item.submenu){const found=find(item.submenu);if(found)return found;}}};const item=find(Menu.getApplicationMenu());if(!item)throw Error('Missing native menu '+label);item.click();},label);
  const rootsUnchanged=async()=>{await expect(page.locator('#pathA')).toHaveValue(left);await expect(page.locator('#pathB')).toHaveValue(right);};
  const absent=file=>assert.rejects(fs.access(file),{code:'ENOENT'});
  const content=(file,value)=>fs.readFile(file,'utf8').then(actual=>assert.equal(actual,value));
  const apply=async()=>{await page.locator('#applyPlan').click();await expect(page.locator('#planDialog')).toBeHidden();await ready();};
  const select=async(side,names)=>{await ready();await row(side,names[0]).click();for(const name of names.slice(1))await row(side,name).click({modifiers:[process.platform==='darwin'?'Meta':'Control']});for(const name of names)await expect(row(side,name)).toHaveAttribute('aria-selected','true');};
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  // Clicking still selects only; opening a move preview must preserve a multi-selection.
  const tabCount=await page.locator('#sessionTabs [role="tab"]').count();
  await select('A',['a.txt','b.txt','nested']);await expect(page.locator('#sessionTabs [role="tab"]')).toHaveCount(tabCount);
  await context('A','a.txt','Move left → right…');await expect(page.locator('#planDialog')).toBeVisible();
  await expect(page.locator('#planDescription')).toContainText(left);await expect(page.locator('#planDescription')).toContainText(right);await expect(page.locator('#planDescription')).toContainText(/remov/i);
  for(const name of ['a.txt','b.txt','nested/child.txt','nested/zero.txt'])await expect(page.locator('#planOperations')).toContainText(name);
  await page.locator('#cancelPlan').click();await expect(page.locator('#planDialog')).toBeHidden();
  for(const [name,value]of Object.entries(originals))await content(path.join(left,name),value);await content(path.join(right,'a.txt'),'right original overwritten');
  await context('A','a.txt','Move left → right…');await expect(page.locator('#planDialog')).toBeVisible();
  // The second native confirmation also has a no-write cancellation path.
  await page.locator('#applyPlan').click();await ready();await expect(page.locator('#planDialog')).toBeVisible();
  for(const [name,value]of Object.entries(originals))await content(path.join(left,name),value);await content(path.join(right,'a.txt'),'right original overwritten');await absent(path.join(right,'nested'));
  await page.screenshot({path:path.join(os.tmpdir(),'further-folder-move.png')});
  await confirm(1);await apply();
  for(const [name,value]of Object.entries(originals)){await absent(path.join(left,name));await content(path.join(right,name),value);}
  await absent(path.join(left,'nested'));assert.ok((await fs.stat(path.join(right,'nested','empty'))).isDirectory());await content(path.join(left,'stay.txt'),'untouched left');await rootsUnchanged();
  // Native reverse direction moves every selected file, not just the focused row.
  await select('B',['r-one.txt','r-two.txt']);await native('Move Right to Left');await expect(page.locator('#planDialog')).toBeVisible();await apply();
  for(const [name,value]of Object.entries({'r-one.txt':'right move one','r-two.txt':'right move two'})){await absent(path.join(right,name));await content(path.join(left,name),value);}
  // Exercise the other native direction with the newly moved files.
  await select('A',['r-one.txt','r-two.txt']);await native('Move Left to Right');await expect(page.locator('#planDialog')).toBeVisible();await apply();
  for(const [name,value]of Object.entries({'r-one.txt':'right move one','r-two.txt':'right move two'})){await absent(path.join(left,name));await content(path.join(right,name),value);}
  // Reverse context action is independently wired.
  await select('B',['r-one.txt','r-two.txt']);await context('B','r-one.txt','Move right → left…');await expect(page.locator('#planDialog')).toBeVisible();await apply();
  for(const name of ['r-one.txt','r-two.txt'])await absent(path.join(right,name));
  // An arbitrary destination is opt-in, can be canceled, and never replaces panel roots.
  await select('B',['to-chosen.txt']);await choose(null);await context('B','to-chosen.txt','Move to folder…');await expect(page.locator('#planDialog')).toBeHidden();await content(path.join(right,'to-chosen.txt'),'chosen move source');await rootsUnchanged();
  await choose(destination);await context('B','to-chosen.txt','Move to folder…');await expect(page.locator('#planDialog')).toBeVisible();await expect(page.locator('#planDescription')).toContainText(destination);await page.locator('#cancelPlan').click();await content(path.join(destination,'to-chosen.txt'),'chosen original overwritten');await rootsUnchanged();
  await choose(destination);await native('Move to Folder');await expect(page.locator('#planDialog')).toBeVisible();await expect(page.locator('#planDescription')).toContainText(right);await expect(page.locator('#planDescription')).toContainText(destination);await apply();
  await absent(path.join(right,'to-chosen.txt'));await content(path.join(destination,'to-chosen.txt'),'chosen move source');await rootsUnchanged();
  const pickerTitles=await app.evaluate(()=>globalThis.moveTestPickerTitles);assert.ok(pickerTitles.includes('Move to Folder'),'move uses its own destination picker title');
  // Both removed source bytes and overwritten destination bytes must be recoverable.
  const walk=async root=>{const files=[];for(const entry of await fs.readdir(root,{withFileTypes:true})){const file=path.join(root,entry.name);if(entry.isDirectory())files.push(...await walk(file));else files.push(file);}return files;};
  const candidates=(await walk(profile)).filter(file=>['a.txt','b.txt','child.txt','to-chosen.txt'].includes(path.basename(file)));
  const backupBytes=await Promise.all(candidates.map(file=>fs.readFile(file,'utf8')));
  for(const value of ['left move replacement','left move b','nested move child','right original overwritten','chosen move source','chosen original overwritten'])assert.ok(backupBytes.includes(value),'recoverable backup missing: '+value);
  assert.deepEqual(errors,[]);
  console.log('Folder move passed: single-click selection, multi-selection in both directions through context/native menus, nested and empty entries, preview/native/picker cancellation, overwritten destination and removed source backups, arbitrary destination and unchanged panel roots.');
 }catch(error){if(page&&!page.isClosed())console.error('Move notice:',await page.locator('#notice').textContent());throw error;}finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
