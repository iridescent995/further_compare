'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
test('macOS early activation waits for readiness and initialization; reactivation opens one window',async()=>{
 const app=new EventEmitter();let resolveReady,ready=false,created=0,windows=[],ipcReady=false,permissionsReady=false;
 app.requestSingleInstanceLock=()=>true;app.isReady=()=>ready;
 app.whenReady=()=>new Promise(resolve=>resolveReady=resolve);
 app.getPath=()=>'/private/tmp/further-lifecycle';app.exit=code=>assert.fail('Unexpected exit '+code);app.quit=()=>{};
 class Window extends EventEmitter {
  static getAllWindows(){return windows;}
  constructor(){super();assert.ok(ready,'BrowserWindow requires ready');assert.ok(permissionsReady,'initialize permissions before window creation');created++;windows.push(this);this.webContents=new EventEmitter();this.webContents.id=created;this.webContents.setWindowOpenHandler=()=>{};}
  loadFile(){assert.ok(ipcReady,'register window routes before loading renderer');return Promise.resolve();}
  isDestroyed(){return false;}
  close(){windows=windows.filter(w=>w!==this);this.emit('closed');}
 }
 const electron={app,BrowserWindow:Window,dialog:{},ipcMain:{handle(){ipcReady=true;}},Menu:{buildFromTemplate:v=>v,setApplicationMenu(){}},session:{defaultSession:{setPermissionRequestHandler(){permissionsReady=true;},setPermissionCheckHandler(){}}}};
 const dir=path.resolve(__dirname,'../desktop');
 vm.runInNewContext(fs.readFileSync(path.join(dir,'main.cjs'),'utf8'),{require:id=>id==='electron'?electron:id.startsWith('./')?require(path.join(dir,id)):require(id),__dirname:dir,process:{argv:[],env:{},platform:'darwin'},console,Buffer,TextDecoder,setTimeout,clearTimeout});
 // This event order reproduces Finder/Dock launch, unlike a CLI smoke launch.
 app.emit('activate');app.emit('activate');app.emit('second-instance',{},['app']);assert.equal(created,0);
 ready=true;resolveReady();for(let i=0;i<100&&created===0;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(created,1);
 app.emit('activate');app.emit('activate');assert.equal(created,1);
 windows[0].close();assert.equal(windows.length,0);
 app.emit('activate');app.emit('activate');assert.equal(created,2);assert.equal(windows.length,1);
});
test('a secondary process exits without initializing another application window',()=>{
 const app=new EventEmitter();let quit=0,lockData;
 app.getPath=()=>'/private/tmp/further-secondary';app.requestSingleInstanceLock=data=>{lockData=data;return false;};app.quit=()=>quit++;app.whenReady=()=>assert.fail('Secondary instance must not initialize');
 const dir=path.resolve(__dirname,'../desktop');const argv=['app','--fc-clear-left'];
 vm.runInNewContext(fs.readFileSync(path.join(dir,'main.cjs'),'utf8'),{require:id=>id==='electron'?{app}:id.startsWith('./')?require(path.join(dir,id)):require(id),__dirname:dir,process:{argv,env:{},platform:'darwin'},console,Buffer,TextDecoder,setTimeout,clearTimeout});
 assert.equal(quit,1);assert.deepEqual(lockData.shellArgs,argv);
});
