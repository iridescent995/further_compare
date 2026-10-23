'use strict';
const {selectFolderOption,clickFolderOption}=require('./folder-options-helper.cjs');
const {clickFolderAction}=require('./folder-context-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-folder-case-rules-')));let app,page;
 try{
  const left=path.join(temp,'left'),right=path.join(temp,'right'),originals=new Map();
  for(const root of [left,right]){
   await fs.mkdir(path.join(root,'nested','unopened'),{recursive:true});const a=root===left;
   const fixtures={'identical.txt':'identical\n','case.txt':a?'Hello WORLD\n':'hello world\n','spaces.txt':a?'a b\tc\n':'abc\n','both.txt':a?'Hello World\n':'helloworld\n','changed.txt':a?'VALUE=1\n':'value=2\n','binary.bin':Buffer.from(a?[0,65]:[0,97]),'nested/case.txt':a?'NESTED\n':'nested\n','nested/unopened/deep.txt':a?'DEEP\n':'deep\n'};
   for(const [name,data] of Object.entries(fixtures)){const file=path.join(root,name);await fs.writeFile(file,data);originals.set(file,await fs.readFile(file));}
  }
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({dialog},roots)=>{globalThis.caseRuleChoices=[...roots];dialog.showOpenDialog=async()=>({canceled:false,filePaths:[globalThis.caseRuleChoices.shift()]});dialog.showMessageBox=async()=>({response:1});},[left,right]);
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const row=name=>page.locator('#folderRowsA .folder-entry[data-path="'+name+'"]');
  const status=(name,value)=>expect(row(name)).toHaveClass(new RegExp('\\b'+value+'\\b'));
  const mode=page.locator('#folderCompareMode');
  const command=async action=>{await ready();await app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',action),action);};
  const contextRule=async label=>{await ready();await row('case.txt').click({button:'right'});await page.locator('#folderContext').getByRole('menuitem',{name:'Compare',exact:true}).click();await page.locator('#folderContext').getByRole('menuitem',{name:label,exact:true}).click();};
  const nativeRule=async label=>{await ready();await app.evaluate(({Menu},label)=>{const find=menu=>{for(const item of menu.items){if(item.label===label)return item;if(item.submenu){const found=find(item.submenu);if(found)return found;}}};const item=find(Menu.getApplicationMenu());if(!item)throw Error('Missing native rule: '+label);item.click();},label);};
  const checkMode=async combined=>{
   await expect(mode).toHaveValue(combined?'text-whitespace-case':'text-case');await status('case.txt','equal');await status('spaces.txt',combined?'equal':'changed');await status('both.txt',combined?'equal':'changed');await status('changed.txt','changed');await status('binary.bin','changed');await status('identical.txt','equal');
   await expect(row('case.txt')).toHaveAttribute('data-comparison','text-normalized');await expect(row('case.txt')).toHaveClass(/text-normalized-match/);await expect(row('case.txt')).toHaveAttribute('title',/case.*does not mean identical bytes/i);
   await expect(row('identical.txt')).toHaveAttribute('data-comparison','content');await expect(row('binary.bin')).toHaveAttribute('data-comparison','content');await expect(page.locator('.folder-legend .equal')).toHaveText('Byte match');await expect(page.locator('.text-normalized-legend')).toBeVisible();await expect(page.locator('#folderRulesHint')).toContainText(/case/i);await ready();
  };
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();await page.locator('#sessionName').fill('Case folder rules');await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  await expect(mode).toHaveValue('content');await status('case.txt','changed');await status('both.txt','changed');await expect(row('nested/case.txt')).toHaveCount(0);
  await selectFolderOption(page,'folderCompareMode','text-case');await checkMode(false);await expect(row('nested/case.txt')).toHaveCount(0);
  await row('nested').locator('.tree-toggle').click();await status('nested/case.txt','equal');await expect(row('nested/unopened/deep.txt')).toHaveCount(0);
  await selectFolderOption(page,'folderCompareMode','text-whitespace-case');await checkMode(true);
  // JSON and visible report labels distinguish rule-based text matches from exact bytes.
  await page.evaluate(()=>{window.__caseReports=[];const blobs=new Map(),create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{const url=create(blob);blobs.set(url,blob);return url;};const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download&&blobs.has(this.href)){window.__caseReports.push(blobs.get(this.href).text());return;}return click.call(this);};});
  for(const combined of [false,true]){
   await selectFolderOption(page,'folderCompareMode',combined?'text-whitespace-case':'text-case');await checkMode(combined);
   if(await row('nested/case.txt').count()===0){await row('nested').locator('.tree-toggle').click();await status('nested/case.txt','equal');}
   await clickFolderOption(page,'folderReport');await expect(page.locator('#folderReportDialog')).toBeVisible();await page.locator('#folderReportScope').selectOption('loaded');await expect(page.locator('#folderReportSummary')).toContainText(/case/i);await page.locator('#folderReportFormat').selectOption('json');await page.locator('#folderReportExport').click();
   const report=JSON.parse(await page.evaluate(()=>window.__caseReports.at(-1)));assert.equal(report.rules.mode,combined?'text-whitespace-case':'text-case');assert.equal(report.statistics.normalizedTextMatches,combined?4:2);assert.equal(report.statistics.contentMatches,1);assert.ok(!report.entries.some(entry=>entry.pathA==='nested/unopened/deep.txt'||entry.pathB==='nested/unopened/deep.txt'));assert.equal(report.entries.find(entry=>entry.pathA==='binary.bin'&&entry.pathB==='binary.bin').comparison,'content');await page.locator('#folderReportClose').click();
  }
  await contextRule('Compare text ignoring case');await checkMode(false);await contextRule('Compare text ignoring case and whitespace');await checkMode(true);
  await nativeRule('Text — Ignore Case');await checkMode(false);await nativeRule('Text — Ignore Case and Whitespace');await checkMode(true);
  // Save both modes and reopen after changing rules, proving persistence rather than live state alone.
  const sessionFiles=[];
  for(const combined of [false,true]){
   await selectFolderOption(page,'folderCompareMode',combined?'text-whitespace-case':'text-case');await checkMode(combined);const file=path.join(temp,combined?'combined.fcompare':'case.fcompare');sessionFiles.push(file);
   await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await command('save-session-as');await expect(page.locator('#dirtyIndicator')).toBeHidden();assert.equal(JSON.parse(await fs.readFile(file,'utf8')).options.folderRules.mode,combined?'text-whitespace-case':'text-case');
  }
  await selectFolderOption(page,'folderCompareMode','content');await status('case.txt','changed');
  for(let index=0;index<sessionFiles.length;index++){await app.evaluate((_,file)=>globalThis.caseRuleChoices.push(file),sessionFiles[index]);await command('open-session');await checkMode(index===1);}
  for(const [file,bytes] of originals)assert.deepEqual(await fs.readFile(file),bytes,'Comparison changed '+file);
  // Normalized equality must never suppress an explicitly selected raw-byte copy.
  await row('both.txt').click({button:'right'});await clickFolderAction(page,'Copy to right');await expect(page.locator('#planDialog')).toBeVisible();await expect(page.locator('#planOperations')).toContainText('copy  both.txt');await page.locator('#applyPlan').click();await expect(page.locator('#planDialog')).toBeHidden();await ready();assert.deepEqual(await fs.readFile(path.join(right,'both.txt')),originals.get(path.join(left,'both.txt')));await expect(row('both.txt')).toHaveAttribute('data-comparison','content');await expect(row('both.txt')).not.toHaveClass(/text-normalized-match/);
  for(const [file,bytes] of originals)if(file!==path.join(right,'both.txt'))assert.deepEqual(await fs.readFile(file),bytes);
  assert.deepEqual(errors,[]);console.log('Folder case rules passed: case and combined semantics, binary fallback, provenance, lazy children, reports, dropdown/context/native commands, saved sessions, unchanged originals and exact copy.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
