'use strict';
const {_electron:electron,expect:baseExpect}=require('@playwright/test'),expect=baseExpect.configure({timeout:30000}),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-save-guard-')));let app;
try{
 const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
 app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await app.evaluate(async({BrowserWindow,dialog},root)=>{
  BrowserWindow.getAllWindows().forEach(w=>{w.hide();w.webContents.setBackgroundThrottling(false);});
  global.guardDestination='';global.guardMode=null;global.guardHits=0;dialog.showSaveDialog=async()=>({canceled:false,filePath:global.guardDestination});
  const fs=process.getBuiltinModule('fs/promises'),path=process.getBuiltinModule('path'),open=fs.open;
  fs.open=async function(file,...args){const handle=await open.call(this,file,...args);if(typeof file==='string'&&path.dirname(file)===root&&file.endsWith('.tmp')){const sync=handle.sync.bind(handle);handle.sync=async()=>{await sync();if(global.guardMode&&global.guardMode!=='no-links'){const mode=global.guardMode;global.guardMode=null;global.guardHits++;if(mode==='sync-error')throw Error('Injected disk sync failure');if(mode==='stage-change'){await fs.writeFile(file,'foreign bytes!');return;}await fs.writeFile(global.guardDestination,'external content',{flag:mode==='create'?'wx':'w'});}};}return handle;};
  const link=fs.link;fs.link=async function(...args){if(global.guardMode==='no-links'){global.guardMode=null;throw Object.assign(Error('hard links unsupported'),{code:'ENOTSUP'});}return link.apply(this,args);};
 },root);
 await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#welcome [data-command="new:text-compare"]').click();await page.locator('#textA').fill('editor content');
 const destination=(file,mode=null)=>app.evaluate((_,v)=>{global.guardDestination=v.file;global.guardMode=v.mode;}, {file,mode});
 for(const mode of ['create','change','sync-error','stage-change']){
  const file=path.join(root,mode+'.txt');if(mode!=='create')await fs.writeFile(file,'initial content');await destination(file,mode);await page.locator('#saveA').click();
  await expect(page.locator('#notice')).toContainText(/changed|exist|sync failure|destination/i);await expect(page.locator('#saveA')).toBeEnabled();
  assert.equal(await fs.readFile(file,'utf8'),['sync-error','stage-change'].includes(mode)?'initial content':'external content');await expect(page.locator('#textA')).toHaveValue('editor content');
 }
 assert.equal(await app.evaluate(()=>global.guardHits),4);
 for(const mode of ['new','replace','no-links']){const existing=mode==='replace',file=path.join(root,mode+'.txt');if(existing){await fs.writeFile(file,'old');await fs.chmod(file,0o640);}await destination(file,mode==='no-links'?mode:null);await page.locator('#saveA').click();await expect.poll(()=>fs.readFile(file,'utf8').catch(()=>null)).toBe('editor content');await expect(page.locator('#pathA')).toHaveValue(file);if(existing&&process.platform!=='win32')assert.equal((await fs.stat(file)).mode&0o777,0o640);}
 assert.equal((await fs.readdir(root)).some(name=>name.endsWith('.tmp')),false);assert.deepEqual(errors,[]);console.log('Local text save native passed: concurrent new/existing destinations preserved, sync failure leaves target unchanged, drafts retained, exact successful saves and permissions.');
}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
