'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {readArchiveFiles,MAX_BYTES}=require('../desktop/archive-import.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-import-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('archive imports preserve empty/binary bytes, basenames and local modification time without disk authority',async t=>{
 const root=await fixture(t),files=['empty.txt','binary.dat'].map(name=>path.join(root,name));
 await fs.writeFile(files[0],'');await fs.writeFile(files[1],Buffer.from([0,255,3]));const date=new Date(2025,4,6,7,8,9);await fs.utimes(files[1],date,date);
 const out=await readArchiveFiles(files);assert.deepEqual(out.map(x=>Object.keys(x)),Array.from({length:2},()=>['name','data','modified',...(process.platform==='win32'?[]:['permissions'])]));assert.equal(out[0].data,'');assert.equal(out[1].name,'binary.dat');assert.deepEqual(Buffer.from(out[1].data,'base64'),Buffer.from([0,255,3]));assert.equal(out[1].modified,'2025-05-06 07:08:09');
});
test('archive import rejects directories and symlinks',async t=>{
 const root=await fixture(t),file=path.join(root,'file'),link=path.join(root,'link');await fs.writeFile(file,'x');await fs.symlink(file,link);
 await assert.rejects(readArchiveFiles([root]),/regular/);await assert.rejects(readArchiveFiles([link]),/regular/);
});
test('archive import enforces aggregate byte and count limits before opening files',async t=>{
 const root=await fixture(t),a=path.join(root,'a'),b=path.join(root,'b');await fs.writeFile(a,'');await fs.truncate(a,MAX_BYTES);await fs.writeFile(b,'x');let opens=0;
 const io={...fs,open:async(...args)=>{opens++;return fs.open(...args);}};
 await assert.rejects(readArchiveFiles([a,b],{io}),/32 MiB/);assert.equal(opens,0);
 await assert.rejects(readArchiveFiles(Array(5001).fill(b),{io}),/5,000/);assert.equal(opens,0);
});
test('archive import rejects file replacement between selection and open',async t=>{
 const root=await fixture(t),file=path.join(root,'a');await fs.writeFile(file,'old');
 const io={...fs,open:async(...args)=>{await fs.rename(file,file+'.old');await fs.writeFile(file,'new');return fs.open(...args);}};
 await assert.rejects(readArchiveFiles([file],{io}),/changed/);
});
test('archive import detects mutation during reading and closes its descriptor',async t=>{
 const root=await fixture(t),file=path.join(root,'a');await fs.writeFile(file,'old');let closed=false;
 const io={...fs,open:async(...args)=>{const h=await fs.open(...args);return {stat:(...x)=>h.stat(...x),close:async()=>{closed=true;await h.close();},read:async(...x)=>{const result=await h.read(...x);await fs.writeFile(file,'longer');return result;}};}};
 await assert.rejects(readArchiveFiles([file],{io}),/changed/);assert.equal(closed,true);
});
test('archive import checks session validity during reading and closes descriptor',async t=>{
 const root=await fixture(t),file=path.join(root,'a');await fs.writeFile(file,'content');let invalid=false,closed=false;
 const io={...fs,open:async(...args)=>{const h=await fs.open(...args);invalid=true;return {stat:(...x)=>h.stat(...x),close:async()=>{closed=true;await h.close();}};}};
 await assert.rejects(readArchiveFiles([file],{io,check(){if(invalid)throw Error('Session changed');}}),/Session changed/);assert.equal(closed,true);
});
test('archive picker is native-only, cancels cleanly and discards imports after window invalidation',async t=>{
 const root=await fixture(t),file=path.join(root,'sample.txt');await fs.writeFile(file,'sample');
 const handlers=new Map();let destroyed=false,window,ready,picker=async()=>({canceled:true,filePaths:[]}),options;
 class Window{constructor(){window=this;this.webContents={mainFrame:{url:require('node:url').pathToFileURL(path.resolve(__dirname,'../dist/compare.html')).href},setWindowOpenHandler(){},on(){}};}isDestroyed(){return destroyed;}once(){}on(){}loadFile(){return Promise.resolve();}}
 const electron={app:{requestSingleInstanceLock:()=>true,whenReady:()=>({then(fn){ready=fn;return{catch(){}};}}),getPath:()=>root,on(){}},BrowserWindow:Window,
  dialog:{showOpenDialog:async(w,opts)=>{options=opts;return picker();}},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},Menu:{buildFromTemplate:x=>x,setApplicationMenu(){}},session:{defaultSession:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}}}};
 const dir=path.resolve(__dirname,'../desktop');require('node:vm').runInNewContext(await fs.readFile(path.join(dir,'main.cjs'),'utf8'),{require:id=>id==='electron'?electron:id.startsWith('./')?require(path.join(dir,id)):require(id),__dirname:dir,process:{argv:[],env:{},platform:process.platform},console,Buffer,TextDecoder,setTimeout,clearTimeout});await ready();
 const invoke=(name,...args)=>handlers.get(name)({sender:window.webContents,senderFrame:window.webContents.mainFrame},...args);await invoke('session:create');
 assert.equal(await invoke('archive:open-files'),null);assert.deepEqual(options.properties,['openFile','multiSelections']);assert.equal(options.title,'Add files to archive');
 picker=async()=>({canceled:false,filePaths:[file]});const output=await invoke('archive:open-files','ignored-renderer-path');assert.equal(output[0].name,'sample.txt');assert.equal(output[0].diskToken,undefined);
 let release;picker=()=>new Promise(resolve=>release=resolve);const pending=invoke('archive:open-files');while(!release)await new Promise(resolve=>setImmediate(resolve));destroyed=true;release({canceled:false,filePaths:[file]});await assert.rejects(pending,/session changed/);
});

test('archive import captures executable permissions without special bits', {skip:process.platform==='win32'}, async t=>{
 const root=await fixture(t),file=path.join(root,'script.sh');await fs.writeFile(file,'echo ok');await fs.chmod(file,0o2751);
 const [entry]=await readArchiveFiles([file]);assert.equal(entry.permissions,0o751);assert.equal(await fs.readFile(file,'utf8'),'echo ok');
});
test('archive import rejects permissions changed during the read', {skip:process.platform==='win32'}, async t=>{
 const root=await fixture(t),file=path.join(root,'script.sh');await fs.writeFile(file,'echo ok');await fs.chmod(file,0o700);
 const io={...fs,open:async(...args)=>{const handle=await fs.open(...args);return {stat:(...a)=>handle.stat(...a),close:()=>handle.close(),read:async(...a)=>{const result=await handle.read(...a);await fs.chmod(file,0o600);return result;}};}};
 await assert.rejects(readArchiveFiles([file],{io}),/changed/);
});
