'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {MAX_SETTINGS_BYTES,normalizeSettingsTransfer,inspectSettingsTransfer,readSettingsTransfer,writeSettingsTransfer}=require('../desktop/settings-transfer.cjs');
const settings=()=>({kind:'further-compare-settings',version:1,platform:'darwin',display:{theme:'system',density:'compact',fontSize:13},folderColumns:{size:100,modified:160},externalEditor:{mode:'system',executable:'',args:[]}});
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-settings-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return {root,file:path.join(root,'settings.json')};}
test('strict envelope excludes unknown authorities, versions and nested fields',()=>{
 for(const change of [{version:2},{kind:'session'},{platform:'unknown'},{diskToken:'secret'},{session:{}},{display:{...settings().display,extra:true}},{folderColumns:{name:200}},{externalEditor:undefined}])assert.throws(()=>normalizeSettingsTransfer({...settings(),...change}));
 for(const value of [null,[],Object.create(null)])assert.throws(()=>normalizeSettingsTransfer(value));
});
test('display and column bounds are validated, optional widths may be absent',()=>{
 for(const theme of ['light','dark','system'])for(const density of ['compact','comfortable'])for(const fontSize of [12,13,14,15])assert.deepEqual(normalizeSettingsTransfer({...settings(),display:{theme,density,fontSize},folderColumns:{}}).display,{theme,density,fontSize});
 for(const display of [{theme:'blue'},{density:'large'},{fontSize:13.5},{fontSize:16}])assert.throws(()=>normalizeSettingsTransfer({...settings(),display:{...settings().display,...display}}));
 for(const folderColumns of [{size:47},{size:241},{size:100.5},{modified:79},{modified:321},{size:undefined}])assert.throws(()=>normalizeSettingsTransfer({...settings(),folderColumns}));
 assert.deepEqual(normalizeSettingsTransfer({...settings(),folderColumns:{size:48,modified:320}}).folderColumns,{size:48,modified:320});
});
test('source platform editor validation is mandatory and returned settings are detached',()=>{
 const value=settings();value.externalEditor={mode:'custom',executable:'relative',args:[]};assert.throws(()=>inspectSettingsTransfer(value,'linux'),/absolute/);
 value.externalEditor={mode:'custom',executable:'/usr/bin/editor',args:['{file}']};const normalized=normalizeSettingsTransfer(value);normalized.externalEditor.args.push('extra');normalized.display.theme='dark';assert.equal(value.externalEditor.args.length,1);assert.equal(value.display.theme,'system');
});
test('incompatible editor does not discard portable appearance',()=>{
 const value=settings();value.externalEditor={mode:'custom',executable:'/Applications/Editor.app',args:[]};
 const result=inspectSettingsTransfer(value,'win32');assert.equal(result.editorCompatible,false);assert.equal(typeof result.editorError,'string');assert.deepEqual(result.settings,value);
 assert.equal(inspectSettingsTransfer(settings(),'win32').editorCompatible,true);
 const win={...settings(),platform:'win32',externalEditor:{mode:'custom',executable:'C:\\Editor\\editor.exe',args:['{file}']}};assert.equal(inspectSettingsTransfer(win,'darwin').editorCompatible,false);
 assert.throws(()=>inspectSettingsTransfer(settings(),'unknown'));
});
test('editor profiles are validated for source and target including disabled profiles',()=>{
 const value=settings();value.externalEditor.profiles=[{id:'text',name:'Text',patterns:['*.txt'],enabled:false,mode:'custom',executable:'/usr/bin/editor',args:[]}];assert.equal(inspectSettingsTransfer(value,'win32').editorCompatible,false);
 value.externalEditor.profiles[0].patterns=['../*'];assert.throws(()=>normalizeSettingsTransfer(value));
});
test('roundtrip and replacement preserve settings and leave no temporary files',async t=>{
 const f=await fixture(t);const written=await writeSettingsTransfer(f.file,settings());assert.equal(written.path,await fs.realpath(f.file));assert.deepEqual((await readSettingsTransfer(f.file,'darwin')).settings,settings());
 const updated=settings();updated.display.theme='dark';await writeSettingsTransfer(f.file,updated);assert.deepEqual((await readSettingsTransfer(f.file)).settings,updated);assert.deepEqual(await fs.readdir(f.root),['settings.json']);
});
test('read rejects oversized, invalid JSON, directories and final symlinks',async t=>{
 const f=await fixture(t);await fs.writeFile(f.file,'oops');await assert.rejects(()=>readSettingsTransfer(f.file));await fs.truncate(f.file,MAX_SETTINGS_BYTES+1);await assert.rejects(()=>readSettingsTransfer(f.file),/too large/);await assert.rejects(()=>readSettingsTransfer(f.root),/regular/);
 await fs.writeFile(f.file,JSON.stringify(settings()));const link=path.join(f.root,'link');await fs.symlink(f.file,link);await assert.rejects(()=>readSettingsTransfer(link),/non-symbolic/);await assert.rejects(()=>writeSettingsTransfer(link,settings()),/non-symbolic/);
});
test('hard-linked destinations refuse export through either alias',async t=>{
 const f=await fixture(t);await fs.writeFile(f.file,JSON.stringify(settings()));const link=path.join(f.root,'hard');await fs.link(f.file,link);for(const name of [f.file,link])await assert.rejects(()=>writeSettingsTransfer(name,settings()),/Hard-linked/);assert.deepEqual(JSON.parse(await fs.readFile(f.file,'utf8')),settings());
});
test('new destination arriving at installation is never overwritten',async t=>{
 const f=await fixture(t),original=fs.link;fs.link=async(a,b)=>{await fs.writeFile(b,'preserve');return original(a,b);};try{await assert.rejects(()=>writeSettingsTransfer(f.file,settings()),{code:'EEXIST'});}finally{fs.link=original;}assert.equal(await fs.readFile(f.file,'utf8'),'preserve');assert.deepEqual(await fs.readdir(f.root),['settings.json']);
});
test('destination changed during preparation aborts and cleans temporary file',async t=>{
 const f=await fixture(t);await fs.writeFile(f.file,JSON.stringify(settings()));const original=fs.writeFile;fs.writeFile=async(file,...args)=>{const result=await original(file,...args);if(String(file).endsWith('.tmp'))await original(f.file,'changed');return result;};try{await assert.rejects(()=>writeSettingsTransfer(f.file,settings()),/destination changed/);}finally{fs.writeFile=original;}assert.equal(await fs.readFile(f.file,'utf8'),'changed');assert.deepEqual(await fs.readdir(f.root),['settings.json']);
});
test('read detects replacement after opening',async t=>{
 const f=await fixture(t);await fs.writeFile(f.file,JSON.stringify(settings()));const original=fs.open;fs.open=async(...args)=>{const handle=await original(...args);await fs.rename(f.file,f.file+'.old');await fs.writeFile(f.file,JSON.stringify(settings()));return handle;};try{await assert.rejects(()=>readSettingsTransfer(f.file),/changed while reading/);}finally{fs.open=original;}
});
test('optional session defaults preserve absent versus explicit empty semantics',()=>{
 assert.equal(Object.hasOwn(normalizeSettingsTransfer(settings()),'sessionDefaults'),false);
 assert.deepEqual(normalizeSettingsTransfer({...settings(),sessionDefaults:[]}).sessionDefaults,[]);
 for(const sessionDefaults of [undefined,null,{},[{type:'text-compare',options:{},text:{a:'secret'}}],[{type:'registry-compare',options:{},advancedOptions:{resultText:'secret'}}],[{type:'text-compare',options:{}},{type:'text-compare',options:{}}]])assert.throws(()=>normalizeSettingsTransfer({...settings(),sessionDefaults}));
});
test('portable session defaults roundtrip with settings and are detached from input',async t=>{
 const f=await fixture(t),value={...settings(),sessionDefaults:[{type:'text-compare',options:{ignoreCase:true}},{type:'table-compare',options:{},advancedOptions:{headers:true,workbookMode:'formulas'}}]};
 await writeSettingsTransfer(f.file,value);assert.deepEqual((await readSettingsTransfer(f.file,'win32')).settings,value);
 const clean=normalizeSettingsTransfer(value);clean.sessionDefaults[0].options.ignoreCase=false;assert.equal(value.sessionDefaults[0].options.ignoreCase,true);
 await writeSettingsTransfer(f.file,{...settings(),sessionDefaults:[]});assert.deepEqual((await readSettingsTransfer(f.file)).settings.sessionDefaults,[]);
 await writeSettingsTransfer(f.file,settings());assert.equal(Object.hasOwn((await readSettingsTransfer(f.file)).settings,'sessionDefaults'),false);
});
test('session defaults enforce their own 128 KiB bound inside larger settings envelope',()=>{
 const sessionDefaults=['folder-compare','folder-merge','folder-sync'].map(type=>({type,options:{folderInclude:'\u0001'.repeat(4096),folderExclude:'\u0001'.repeat(4096)}}));
 const value={...settings(),sessionDefaults};assert.ok(Buffer.byteLength(JSON.stringify(value))<MAX_SETTINGS_BYTES);assert.throws(()=>normalizeSettingsTransfer(value),/too large/);
});
const shortcutCatalog=[{id:'open',label:'Open',accelerator:'CmdOrCtrl+O'},{id:'save',label:'Save',accelerator:'CmdOrCtrl+S'},{id:'other',label:'Other',accelerator:''}];
test('keyboard transfer preserves omitted versus empty and requires trusted catalog only when present',()=>{
 assert.equal(Object.hasOwn(normalizeSettingsTransfer(settings()),'keyboardShortcuts'),false);
 assert.deepEqual(normalizeSettingsTransfer({...settings(),keyboardShortcuts:{}},shortcutCatalog).keyboardShortcuts,{});
 assert.throws(()=>normalizeSettingsTransfer({...settings(),keyboardShortcuts:{}}),/trusted command catalog/);
 assert.throws(()=>normalizeSettingsTransfer({...settings(),keyboardShortcuts:{},catalog:shortcutCatalog},shortcutCatalog));
 const inspected=inspectSettingsTransfer(settings(),'win32');assert.equal(inspected.shortcutsCompatible,true);assert.equal(inspected.shortcutsError,null);
});
test('source keyboard validation rejects unknown, reserved, malformed and colliding bindings',()=>{
 for(const keyboardShortcuts of [null,[],{bad:'F4'},{other:'CmdOrCtrl+C'},{other:'a'},{other:undefined},{other:'Command+O'}])assert.throws(()=>normalizeSettingsTransfer({...settings(),keyboardShortcuts},shortcutCatalog));
 assert.throws(()=>normalizeSettingsTransfer({...settings(),platform:'win32',keyboardShortcuts:{other:'Command+K'}},shortcutCatalog),/macOS/);
 assert.deepEqual(normalizeSettingsTransfer({...settings(),keyboardShortcuts:{open:'CmdOrCtrl+S',save:'CmdOrCtrl+O'}},shortcutCatalog).keyboardShortcuts,{open:'CmdOrCtrl+S',save:'CmdOrCtrl+O'});
});
test('incompatible target shortcuts retain portable settings and explain incompatibility',()=>{
 const value={...settings(),sessionDefaults:[{type:'text-compare',options:{ignoreCase:true}}],keyboardShortcuts:{other:'Command+K'}};
 const result=inspectSettingsTransfer(value,'win32',shortcutCatalog);assert.equal(result.shortcutsCompatible,false);assert.match(result.shortcutsError,/macOS/);assert.deepEqual(result.settings,value);assert.equal(result.editorCompatible,true);
 const aliasConflict=inspectSettingsTransfer({...settings(),keyboardShortcuts:{other:'Ctrl+O'}},'win32',shortcutCatalog);assert.equal(aliasConflict.shortcutsCompatible,false);assert.match(aliasConflict.shortcutsError,/conflicts with Open/);
 const compatible=inspectSettingsTransfer({...settings(),keyboardShortcuts:{other:'CmdOrCtrl+K'}},'linux',shortcutCatalog);assert.equal(compatible.shortcutsCompatible,true);assert.equal(compatible.shortcutsError,null);
});
test('keyboard settings roundtrip with trusted catalog and reset to empty map',async t=>{
 const f=await fixture(t),value={...settings(),keyboardShortcuts:{open:'Alt+O',save:''}};
 await writeSettingsTransfer(f.file,value,shortcutCatalog);assert.deepEqual((await readSettingsTransfer(f.file,'darwin',shortcutCatalog)).settings,value);
 await assert.rejects(readSettingsTransfer(f.file,'darwin'),/trusted command catalog/);
 const clean=normalizeSettingsTransfer(value,shortcutCatalog);clean.keyboardShortcuts.open='Alt+P';assert.equal(value.keyboardShortcuts.open,'Alt+O');
 await writeSettingsTransfer(f.file,{...settings(),keyboardShortcuts:{}},shortcutCatalog);assert.deepEqual((await readSettingsTransfer(f.file,'win32',shortcutCatalog)).settings.keyboardShortcuts,{});
 await writeSettingsTransfer(f.file,settings());assert.equal(Object.hasOwn((await readSettingsTransfer(f.file)).settings,'keyboardShortcuts'),false);
});
