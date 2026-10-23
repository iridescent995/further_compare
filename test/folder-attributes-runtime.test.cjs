'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

test('native attribute previews bind selection, session, root and reviewed state', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'fc-tabs-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const left = path.join(root,'left'), right = path.join(root,'right');
  await fs.mkdir(left); await fs.mkdir(right);
  await fs.writeFile(path.join(left,'same.txt'),'left content');
  await fs.writeFile(path.join(right,'same.txt'),'right content');
  await fs.writeFile(path.join(left,'only.txt'),'only content');
  const handlers = new Map(); let window, ready, chosen, response=0;
  class Window {
    constructor() { window=this; this.webContents={mainFrame:{url:require('node:url').pathToFileURL(path.resolve(__dirname,'../dist/compare.html')).href},setWindowOpenHandler(){},on(){}}; }
    isDestroyed(){return false;} once(){} on(){} loadFile(){return Promise.resolve();}
  }
  const electron={app:{requestSingleInstanceLock:()=>true,whenReady:()=>({then(fn){ready=fn;return{catch(){}};}}),getPath:()=>root,on(){}},BrowserWindow:Window,
    dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[chosen]}),showMessageBox:async()=>({response})},
    ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},Menu:{buildFromTemplate:x=>x,setApplicationMenu(){}},
    session:{defaultSession:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}}}};
  const dir=path.resolve(__dirname,'../desktop');
  vm.runInNewContext(await fs.readFile(path.join(dir,'main.cjs'),'utf8'),{require:id=>id==='electron'?electron:id.startsWith('./')?require(path.join(dir,id)):require(id),__dirname:dir,process:{argv:[],env:{},platform:process.platform},console,Buffer,TextDecoder,setTimeout,clearTimeout});
  await ready();
  const invoke=(name,...args)=>handlers.get(name)({sender:window.webContents,senderFrame:window.webContents.mainFrame},...args);
  const folder=await invoke('session:create');chosen=left;await invoke('folders:choose','a');chosen=right;await invoke('folders:choose','b');
  await fs.chmod(path.join(left,'same.txt'),0o644);
  let listing=await invoke('folders:tree-list','root',null);
  const target=listing.rows.find(row=>row.pathA==='same.txt'||row.path==='same.txt');assert.ok(target);
  const preview=await invoke('folders:tree-attributes-preview','a',[target.id],listing.revision);
  assert.equal(preview.entries.length,1);assert.equal(preview.entries[0].mode,0o644);assert.equal(preview.entries[0].expected,undefined);
  const changes={setMask:0o100,clearMask:0};
  assert.equal((await invoke('folders:tree-attributes-execute',preview.id,changes)).cancelled,true);assert.equal((await fs.stat(path.join(left,'same.txt'))).mode&0o777,0o644);
  await assert.rejects(invoke('folders:tree-attributes-execute','foreign',changes));
  await invoke('session:create');await assert.rejects(invoke('folders:tree-attributes-execute',preview.id,changes));await invoke('session:activate',folder.id);
  response=1;assert.equal((await invoke('folders:tree-attributes-execute',preview.id,changes)).changed,1);assert.equal((await fs.stat(path.join(left,'same.txt'))).mode&0o777,0o744);
  await assert.rejects(invoke('folders:tree-attributes-execute',preview.id,changes));
  listing=await invoke('folders:tree-list','root',null);const row=listing.rows.find(row=>row.pathA==='same.txt'||row.path==='same.txt');
  const stale=await invoke('folders:tree-attributes-preview','a',[row.id],listing.revision);await fs.chmod(path.join(left,'same.txt'),0o640);await assert.rejects(invoke('folders:tree-attributes-execute',stale.id,changes),/changed/i);assert.equal((await fs.stat(path.join(left,'same.txt'))).mode&0o777,0o640);
});
