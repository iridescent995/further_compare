'use strict';
const {_electron:electron,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:15000});
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {zip}=require('./archive-fixture.cjs');
function wav(){const b=Buffer.alloc(50);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(6,40);b.writeInt16LE(100,46);return b;}
(async()=>{
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-advanced-editor-')));let app,page;
 try{
  const files={binary:Buffer.from([1,2,3]),table:Buffer.from('id,value\n1,same\n'),threeway:Buffer.from('same\n'),audio:wav(),archive:zip([{name:'entry.bin',data:Buffer.from([4,5,6])}]),registry:Buffer.from('Windows Registry Editor Version 5.00\n\n[HKEY_CURRENT_USER\\Software\\FurtherTest]\n"Value"="same"\n')};
  const suffix={binary:'bin',table:'csv',threeway:'txt',picture:'png',audio:'wav',archive:'zip',registry:'reg'};
  const disk=(kind,side)=>path.join(dir,`${kind} ${side}.${suffix[kind]}`);
  for(const [kind,data]of Object.entries(files))for(const side of ['left','right'])await fs.writeFile(disk(kind,side),data);
  const env={...process.env,FC_USER_DATA_DIR:path.join(dir,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({dialog,shell})=>{global.editorFiles=[];global.editorDialogs=[];global.editorLaunches=[];global.editorDestination='';dialog.showOpenDialog=async(_w,options)=>{global.editorDialogs.push(options);return {canceled:false,filePaths:[global.editorFiles.shift()]};};dialog.showSaveDialog=async()=>({canceled:false,filePath:global.editorDestination});dialog.showMessageBox=async()=>({response:1});shell.openPath=async file=>{global.editorLaunches.push(file);return '';};});
  const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=2;c.height=2;const ctx=c.getContext('2d');ctx.fillStyle='#a24c93';ctx.fillRect(0,0,2,2);return c.toDataURL('image/png').split(',')[1];});
  for(const side of ['left','right'])await fs.writeFile(disk('picture',side),Buffer.from(image,'base64'));
  const queue=paths=>app.evaluate(({},paths)=>global.editorFiles=paths,paths);
  const destination=file=>app.evaluate(({},file)=>global.editorDestination=file,file);
  const menu=command=>app.evaluate(({BrowserWindow},command)=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action',command),command);
  const launches=()=>app.evaluate(()=>global.editorLaunches);
  const expected=[];let binaryToken;
  const openExternally=async(side,file)=>{await menu('editor:'+side);expected.push(file);await expect.poll(launches).toEqual(expected);};
  const rejected=request=>page.evaluate(async request=>{try{await window.desktop.openExternalEditor(request);return false;}catch{return true;}},request);
  const newSession=async(kind,first=false)=>{if(!first)await page.locator('#newTab').click();await page.locator(`#welcome [data-command="new:${kind}"]`).click();};
  const ready=async(kind,side)=>{
   const index=side==='left'?0:1,name=path.basename(disk(kind,side));
   if(kind==='picture')await expect(page.locator('#pictureWorkspace .picture-pane header').nth(index)).toContainText(name+' · 2 × 2');
   else if(kind==='audio')await expect(page.locator('#mediaWorkspace .media-pane h3').nth(index)).toContainText(name);
   else if(kind==='archive')await expect(page.locator('#archiveWorkspace [data-path="entry.bin"] .archive-name').nth(index)).toHaveText('entry.bin');
   else if(kind==='registry')await expect(page.locator('#registryWorkspace .registry-toolbar').first()).toContainText(name);
   else await expect(page.locator('#dataWorkspace .advanced-file')).toContainText(kind==='threeway'?(side==='left'?['No file',name,'No file']:['No file',path.basename(disk(kind,'left')),name]):(side==='left'?[name,'No file']:[path.basename(disk(kind,'left')),name]));
  };
  const kinds=[['binary','binary-compare','Open left','Open right'],['table','table-compare','Open left','Open right'],['threeway','text-merge3','Open left','Open right'],['picture','picture-compare','Open left image','Open right image'],['audio','audio-compare','Open left audio','Open right audio'],['archive','archive-compare','Open left archive','Open right archive'],['registry','registry-compare','Open left registry file','Open right registry file']];
  for(const [index,[kind,type,leftLabel,rightLabel]]of kinds.entries()){
   await newSession(type,index===0);await page.locator('#sessionName').fill('Editor '+kind);
   await queue([disk(kind,'left'),disk(kind,'right')]);
   await page.getByRole('button',{name:leftLabel,exact:true}).click();await ready(kind,'left');await page.getByRole('button',{name:rightLabel,exact:true}).click();await ready(kind,'right');
   const dialogs=await app.evaluate(()=>global.editorDialogs.slice(-2));
   for(const [i,side]of ['left','right'].entries()){
    const label={binary:'file',table:'table',threeway:'text file',picture:'image',audio:'audio file',archive:'archive',registry:'registry file'}[kind];
    assert.equal(dialogs[i].title,`Open ${side} ${label}`);assert.deepEqual(dialogs[i].properties,['openFile']);
    assert.ok(dialogs[i].filters.some(filter=>filter.extensions.includes('*')),'An All files fallback must remain available');
    if(!['binary','threeway'].includes(kind))assert.ok(dialogs[i].filters[0].extensions.includes(suffix[kind]),'The mode must offer its supported input extension');
   }
   if(kind==='binary'){
    await page.getByLabel('Byte offset (hex)',{exact:true}).fill('1');await page.getByLabel('Right byte (hex)',{exact:true}).fill('ff');await page.getByRole('button',{name:'Apply byte',exact:true}).click();
    await expect(page.locator('.advanced-note').first()).toContainText('1 differing byte');
   }
   await openExternally('left',disk(kind,'left'));await openExternally('right',disk(kind,'right'));
   if(kind==='binary'){await queue([disk(kind,'left')]);const grant=await page.evaluate(()=>window.desktop.openData('a','binary'));binaryToken=grant.diskToken;assert.equal(typeof binaryToken,'string');assert.equal(await rejected({source:'advanced',side:'a',token:binaryToken,path:disk('binary','right')}),true,'Renderer-supplied disk paths must not override a valid token');}
   if(kind==='registry'){
    const invalid=path.join(dir,'invalid.reg');await fs.writeFile(invalid,'not a registry file');await queue([invalid]);await page.getByRole('button',{name:rightLabel,exact:true}).click();await expect(page.locator('#notice')).toContainText(/registry|header|format/i);await openExternally('right',disk(kind,'right'));
   }
   if(kind==='archive'){
    await page.locator('#archiveWorkspace [data-path="entry.bin"]').dblclick();await expect(page.locator('#sessionKind')).toHaveText('Binary Compare');await menu('editor:left');await expect(page.locator('#notice')).toContainText(/disk|open.*file/i);assert.deepEqual(await launches(),expected);await page.locator('#backToFolder').click();await expect(page.locator('#archiveWorkspace')).toBeVisible();
   }
   if(kind==='binary'){
    const output=path.join(dir,'unsaved-result.bin');await destination(output);await page.getByRole('button',{name:'Save result',exact:true}).click();
    await expect.poll(()=>fs.readFile(output).then(data=>[...data]).catch(()=>null)).toEqual([1,255,3]);
    assert.deepEqual(await fs.readFile(disk('binary','right')),files.binary,'External editing must not implicitly save pending binary edits');
    await expect(page.locator('#unsavedDialog')).toBeHidden();
   }
  }
  // Active-tab authority must follow its own inputs, even after many different comparison types.
  await page.getByRole('tab',{name:/^Editor binary(?: •)?$/}).click();await openExternally('left',disk('binary','left'));await openExternally('right',disk('binary','right'));
  await expect(page.locator('.advanced-note').first()).toContainText('1 differing byte');
  await menu('swap');await openExternally('left',disk('binary','right'));await openExternally('right',disk('binary','left'));
  await menu('swap');await openExternally('left',disk('binary','left'));
  const sessionFile=path.join(dir,'embedded.fcompare');await destination(sessionFile);await menu('save-session');await expect(page.locator('#dirtyIndicator')).toBeHidden();
  const session=JSON.parse(await fs.readFile(sessionFile,'utf8'));assert.equal(session.advanced.inputs.b.data,Buffer.from([1,255,3]).toString('base64'));assert.equal('diskToken' in session.advanced.inputs.a,false);assert.equal('diskToken' in session.advanced.inputs.b,false);
  await newSession('binary-compare');assert.equal(await rejected({source:'advanced',side:'a',token:binaryToken}),true,'A new tab must not inherit the previous tab disk authority');
  await queue([sessionFile]);await menu('open-session');await expect(page.locator('.advanced-note').first()).toContainText('1 differing byte');
  assert.equal(await rejected({source:'advanced',side:'a',token:binaryToken}),true,'Embedded session data must not be treated as a disk file');
  await menu('editor:left');await expect(page.locator('#notice')).toContainText(/disk|open.*file/i);assert.deepEqual(await launches(),expected);
  // Opening a real file grants authority only for that side; deletion revokes practical access.
  await queue([disk('binary','left')]);await page.getByRole('button',{name:'Open left',exact:true}).click();await openExternally('left',disk('binary','left'));
  assert.equal(await rejected({source:'advanced',side:'b'}),true);
  await queue([disk('binary','left')]);const lastGrant=await page.evaluate(()=>window.desktop.openData('a','binary'));assert.equal(typeof lastGrant.diskToken,'string');
  await fs.rm(disk('binary','left'));assert.equal(await rejected({source:'advanced',side:'a',token:lastGrant.diskToken}),true);await menu('editor:left');await expect(page.locator('#notice')).toContainText(/ENOENT|no such file|missing|changed/i);assert.deepEqual(await launches(),expected);
  assert.deepEqual(errors,[]);
  console.log('Advanced external editor desktop passed: all seven comparison types, mode-specific picker titles/filters, native side routing, unsaved binary preservation, tab/swap isolation, embedded-session rejection, renderer path rejection, and missing files.');
 }catch(error){if(page&&!page.isClosed())console.error(await page.locator('#notice').textContent().catch(()=>''));throw error;}
 finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
