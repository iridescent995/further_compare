'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');

// The VM observes native session state without exposing a production IPC/debug API.
async function harness(t){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-open-atomic-')));
 await fs.mkdir(path.join(root,'user-data'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const dir=path.resolve(__dirname,'../desktop'),handlers=new Map();let window,ready,runtime,chosen=[],afterRead=null,beforeRead=null,beforeValidate=null;
 const helper=require('../desktop/local-file-snapshot.cjs');
 const module={exports:{}};
 const source=(await fs.readFile(path.join(dir,'window-runtime.cjs'),'utf8')).replace('return {window:mainWindow,handlers,immediateHandlers,',`return {observe:()=>JSON.parse(JSON.stringify({activeId,contexts:[...contexts.keys()],textPaths,textFormats,textInputEncodings,revisions,origins:[...remoteChildOrigins],authorities:[...dataAuthorities],roots:folders.roots},(_,v)=>typeof v==='bigint'?String(v):v)),seedOrigin:value=>remoteChildOrigins.set(activeId,value),window:mainWindow,handlers,immediateHandlers,`);
 vm.runInNewContext(source,{module,exports:module.exports,require:id=>id==='./local-file-snapshot.cjs'?{...helper,validate:async snapshot=>{if(beforeValidate)await beforeValidate(snapshot);return helper.validate(snapshot);},read:async(...args)=>{if(beforeRead)await beforeRead(args[0]);const result=await helper.read(...args);if(afterRead)await afterRead(args[0],result);return result;}}:id.startsWith('./')?require(path.join(dir,id)):require(id),__dirname:dir,console,Buffer,TextDecoder,setTimeout,clearTimeout,AbortController,URL,process});
 class Window{constructor(){window=this;this.webContents={id:1,mainFrame:{url:pathToFileURL(path.resolve(__dirname,'../dist/compare.html')).href},setWindowOpenHandler(){},on(){},send(){}};}isDestroyed(){return false;}once(){}on(){}removeListener(){}loadFile(){return Promise.resolve();}}
 const electron={app:{requestSingleInstanceLock:()=>true,whenReady:()=>({then(fn){ready=fn;return{catch(){}};}}),getPath:()=>path.join(root,'user-data'),on(){}},BrowserWindow:Window,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:chosen}),showSaveDialog:async()=>({canceled:false,filePath:chosen[0]})},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},Menu:{buildFromTemplate:x=>x,setApplicationMenu(){}},session:{defaultSession:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}}}};
 vm.runInNewContext(await fs.readFile(path.join(dir,'main.cjs'),'utf8'),{require:id=>id==='electron'?electron:id==='./window-runtime.cjs'?{createWindowRuntime:(window,shared)=>{const Original=shared.FolderAlignment;shared.FolderAlignment=class extends Original{constructor(pairs,kinds){super(pairs,kinds&&JSON.parse(JSON.stringify(kinds)));}};return runtime=module.exports.createWindowRuntime(window,shared);}}:id.startsWith('./')?require(path.join(dir,id)):require(id),__dirname:dir,process:{argv:[],env:{},platform:process.platform},console,Buffer,TextDecoder,setTimeout,clearTimeout});
 await ready();t.after(()=>runtime.dispose());
 return {root,invoke:(name,...args)=>handlers.get(name)({sender:window.webContents,senderFrame:window.webContents.mainFrame},...args),choose:(...files)=>{chosen=files;},hook:fn=>{afterRead=fn;},beforeRead:fn=>{beforeRead=fn;},beforeValidate:fn=>{beforeValidate=fn;},state:()=>runtime.observe(),seedOrigin:value=>runtime.seedOrigin(value)};
}

for(const channel of ['text:open','text:open-path','text:reload','folders:read'])test(`${channel} rejects a changed read without altering existing native paths, formats or origins`,async t=>{
 const h=await harness(t),old=path.join(h.root,'original.txt'),next=path.join(h.root,'candidate.txt');
 await fs.writeFile(old,Buffer.from([255,254,111,0,108,0,100,0]));await fs.writeFile(next,'candidate');
 await h.invoke('session:create');await h.invoke('text:open-path','a',old);
 if(channel==='folders:read'){await fs.mkdir(path.join(h.root,'input'));await fs.rename(next,path.join(h.root,'input','candidate.txt'));h.choose(path.join(h.root,'input'));await h.invoke('folders:choose','a');}
 h.seedOrigin({parentSessionId:'retained-parent',sources:{b:{saveToken:'retained-origin'}}});
 const before=h.state(),target=channel==='text:reload'?old:channel==='folders:read'?path.join(h.root,'input','candidate.txt'):next;
 h.choose(target);h.hook(async file=>{if(file===target){h.hook(null);await fs.writeFile(file,'changed after stable read');}});
 const args=channel==='text:open-path'?['a',target]:channel==='folders:read'?['a','candidate.txt']:['a'];
 await assert.rejects(h.invoke(channel,...args),/changed|again/i);
 assert.deepEqual(h.state(),before);
});

for(const channel of ['folders:open-files','folders:open-data','folders:tree-open-files','folders:tree-open-data'])test(`${channel} stages both sides before creating a context or publishing authority`,async t=>{
 const h=await harness(t),a=path.join(h.root,'left'),b=path.join(h.root,'right');await fs.mkdir(a);await fs.mkdir(b);
 const left=path.join(a,'pair.txt'),right=path.join(b,'pair.txt');await fs.writeFile(left,'left');await fs.writeFile(right,'right');
 await h.invoke('session:create');h.choose(a);await h.invoke('folders:choose','a');h.choose(b);await h.invoke('folders:choose','b');
 const old=path.join(h.root,'old.txt');await fs.writeFile(old,'retained input');await h.invoke('text:open-path','a',old);
 const listing=channel.includes('tree-')?await h.invoke('folders:tree-list','root',null):null;
 const args=listing?[listing.rows.find(row=>row.pathA==='pair.txt'||row.path==='pair.txt').id,listing.revision]:['pair.txt'];
 const before=h.state();h.hook(async file=>{if(file===right)throw Error('Injected second-side read failure');});
 await assert.rejects(h.invoke(channel,...args),/second-side/);assert.deepEqual(h.state(),before);
 h.hook(async file=>{if(file===right){h.hook(null);await fs.writeFile(left,'left changed while opening right');}});
 await assert.rejects(h.invoke(channel,...args),/changed|again/i);assert.deepEqual(h.state(),before);
});

test('data:open does not grant replacement bytes an advanced-file disk authority',async t=>{
 const h=await harness(t),old=path.join(h.root,'old.bin'),next=path.join(h.root,'next.bin');await fs.writeFile(old,'old');await fs.writeFile(next,'new');
 await h.invoke('session:create');h.choose(old);const retained=await h.invoke('data:open','a','binary');assert.ok(retained.diskToken);
 const before=h.state();h.choose(next);h.hook(async file=>{if(file===next){h.hook(null);await fs.rename(file,file+'.old');await fs.writeFile(file,'replacement');}});
 await assert.rejects(h.invoke('data:open','b','binary'),/changed|again/i);assert.deepEqual(h.state(),before);
});

test('successful local text open retains the revision belonging to the returned bytes',async t=>{
 const h=await harness(t),file=path.join(h.root,'stable.txt');await fs.writeFile(file,'stable content');await h.invoke('session:create');
 const opened=await h.invoke('text:open-path','a',file);assert.equal(opened.content,'stable content');
 assert.equal((await h.invoke('text:changes')).a,false);
 await fs.writeFile(file,'later content');assert.equal((await h.invoke('text:changes')).a,true);
 const refreshed=await h.invoke('text:reload','a');assert.equal(refreshed.content,'later content');assert.equal((await h.invoke('text:changes')).a,false);
});

test('post-save reopening rejects an identical-byte replacement without changing native ownership',async t=>{
 const h=await harness(t),old=path.join(h.root,'old.txt'),saved=path.join(h.root,'saved.txt');await fs.writeFile(old,'original');await h.invoke('session:create');await h.invoke('text:open-path','a',old);
 const before=h.state();h.choose(saved);h.beforeRead(async file=>{if(file===saved){h.beforeRead(null);const bytes=await fs.readFile(file);await fs.rename(file,file+'.actual-write');await fs.writeFile(file,bytes);}});
 await assert.rejects(h.invoke('text:save','edited text','saved.txt','a',{encoding:'utf8',bom:false,lineEnding:'lf'}),/saved file changed/i);
 assert.deepEqual(h.state(),before);assert.equal(await fs.readFile(saved,'utf8'),'edited text');
});

test('failed session restore retains origins and native state; successful restore keeps saved edited text',async t=>{
 const h=await harness(t),old=path.join(h.root,'old.txt'),next=path.join(h.root,'next.txt'),session=path.join(h.root,'saved.fcompare');await fs.writeFile(old,'old disk');await fs.writeFile(next,'new disk');
 await h.invoke('session:create');await h.invoke('text:open-path','a',old);h.seedOrigin({parentSessionId:'parent',sources:{b:{saveToken:'retain-me'}}});
 const value={version:1,type:'text-compare',name:'Saved edit',text:{a:'saved edited content',b:''},files:{a:{name:'next.txt',path:next},b:{name:'',path:''}},folders:{a:null,b:null},options:{ignoreWhitespace:false,filter:'all',direction:'a-to-b'}};
 await fs.writeFile(session,JSON.stringify(value));h.choose(session);const before=h.state();h.beforeValidate(async snapshot=>{if(snapshot.path===next){h.beforeValidate(null);await fs.writeFile(next,'changed during restore');}});
 await assert.rejects(h.invoke('session:open'),/changed|again/i);assert.deepEqual(h.state(),before);
 const opened=await h.invoke('session:open');assert.equal(opened.data.text.a,'saved edited content');assert.equal(h.state().textPaths.a,next);
});
