'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

test('native tabs isolate authorized files, change baselines and folder roots', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'fc-tabs-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const left = path.join(root,'left'), right = path.join(root,'right');
  await fs.mkdir(left); await fs.mkdir(right);
  await fs.writeFile(path.join(left,'same.txt'),'left content');
  await fs.writeFile(path.join(right,'same.txt'),'right content');
  await fs.writeFile(path.join(left,'only.txt'),'only content');
  const handlers = new Map(); let window, ready, chosen;
  class Window {
    constructor() { window=this; this.webContents={mainFrame:{url:require('node:url').pathToFileURL(path.resolve(__dirname,'../dist/compare.html')).href},setWindowOpenHandler(){},on(){}}; }
    isDestroyed(){return false;} once(){} on(){} loadFile(){return Promise.resolve();}
  }
  const electron={app:{requestSingleInstanceLock:()=>true,whenReady:()=>({then(fn){ready=fn;return{catch(){}};}}),getPath:()=>root,on(){}},BrowserWindow:Window,
    dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[chosen]})},
    ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},Menu:{buildFromTemplate:x=>x,setApplicationMenu(){}},
    session:{defaultSession:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}}}};
  const dir=path.resolve(__dirname,'../desktop');
  vm.runInNewContext(await fs.readFile(path.join(dir,'main.cjs'),'utf8'),{require:id=>id==='electron'?electron:id.startsWith('./')?require(path.join(dir,id)):require(id),__dirname:dir,process:{argv:[],env:{},platform:process.platform},console,Buffer,TextDecoder,setTimeout,clearTimeout});
  await ready();
  const invoke=(name,...args)=>handlers.get(name)({sender:window.webContents,senderFrame:window.webContents.mainFrame},...args);
  const folder=await invoke('session:create');
  chosen=left; await invoke('folders:choose','a'); chosen=right; await invoke('folders:choose','b');
  const opened=await invoke('folders:open-files','same.txt');
  assert.notEqual(opened.id,folder.id);
  assert.equal(opened.a.content,'left content'); assert.equal(opened.b.content,'right content');
  assert.equal((await invoke('text:changes')).a,false);
  await fs.writeFile(path.join(left,'same.txt'),'new content on disk');
  assert.equal((await invoke('text:changes')).a,true);
  assert.equal((await invoke('text:reload','a')).content,'new content on disk');
  assert.equal((await invoke('text:changes')).a,false);
  const blank=await invoke('session:create'); assert.equal(await invoke('text:reload','a'),null);
  await invoke('session:activate',opened.id); assert.equal((await invoke('text:reload','b')).content,'right content');
  await invoke('session:activate',folder.id); assert.equal(await invoke('text:reload','a'),null);
  const only=await invoke('folders:open-files','only.txt'); assert.equal(only.a.content,'only content'); assert.equal(only.b,null);
  await invoke('session:close',only.id); await assert.rejects(invoke('session:activate',only.id),/no longer open/);
  await invoke('session:activate',folder.id); assert.equal((await invoke('folders:list','')).rows.length,2);
  await invoke('session:close',blank.id);
  await assert.rejects(invoke('folders:open-files','../escape'),/Invalid relative/);
});
