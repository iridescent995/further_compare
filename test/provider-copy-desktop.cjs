'use strict';
const {_electron:electron,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
(async()=>{
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-provider-copy-ipc-'))),controls={};let app,server;
 try{
  server=await createSftpServer({root:base,controls,writes:true,extensions:{'posix-rename@openssh.com':'1','fsync@openssh.com':'1'}});
  const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
  await app.evaluate(({app,dialog})=>{process.removeAllListeners('uncaughtException');process.on('uncaughtException',error=>{require('node:fs').writeFileSync('/private/tmp/fc-provider-copy-uncaught.log',error.stack||String(error));app.exit(1);});global.copyConfirm=1;global.copyReviews=[];dialog.showMessageBox=async(_,options)=>{global.copyReviews.push(options);return {response:global.copyConfirm};};});
  const page=await app.firstWindow();await expect(page.locator('#welcome')).toBeVisible();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const call=(method,...args)=>page.evaluate(({method,args})=>window.desktop[method](...args),{method,args});
  let serial=0;
  const setup=async(from='remote',to='remote')=>{
   const label='case-'+(++serial),left=path.join(base,label,'left'),right=path.join(base,label,'right');await fs.mkdir(left,{recursive:true});await fs.mkdir(right);
   await fs.writeFile(path.join(left,'source.bin'),Buffer.from([0,255,1,254]));await fs.writeFile(path.join(left,'new.bin'),'new bytes');await fs.writeFile(path.join(left,'zzz.bin'),'later bytes');await fs.writeFile(path.join(left,'same.bin'),'same');await fs.mkdir(path.join(left,'folder/nested/empty'),{recursive:true});await fs.writeFile(path.join(left,'folder/nested/payload.bin'),Buffer.from([0,255,2,254]));await fs.writeFile(path.join(left,'folder/replaced.txt'),'source folder bytes');await fs.writeFile(path.join(left,'folder/hidden.tmp'),'excluded');await fs.mkdir(path.join(right,'mapped-folder'));await fs.writeFile(path.join(right,'mapped-folder/replaced.txt'),'target folder bytes');
   await fs.writeFile(path.join(right,'mapped.bin'),Buffer.from([3,2,1,0]));await fs.writeFile(path.join(right,'same.bin'),'same');
   const {id}=await call('createSession');let connection;
   if(from==='remote'||to==='remote'){const {attemptId}=await call('probeSftp',id,{host:server.host,port:server.port}),review=await call('reviewSftp',id,attemptId);connection=await call('connectSftp',id,{attemptId,approvalToken:review.approvalToken,approved:true,credentials:{username:'fixture-user',password:'fixture-secret'}});}
   for(const [side,kind,folder]of [['a',from,'left'],['b',to,'right']])if(kind==='remote')await call('attachSftp',id,side,connection.connectionId,'/'+label+'/'+folder);else{await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},path.join(base,label,folder));await call('chooseFolder',side);}
   let tree=await call('listFolderTree');await call('alignFolderRows',tree.rows.find(row=>row.pathA==='source.bin').id,tree.rows.find(row=>row.pathB==='mapped.bin').id,tree.revision);tree=await call('listFolderTree');
   const rows=names=>names.map(name=>{const row=tree.rows.find(item=>item.pathA===name);assert.ok(row,name);return row.id;});
   const preview=(names=['source.bin','new.bin','same.bin'])=>call('previewAlignedFolderAction','copy','a',rows(names),tree.revision);
   return {id,left,right,tree,rows,preview};
  };
  for(const [from,to]of [['local','remote'],['remote','local'],['remote','remote']]){
   const f=await setup(from,to),writesBefore=server.events.requests.filter(row=>row[0]==='write').length,plan=await f.preview();assert.equal(plan.remoteTransfer,true);assert.ok(plan.operations.some(op=>op.sourcePath==='source.bin'&&op.targetPath==='mapped.bin'));
   await app.evaluate(()=>global.copyConfirm=0);assert.equal((await call('executeFolders',plan.id)).cancelled,true);assert.equal(server.events.requests.filter(row=>row[0]==='write').length,writesBefore);assert.deepEqual(await fs.readFile(path.join(f.right,'mapped.bin')),Buffer.from([3,2,1,0]));await assert.rejects(fs.access(path.join(f.right,'new.bin')));
   // Cancellation may revoke a plan; obtain a fresh current tree and preview.
   const refreshed=await call('listFolderTree'),ids=['source.bin','new.bin','same.bin'].map(name=>refreshed.rows.find(row=>row.pathA===name).id),ready=await call('previewAlignedFolderAction','copy','a',ids,refreshed.revision);await app.evaluate(()=>global.copyConfirm=1);const result=await call('executeFolders',ready.id);assert.equal(result.remoteTransfer,true);assert.equal(result.failed,undefined);assert.equal(result.completed,2);assert.equal(result.skipped,1);assert.deepEqual(await fs.readFile(path.join(f.right,'mapped.bin')),Buffer.from([0,255,1,254]));assert.equal(await fs.readFile(path.join(f.right,'new.bin'),'utf8'),'new bytes');
   assert.ok(result.backupPath);const manifest=JSON.parse(await fs.readFile(path.join(result.backupPath,'manifest.json'),'utf8'));assert.equal(manifest.files[0].path,'mapped.bin');assert.deepEqual(await fs.readFile(path.join(result.backupPath,manifest.files[0].backupName)),Buffer.from([3,2,1,0]));await assert.rejects(()=>call('executeFolders',ready.id));await call('closeSession',f.id);
  }
  // Select a collapsed mapped directory: preview must discover all scoped descendants itself.
  for(const [from,to]of [['local','remote'],['remote','local'],['remote','remote']]){
   const f=await setup(from,to);await call('alignFolderRows',f.tree.rows.find(row=>row.pathA==='folder').id,f.tree.rows.find(row=>row.pathB==='mapped-folder').id,f.tree.revision);
   const tree=await call('listFolderTree'),folder=tree.rows.find(row=>row.pathA==='folder');assert.equal(folder.pathB,'mapped-folder');
   const plan=await call('previewAlignedFolderAction','copy','a',[folder.id],tree.revision,{exclude:'*.tmp'});assert.equal(plan.remoteTransfer,true);assert.ok(plan.operations.some(op=>op.sourcePath==='folder/nested/payload.bin'||op.source==='folder/nested/payload.bin'));
   await app.evaluate(()=>global.copyConfirm=0);assert.equal((await call('executeFolders',plan.id)).cancelled,true);await assert.rejects(fs.access(path.join(f.right,'mapped-folder/nested')));
   const freshTree=await call('listFolderTree'),ready=await call('previewAlignedFolderAction','copy','a',[freshTree.rows.find(row=>row.pathA==='folder').id],freshTree.revision,{exclude:'*.tmp'});await app.evaluate(()=>global.copyConfirm=1);const result=await call('executeFolders',ready.id);assert.equal(result.failed,undefined);assert.ok(result.completed>0);assert.ok(result.backupPath);
   assert.deepEqual(await fs.readFile(path.join(f.right,'mapped-folder/nested/payload.bin')),Buffer.from([0,255,2,254]));assert.deepEqual(await fs.readdir(path.join(f.right,'mapped-folder/nested/empty')),[]);assert.equal(await fs.readFile(path.join(f.right,'mapped-folder/replaced.txt'),'utf8'),'source folder bytes');await assert.rejects(fs.access(path.join(f.right,'mapped-folder/hidden.tmp')));
   const manifest=JSON.parse(await fs.readFile(path.join(result.backupPath,'manifest.json'),'utf8')),backup=manifest.files.find(item=>item.path==='mapped-folder/replaced.txt');assert.ok(backup);assert.equal(await fs.readFile(path.join(result.backupPath,backup.backupName),'utf8'),'target folder bytes');await assert.rejects(()=>call('executeFolders',ready.id));await call('closeSession',f.id);
  }
  // Real stage-write failure must cross IPC as structured partial outcomes.
  const partial=await setup('local','remote'),partialPlan=await partial.preview(['new.bin','source.bin','same.bin','zzz.bin']);let writes=0;controls.onRequest=name=>{if(name==='WRITE'&&++writes===2)throw Error('fixture second write failed');};
  const failed=await call('executeFolders',partialPlan.id);delete controls.onRequest;assert.equal(failed.remoteTransfer,true);assert.equal(failed.failed,true);assert.equal(failed.completed,1);assert.deepEqual(failed.items.map(item=>item.status),['completed','skipped','failed','unattempted']);assert.ok(failed.backupPath);assert.equal(await fs.readFile(path.join(partial.right,'new.bin'),'utf8'),'new bytes');assert.deepEqual(await fs.readFile(path.join(partial.right,'mapped.bin')),Buffer.from([3,2,1,0]));await call('closeSession',partial.id);
  // Preview plans cannot survive side swaps, root replacement, or session disposal.
  for(const change of ['swap','root','close']){
   const f=await setup(),plan=await f.preview(['source.bin']);
   if(change==='swap')await call('swapSides');else if(change==='root'){await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},f.left);await call('chooseFolder','a');}else await call('closeSession',f.id);
   await assert.rejects(()=>call('executeFolders',plan.id));assert.deepEqual(await fs.readFile(path.join(f.right,'mapped.bin')),Buffer.from([3,2,1,0]));if(change!=='close')await call('closeSession',f.id);
  }
  // Stop before the queued preview reaches its handler must revoke that request.
  const queued=await setup(),nonce=require('node:crypto').randomUUID(),queuedReads=server.events.requests.filter(row=>row[0]==='read').length;
  await app.evaluate(({dialog})=>{global.copyPickerHeld=false;dialog.showOpenDialog=()=>new Promise(resolve=>{global.copyPickerHeld=true;global.releaseCopyPicker=()=>resolve({canceled:true,filePaths:[]});});});
  await page.evaluate(()=>{window.copyQueuedPicker=window.desktop.chooseFolder('a').then(value=>({value}),error=>({error:error.message}));});await expect.poll(()=>app.evaluate(()=>global.copyPickerHeld)).toBe(true);
  await page.evaluate(({ids,revision,nonce})=>{window.copyQueuedPreview=window.desktop.previewAlignedFolderAction('copy','a',ids,revision,null,nonce).then(value=>({value}),error=>({error:error.message}));},{ids:queued.rows(['source.bin']),revision:queued.tree.revision,nonce});
  assert.equal((await call('cancelFolderTransfer',queued.id,undefined,nonce)).cancelled,true);await app.evaluate(()=>global.releaseCopyPicker());await page.evaluate(()=>window.copyQueuedPicker);
  const queuedResult=await page.evaluate(()=>window.copyQueuedPreview);assert.ok(queuedResult.error&&/cancel|abort/i.test(queuedResult.error));assert.equal(server.events.requests.filter(row=>row[0]==='read').length,queuedReads,'Cancelled queued preview must not read source bytes');
  const fresh=await call('previewAlignedFolderAction','copy','a',queued.rows(['source.bin']),queued.tree.revision,null,require('node:crypto').randomUUID());assert.equal(fresh.remoteTransfer,true);await call('closeSession',queued.id);
  // Preview Stop is immediate even while an actual remote READ is blocked.
  const previewStop=await setup(),beforePreviewReads=server.events.requests.filter(row=>row[0]==='read').length;controls.holdReads=true;
  await page.evaluate(({ids,revision})=>{window.copyPendingPreview=window.desktop.previewAlignedFolderAction('copy','a',ids,revision).then(value=>({value}),error=>({error:error.message}));},{ids:previewStop.rows(['source.bin']),revision:previewStop.tree.revision});
  await expect.poll(()=>server.events.requests.filter(row=>row[0]==='read').length).toBeGreaterThan(beforePreviewReads);assert.equal((await call('cancelFolderTransfer',previewStop.id)).cancelled,true);assert.ok((await page.evaluate(()=>window.copyPendingPreview)).error);controls.holdReads=false;assert.deepEqual(await fs.readFile(path.join(previewStop.right,'mapped.bin')),Buffer.from([3,2,1,0]));await call('closeSession',previewStop.id);
  const executeStop=await setup(),stopPlan=await executeStop.preview(['source.bin']),beforeExecuteReads=server.events.requests.filter(row=>row[0]==='read').length;controls.holdReads=true;
  await page.evaluate(id=>{window.copyPendingExecute=window.desktop.executeFolders(id).then(value=>({value}),error=>({error:error.message}));},stopPlan.id);
  await expect.poll(()=>server.events.requests.filter(row=>row[0]==='read').length).toBeGreaterThan(beforeExecuteReads);assert.equal((await call('cancelFolderTransfer',executeStop.id,stopPlan.id)).cancelled,true);const stopped=await page.evaluate(()=>window.copyPendingExecute);assert.ok(stopped.error||stopped.value?.cancelled||stopped.value?.failed);controls.holdReads=false;assert.deepEqual(await fs.readFile(path.join(executeStop.right,'mapped.bin')),Buffer.from([3,2,1,0]));await call('closeSession',executeStop.id);
  console.log('Provider copy IPC passed: all3 directions, mapped targets, cancelled review, exact bytes and backups, replay rejection, structured partial failure, swap/root/close revocation and held preview/execute Stop.');
 }finally{controls.holdReads=false;if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}if(server)await server.close();await fs.rm(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
