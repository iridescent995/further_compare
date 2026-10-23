'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-folder-stop-queued-')));let app,page;
 try{
  const roots=['left','right'].map(name=>path.join(temp,name));
  for(const root of roots){await fs.mkdir(root);await fs.writeFile(path.join(root,'file.txt'),'identical fixture bytes\n');}
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));
  await app.evaluate(({app,dialog,ipcMain},roots)=>{
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots.shift()]});
   const require=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');
   const {FolderService}=require('./desktop/folders.cjs'),original=FolderService.prototype.openFileReader;
   global.stopProbe={events:[],release:null,armed:true,reads:0,calls:[],stops:[]};
   for(const channel of ['folders:tree-compare','folders:tree-compare-selected','folders:tree-refresh-selected']){
    const handler=ipcMain._invokeHandlers.get(channel);ipcMain.removeHandler(channel);ipcMain.handle(channel,async(...args)=>{global.stopProbe.calls.push([channel,...args.slice(1)]);return handler(...args);});
   }
   const cancel=ipcMain._invokeHandlers.get('folders:read-cancel');ipcMain.removeHandler('folders:read-cancel');ipcMain.handle('folders:read-cancel',(...args)=>{global.stopProbe.stops.push(args[1]);return cancel(...args);});
   FolderService.prototype.openFileReader=async function(...args){
    const reader=await original.apply(this,args),probe=global.stopProbe;probe.reads++;
    if(!probe.armed)return reader;probe.armed=false;
    const signal=args[2]?.signal;if(!signal)throw Error('Missing comparison cancellation signal');
    const read=reader.read.bind(reader),close=reader.close.bind(reader);let first=true;
    reader.read=async function(...values){if(first){first=false;probe.events.push('read');await new Promise((resolve,reject)=>{
     const aborted=()=>{probe.events.push('abort');reject(Object.assign(Error('Held provider read cancelled'),{code:'ABORT_ERR'}));};
     probe.release=()=>{signal.removeEventListener('abort',aborted);probe.events.push('release');resolve();};
     signal.addEventListener('abort',aborted,{once:true});if(signal.aborted)aborted();
    });}return read(...values);};
    reader.close=async()=>{await close();probe.events.push('close');};return reader;
   };
  },roots);
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  await ready();await page.locator('#welcome [data-command="new:folder-compare"]').click();await ready();
  await page.locator('#openA').click();await ready();await page.locator('#openB').click();await ready();
  const row=page.locator('#folderRowsA [data-path="file.txt"]');await expect(row).toBeVisible();
  await expect.poll(()=>app.evaluate(()=>global.stopProbe.events)).toContain('read');
  await row.click();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','folder:compare-selected'));
  // This user command is now inside the selected-comparison wait, not just an
  // IPC request that has yet to be dispatched by the renderer.
  await expect(page.locator('body')).toHaveAttribute('aria-busy','true');
  assert.equal(await app.evaluate(()=>global.stopProbe.calls.filter(([channel])=>channel==='folders:tree-compare-selected').length),0);
  await expect(page.locator('#folderStop')).toBeEnabled();await page.locator('#folderStop').click();
  await ready();
  assert.equal(await app.evaluate(()=>global.stopProbe.calls.filter(([channel])=>channel==='folders:tree-compare-selected').length),0);

  await expect.poll(()=>app.evaluate(()=>global.stopProbe.events)).toEqual(['read','abort','close']);
  await expect(page.locator('#folderStop')).toBeDisabled();await expect(row).toBeVisible();
  const stopped=await app.evaluate(()=>({reads:global.stopProbe.reads,calls:global.stopProbe.calls.length}));
  // Observe beyond the comparison debounce: Stop must not schedule another reader.
  await page.waitForTimeout(350);
  assert.deepEqual(await app.evaluate(()=>({reads:global.stopProbe.reads,calls:global.stopProbe.calls.length})),stopped);
  await app.evaluate(()=>global.stopProbe.release());
  for(const root of roots)assert.equal(await fs.readFile(path.join(root,'file.txt'),'utf8'),'identical fixture bytes\n');
  console.log('Queued selected comparison Stop passed: pending command never reaches native comparison after Stop; held background reader aborts and closes, visible rows survive, and no debounce restart occurs.');
 }finally{
  if(app)await app.evaluate(()=>global.stopProbe?.release?.()).catch(()=>{});
  if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
