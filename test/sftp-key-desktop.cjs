'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
(async()=>{
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-sftp-key-')));let app,server;
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const plain=pair.privateKey.export({type:'pkcs1',format:'pem'}),encrypted=pair.privateKey.export({type:'pkcs1',format:'pem',cipher:'aes-256-cbc',passphrase:'fixture-passphrase'});
 const keyPath=path.join(base,'fixture-key.pem'),encryptedPath=path.join(base,'encrypted-key.pem');
 await fs.writeFile(keyPath,plain,{mode:0o600});await fs.writeFile(encryptedPath,encrypted,{mode:0o600});
 try{
  const root=path.join(base,'remote');await fs.mkdir(root);await fs.writeFile(path.join(root,'sample.txt'),'key-auth comparison\n');
  server=await createSftpServer({authorizedKey:plain,root});
  const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
  const page=await app.firstWindow();await expect(page.locator('#welcome')).toBeVisible();
  const call=(method,...args)=>page.evaluate(({method,args})=>window.desktop[method](...args),{method,args});
  const session=async()=>(await call('createSession')).id;
  const choose=async(id,file=keyPath)=>{await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);return call('chooseSftpKey',id);};
  const review=async id=>{const {attemptId}=await call('probeSftp',id,{host:server.host,port:server.port,connectTimeoutMs:10000});return call('reviewSftp',id,attemptId);};
  const request=(review,keyId,passphrase)=>({attemptId:review.attemptId,approvalToken:review.approvalToken,approved:true,credentials:{username:'fixture-user',keyId,...(passphrase?{passphrase}:{})}});
  const id=await session(),key=await choose(id);assert.deepEqual(Object.keys(key).sort(),['keyId','name']);assert.equal(key.name,'fixture-key.pem');assert.ok(!JSON.stringify(key).includes(base));assert.ok(!JSON.stringify(key).includes('PRIVATE KEY'));
  const reviewed=await review(id);assert.equal(server.events.auth.length,0,'Host review must happen without authentication');
  const connection=await call('connectSftp',id,request(reviewed,key.keyId));assert.ok(connection.connectionId);assert.ok(server.events.auth.some(event=>event.method==='publickey'));assert.ok(!server.events.auth.some(event=>event.method==='password'));
  await assert.rejects(()=>call('connectSftp',id,request(reviewed,key.keyId)),'Consumed key cannot be reused');
  const reuseReview=await review(id);await assert.rejects(()=>call('connectSftp',id,request(reuseReview,key.keyId)),'New approval cannot resurrect consumed key');
  const ownKey=await choose(id),foreign=await session(),foreignReview=await review(foreign);
  assert.equal(await call('discardSftpKey',foreign,ownKey.keyId),false);
  await assert.rejects(()=>call('connectSftp',foreign,request(foreignReview,ownKey.keyId)));
  assert.ok((await call('connectSftp',id,request(await review(id),ownKey.keyId))).connectionId,'Foreign attempt cannot consume owner key');
  const secured=await choose(id,encryptedPath);assert.ok((await call('connectSftp',id,request(await review(id),secured.keyId,'fixture-passphrase'))).connectionId);
  const discarded=await choose(id);assert.equal(await call('discardSftpKey',id,discarded.keyId),true);assert.equal(await call('discardSftpKey',id,discarded.keyId),false);
  const resetKey=await choose(id);await call('activateSession',id);await call('resetSession');const resetReview=await review(id);await assert.rejects(()=>call('connectSftp',id,request(resetReview,resetKey.keyId)));
  const closed=await session(),closedKey=await choose(closed);await call('closeSession',closed);await assert.rejects(()=>call('connectSftp',closed,request(reviewed,closedKey.keyId)));
  // The native picker can outlive its originating session. Its late result must not grant a key.
  const stale=await session();await app.evaluate(({dialog})=>{global.sftpKeyPickerWaiting=false;dialog.showOpenDialog=()=>new Promise(resolve=>{global.sftpKeyPickerWaiting=true;global.releaseSftpKeyPicker=resolve;});});
  await page.evaluate(id=>{window.staleKey=window.desktop.chooseSftpKey(id).then(value=>({value}),error=>({error:error.message}));},stale);
  await expect.poll(()=>app.evaluate(()=>global.sftpKeyPickerWaiting)).toBe(true);
  await call('closeSession',stale);await app.evaluate((_,file)=>global.releaseSftpKeyPicker({canceled:false,filePaths:[file]}),keyPath);
  const staleResult=await page.evaluate(()=>window.staleKey);assert.ok(staleResult.error||staleResult.value===null,'Late picker must not publish key');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','new:folder-compare'));
  const dialog=page.locator('#sftpConnectionDialog');
  for(const side of ['A','B']){
   await page.locator('#folderRemote'+side).click();await expect(dialog).toBeVisible();
   await dialog.locator('[name=host]').fill(server.host);await dialog.locator('[name=port]').fill(String(server.port));await dialog.locator('[name=username]').fill('fixture-user');
   await dialog.locator('[name=authentication]').selectOption('key');
   await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},encryptedPath);
   await dialog.getByRole('button',{name:'Choose key file',exact:true}).click();await expect(dialog.locator('#sftpKeyName')).toHaveText('encrypted-key.pem');
   if(side==='A')await page.screenshot({path:'/private/tmp/fc-sftp-key-dialog.png'});
   await dialog.locator('[name=passphrase]').fill('fixture-passphrase');const authBefore=server.events.auth.length;
   await dialog.getByRole('button',{name:'Review server key',exact:true}).click();await expect(dialog.locator('code')).toHaveText(server.fingerprint);assert.equal(server.events.auth.length,authBefore);
   await expect(dialog.getByRole('button',{name:'Approve and connect',exact:true})).toBeDisabled();await dialog.getByRole('checkbox',{name:'I recognize this server key',exact:true}).check();await dialog.getByRole('button',{name:'Approve and connect',exact:true}).click();
   await expect(dialog).not.toBeVisible({timeout:30000});await expect(page.locator('#folderRows'+side+' .folder-entry').filter({hasText:'sample.txt'})).toBeVisible();await expect(dialog.locator('[name=passphrase]')).toHaveValue('');
  }
  await expect(page.locator('#folderRowsA .folder-entry.equal').filter({hasText:'sample.txt'})).toBeVisible();
  console.log('SFTP native key passed: real public-key and encrypted-key authentication, no renderer key bytes, host review first, single use, ownership, discard/reset/close and stale picker, encrypted-key dialog and equal remote tree.');
 }finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}if(server)await server.close();await fs.rm(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
