'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {readArchiveFolder,MAX_BYTES}=require('../desktop/archive-folder-import.cjs');
async function fixture(t){const base=await fs.mkdtemp(path.join(os.tmpdir(),'fc-folder-import-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));const root=path.join(base,'bundle');await fs.mkdir(root);return fs.realpath(root);}
test('folder snapshot preserves root, nested files, binary bytes, empty directories and local timestamps',async t=>{
 const root=await fixture(t);await fs.mkdir(path.join(root,'empty'));await fs.mkdir(path.join(root,'nested'));await fs.writeFile(path.join(root,'nested','zero'),'');await fs.writeFile(path.join(root,'binary'),Buffer.from([0,255,7]));const date=new Date(2025,4,6,7,8,9);await fs.utimes(path.join(root,'binary'),date,date);
 const out=await readArchiveFolder(root),byPath=new Map(out.map(e=>[e.path,e]));assert.equal(out.length,5);assert.equal(byPath.get('bundle').kind,'directory');assert.equal(byPath.get('bundle/empty').kind,'directory');assert.equal(byPath.get('bundle/nested/zero').data,'');assert.equal(byPath.get('bundle/binary').modified,'2025-05-06 07:08:09');assert.deepEqual(Buffer.from(byPath.get('bundle/binary').data,'base64'),Buffer.from([0,255,7]));assert.ok(out.every(e=>!('diskToken'in e)&&!('name'in e)));
});
test('folder snapshot rejects root and descendant symlinks',async t=>{
 const root=await fixture(t),link=root+'-link';await fs.symlink(root,link);t.after(()=>fs.rm(link,{force:true}));await assert.rejects(readArchiveFolder(link),/symbolic/);await fs.symlink(root,path.join(root,'cycle'));await assert.rejects(readArchiveFolder(root),/changed|symbolic/);
});
test('folder snapshot bounds total bytes before opening a file',async t=>{
 const root=await fixture(t),file=path.join(root,'large');await fs.writeFile(file,'');await fs.truncate(file,MAX_BYTES+1);let opens=0;await assert.rejects(readArchiveFolder(root,{io:{...fs,open:async()=>{opens++;}}}),/32 MiB/);assert.equal(opens,0);
});
test('folder enumeration stops at entry budget and closes directory',async t=>{
 const root=await fixture(t);let yielded=0,closed=false;
 const io={...fs,opendir:async()=>({async *[Symbol.asyncIterator](){for(let i=0;i<100000;i++){yielded++;yield{name:`file${i}`};}},async close(){closed=true;}})};
 await assert.rejects(readArchiveFolder(root,{io}),/5,000/);assert.equal(yielded,5000);assert.equal(closed,true);
});
test('folder snapshot rejects excessive depth without recursion',async t=>{
 const root=await fixture(t);let current=root;for(let i=0;i<129;i++){current=path.join(current,'a');await fs.mkdir(current);}await assert.rejects(readArchiveFolder(root),/128/);
});
test('folder snapshot detects an earlier file changed while reading a later file',async t=>{
 const root=await fixture(t),a=path.join(root,'a'),b=path.join(root,'b');await fs.writeFile(a,'old');await fs.writeFile(b,'b');const io={...fs,open:async(file,...args)=>{if(file===b)await fs.writeFile(a,'new data');return fs.open(file,...args);}};await assert.rejects(readArchiveFolder(root,{io}),/changed/);
});
test('folder snapshot detects changed listings before publication',async t=>{
 const root=await fixture(t),a=path.join(root,'a');await fs.writeFile(a,'old');const io={...fs,open:async(...args)=>{await fs.writeFile(path.join(root,'extra'),'x');return fs.open(...args);}};await assert.rejects(readArchiveFolder(root,{io}),/changed/);
});
test('folder snapshot rejects ancestor replacement before leaf open',async t=>{
 const root=await fixture(t),sub=path.join(root,'sub'),leaf=path.join(sub,'a');await fs.mkdir(sub);await fs.writeFile(leaf,'old');let replaced=false,opened=false;
 const io={...fs,lstat:async(file,...args)=>{const result=await fs.lstat(file,...args);if(file===leaf&&!replaced){replaced=true;await fs.rename(sub,sub+'-old');await fs.mkdir(sub);await fs.writeFile(leaf,'new');}return result;},open:async(...args)=>{opened=true;return fs.open(...args);}};
 await assert.rejects(readArchiveFolder(root,{io}),/changed/);assert.equal(opened,false);
});
test('folder snapshot closes file when session invalidates during read',async t=>{
 const root=await fixture(t);await fs.writeFile(path.join(root,'a'),'old');let invalid=false,closed=false;const io={...fs,open:async(...args)=>{const handle=await fs.open(...args);invalid=true;return{stat:(...x)=>handle.stat(...x),close:async()=>{closed=true;await handle.close();}};}};await assert.rejects(readArchiveFolder(root,{io,check(){if(invalid)throw Error('Session changed');}}),/Session changed/);assert.equal(closed,true);
});
test('folder picker is native-only, cancels cleanly and discards imports after window invalidation',async t=>{
 const root=await fixture(t),file=path.join(root,'sample.txt');await fs.writeFile(file,'sample');
 const handlers=new Map();let destroyed=false,window,ready,picker=async()=>({canceled:true,filePaths:[]}),options;
 class Window{constructor(){window=this;this.webContents={mainFrame:{url:require('node:url').pathToFileURL(path.resolve(__dirname,'../dist/compare.html')).href},setWindowOpenHandler(){},on(){}};}isDestroyed(){return destroyed;}once(){}on(){}loadFile(){return Promise.resolve();}}
 const electron={app:{requestSingleInstanceLock:()=>true,whenReady:()=>({then(fn){ready=fn;return{catch(){}};}}),getPath:()=>root,on(){}},BrowserWindow:Window,
  dialog:{showOpenDialog:async(w,opts)=>{options=opts;return picker();}},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},Menu:{buildFromTemplate:x=>x,setApplicationMenu(){}},session:{defaultSession:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}}}};
 const dir=path.resolve(__dirname,'../desktop');require('node:vm').runInNewContext(await fs.readFile(path.join(dir,'main.cjs'),'utf8'),{require:id=>id==='electron'?electron:id.startsWith('./')?require(path.join(dir,id)):require(id),__dirname:dir,process:{argv:[],env:{},platform:process.platform},console,Buffer,TextDecoder,setTimeout,clearTimeout});await ready();
 const invoke=(name,...args)=>handlers.get(name)({sender:window.webContents,senderFrame:window.webContents.mainFrame},...args);await invoke('session:create');
 assert.equal(await invoke('archive:open-folder'),null);assert.deepEqual(options.properties,['openDirectory']);assert.equal(options.title,'Add folder to archive');
 picker=async()=>({canceled:false,filePaths:[root]});const output=await invoke('archive:open-folder','ignored-renderer-path');assert.equal(output[0].path,path.basename(root));assert.equal(output[0].kind,'directory');assert.equal(output[0].diskToken,undefined);
 let release;picker=()=>new Promise(resolve=>release=resolve);const pending=invoke('archive:open-folder');while(!release)await new Promise(resolve=>setImmediate(resolve));destroyed=true;release({canceled:false,filePaths:[root]});await assert.rejects(pending,/session changed/);
});
test('folder snapshot rejects selected root replacement during file read',async t=>{
 const root=await fixture(t),file=path.join(root,'a');await fs.writeFile(file,'old');let closed=false;
 const io={...fs,open:async(...args)=>{const handle=await fs.open(...args);return{stat:(...x)=>handle.stat(...x),close:async()=>{closed=true;await handle.close();},read:async(...x)=>{const result=await handle.read(...x);if(result.bytesRead){await fs.rename(root,root+'-old');await fs.mkdir(root);await fs.writeFile(file,'new');}return result;}};}};
 await assert.rejects(readArchiveFolder(root,{io}),/changed/);assert.equal(closed,true);
});

test('archive folder snapshots retain ordinary file and directory permissions', {skip:process.platform==='win32'}, async t=>{
 const root=await fixture(t),file=path.join(root,'script.sh');await fs.writeFile(file,'echo ok');await fs.chmod(root,0o750);await fs.chmod(file,0o741);
 const records=await readArchiveFolder(root);assert.equal(records.find(e=>e.kind==='directory').permissions,0o750);assert.equal(records.find(e=>e.kind==='file').permissions,0o741);
});
