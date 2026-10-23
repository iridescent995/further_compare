'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-sftp-dialog-')));let app,server;const controls={};
 try{
  const root=path.join(temp,'remote');await fs.mkdir(root);await fs.writeFile(path.join(root,'sample.txt'),'same content\n');await fs.writeFile(path.join(root,'résumé #1.txt'),'clipboard fixture');await fs.chmod(path.join(root,'sample.txt'),0o640);
  await fs.mkdir(path.join(root,'branch'));await fs.writeFile(path.join(root,'branch','child.txt'),'paired directory child\n');
  server=await createSftpServer({root,controls});const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});const page=await app.firstWindow();await app.evaluate(({clipboard})=>{global.sftpClipboardBefore=clipboard.availableFormats().map(format=>({format,buffer:clipboard.readBuffer(format)}));});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','new:folder-compare'));
  const dialog=page.locator('#sftpConnectionDialog');
  for(const side of ['A','B']){
   await page.locator('#folderRemote'+side).click();await expect(dialog).toBeVisible();
   await dialog.locator('[name=host]').fill(server.host);await dialog.locator('[name=port]').fill(String(server.port));
   await dialog.locator('[name=username]').fill('fixture-user');await dialog.locator('[name=password]').fill('fixture-secret');
   const authBefore=server.events.auth.length;
   await dialog.getByRole('button',{name:'Review server key',exact:true}).click();
   await expect(dialog.locator('code')).toHaveText(server.fingerprint);assert.equal(server.events.auth.length,authBefore);
   await expect(dialog.getByRole('button',{name:'Approve and connect',exact:true})).toBeDisabled();
   await dialog.getByRole('checkbox',{name:'I recognize this server key',exact:true}).check();await dialog.getByRole('button',{name:'Approve and connect',exact:true}).click();
   await expect(dialog).not.toBeVisible();await expect(page.locator('#folderRows'+side+' .folder-entry').filter({hasText:'sample.txt'})).toBeVisible();
   assert.equal(await dialog.locator('[name=password]').inputValue(),'');
  }
  await expect(page.locator('#folderRowsA .folder-entry.equal').filter({hasText:'sample.txt'})).toBeVisible();
  const parentSession=await page.locator('#sessionTabs [role="tab"][aria-selected="true"]').evaluate(el=>el.parentElement.dataset.sessionId);
  // Reconnect restores an existing endpoint with fresh credentials and review.
  const originalConnections=await page.evaluate(id=>window.desktop.listSftp(id),parentSession);
  assert.equal(originalConnections.connections.length,2);
  for(const connection of originalConnections.connections)assert.equal(connection.username,'fixture-user');
  await expect(page.locator('#folderRemoteA')).toHaveText('Reconnect');await page.locator('#folderRemoteA').click();
  await expect(dialog.getByRole('heading',{name:'Reconnect left folder'})).toBeVisible();
  for(const [field,value] of [['host',server.host],['port',String(server.port)],['username','fixture-user'],['root','/'],['password','']])await expect(dialog.locator('[name='+field+']')).toHaveValue(value);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual((await page.evaluate(id=>window.desktop.listSftp(id),parentSession)).connections.map(item=>item.connectionId),originalConnections.connections.map(item=>item.connectionId));
  // Failed reconnect must leave the live original roots and handles untouched.
  await page.locator('#folderRemoteA').click();await dialog.locator('[name=password]').fill('wrong-fixture-password');
  await dialog.getByRole('button',{name:'Review server key',exact:true}).click();await expect(dialog.locator('code')).toHaveText(server.fingerprint);
  await dialog.getByRole('checkbox',{name:'I recognize this server key',exact:true}).check();await dialog.getByRole('button',{name:'Approve and connect',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText(/authentication failed/i,{timeout:30000});await expect(dialog.locator('[name=password]')).toHaveValue('');
  assert.deepEqual((await page.evaluate(id=>window.desktop.listSftp(id),parentSession)).connections.map(item=>item.connectionId),originalConnections.connections.map(item=>item.connectionId));
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.locator('#folderRowsA .folder-entry.equal').filter({hasText:'sample.txt'})).toBeVisible();
  await page.evaluate(({id,connectionId})=>window.desktop.disconnectSftp(id,connectionId),{id:parentSession,connectionId:originalConnections.connections[0].connectionId});
  await page.locator('#folderRemoteA').click();await dialog.locator('[name=password]').fill('fixture-secret');
  const reconnectAuth=server.events.auth.length;
  await dialog.getByRole('button',{name:'Review server key',exact:true}).click();await expect(dialog.locator('code')).toHaveText(server.fingerprint);assert.equal(server.events.auth.length,reconnectAuth);
  await dialog.getByRole('checkbox',{name:'I recognize this server key',exact:true}).check();await dialog.getByRole('button',{name:'Approve and connect',exact:true}).click();await expect(dialog).not.toBeVisible({timeout:30000});
  await expect(page.locator('#folderRowsA .folder-entry.equal').filter({hasText:'sample.txt'})).toBeVisible({timeout:30000});
  const reconnected=await page.evaluate(id=>window.desktop.listSftp(id),parentSession);assert.equal(reconnected.connections.length,2);assert.equal(reconnected.connections.filter(item=>!originalConnections.connections.some(old=>old.connectionId===item.connectionId)).length,1);
  const parentTab=page.locator('#sessionTabs [data-session-id="'+parentSession+'"] [role="tab"]');
  const tabCount=await page.locator('#sessionTabs [role="tab"]').count();
  const branch=side=>page.locator('#folderRows'+side+' .folder-entry[data-path="branch"]');
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await expect(page.locator('#folderStop')).toBeDisabled();
  await branch('A').click();await branch('B').click({modifiers:[process.platform==='darwin'?'Meta':'Control']});
  await expect(branch('A')).toHaveClass(/selected/);await expect(branch('B')).toHaveClass(/selected/);
  await expect(page.locator('#sessionTabs [role="tab"]')).toHaveCount(tabCount);
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await expect(page.locator('#folderStop')).toBeDisabled();
  await branch('A').click({button:'right'});const pairMenu=page.locator('#folderContext');
  await pairMenu.getByRole('menuitem',{name:'Compare',exact:true}).click();
  await expect(pairMenu.getByRole('menuitem',{name:'Compare selected pair',exact:true})).toBeEnabled();
  await pairMenu.getByRole('menuitem',{name:'Compare selected pair',exact:true}).click();
  await expect(page.locator('#sessionTabs [role="tab"]')).toHaveCount(tabCount+1,{timeout:30000});
  await expect(parentTab).toHaveAttribute('aria-selected','false');
  await expect(page.locator('#folderWorkspace')).toBeVisible();
  for(const side of ['A','B']){
   await expect(page.locator('#folderRows'+side+' .folder-entry[data-path="child.txt"]')).toBeVisible();
   await expect(page.locator('#path'+side)).toHaveValue('sftp://127.0.0.1:'+server.port+'/branch');
  }
  await parentTab.click();await expect(parentTab).toHaveAttribute('aria-selected','true');
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const row=page.locator('#folderRowsA .folder-entry').filter({hasText:'sample.txt'});await row.click();await expect(row).toHaveClass(/selected/);await expect(page.locator('#folderWorkspace')).toBeVisible();
  await row.click({button:'right'});const menu=page.locator('#folderContext');await expect(menu.getByRole('menuitem',{name:'Open comparison',exact:true})).toBeEnabled();
  for(const name of ['Delete selected','Rename file…'])await expect(menu.getByRole('menuitem',{name,exact:true})).toBeEnabled();
  for(const name of ['Move left → right…','Open in external editor…'])await expect(menu.getByRole('menuitem',{name,exact:true})).toBeDisabled();
  await expect(menu.getByRole('menuitem',{name:'Copy to right',exact:true})).toBeEnabled();
  for(const name of ['New','Transfer to folder','Synchronize'])await expect(menu.getByRole('menuitem',{name,exact:true})).toBeDisabled();await page.keyboard.press('Escape');
  await row.click({button:'right'});await menu.getByRole('menuitem',{name:'Properties',exact:true}).click();for(const name of ['Change attributes…','Change modified time…','Reveal in file manager'])await expect(menu.getByRole('menuitem',{name,exact:true})).toBeDisabled();await expect(menu.getByRole('menuitem',{name:'Copy paths',exact:true})).toBeEnabled();await menu.getByRole('menuitem',{name:'Copy paths',exact:true}).click();await expect.poll(()=>app.evaluate(({clipboard})=>clipboard.readText())).toBe('sftp://127.0.0.1:'+server.port+'/sample.txt');
  const special=page.locator('#folderRowsA .folder-entry').filter({hasText:'résumé #1.txt'});for(const [label,expected]of [['Copy paths','sftp://127.0.0.1:'+server.port+'/r%C3%A9sum%C3%A9%20%231.txt'],['Copy relative paths','résumé #1.txt'],['Copy filenames','résumé #1.txt']]){await special.click({button:'right'});await menu.getByRole('menuitem',{name:'Properties',exact:true}).click();await menu.getByRole('menuitem',{name:label,exact:true}).click();await expect.poll(()=>app.evaluate(({clipboard})=>clipboard.readText())).toBe(expected);}
  // Properties read selected metadata without opening or scanning closed descendants.
  await row.click({button:'right'});await menu.getByRole('menuitem',{name:'View',exact:true}).click();await menu.getByRole('menuitem',{name:'Automatic refresh…',exact:true}).click();
  const folderOptions=page.locator('#folderOptionsDialog');await expect(folderOptions).toBeVisible();await page.locator('#folderAutoRefresh').selectOption('0');await folderOptions.locator('[data-done]').click();
  await expect(folderOptions).not.toBeVisible();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await expect(page.locator('#folderStop')).toBeDisabled();
  const properties=page.locator('#folderPropertiesDialog');
  const field=label=>properties.locator('dt').filter({hasText:new RegExp('^'+label+'$')}).locator('xpath=following-sibling::dd[1]');
  const directoryReads=()=>server.events.requests.filter(([method])=>method==='opendir'||method==='readdir').length;
  const fileReads=()=>server.events.requests.filter(([method])=>method==='open'||method==='read').length;
  let directoryReadsBefore=directoryReads(),fileReadsBefore=fileReads();
  await row.click({button:'right'});await menu.getByRole('menuitem',{name:'Properties',exact:true}).click();
  await expect(menu.getByRole('menuitem',{name:'View properties…',exact:true})).toBeEnabled();
  await menu.getByRole('menuitem',{name:'View properties…',exact:true}).click();await expect(properties).toBeVisible();
  await expect(field('Absolute path')).toHaveText('sftp://127.0.0.1:'+server.port+'/sample.txt');
  await expect(field('Size')).toHaveText('13 bytes');
  const sampleStat=await fs.stat(path.join(root,'sample.txt'));
  await expect(field('Modified').locator('time')).toHaveAttribute('datetime',new Date(Math.floor(sampleStat.mtimeMs/1000)*1000).toISOString());
  await expect(field('POSIX permissions')).toHaveText('rw-r-----');await expect(field('Mode')).toHaveText('0640');
  for(const label of ['Accessed','Created'])await expect(field(label)).toHaveText('Unavailable');
  assert.equal(directoryReads(),directoryReadsBefore);assert.equal(fileReads(),fileReadsBefore);
  await properties.getByRole('button',{name:'Close',exact:true}).click();await expect(properties).not.toBeVisible();
  directoryReadsBefore=directoryReads();fileReadsBefore=fileReads();
  await branch('A').click({button:'right'});await menu.getByRole('menuitem',{name:'Properties',exact:true}).click();await menu.getByRole('menuitem',{name:'View properties…',exact:true}).click();
  await expect(properties).toBeVisible();await expect(field('Type')).toHaveText('Folder');
  await expect(field('Absolute path')).toHaveText('sftp://127.0.0.1:'+server.port+'/branch');
  await expect(field('Size')).toContainText('Not calculated (folder contents not scanned)');
  await expect(properties.getByRole('button',{name:/Calculate folder size/})).toBeEnabled();
  assert.equal(directoryReads(),directoryReadsBefore);assert.equal(fileReads(),fileReadsBefore);
  await properties.getByRole('button',{name:/Calculate folder size/}).click();await expect(properties.locator('.folder-size-value')).toHaveText('23 bytes · 1 file · 0 folders');assert.ok(directoryReads()>directoryReadsBefore);assert.equal(fileReads(),fileReadsBefore);await page.screenshot({path:'/private/tmp/fc-remote-folder-size-ui.png'});
  await properties.getByRole('button',{name:'Close',exact:true}).click();await expect(properties).not.toBeVisible();
  const staleProperties=await page.evaluate(async()=>{const tree=await window.desktop.listFolderTree();try{await window.desktop.getFolderTreeProperties('a',[tree.rows.find(item=>item.nameA==='sample.txt').id],String(tree.revision)+'-stale');return 'accepted';}catch(error){return error.message;}});
  assert.match(staleProperties,/changed|stale|revision|refresh/i);
  await row.dblclick();await expect(page.locator('#textA')).toHaveValue('same content\n');await expect(page.locator('#textB')).toHaveValue('same content\n');
  await expect(page.locator('#pathA')).toHaveValue(new RegExp('^sftp://.*sample\\.txt$'));
  await expect(page.locator('#folderWorkspace')).not.toBeVisible();
  await page.locator('#textA').fill('edited local copy\n');
  assert.equal(await fs.readFile(path.join(root,'sample.txt'),'utf8'),'same content\n');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'/private/tmp/fc-sftp-dialog-tree.png'});
  // Closing Properties interrupts an in-flight metadata scan without a late UI update.
  await parentTab.click();await expect(page.locator('#folderWorkspace')).toBeVisible();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  await branch('A').click({button:'right'});await menu.getByRole('menuitem',{name:'Properties',exact:true}).click();await menu.getByRole('menuitem',{name:'View properties…',exact:true}).click();await expect(properties).toBeVisible();
  const sizeReads=directoryReads(),closedBefore=server.events.closed;controls.holdMethods=new Set(['READDIR']);await properties.getByRole('button',{name:/Calculate folder size/}).click();await expect.poll(directoryReads).toBeGreaterThan(sizeReads);await expect(properties.locator('.folder-size-value')).toHaveText('Calculating…');await properties.getByRole('button',{name:'Close',exact:true}).click();await expect(properties).not.toBeVisible();await expect.poll(()=>server.events.closed).toBeGreaterThan(closedBefore);controls.holdMethods.clear();assert.deepEqual(errors,[]);
  console.log('Real SFTP dialog passed: key review before auth, approval, both roots in same tree, live equal status, click selection, paired-directory context comparison and parent restoration, secret cleared.');
 }catch(error){if(app){const failedPage=await app.firstWindow().catch(()=>null);if(failedPage){console.error('SFTP dialog failure UI:',await failedPage.locator('body').innerText().catch(()=>''));await failedPage.screenshot({path:'/private/tmp/fc-sftp-dialog-failure.png'}).catch(()=>{});}}throw error;}finally{controls.holdMethods?.clear();if(app){await app.evaluate(({clipboard})=>{if(global.sftpClipboardBefore){clipboard.clear();for(const {format,buffer}of global.sftpClipboardBefore)clipboard.writeBuffer(format,buffer);}}).catch(()=>{});await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await server?.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
