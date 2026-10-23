'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {validateSession, stageSession, readLimited, MAX_TEXT_BYTES, TYPES} = require('../desktop/sessions.cjs');
const valid = () => ({version:1,type:'text-merge',name:'Untitled',text:{a:'unsaved left',b:'right'},files:{a:{name:'',path:''},b:{name:'',path:''}},folders:{a:null,b:null},options:{ignoreWhitespace:false,filter:'all',direction:'a-to-b'}});
test('session schema preserves supported types, text snapshots, and comparison options', () => {
  for (const type of TYPES) {
    const value = valid(); value.type = type; value.options.filter = 'context';
    if(type==='folder-merge3')value.threeWay={roots:{base:null,left:null,right:null},choices:Object.create(null)};
    assert.deepEqual(validateSession(value), value);
    assert.notEqual(validateSession(value), value);
  }
});
test('session schema rejects malformed options, oversized text and relative paths', () => {
  const cases = [v => v.version = 2, v => v.type = 'script', v => v.options.filter = 'hidden',
    v => v.options.ignoreWhitespace = 'true', v => v.options.direction = 'delete',
    v => v.files.a.path = '../secret', v => v.folders.a = {name:'x',path:''},
    v => v.text.a = 'x'.repeat(MAX_TEXT_BYTES+1), v => v.text = null];
  for (const change of cases) { const value = valid(); change(value); assert.throws(() => validateSession(value)); }
});
test('opening session validates folder roots atomically and preserves unsaved snapshot', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'fc-session-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const a = path.join(root,'left'), b = path.join(root,'right');
  await fs.mkdir(a); await fs.mkdir(b);
  const source = path.join(a,'input.txt'); await fs.writeFile(source,'disk content');
  const value = valid(); value.files.a = {name:'input.txt',path:source};
  value.folders = {a:{name:'left',path:a},b:{name:'right',path:b}};
  const file = path.join(root,'test.fcompare'); await fs.writeFile(file,JSON.stringify(value));
  const staged = await stageSession(file,path.join(root,'backups'));
  assert.equal(staged.data.text.a,'unsaved left');
  assert.equal(staged.textPaths.a,await fs.realpath(source));
  assert.equal(staged.folders.roots.b,await fs.realpath(b));
  value.folders.b.path = a; await fs.writeFile(file,JSON.stringify(value));
  await assert.rejects(stageSession(file,path.join(root,'backups')), /separate/);
  assert.equal(staged.folders.roots.b,await fs.realpath(b));
});
test('bounded UTF-8 reads reject binary encoding, oversized input and directories',async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'fc-read-')); t.after(() => fs.rm(root,{recursive:true,force:true}));
  const file = path.join(root,'text');
  await fs.writeFile(file,'hello'); assert.equal(await readLimited(file,5),'hello');
  await assert.rejects(readLimited(file,4),/too large/);
  await fs.writeFile(file,Buffer.from([0xff])); await assert.rejects(readLimited(file,5));
  await assert.rejects(readLimited(root,5));
});
test('native file reload uses authorized paths and reset clears them', async t => {
  const vm = require('node:vm');
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'fc-ipc-')); t.after(() => fs.rm(root,{recursive:true,force:true}));
  const input = path.join(root,'input.txt'); await fs.writeFile(input,'first');
  const handlers = new Map(), windowEvents = new Map(); let window, ready, closeResponse = 0, failRename = false;
  class Window {
    constructor() { window = this; this.webContents = {mainFrame:{url:require('node:url').pathToFileURL(path.resolve(__dirname,'../dist/compare.html')).href},setWindowOpenHandler(){},on(name,fn){windowEvents.set(name,fn);}}; }
    isDestroyed() { return false; } once() {} on() {} loadFile() { return Promise.resolve(); }
  }
  const electron = {
    app:{requestSingleInstanceLock:()=>true,whenReady:()=>({then(fn){ready=fn;return {catch(){}};}}),getPath:()=>root,on(){},setPath(){}},BrowserWindow:Window,
    dialog:{showMessageBoxSync:()=>closeResponse,showOpenDialog:async()=>({canceled:false,filePaths:[input]}),showSaveDialog:async()=>({canceled:false,filePath:path.join(root,'saved.fcompare')})},
    ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},
    Menu:{buildFromTemplate:x=>x,setApplicationMenu(){}},
    session:{defaultSession:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}}}
  };
  const source = await fs.readFile(path.resolve(__dirname,'../desktop/main.cjs'),'utf8');
  const lockModule={exports:{}};
  vm.runInNewContext(await fs.readFile(path.resolve(__dirname,'../desktop/session-locks.cjs'),'utf8'),{module:lockModule,require:id=>id==='node:fs/promises'?{...fs,rename:async(...args)=>{if(failRename)throw new Error('rename failure');return fs.rename(...args);}}:id.startsWith('./')?require(path.resolve(__dirname,'../desktop',id)):require(id),Buffer});
  vm.runInNewContext(source,{require:id=>id==='./session-locks.cjs'?lockModule.exports:id==='electron'?electron:id==='node:fs/promises'?{...fs,rename:async(...args)=>{if(failRename) throw new Error('rename failure'); return fs.rename(...args);}}:id.startsWith('./')?require(path.resolve(__dirname,'../desktop',id)):require(id),__dirname:path.resolve(__dirname,'../desktop'),process:{argv:[],env:{},platform:process.platform},console,Buffer,TextDecoder,setTimeout,clearTimeout});
  await ready();
  let allowedClose = false;
  windowEvents.get('will-prevent-unload')({preventDefault(){allowedClose = true;}});
  assert.equal(allowedClose,false);
  closeResponse = 1;
  windowEvents.get('will-prevent-unload')({preventDefault(){allowedClose = true;}});
  assert.equal(allowedClose,true);
  const invoke = (name,...args) => handlers.get(name)({sender:window.webContents,senderFrame:window.webContents.mainFrame},...args);
  assert.equal(await invoke('text:reload','a'),null);
  const opened = await invoke('text:open','a'); assert.equal(opened.content,'first');
  const snapshot = valid();
  snapshot.files.a = {name:'input.txt',path:opened.path};
  await invoke('session:save',snapshot);
  assert.equal(JSON.parse(await fs.readFile(path.join(root,'saved.fcompare'),'utf8')).files.a.path,opened.path);
  const priorSession = await fs.readFile(path.join(root,'saved.fcompare'),'utf8');
  failRename = true;
  await assert.rejects(invoke('session:save',snapshot),/rename failure/);
  failRename = false;
  assert.equal(await fs.readFile(path.join(root,'saved.fcompare'),'utf8'),priorSession);
  assert.equal((await fs.readdir(root)).some(name=>name.endsWith('.tmp')),false);
  snapshot.files.a.path = '';
  await invoke('session:save',snapshot);
  assert.equal(JSON.parse(await fs.readFile(path.join(root,'saved.fcompare'),'utf8')).files.a.path,'');
  snapshot.files.a.path = path.join(root,'unapproved.txt');
  await invoke('session:save',snapshot);
  assert.equal(JSON.parse(await fs.readFile(path.join(root,'saved.fcompare'),'utf8')).files.a.path,'');
  await fs.writeFile(input,'second'); assert.equal((await invoke('text:reload','a')).content,'second');
  await invoke('session:swap'); assert.equal(await invoke('text:reload','a'),null);
  assert.equal((await invoke('text:reload','b')).path,await fs.realpath(input));
  await invoke('session:reset'); assert.equal(await invoke('text:reload','b'),null);
  await fs.writeFile(input,'binary\0content');
  await assert.rejects(invoke('text:open','a'),/Binary files/);
  assert.equal(await invoke('text:reload','a'),null);
  await assert.rejects(invoke('text:reload','invalid'),/valid folder side/);
  assert.throws(()=>handlers.get('text:open')({sender:{},senderFrame:{}},'a'),/application window/);
  const data = await invoke('data:open','base','binary');
  assert.equal(Buffer.from(data.data,'base64').toString(),'binary\0content');
  assert.equal(await invoke('text:reload','a'),null, 'generic data inputs do not grant text-path authority');
  await assert.rejects(invoke('data:open','untrusted','binary'), /Invalid/);
  await assert.rejects(invoke('data:save','non-base64','output'), /base64/);
  await invoke('data:save','AAEC','output.bin');
  assert.deepEqual(await fs.readFile(path.join(root,'saved.fcompare')),Buffer.from([0,1,2]));
  failRename = true;
  await assert.rejects(invoke('data:save','AwQF','output.bin'), /rename failure/);
  assert.deepEqual(await fs.readFile(path.join(root,'saved.fcompare')),Buffer.from([0,1,2]));
  assert.equal((await fs.readdir(root)).some(name=>name.endsWith('.tmp')),false);
  failRename = false;
  const {encodeText} = require('../src/text-codec.cjs');
  const sourceFormat = {encoding:'utf16be',bom:true,lineEnding:'mixed'};
  const raw = 'left Ω\r\nsecond\nthird\r';
  const encoded = Buffer.from(encodeText(raw,sourceFormat));
  await fs.writeFile(input,encoded);
  const unicode = await invoke('text:open','a');
  assert.equal(unicode.content,raw); assert.deepEqual({...unicode.format},sourceFormat);
  await invoke('text:save',raw,'roundtrip.txt','a');
  assert.deepEqual(await fs.readFile(path.join(root,'saved.fcompare')),encoded);
  const output = await invoke('text:save',raw,'converted.txt','a',{encoding:'utf8',bom:false,lineEnding:'lf'});
  assert.equal(await fs.readFile(path.join(root,'saved.fcompare'),'utf8'),'left Ω\nsecond\nthird\n');
  assert.equal(output.format.encoding,'utf8');assert.equal(output.format.lineEnding,'lf');
  await assert.rejects(invoke('text:save','€','lossy.txt','a',{encoding:'latin1',bom:false,lineEnding:'none'}),/data loss/);
  await fs.writeFile(input,Buffer.from([0x80,0xe9]));
  const legacy=await invoke('text:open','a','windows1252');assert.equal(legacy.content,'€é');
  assert.equal((await invoke('text:reload','a')).content,'€é');
  // The shared dialog fixture used this path for binary/text exports. Remove that
  // unrelated output before exercising session saves, which now reject non-session destinations.
  await fs.unlink(path.join(root,'saved.fcompare'));
  for (const sourceEncoding of ['utf16be','windows1252']) {
    const sourceText = sourceEncoding === 'utf16be' ? 'Ω\r\nsource' : '€é\r\nsource';
    const sourceBytes = encodeText(sourceText,{encoding:sourceEncoding,bom:sourceEncoding==='utf16be',lineEnding:'crlf'});
    await fs.writeFile(input,sourceBytes);
    electron.dialog.showOpenDialog = async () => ({canceled:false,filePaths:[input]});
    const sourceOpened = await invoke('text:open','a',sourceEncoding);
    const changedOutput = valid();changedOutput.text.a = sourceText;changedOutput.files.a = {name:'input.txt',path:sourceOpened.path};
    changedOutput.options.textFormats = {a:{encoding:'utf8',bom:false,lineEnding:'lf'},b:{encoding:'utf8',bom:false,lineEnding:'none'}};
    changedOutput.options.textInputEncodings = {a:'utf8',b:'auto'}; // Native provenance must override renderer claims.
    await invoke('session:save',changedOutput);
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'saved.fcompare'),'utf8')).options.textInputEncodings.a,sourceEncoding);
    electron.dialog.showOpenDialog = async () => ({canceled:false,filePaths:[path.join(root,'saved.fcompare')]});
    await invoke('session:open');
    assert.equal((await invoke('text:reload','a')).content,sourceText);
    assert.deepEqual(await fs.readFile(input),Buffer.from(sourceBytes));
  }
  if (process.platform !== 'win32') {
    const executable = path.join(root,'script.sh');await fs.writeFile(executable,'original',{mode:0o755});
    electron.dialog.showSaveDialog = async () => ({canceled:false,filePath:executable});
    await invoke('text:save','updated','script.sh','a',{encoding:'utf8',bom:false,lineEnding:'none'});
    assert.equal((await fs.stat(executable)).mode & 0o777,0o755);
    const link=path.join(root,'save-link');await fs.symlink(executable,link);
    electron.dialog.showSaveDialog = async () => ({canceled:false,filePath:link});
    await assert.rejects(invoke('text:save','do not redirect','script.sh','a',{encoding:'utf8',bom:false,lineEnding:'none'}),/symbolic links/);
    assert.equal(await fs.readFile(executable,'utf8'),'updated');
  }
  const folderA = path.join(root,'data-left'), folderB = path.join(root,'data-right');
  await fs.mkdir(folderA); await fs.mkdir(folderB);
  await fs.writeFile(path.join(folderA,'picture.bin'),Buffer.from([0,255,1]));
  await invoke('session:create');
  electron.dialog.showOpenDialog = async () => ({canceled:false,filePaths:[folderA]});
  await invoke('folders:choose','a');
  electron.dialog.showOpenDialog = async () => ({canceled:false,filePaths:[folderB]});
  await invoke('folders:choose','b');
  const snapshotA = path.join(root,'left.fcsnapshot'), snapshotB = path.join(root,'right.fcsnapshot');
  electron.dialog.showSaveDialog = async () => ({canceled:false,filePath:snapshotA});
  assert.equal((await invoke('folders:save-snapshot','a')).cancelled,false);
  electron.dialog.showSaveDialog = async () => ({canceled:false,filePath:snapshotB});
  await invoke('folders:save-snapshot','b');
  electron.dialog.showOpenDialog = async () => ({canceled:false,filePaths:[snapshotA,snapshotB]});
  const snapshotResult = await invoke('folders:compare-snapshots');
  assert.equal(snapshotResult.equal,false);
  assert.equal(snapshotResult.rows.find(row=>row.path==='picture.bin').status,'left');
  assert.equal(snapshotResult.leftName,'left.fcsnapshot');
  electron.dialog.showOpenDialog = async () => ({canceled:false,filePaths:[snapshotA]});
  await assert.rejects(invoke('folders:compare-snapshots'),/exactly two/);
  electron.dialog.showOpenDialog = async () => ({canceled:true,filePaths:[]});
  assert.equal(await invoke('folders:compare-snapshots'),null);
  await fs.symlink(input,path.join(folderA,'link'));
  await assert.rejects(invoke('folders:open-data','link'), /Symbolic/);
  assert.ok((await invoke('folders:list','')).rows.some(row => row.name === 'picture.bin'), 'failed read preserves folder context');
  const folderData = await invoke('folders:open-data','picture.bin');
  assert.equal(typeof folderData.id,'string');
  assert.deepEqual(Buffer.from(folderData.a.data,'base64'),Buffer.from([0,255,1]));
  assert.equal(folderData.b,null);
  assert.equal(await invoke('text:reload','a'),null);
});

test('advanced sessions preserve typed inputs and JSON options without granting paths', () => {
  const value = valid(); value.type = 'binary-compare';
  value.advanced = {inputs:{a:{name:'binary',data:'AAEC',path:'/untrusted'},b:null,base:null},options:{offset:3,nested:[true,null]},output:'result'};
  const result = validateSession(value);
  assert.deepEqual(result.advanced,{inputs:{a:{name:'binary',data:'AAEC'},b:null,base:null},options:{offset:3,nested:[true,null]},output:'result'});
  for (const data of ['Zg','Zh==','Zg==\n','@@==']) {
    value.advanced.inputs.a.data = data;
    assert.throws(() => validateSession(value), /base64/);
  }
  value.advanced.inputs.a.data = '';
  value.advanced.options = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(() => validateSession(value), /option/);
});

test('binary reads and canonical base64 decoding enforce limits', async t => {
  const {readDataLimited,decodeData} = require('../desktop/sessions.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'fc-data-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const file = path.join(root,'binary');
  const bytes = Buffer.from([0,255,128,42]);
  await fs.writeFile(file,bytes);
  assert.deepEqual(await readDataLimited(file,4),bytes);
  assert.deepEqual(decodeData(bytes.toString('base64'),4),bytes);
  await assert.rejects(readDataLimited(file,3), /too large/);
  await assert.rejects(readDataLimited(root), /regular/);
  assert.throws(() => decodeData(bytes.toString('base64'),3), /oversized/);
});

test('folder masks and text tools persist with validated bookmark state', () => {
  const value = valid();
  Object.assign(value.options,{folderInclude:'*.js;*.ts',folderExclude:'build/**',textTools:{side:'b',query:'find',replacement:'replace',matchCase:false,wrap:true,whitespace:true,bookmarks:{a:[3,1,3],b:[]}}});
  const output = validateSession(value);
  assert.equal(output.options.folderInclude,'*.js;*.ts');
  assert.deepEqual(output.options.textTools.bookmarks.a,[1,3]);
  assert.equal(output.options.textTools.regex,false);
  value.options.textTools.regex=true;assert.equal(validateSession(value).options.textTools.regex,true);
  value.options.textTools.regex='true';assert.throws(()=>validateSession(value),/pattern search/);
  value.options.textTools.regex=false;
  value.options.textTools.bookmarks.a=[-1];
  assert.throws(()=>validateSession(value),/bookmarks/);
  value.options.textTools.bookmarks.a=[];
  value.options.folderExclude='x'.repeat(4097);
  assert.throws(()=>validateSession(value),/folder filter/);
});

test('folder view persists only supported ordering and layout settings',()=>{
 const value=valid();value.options.folderView={mode:'flat',sort:'modified-right',descending:true,extra:'discard'};
 assert.deepEqual(validateSession(value).options.folderView,{mode:'flat',sort:'modified-right',descending:true});
 value.options.folderView.mode='recursive';assert.equal(validateSession(value).options.folderView.mode,'recursive');
 value.options.folderView.sort='not-a-sort';assert.throws(()=>validateSession(value),/folder view/);
});

test('text encoding and line-ending choices persist in session schema',()=>{
 const value=valid();value.options.textFormats={a:{encoding:'utf16be',bom:true,lineEnding:'mixed'},b:{encoding:'windows1252',bom:false,lineEnding:'crlf'}};
 assert.deepEqual(validateSession(value).options.textFormats,value.options.textFormats);
 value.options.textFormats.b.bom=true;assert.throws(()=>validateSession(value),/BOM/);
});

test('source decoding metadata is validated independently from desired output formats',()=>{
 const value=valid();value.options.textInputEncodings={a:'windows1252',b:'auto'};
 value.options.textFormats={a:{encoding:'utf8',bom:false,lineEnding:'lf'},b:{encoding:'utf16be',bom:true,lineEnding:'none'}};
 const parsed=validateSession(value);assert.deepEqual(parsed.options.textInputEncodings,value.options.textInputEncodings);
 value.options.textInputEncodings.a='utf7';assert.throws(()=>validateSession(value),/source text encoding/);
});
test('ignore case session option is optional, boolean, and preserves explicit false',async t=>{
  assert.equal(Object.hasOwn(validateSession(valid()).options,'ignoreCase'),false);
  for(const value of [true,false]){const session=valid();session.options.ignoreCase=value;assert.equal(validateSession(session).options.ignoreCase,value);}
  for(const value of ['true',1,0,null,{},[]]){const session=valid();session.options.ignoreCase=value;assert.throws(()=>validateSession(session),/ignore case/);}
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-case-session-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const session=valid();session.options.ignoreCase=true;const file=path.join(root,'case.fcompare');await fs.writeFile(file,JSON.stringify(session));
  assert.equal((await stageSession(file,path.join(root,'backups'))).data.options.ignoreCase,true);
});

test('workbook comparison modes persist and reject unknown modes without changing legacy options', () => {
 const value=valid();value.type='table-compare';value.advanced={inputs:{a:null,b:null,base:null},options:{}};
 assert.deepEqual(validateSession(value).advanced.options,{});
 for(const mode of ['values','formulas']){value.advanced.options.workbookMode=mode;assert.equal(validateSession(value).advanced.options.workbookMode,mode);}
 for(const mode of [null,true,'script',{},[]]){value.advanced.options.workbookMode=mode;assert.throws(()=>validateSession(value),/workbook comparison/);}
});

test('workbook formatting option is optional and boolean in saved sessions', () => {
 const value=valid();value.type='table-compare';value.advanced={inputs:{a:null,b:null,base:null},options:{}};
 assert.deepEqual(validateSession(value).advanced.options,{});
 for(const enabled of [false,true]){value.advanced.options.compareFormatting=enabled;assert.equal(validateSession(value).advanced.options.compareFormatting,enabled);}
 for(const enabled of [null,'true',1,{},[]]){value.advanced.options.compareFormatting=enabled;assert.throws(()=>validateSession(value),/workbook formatting/);}
});

test('workbook layout option preserves enabled and disabled settings with legacy omission', () => {
 const value=valid();value.type='table-compare';value.advanced={inputs:{a:null,b:null,base:null},options:{}};
 assert.deepEqual(validateSession(value).advanced.options,{});
 for(const enabled of [false,true]){value.advanced.options.compareLayout=enabled;assert.equal(validateSession(value).advanced.options.compareLayout,enabled);}
 for(const enabled of [null,'true',1,{},[]]){value.advanced.options.compareLayout=enabled;assert.throws(()=>validateSession(value),/workbook layout/);}
});

test('folder alignment descriptors canonicalize nested pairs and round-trip only in folder sessions',()=>{
 const pairs=[{a:'old/file',b:'new/renamed',kind:'file'},{a:'old',b:'new',kind:'directory'}];
 for(const type of ['folder-compare','folder-merge','folder-sync']) {
  const value=valid();value.type=type;value.options.folderAlignment=pairs;
  const result=validateSession(value);assert.deepEqual(result.options.folderAlignment,[pairs[1],pairs[0]]);
  assert.deepEqual(validateSession(JSON.parse(JSON.stringify(result))),result);
 }
 const value=valid();value.options.folderAlignment=pairs;assert.throws(()=>validateSession(value),/folder session/);
 value.options.folderAlignment=[];assert.deepEqual(validateSession(value).options.folderAlignment,[]);
 assert.equal(Object.hasOwn(validateSession(valid()).options,'folderAlignment'),false);
});
test('saved folder alignments reject malformed pairs, traversal and incompatible ancestry',()=>{
 const value=valid();value.type='folder-compare';
 for(const pairs of [null,{},[{a:'../escape',b:'target',kind:'file'}],[{a:'one',b:'/absolute',kind:'file'}],[{a:'one',b:'target',kind:'symlink'}],[{a:'one',b:'target',kind:'file'},{a:'one',b:'other',kind:'file'}],[{a:'one',b:'target',kind:'directory'},{a:'one/child',b:'other',kind:'file'}]]) {
  value.options.folderAlignment=pairs;assert.throws(()=>validateSession(value));
 }
});
test('staging folder alignments preserves missing endpoints but rejects unsafe or changed types',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-session-pairs-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const a=path.join(root,'left'),b=path.join(root,'right');await fs.mkdir(a);await fs.mkdir(b);
 await fs.mkdir(path.join(a,'old'));await fs.mkdir(path.join(b,'new'));await fs.writeFile(path.join(a,'old/file'),'left');
 const value=valid();value.type='folder-compare';value.folders={a:{name:'left',path:a},b:{name:'right',path:b}};
 value.options.folderAlignment=[{a:'old',b:'new',kind:'directory'},{a:'old/file',b:'new/renamed',kind:'file'}];
 const file=path.join(root,'pairs.fcompare'),backup=path.join(root,'backups');
 const stage=async()=>{await fs.writeFile(file,JSON.stringify(value));return stageSession(file,backup);};
 const staged=await stage();assert.deepEqual(staged.data.options.folderAlignment,value.options.folderAlignment);assert.equal(staged.folders.roots.a,a);
 await fs.writeFile(path.join(b,'new/renamed'),'right');assert.deepEqual((await stage()).data.options.folderAlignment,value.options.folderAlignment);
 await fs.unlink(path.join(b,'new/renamed'));await fs.mkdir(path.join(b,'new/renamed'));await assert.rejects(stage(),/changed type/);await fs.rmdir(path.join(b,'new/renamed'));
 const original=value.options.folderAlignment;
 value.options.folderAlignment=[{a:'.git/config',b:'absent',kind:'file'}];await assert.rejects(stage(),/excluded/);
 value.options.folderAlignment=original;
 try {await fs.symlink(path.join(a,'old/file'),path.join(b,'new/renamed'));} catch(error) {if(!['EPERM','EACCES'].includes(error.code))throw error;return;}
 await assert.rejects(stage(),/Symbolic/);await fs.unlink(path.join(b,'new/renamed'));
 await fs.rmdir(path.join(b,'new'));await fs.symlink(path.join(a,'old'),path.join(b,'new'));await assert.rejects(stage(),/Symbolic/);
});
test('staging alignment rejects missing roots and allows a missing child below a non-directory',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-session-missing-pairs-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const a=path.join(root,'a'),b=path.join(root,'b');await fs.mkdir(a);await fs.mkdir(b);await fs.writeFile(path.join(b,'parent'),'file');
 const value=valid();value.type='folder-sync';value.options.folderAlignment=[{a:'missing',b:'parent/missing',kind:'file'}];
 const file=path.join(root,'saved.fcompare');await fs.writeFile(file,JSON.stringify(value));await assert.rejects(stageSession(file,path.join(root,'backups')),/both folder roots/);
 value.folders={a:{name:'a',path:a},b:{name:'b',path:b}};await fs.writeFile(file,JSON.stringify(value));
 assert.deepEqual((await stageSession(file,path.join(root,'backups'))).data.options.folderAlignment,value.options.folderAlignment);
});

test('minor difference display persists explicit true and false while legacy sessions omit it',async t=>{
  assert.equal(Object.hasOwn(validateSession(valid()).options,'showMinor'),false);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-minor-session-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(const value of [true,false]){
    const session=valid();session.options.showMinor=value;
    session.options.ignoreWhitespace=true;session.options.ignoreCase=true;
    assert.equal(validateSession(session).options.showMinor,value);
    const file=path.join(root,`minor-${value}.fcompare`);
    await fs.writeFile(file,JSON.stringify(validateSession(session)));
    const staged=await stageSession(file,path.join(root,'backups'));
    assert.equal(staged.data.options.showMinor,value);
    assert.deepEqual(staged.data.text,session.text);
    assert.equal(staged.data.options.ignoreWhitespace,true);
    assert.equal(staged.data.options.ignoreCase,true);
  }
});

test('minor difference display rejects nonboolean session values',()=>{
  for(const value of ['true','false',1,0,null,{},[]]){
    const session=valid();session.options.showMinor=value;
    assert.throws(()=>validateSession(session),/minor difference display/);
  }
});

test('whitespace scope remains optional and stages both supported choices without changing text',async t=>{
  assert.equal(Object.hasOwn(validateSession(valid()).options,'whitespaceScope'),false);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-whitespace-session-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(const scope of ['all','horizontal']){
    const session=valid();session.options.whitespaceScope=scope;
    session.options.ignoreWhitespace=true;session.options.showMinor=true;
    session.text={a:'a \tb\nc\u00a0d',b:'ab\ncd'};
    const normalized=validateSession(session);
    assert.equal(normalized.options.whitespaceScope,scope);
    const file=path.join(root,`${scope}.fcompare`);
    await fs.writeFile(file,JSON.stringify(normalized));
    const staged=await stageSession(file,path.join(root,'backups'));
    assert.equal(staged.data.options.whitespaceScope,scope);
    assert.equal(staged.data.options.ignoreWhitespace,true);
    assert.equal(staged.data.options.showMinor,true);
    assert.deepEqual(staged.data.text,session.text);
  }
});

test('whitespace scope session validation rejects unsupported strings and nonstring types',()=>{
  for(const scope of ['', 'ALL', 'spaces', 'vertical', true, false, 1, 0, null, {}, []]){
    const session=valid();session.options.whitespaceScope=scope;
    assert.throws(()=>validateSession(session),/whitespace comparison scope/);
  }
});


test('three-way folder sessions stage fresh native authority without trusting cached scans',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-threeway-session-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const value=valid();value.type='folder-merge3';value.threeWay={roots:{},choices:{'item.txt':'left'},revision:'forged',rows:[{path:'item.txt',status:'unchanged'}]};
 for(const side of ['base','left','right']){const dir=path.join(root,side);await fs.mkdir(dir);await fs.writeFile(path.join(dir,'item.txt'),side);value.threeWay.roots[side]={name:side,path:dir};}
 const output=path.join(root,'output');await fs.mkdir(output);value.threeWay.output={name:'output',path:output};
 const file=path.join(root,'review.fcompare');await fs.writeFile(file,JSON.stringify(value));
 const staged=await stageSession(file,path.join(root,'backups'));
 assert.equal(staged.threeWay.output.path,output);assert.equal(staged.data.threeWay.output.path,output);
 assert.equal(staged.data.threeWay.revision,undefined);assert.equal(staged.data.threeWay.rows,undefined);
 await assert.rejects(()=>staged.threeWay.resolve({'item.txt':'left'},'forged'),/analysis changed/);
 const scan=await staged.threeWay.analyze();assert.equal(scan.rows[0].status,'conflict');
 assert.equal((await staged.threeWay.resolve({'item.txt':'left'},scan.revision)).entries[0].sourceSide,'left');
 value.threeWay.output.path=value.threeWay.roots.base.path;await fs.writeFile(file,JSON.stringify(value));await assert.rejects(()=>stageSession(file,path.join(root,'backups')),/separate/);value.threeWay.output.path=output;
 value.threeWay.roots.left.path=path.join(root,'absent');await fs.writeFile(file,JSON.stringify(value));
 await assert.rejects(()=>stageSession(file,path.join(root,'backups')));
 assert.equal((await staged.threeWay.analyze()).rows[0].status,'conflict');
});
test('three-way saved review rejects malformed paths and decisions',()=>{
 const value=valid();value.type='folder-merge3';value.threeWay={roots:{base:null,left:null,right:null},choices:{}};
 for(const choices of [{'../escape':'left'},{'/absolute':'right'},{'file':'delete'},{'a\\b':'base'}])assert.throws(()=>validateSession({...value,threeWay:{...value.threeWay,choices}}),/choice/);
 assert.throws(()=>validateSession({...value,type:'text-compare'}),/requires/);
 assert.throws(()=>validateSession({...value,threeWay:{roots:{base:{name:'relative',path:'relative'},left:null,right:null},choices:{}}}),/path/);
});

test('folder path search persists with bounded validated text and legacy omission',()=>{
 const value=valid();assert.equal(validateSession(value).options.folderSearch,undefined);
 value.options.folderSearch='src/こんにちは';assert.equal(validateSession(value).options.folderSearch,'src/こんにちは');
 value.options.folderSearch='';assert.equal(validateSession(value).options.folderSearch,'');
 value.options.folderSearch='x'.repeat(4096);assert.equal(validateSession(value).options.folderSearch.length,4096);
 for(const invalid of [false,42,null,{},'x'.repeat(4097),'a\0b']){value.options.folderSearch=invalid;assert.throws(()=>validateSession(value),/folder filter/);}
});

test('one-sided display filters are persisted only for two-way folder sessions',()=>{
 for(const filter of require('../desktop/folder-display.cjs').FOLDER_FILTER_IDS){
  for(const type of ['folder-compare','folder-merge','folder-sync']){const value=valid();value.type=type;value.options.filter=filter;assert.equal(validateSession(value).options.filter,filter);}
  const text=valid();text.options.filter=filter;assert.throws(()=>validateSession(text),/Invalid session options/);
 }
});

test('folder visibility preference validates and round trips independently of other view options',()=>{const value=valid();value.options.folderView={mode:'tree',sort:'name',descending:false,alwaysShowFolders:true};assert.equal(validateSession(value).options.folderView.alwaysShowFolders,true);value.options.folderView.alwaysShowFolders=false;assert.equal(validateSession(value).options.folderView.alwaysShowFolders,false);for(const bad of ['yes',1,null,{}]){value.options.folderView.alwaysShowFolders=bad;assert.throws(()=>validateSession(value),/folder visibility/);}});

test('folder color legend visibility validates and round trips',()=>{const value=valid();value.options.folderView={mode:'tree',sort:'name',descending:false,hideLegend:true};assert.equal(validateSession(value).options.folderView.hideLegend,true);value.options.folderView.hideLegend=false;assert.equal(validateSession(value).options.folderView.hideLegend,false);for(const bad of [null,'false',1,{},[]]){value.options.folderView.hideLegend=bad;assert.throws(()=>validateSession(value),/legend visibility/);}});

test('sync methods round trip and legacy sessions retain omitted default',()=>{
 const value=valid();value.type='folder-sync';
 assert.equal(validateSession(value).options.folderSyncMode,undefined);
 for(const mode of ['mirror','update','update-both']){value.options.folderSyncMode=mode;assert.equal(validateSession(value).options.folderSyncMode,mode);}
 for(const mode of ['delete',null,{},true]){value.options.folderSyncMode=mode;assert.throws(()=>validateSession(value));}
 value.options.folderSyncMode='update';value.type='folder-compare';assert.throws(()=>validateSession(value));
});

test('saved session lock validates optional boolean and preserves legacy omission',()=>{
 const value=valid();assert.equal(validateSession(value).locked,undefined);
 for(const locked of [true,false]){value.locked=locked;assert.equal(validateSession(value).locked,locked);}
 for(const locked of [null,'true',1,{}]){value.locked=locked;assert.throws(()=>validateSession(value));}
});

test('filename matching mode persists without generated alignment descriptors',()=>{const value=valid();value.type='folder-compare';value.options.folderView={mode:'filename',sort:'name',descending:false};value.options.folderAlignment=[];const out=validateSession(value);assert.equal(out.options.folderView.mode,'filename');assert.deepEqual(out.options.folderAlignment,[]);});

test('requested read encodings persist separately from native provenance and output formats',()=>{
 const value=valid();value.options.readEncodings={a:'windows1250',b:'auto'};value.options.textInputEncodings={a:'windows1253',b:'utf8'};value.options.textFormats={a:{encoding:'utf8',bom:false,lineEnding:'none'},b:{encoding:'utf16le',bom:true,lineEnding:'crlf'}};
 const parsed=validateSession(value);assert.deepEqual(parsed.options.readEncodings,value.options.readEncodings);assert.notEqual(parsed.options.readEncodings,value.options.readEncodings);assert.deepEqual(parsed.options.textInputEncodings,value.options.textInputEncodings);assert.deepEqual(parsed.options.textFormats,value.options.textFormats);
 assert.equal(validateSession(valid()).options.readEncodings,undefined);
 for(const bad of [null,[],{}, {a:'auto'}, {a:'auto',b:'bad'}, {a:1250,b:'auto'}, {a:'auto',b:'auto',extra:'auto'}]){value.options.readEncodings=bad;assert.throws(()=>validateSession(value),/requested read encodings/);}
 for(const encoding of require('../src/text-codec.cjs').ENCODINGS){value.options.readEncodings={a:encoding,b:'auto'};assert.deepEqual(validateSession(value).options.readEncodings,value.options.readEncodings);}
});

test('folder filename policy is separate from manual pairs and validates boolean choices',()=>{
 const value=valid();value.type='folder-compare';value.options.folderNameRules={ignoreCase:true,normalizeUnicode:false};
 assert.deepEqual(validateSession(value).options.folderNameRules,{ignoreCase:true});
 assert.equal(validateSession(value).options.folderAlignment,undefined);
 for(const bad of [null,[],{ignoreCase:'yes'},{normalizeUnicode:1},{unknown:true}]){value.options.folderNameRules=bad;assert.throws(()=>validateSession(value),/filename matching/);}
 value.options.folderNameRules={};value.type='text-compare';assert.throws(()=>validateSession(value),/requires a folder session/);
});

test('precise whitespace scopes survive text sessions and folder comparison rules',()=>{
 for(const scope of require('../src/text-whitespace.cjs').WHITESPACE_SCOPES){
  const session=valid();session.options.whitespaceScope=scope;
  assert.equal(validateSession(session).options.whitespaceScope,scope);
  session.type='folder-compare';session.options.folderRules={mode:'text-whitespace',textWhitespaceScope:scope};
  assert.equal(validateSession(session).options.folderRules.textWhitespaceScope,scope==='horizontal'?undefined:scope);
 }
});

test('blank line comparison is optional, strict, and retained by text and folder sessions',()=>{
 const text=valid();text.options.ignoreBlankLines=true;assert.equal(validateSession(text).options.ignoreBlankLines,true);
 text.options.ignoreBlankLines=false;assert.equal(validateSession(text).options.ignoreBlankLines,undefined);
 text.options.ignoreBlankLines='yes';assert.throws(()=>validateSession(text),/blank/i);
 const folder=valid();folder.type='folder-compare';folder.options.folderRules={mode:'text-content',ignoreBlankLines:true};assert.equal(validateSession(folder).options.folderRules.ignoreBlankLines,true);
});

test('ignored text rules persist as bounded structural data without compiling regex on main thread',()=>{
 const session=valid();session.options.ignoredTextPatterns=[{pattern:'['}];assert.deepEqual(validateSession(session).options.ignoredTextPatterns,[{pattern:'[',matchCase:true}]);
 session.options.ignoredTextPatterns=[];assert.equal(validateSession(session).options.ignoredTextPatterns,undefined);
 session.options.ignoredTextPatterns=[{pattern:'x',matchCase:'yes'}];assert.throws(()=>validateSession(session));
});

test('three-way merge word wrap is optional and preserves either boolean', () => {
 const value=valid();value.type='text-merge3';value.advanced={inputs:{a:null,b:null,base:null},options:{}};
 assert.equal(validateSession(value).advanced.options.mergeWrap,undefined);
 for(const enabled of [true,false]){value.advanced.options.mergeWrap=enabled;assert.equal(validateSession(value).advanced.options.mergeWrap,enabled);}
 for(const invalid of [null,0,1,'true',{},[]]){value.advanced.options.mergeWrap=invalid;assert.throws(()=>validateSession(value),/merge word wrap/);}
});
test('merge session preserves encoded source bytes and Unicode drafts with explicit result format',()=>{
 const {encodeText}=require('../src/text-codec.cjs');
 const value=valid();value.type='text-merge3';
 const format={encoding:'utf16be',bom:true,lineEnding:'crlf'};
 const data=Buffer.from(encodeText('original Ω\r\n',format)).toString('base64');
 value.advanced={inputs:{base:{name:'base.txt',data},a:null,b:null},options:{mergeReadEncodings:{base:'auto',a:'windows1252'},mergeDrafts:{base:'\ufeffedited 😀\r\n'},mergeOutputFormat:format}};
 const result=validateSession(value);assert.deepEqual(result.advanced,value.advanced);
 assert.equal(result.advanced.inputs.base.data,data);
 for(const options of [{mergeReadEncodings:{base:'utf7'}},{mergeReadEncodings:[]},{mergeDrafts:{other:'text'}},{mergeDrafts:{a:null}},{mergeDrafts:{a:'\ud800'}},{mergeDrafts:{a:'a\0b'}},{mergeOutputFormat:{encoding:'latin1',bom:true,lineEnding:'lf'}},{mergeOutputFormat:{encoding:'utf8',bom:false,lineEnding:'bogus'}}]){
  const invalid=structuredClone(value);invalid.advanced.options=options;assert.throws(()=>validateSession(invalid));
 }
 const oversized=structuredClone(value);oversized.advanced.options.mergeDrafts={a:'Ω'.repeat(MAX_TEXT_BYTES/2+1)};assert.throws(()=>validateSession(oversized),/10 MB/);
});
test('workbook template provenance persists and rejects malformed or missing source bindings',()=>{
 const value=valid();value.type='table-compare';value.advanced={inputs:{a:{name:'book.xlsx',data:'eA=='},b:null,base:null},options:{tableResult:[['value']],tableTemplate:{side:'a',sheetName:'Data',sourceHash:'a'.repeat(64),structural:false}}};
 assert.deepEqual(validateSession(value).advanced,value.advanced);
 for(const patch of [{side:'base'},{sheetName:''},{sheetName:'bad\0name'},{sourceHash:'not-a-hash'},{structural:'false'},{extra:1}]){const bad=structuredClone(value);Object.assign(bad.advanced.options.tableTemplate,patch);assert.throws(()=>validateSession(bad),/template/);}
 const absent=structuredClone(value);absent.advanced.inputs.a=null;assert.throws(()=>validateSession(absent),/source and result/);
 const absentResult=structuredClone(value);absentResult.advanced.options.tableResult=null;assert.throws(()=>validateSession(absentResult),/source and result/);
});
test('table copy mappings survive sessions and reject unsafe result coordinates',()=>{
 const value=valid();value.type='table-compare';
 value.advanced={inputs:{a:{name:'data.csv',data:'eA=='},b:null,base:null},options:{tableResult:[['id'],['x']],tableCopyBinding:{version:1,side:'a',headerOffset:1,context:'source-and-settings',rowIds:[null,'0:-']}}};
 const result=validateSession(value);assert.deepEqual(result.advanced,value.advanced);
 result.advanced.options.tableCopyBinding.rowIds[1]=null;
 assert.equal(value.advanced.options.tableCopyBinding.rowIds[1],'0:-');
 for(const patch of [{rowIds:[null,'50000:-']},{rowIds:[null,'-:-']},{rowIds:[null]},{context:''},{context:'x'.repeat(4097)},{side:'base'},{unexpected:true}]){
  const bad=structuredClone(value);Object.assign(bad.advanced.options.tableCopyBinding,patch);assert.throws(()=>validateSession(bad));
 }
 for(const rows of [null,[[1],['x']],[['id'],Array(513).fill('x')],[['id'],Array(2)]]){
  const bad=structuredClone(value);bad.advanced.options.tableResult=rows;assert.throws(()=>validateSession(bad));
 }
 const missing=structuredClone(value);missing.advanced.inputs.a=null;assert.throws(()=>validateSession(missing),/requires its source/);
});

test('code structure alignment persists explicit booleans and stays absent in older sessions',()=>{
 for(const enabled of [true,false]){const source=valid();source.options.syntaxAlignment=enabled;assert.equal(validateSession(source).options.syntaxAlignment,enabled);}
 assert.equal(Object.hasOwn(validateSession(valid()).options,'syntaxAlignment'),false);
 for(const value of ['true',1,null,[],{}]){const source=valid();source.options.syntaxAlignment=value;assert.throws(()=>validateSession(source),/code structure alignment/);}
});

test('moved text preference persists only a strict boolean and defaults to absent',()=>{
 for(const enabled of [true,false]){const source=valid();source.options.showMovedBlocks=enabled;assert.equal(validateSession(source).options.showMovedBlocks,enabled);}
 assert.equal(Object.hasOwn(validateSession(valid()).options,'showMovedBlocks'),false);
 for(const value of ['true',1,null,[],{}]){const source=valid();source.options.showMovedBlocks=value;assert.throws(()=>validateSession(source),/moved text/);}
 const source=valid();source.options.movedBlocks={pairs:[{aStart:1,bStart:5,lineCount:3}]};assert.equal(Object.hasOwn(validateSession(source).options,'movedBlocks'),false);
});
