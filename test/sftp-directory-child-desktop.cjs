'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
const {randomUUID}=require('node:crypto');
(async()=>{
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-sftp-directory-child-')));let app,server;const controls={};
 try{
  for(const side of ['left','right','local']){
   await fs.mkdir(path.join(base,side,'branch','nested'),{recursive:true});
   await fs.writeFile(path.join(base,side,'branch','same.txt'),'same child content');
   await fs.writeFile(path.join(base,side,'branch','different.txt'),side==='left'?'LEFT':'RGHT');
   await fs.writeFile(path.join(base,side,'branch',side+'-only.txt'),side);
   await fs.writeFile(path.join(base,side,'branch','nested','deep.txt'),'deeper child');
   await fs.writeFile(path.join(base,side,'root-file.txt'),'root only');
  }
  server=await createSftpServer({root:base,readChunk:3,controls});
  const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
  const page=await app.firstWindow();await expect(page.locator('#welcome')).toBeVisible();
  const call=(method,...args)=>page.evaluate(({method,args})=>window.desktop[method](...args),{method,args});
  const row=(listed,name,side='A')=>{const found=listed.rows.find(item=>item['path'+side]===name);assert.ok(found,`Missing ${side} row ${name}`);return found;};
  const connect=async id=>{
   const {attemptId}=await call('probeSftp',id,{host:server.host,port:server.port});
   const review=await call('reviewSftp',id,attemptId);
   return call('connectSftp',id,{attemptId,approvalToken:review.approvalToken,approved:true,credentials:{username:'fixture-user',password:'fixture-secret'}});
  };
  const setup=async mixed=>{
   const {id}=await call('createSession'),connection=await connect(id);
   await call('attachSftp',id,'a',connection.connectionId,'/left');
   if(mixed){
    await app.evaluate(({dialog},root)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});},path.join(base,'local'));
    await call('chooseFolder','b');
   }else await call('attachSftp',id,'b',connection.connectionId,'/right');
   return {id,connectionId:connection.connectionId,listed:await call('listFolderTree')};
  };
  const openBranch=async listed=>{const branch=row(listed,'branch');return call('openFolderTreePair',branch.id,branch.id,listed.revision);};
  const checkChild=async right=>{
   const listed=await call('listFolderTree');
   assert.ok(!listed.rows.some(item=>item.pathA==='branch'||item.pathA==='root-file.txt'));
   row(listed,'same.txt');row(listed,'left-only.txt');row(listed,right+'-only.txt','B');row(listed,'nested');
   const compared=await call('compareFolderTree','root',listed.revision,{});
   assert.equal(row(compared,'same.txt').status,'equal');assert.equal(row(compared,'different.txt').status,'changed');
   return compared;
  };
  // Both remote sides deliberately share one underlying SSH connection. Each child
  // side needs its own session-scoped ID, while closing the parent retains transport.
  let parent=await setup(false),child=await openBranch(parent.listed);
  assert.equal(child.mode,'folder-compare');assert.equal(child.remote,true);assert.notEqual(child.id,parent.id);
  for(const [side,root] of [['a','/left/branch'],['b','/right/branch']]){
   assert.equal(child.folders[side].path,root);assert.equal(child.folders[side].remote,true);
   assert.notEqual(child.folders[side].connectionId,parent.connectionId);
  }
  assert.notEqual(child.folders.a.connectionId,child.folders.b.connectionId);
  const childConnections=(await call('listSftp',child.id)).connections;
  assert.equal(childConnections.length,2);assert.ok(childConnections.every(item=>!item.closed));
  await checkChild('right');await call('closeSession',parent.id);
  // Force fresh root metadata/content reads after parent disposal, not just a cache hit.
  await fs.writeFile(path.join(base,'left','branch','after-parent-close.txt'),'still connected');
  const afterParent=await checkChild('right');row(afterParent,'after-parent-close.txt');
  const nested=row(afterParent,'nested'),grandchild=await call('openFolderTreePair',nested.id,nested.id,afterParent.revision);
  assert.equal(grandchild.folders.a.path,'/left/branch/nested');
  const deep=await call('listFolderTree');row(deep,'deep.txt');
  await call('closeSession',grandchild.id);await call('activateSession',child.id);await checkChild('right');
  await call('closeSession',child.id);await expect.poll(()=>server.clients.size).toBe(0);

  // Mixed remote/local child roots retain independent lifetime in the opposite order.
  parent=await setup(true);child=await openBranch(parent.listed);
  assert.equal(child.folders.a.path,'/left/branch');assert.equal(child.folders.a.remote,true);
  assert.equal(child.folders.b.path,path.join(base,'local','branch'));assert.ok(!child.folders.b.remote);
  assert.notEqual(child.folders.a.connectionId,parent.connectionId);
  assert.equal((await call('listSftp',child.id)).connections.length,1);
  await checkChild('local');await call('closeSession',child.id);await call('activateSession',parent.id);
  const parentListed=await call('listFolderTree');row(parentListed,'branch');row(parentListed,'root-file.txt');
  assert.equal((await call('listSftp',parent.id)).connections[0].closed,false);
  const branchComparison=await call('compareFolderTree',row(parentListed,'branch').id,parentListed.revision,{});
  assert.equal(row(branchComparison,'branch/same.txt').status,'equal');
  // Invalid file/folder selection must not publish a child or change the parent tree.
  await assert.rejects(()=>call('openFolderTreePair',row(parentListed,'branch').id,row(parentListed,'root-file.txt','B').id,parentListed.revision));
  const retained=await call('listFolderTree','root',parentListed.revision);
  assert.equal(retained.revision,parentListed.revision);row(retained,'root-file.txt');
  assert.equal((await call('listSftp',parent.id)).connections.length,1);
  await call('closeSession',parent.id);await expect.poll(()=>server.clients.size).toBe(0);
  // Explicit parent disconnect revokes that session's roots without closing a
  // transport retained by an idle child session.
  parent=await setup(false);child=await openBranch(parent.listed);
  await call('disconnectSftp',parent.id,parent.connectionId);
  assert.equal((await call('listSftp',parent.id)).connections.length,0);
  await checkChild('right');await call('activateSession',parent.id);
  await assert.rejects(()=>call('listFolderTree'));
  await call('activateSession',child.id);await checkChild('right');
  await call('closeSession',parent.id);await call('closeSession',child.id);
  await expect.poll(()=>server.clients.size).toBe(0);
  // Reconnect replaces only the targeted root. A failed stage/commit preserves
  // the old root, and replacing the final parent handle keeps retained children alive.
  parent=await setup(false);child=await openBranch(parent.listed);
  await call('activateSession',parent.id);const replacement=await connect(parent.id);
  assert.equal(replacement.username,'fixture-user');
  await assert.rejects(()=>call('prepareSftpAttachment',parent.id,'a',replacement.connectionId,'/missing'));
  assert.ok((await call('listSftp',parent.id)).connections.some(item=>item.connectionId===parent.connectionId&&!item.closed));
  const oldTree=await call('listFolderTree');row(oldTree,'root-file.txt');
  const prepared=await call('prepareSftpAttachment',parent.id,'a',replacement.connectionId,'/left');
  assert.equal(prepared.descriptor.username,'fixture-user');
  // Another committed root invalidates this token; failure must not release old authority.
  await call('attachSftp',parent.id,'b',parent.connectionId,'/right');
  await assert.rejects(()=>call('commitSftpAttachment',parent.id,prepared.attachmentId));
  assert.ok((await call('listSftp',parent.id)).connections.some(item=>item.connectionId===parent.connectionId&&!item.closed));
  const firstReplacement=await call('attachSftp',parent.id,'a',replacement.connectionId,'/left');
  assert.equal(firstReplacement.username,'fixture-user');
  assert.ok((await call('listSftp',parent.id)).connections.some(item=>item.connectionId===parent.connectionId&&!item.closed),'opposite root retains the original handle');
  await call('attachSftp',parent.id,'b',replacement.connectionId,'/right');
  assert.deepEqual((await call('listSftp',parent.id)).connections.map(item=>item.connectionId),[replacement.connectionId]);
  await call('activateSession',child.id);await checkChild('right');
  await call('closeSession',child.id);await expect.poll(()=>server.clients.size).toBe(1);
  await call('activateSession',parent.id);row(await call('listFolderTree'),'root-file.txt');
  await call('closeSession',parent.id);await expect.poll(()=>server.clients.size).toBe(0);
  // Stop must cancel a directory pair even before root metadata has resolved.
  parent=await setup(false);const heldBranch=row(parent.listed,'branch');
  controls.holdMethods=new Set(['LSTAT']);let heldMetadata=false;
  controls.onRequest=name=>{if(name==='LSTAT')heldMetadata=true;};
  const stopTicket={sessionId:parent.id,revision:parent.listed.revision,requestId:randomUUID()};
  await page.evaluate(({rowId,revision,ticket})=>{
   window.directoryChildPending=window.desktop.openFolderTreePair(rowId,rowId,revision,'auto',ticket).then(value=>({value}),error=>({error:error.message}));
  },{rowId:heldBranch.id,revision:parent.listed.revision,ticket:stopTicket});
  await expect.poll(()=>heldMetadata).toBe(true);
  await assert.rejects(()=>call('openFolderTreePair',heldBranch.id,heldBranch.id,parent.listed.revision));
  assert.equal(await call('cancelFolderRead',stopTicket),true);
  const cancelled=await page.evaluate(()=>window.directoryChildPending);assert.ok(cancelled.error);assert.equal(cancelled.value,undefined);
  controls.holdMethods.clear();delete controls.onRequest;
  // The original parent is still current: reset acts on its registry and leaves no retained child lease.
  await call('resetSession');assert.equal((await call('listSftp',parent.id)).connections.length,0);
  await call('closeSession',parent.id);await expect.poll(()=>server.clients.size).toBe(0);
  await expect.poll(()=>server.events.handlesOpened-server.events.handlesClosed).toBe(0);
  console.log('Remote directory child IPC passed: paired remote and mixed roots, scoped connection IDs, nested children, parent/child close independence, fresh reads after disposal, invalid pair retains parent, final transport cleanup.');
 }finally{
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
  if(server)await server.close();await fs.rm(base,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
