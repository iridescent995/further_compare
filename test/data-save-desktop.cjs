'use strict';
const {_electron:electron,expect:baseExpect}=require('@playwright/test'),expect=baseExpect.configure({timeout:30000}),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-export-guard-')));let app;
try{
 const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
 app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});const page=await app.firstWindow();
 await app.evaluate(({BrowserWindow,dialog},root)=>{
  BrowserWindow.getAllWindows().forEach(w=>{w.hide();w.webContents.setBackgroundThrottling(false);});global.exportPath='';global.exportFault=null;
  dialog.showSaveDialog=async()=>({canceled:false,filePath:global.exportPath});const fs=process.getBuiltinModule('fs/promises'),path=process.getBuiltinModule('path'),open=fs.open,link=fs.link;
  fs.open=async function(file,...args){const h=await open.call(this,file,...args);if(typeof file==='string'&&path.dirname(file)===root&&file.endsWith('.tmp')){const sync=h.sync.bind(h);h.sync=async()=>{await sync();const fault=global.exportFault;if(['change','create','stage'].includes(fault)){global.exportFault=null;await fs.writeFile(fault==='stage'?file:global.exportPath,Buffer.from([9,8,7,6]),{flag:fault==='create'?'wx':'w'});}};}return h;};
  fs.link=async function(...args){if(global.exportFault==='no-links'){global.exportFault=null;throw Object.assign(Error('Unsupported hardlinks'),{code:'ENOTSUP'});}const result=await link.apply(this,args);if(global.exportFault==='after-write'){global.exportFault=null;await fs.writeFile(args[1],Buffer.from([9,8,7,6]));}return result;};
 },root);
 await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#welcome [data-command="new:binary-compare"]').click();
 const bytes=Buffer.from([0,255,0,128]),payload=bytes.toString('base64');
 const run=async(file,fault=null,data=payload)=>{await app.evaluate((_,v)=>{global.exportPath=v.file;global.exportFault=v.fault;},{file,fault});return page.evaluate(async data=>{try{return {result:await window.desktop.saveData(data,'output.bin')};}catch(error){return {error:error.message};}},data);};
 for(const fault of ['create','change','stage']){const file=path.join(root,fault+'.bin');if(fault!=='create')await fs.writeFile(file,'original');const result=await run(file,fault);assert.match(result.error,/changed/);assert.deepEqual(await fs.readFile(file),fault==='stage'?Buffer.from('original'):Buffer.from([9,8,7,6]));}
 const changedAfter=path.join(root,'after-write.bin');assert.match((await run(changedAfter,'after-write')).error,/changed/);assert.deepEqual(await fs.readFile(changedAfter),Buffer.from([9,8,7,6]));
 const target=path.join(root,'referent.bin'),symlink=path.join(root,'symlink.bin');await fs.writeFile(target,'untouched');await fs.symlink(target,symlink);assert.match((await run(symlink)).error,/regular file/);assert.equal(await fs.readFile(target,'utf8'),'untouched');
 for(const fault of [null,'no-links']){const file=path.join(root,'success-'+String(fault)+'.bin');assert.equal((await run(file,fault)).result.cancelled,false);assert.deepEqual(await fs.readFile(file),bytes);await fs.chmod(file,0o640);assert.equal((await run(file)).result.cancelled,false);assert.equal((await fs.stat(file)).mode&0o777,0o640);}
 const large=Buffer.alloc(12*1024*1024,0xa5),largeFile=path.join(root,'large.bin');assert.equal((await run(largeFile,null,large.toString('base64'))).result.cancelled,false);assert.deepEqual(await fs.readFile(largeFile),large);
 const emptyFile=path.join(root,'empty.bin');assert.equal((await run(emptyFile,null,'')).result.cancelled,false);assert.equal((await fs.stat(emptyFile)).size,0);
 assert.equal((await fs.readdir(root)).some(x=>x.endsWith('.tmp')),false);console.log('Data export native passed: exact binary, 12 MiB and empty outputs, exclusive fallback, permissions, symlink refusal and concurrent/staged-byte guards.');
}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
