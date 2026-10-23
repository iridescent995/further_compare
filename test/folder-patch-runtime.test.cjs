'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
test('native patch previews are disposed on root mismatch and confirmation failure, retained on cancel and foreign tokens',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-patch-runtime-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const left=path.join(root,'left'),other=path.join(root,'other');await fs.mkdir(left);await fs.mkdir(other);
 const handlers=new Map(),instances=[];let window,ready,chosen=left,response=0,confirmationError=null;
 class Patch{constructor(){this.id='patch-'+instances.length;this.disposed=false;instances.push(this);}async preview(root){return {id:this.id,root,entries:[],operations:[]};}async execute(){assert.equal(this.disposed,false);return {completed:1};}async dispose(){this.disposed=true;}}
 const dir=path.resolve(__dirname,'../desktop'),runtime={exports:{}};
 vm.runInNewContext(await fs.readFile(path.join(dir,'window-runtime.cjs'),'utf8'),{module:runtime,exports:runtime.exports,require:id=>id==='./folder-patch.cjs'?{FolderPatch:Patch}:id.startsWith('./')?require(path.join(dir,id)):require(id),console,Buffer,TextDecoder,setTimeout,clearTimeout,AbortController,AbortSignal});
 class Window{constructor(){window=this;this.webContents={mainFrame:{url:require('node:url').pathToFileURL(path.resolve(__dirname,'../dist/compare.html')).href},setWindowOpenHandler(){},on(){}};}isDestroyed(){return false;}once(){}on(){}loadFile(){return Promise.resolve();}}
 const electron={app:{requestSingleInstanceLock:()=>true,whenReady:()=>({then(fn){ready=fn;return{catch(){}};}}),getPath:()=>root,on(){}},BrowserWindow:Window,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[chosen]}),showMessageBox:async()=>{if(confirmationError)throw confirmationError;return {response};}},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},Menu:{buildFromTemplate:x=>x,setApplicationMenu(){}},session:{defaultSession:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}}}};
 vm.runInNewContext(await fs.readFile(path.join(dir,'main.cjs'),'utf8'),{require:id=>id==='electron'?electron:id==='./window-runtime.cjs'?runtime.exports:id.startsWith('./')?require(path.join(dir,id)):require(id),__dirname:dir,process:{argv:[],env:{},platform:process.platform},console,Buffer,TextDecoder,setTimeout,clearTimeout,AbortController,AbortSignal});await ready();
 const invoke=(name,...args)=>handlers.get(name)({sender:window.webContents,senderFrame:window.webContents.mainFrame},...args);
 const session=await invoke('session:create');await invoke('folders:choose','a');
 let preview=await invoke('folders:patch-preview','a','patch',{});const retained=instances.at(-1);
 assert.equal((await invoke('folders:patch-execute',preview.id)).cancelled,true);assert.equal(retained.disposed,false);
 await assert.rejects(invoke('folders:patch-execute','foreign'),/changed/);assert.equal(retained.disposed,false);
 await invoke('session:create');await assert.rejects(invoke('folders:patch-execute',preview.id),/changed/);assert.equal(retained.disposed,false);await invoke('session:activate',session.id);
 chosen=other;await invoke('folders:choose','a');await assert.rejects(invoke('folders:patch-execute',preview.id),/changed/);assert.equal(retained.disposed,true);
 preview=await invoke('folders:patch-preview','a','patch',{});confirmationError=Error('Confirmation unavailable');await assert.rejects(invoke('folders:patch-execute',preview.id),/Confirmation unavailable/);assert.equal(instances.at(-1).disposed,true);confirmationError=null;
 preview=await invoke('folders:patch-preview','a','patch',{});response=1;assert.equal((await invoke('folders:patch-execute',preview.id)).completed,1);assert.equal(instances.at(-1).disposed,true);
 await assert.rejects(invoke('folders:patch-execute',preview.id),/changed/);
});
