'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
(async()=>{
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-sftp-text-origin-')));let app,server;
 try{
  const root=path.join(base,'remote');await fs.mkdir(root);await fs.writeFile(path.join(root,'sample.txt'),'remote original\n');
  const local=path.join(base,'local.txt');await fs.writeFile(local,'local replacement\n');
  server=await createSftpServer({root,writes:true,extensions:{'posix-rename@openssh.com':'1'}});
  const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});const page=await app.firstWindow();await expect(page.locator('#welcome')).toBeVisible();
  const call=(method,...args)=>page.evaluate(({method,args})=>window.desktop[method](...args),{method,args});
  const {id:parent}=await call('createSession');
  const {attemptId}=await call('probeSftp',parent,{host:server.host,port:server.port}),review=await call('reviewSftp',parent,attemptId);
  const connection=await call('connectSftp',parent,{attemptId,approvalToken:review.approvalToken,approved:true,credentials:{username:'fixture-user',password:'fixture-secret'}});
  for(const side of ['a','b'])await call('attachSftp',parent,side,connection.connectionId,'/');
  const tree=await call('listFolderTree'),row=tree.rows.find(item=>item.pathA==='sample.txt');assert.ok(row);
  const child=await call('openFolderTreeFiles',row.id,tree.revision);
  for(const side of ['a','b']){assert.equal(child[side].content,'remote original\n');assert.equal(child[side].source.canSaveToServer,true);assert.equal(child[side].source.readOnly,false);assert.match(child[side].source.saveToken,/^[0-9a-f-]{36}$/);assert.equal(child[side].sha256,undefined);}
  assert.notEqual(child.a.source.saveToken,child.b.source.saveToken);
  const leases=(await call('listSftp',child.id)).connections;assert.equal(leases.length,2);assert.equal(new Set(leases.map(item=>item.connectionId)).size,2);for(const lease of leases)assert.notEqual(lease.connectionId,connection.connectionId);
  await expect.poll(()=>server.clients.size).toBe(1);const closedBeforeParent=server.events.closed;
  await call('closeSession',parent);
  assert.equal((await call('listSftp',child.id)).connections.length,2);assert.equal(server.clients.size,1);assert.equal(server.events.closed,closedBeforeParent,'Parent disposal must not close the child-owned transport');
  for(const side of ['a','b'])await assert.rejects(()=>call('reloadText',side),/opened snapshot|Reopen/);
  // Native review and exact-byte baseline remain usable after the parent closes.
  const format={encoding:'utf8',bom:false,lineEnding:'lf'},save=(side,text,token=child[side].source.saveToken)=>call('saveRemoteText',child.id,side,token,text,format);
  await app.evaluate(({dialog})=>{global.remoteSaveReviews=[];global.remoteSaveAnswer=0;dialog.showMessageBox=async(_window,options)=>{global.remoteSaveReviews.push(options);return {response:global.remoteSaveAnswer};};});
  const requestsBefore=server.events.requests.length;await assert.rejects(()=>save('a','invalid token\n','unknown-token'),/Reopen/);assert.equal(server.events.requests.length,requestsBefore);assert.equal(await app.evaluate(()=>global.remoteSaveReviews.length),0);
  assert.deepEqual(await save('a','first remote edit\n'),{cancelled:true});assert.equal(await fs.readFile(path.join(root,'sample.txt'),'utf8'),'remote original\n');assert.equal(server.events.requests.some(([method])=>method==='write'),false);
  const prompt=await app.evaluate(()=>global.remoteSaveReviews[0]);assert.equal(prompt.title,'Save to server');assert.ok(prompt.detail.includes(child.a.source.displayPath));assert.equal(prompt.defaultId,0);
  await app.evaluate(()=>global.remoteSaveAnswer=1);
  const first=await save('a','first remote edit\n');assert.equal(first.cancelled,false);assert.equal(first.remote,true);assert.equal(await fs.readFile(path.join(root,'sample.txt'),'utf8'),'first remote edit\n');
  const second=await save('a','second remote edit\n');assert.equal(second.cancelled,false);assert.equal(await fs.readFile(path.join(root,'sample.txt'),'utf8'),'second remote edit\n');
  const beforeExternal=await fs.stat(path.join(root,'sample.txt')),external='X'.repeat(Buffer.byteLength('second remote edit\n'));
  await fs.writeFile(path.join(root,'sample.txt'),external);await fs.utimes(path.join(root,'sample.txt'),beforeExternal.atime,beforeExternal.mtime);
  const promptsBefore=await app.evaluate(()=>global.remoteSaveReviews.length);await assert.rejects(()=>save('a','must not overwrite\n'),/changed|Reopen/);assert.equal(await app.evaluate(()=>global.remoteSaveReviews.length),promptsBefore);assert.equal(await fs.readFile(path.join(root,'sample.txt'),'utf8'),external);
  const loaded=await call('openTextPath','a',local,'utf8');assert.equal(loaded.content,'local replacement\n');assert.equal(loaded.path,local);assert.equal(loaded.source,undefined);
  const afterLocalRequests=server.events.requests.length;await assert.rejects(()=>save('a','stale origin token\n'),/Reopen/);assert.equal(server.events.requests.length,afterLocalRequests);
  await fs.writeFile(local,'updated local replacement\n');assert.equal((await call('reloadText','a')).content,'updated local replacement\n');await assert.rejects(()=>call('reloadText','b'),/opened snapshot|Reopen/);
  assert.equal(await fs.readFile(path.join(root,'sample.txt'),'utf8'),external);
  await call('closeSession',child.id);await expect.poll(()=>server.clients.size).toBe(0);assert.equal(server.events.handlesOpened,server.events.handlesClosed);
  console.log('Remote text origin passed: independent side leases and opaque save tokens, parent closure preserves transport, native save cancel/commit/repeat, same-size external edit preserved, local replacement invalidates token, other remote side preserved, final child closure releases transport.');
 }finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await server?.close();await fs.rm(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
