'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-folder-cancel-')));let app,page;
 try{
  const roots=['left','right','replacement'].map(name=>path.join(temp,name));
  for(const root of roots){await fs.mkdir(root);await fs.writeFile(path.join(root,'file.txt'),'identical fixture bytes\n');}
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  await app.evaluate(({app})=>{
   const require=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');
   const {FolderService}=require('./desktop/folders.cjs'),original=FolderService.prototype.openFileReader;
   global.cancelProbe={events:[],release:null,armed:false};
   FolderService.prototype.openFileReader=async function(...args){
    const reader=await original.apply(this,args),probe=global.cancelProbe;
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
  });
  const setup=()=>page.evaluate(async roots=>{
   const session=await desktop.createSession();await desktop.navigateFolder('a','path',roots[0]);await desktop.navigateFolder('b','path',roots[1]);
   const tree=await desktop.listFolderTree();return {id:session.id,revision:tree.revision};
  },roots);
  const start=async session=>{
   await app.evaluate(()=>{global.cancelProbe.events=[];global.cancelProbe.armed=true;global.cancelProbe.release=null;});
   await page.evaluate(({revision})=>{window.cancelResult={settled:false};desktop.compareFolderTree('root',revision,{mode:'content'}).then(value=>window.cancelResult={settled:true,value},error=>window.cancelResult={settled:true,error:String(error)});},session);
   await expect.poll(()=>app.evaluate(()=>global.cancelProbe.events)).toContain('read');
   assert.equal(await page.evaluate(()=>window.cancelResult.settled),false);
  };
  const verifyCancelled=async()=>{
   await expect.poll(()=>page.evaluate(()=>window.cancelResult.settled)).toBe(true);
   const result=await page.evaluate(()=>window.cancelResult);assert.match(result.error,/cancel|abort/i);
   const events=await app.evaluate(()=>global.cancelProbe.events);assert.deepEqual(events,['read','abort','close']);
   // Completion happened while the original read gate remains unreleased.
   await app.evaluate(()=>global.cancelProbe.release());return result;
  };
  const lifecycle=async operation=>{let timer;try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Lifecycle operation queued behind held comparison instead of cancelling it')),10000);})]);}finally{clearTimeout(timer);}};
  let session=await setup();await start(session);
  await lifecycle(page.evaluate(root=>desktop.navigateFolder('a','path',root),roots[2]));await verifyCancelled();
  const replacement=await page.evaluate(async()=>{const tree=await desktop.listFolderTree();return desktop.compareFolderTree('root',tree.revision,{mode:'content'});});
  assert.equal(replacement.rows.find(row=>row.pathA==='file.txt').status,'equal');
  await page.evaluate(id=>desktop.closeSession(id),session.id);
  session=await setup();await start(session);await lifecycle(page.evaluate(id=>desktop.closeSession(id),session.id));await verifyCancelled();
  session=await setup();const other=await page.evaluate(()=>desktop.createSession());await page.evaluate(id=>desktop.activateSession(id),session.id);await start(session);
  await lifecycle(page.evaluate(async ids=>{await desktop.activateSession(ids.other);await desktop.activateSession(ids.original);},{other:other.id,original:session.id}));
  assert.deepEqual(await app.evaluate(()=>global.cancelProbe.events),['read']);assert.equal(await page.evaluate(()=>window.cancelResult.settled),false);
  await app.evaluate(()=>global.cancelProbe.release());await expect.poll(()=>page.evaluate(()=>window.cancelResult.settled)).toBe(true);
  const completed=await page.evaluate(()=>window.cancelResult);assert.equal(completed.error,undefined);assert.equal(completed.value.rows.find(row=>row.pathA==='file.txt').status,'equal');
  assert.deepEqual(await app.evaluate(()=>global.cancelProbe.events),['read','release','close']);
  for(const id of [session.id,other.id])await page.evaluate(id=>desktop.closeSession(id),id);
  for(const root of roots)assert.equal(await fs.readFile(path.join(root,'file.txt'),'utf8'),'identical fixture bytes\n');
  console.log('Native folder lifecycle passed: root replacement and session close abort held provider reads and close handles before release; session switching retains work and exact results; source bytes unchanged.');
 }finally{
  if(app)await app.evaluate(()=>global.cancelProbe?.release?.()).catch(()=>{});
  if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
