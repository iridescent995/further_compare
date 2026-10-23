'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {normalizeAccelerator:normalize,validateShortcuts:validate,KeyboardShortcuts,MAX_SHORTCUT_BYTES}=require('../desktop/keyboard-shortcuts.cjs');
const catalog=[{id:'open',label:'Open',accelerator:'CmdOrCtrl+O'},{id:'save',label:'Save',accelerator:'CmdOrCtrl+S'},{id:'next',label:'Next',accelerator:'F3'},{id:'other',label:'Other',accelerator:''}];
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-keys-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'keys.json');return {dir,file,store:new KeyboardShortcuts(file,catalog,'darwin')};}
test('normalizes modifier/key case and order with disabling',()=>{
 assert.equal(normalize('shift+alt+cmdorctrl+k','darwin'),'CmdOrCtrl+Alt+Shift+K');assert.equal(normalize('ctrl+command+f24','darwin'),'Command+Ctrl+F24');assert.equal(normalize('','win32'),'');assert.equal(normalize('F1','linux'),'F1');assert.equal(normalize('Alt+PageDown','win32'),'Alt+PageDown');assert.equal(normalize('Ctrl+,','linux'),'Ctrl+,');
});
test('rejects unsupported keys, duplicate modifiers, unmodified keys and reserved tree F2',()=>{
 for(const value of ['a','Enter','Delete','Tab','Space','Shift+A','Ctrl','Ctrl+','Ctrl++A','Ctrl+Ctrl+A','F0','F25','F2','Ctrl+Escape','Super+A','Ctrl+💥',null])assert.throws(()=>normalize(value,'darwin'));
 assert.throws(()=>normalize('CmdOrCtrl+Ctrl+A','win32'));assert.throws(()=>normalize('CmdOrCtrl+Command+A','darwin'));assert.equal(normalize('CmdOrCtrl+Ctrl+K','darwin'),'CmdOrCtrl+Ctrl+K');
});
test('detects effective platform collisions against unchanged defaults',()=>{
 assert.throws(()=>validate({other:'Command+O'},catalog,'darwin'),/conflicts with Open/);assert.throws(()=>validate({other:'Ctrl+O'},catalog,'win32'),/conflict/);assert.doesNotThrow(()=>validate({other:'Ctrl+O'},catalog,'darwin'));assert.throws(()=>validate({open:'Alt+K',save:'Alt+K'},catalog,'darwin'),/conflict/);
});
test('swaps and disabling are evaluated as a whole and results are detached',()=>{
 const input={open:'CmdOrCtrl+S',save:'CmdOrCtrl+O',next:''},out=validate(input,catalog,'darwin');assert.deepEqual(out,input);out.next='F4';assert.equal(input.next,'');assert.deepEqual(validate({open:'',other:'Command+O'},catalog,'darwin'),{open:'',other:'Command+O'});
});
test('reserved system and text editing combinations cannot be assigned',()=>{
 for(const platform of ['darwin','win32','linux'])for(const accelerator of ['CmdOrCtrl+A','CmdOrCtrl+C','CmdOrCtrl+V','CmdOrCtrl+X','CmdOrCtrl+Z','CmdOrCtrl+Shift+Z','CmdOrCtrl+Y','CmdOrCtrl+Q','CmdOrCtrl+W','CmdOrCtrl+H','CmdOrCtrl+M','CmdOrCtrl+-','CmdOrCtrl+Shift+=','CmdOrCtrl+0','Shift+F10','Alt+F4','Ctrl+Alt+Delete','Command+Space','Command+Tab','Ctrl+Tab','Ctrl+Shift+Tab'])assert.throws(()=>validate({other:accelerator},catalog,platform),/reserved|only on macOS/);
});
test('unknown commands, oversized and malformed maps/catalogs reject',()=>{
 for(const value of [null,[],{bad:'F4'},{open:undefined},{[Symbol('open')]:'F4'},Object.fromEntries(Array.from({length:201},(_,i)=>['x'+i,'']))])assert.throws(()=>validate(value,catalog,'darwin'));
 assert.throws(()=>validate({},[...catalog,catalog[0]],'darwin'));assert.throws(()=>validate({},[{id:'__proto__',label:'bad',accelerator:''}],'darwin'));
});
test('persists, reloads, resets and rejects stale review without data loss',async t=>{
 const {file,store}=await fixture(t);assert.deepEqual(await store.get(),{});const first={open:'Alt+O'};await store.save(first,{});assert.deepEqual(await new KeyboardShortcuts(file,catalog,'darwin').get(),first);
 await assert.rejects(store.save({open:'Alt+P'},{}),/changed since review/);assert.deepEqual(await store.get(),first);await assert.rejects(store.save({open:'Alt+P'}));await store.save({},first);assert.deepEqual(await store.get(),{});
});
test('simultaneous saves using the same review permit only one winner',async t=>{
 const {store,file}=await fixture(t),other=new KeyboardShortcuts(file,catalog,'darwin');const results=await Promise.allSettled([store.save({open:'Alt+O'},{}),other.save({open:'Alt+P'},{})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
});
test('invalid stored version, fields, UTF8 and size are not overwritten',async t=>{
 const {file,store}=await fixture(t);for(const content of ['{',JSON.stringify({version:2,overrides:{}}),JSON.stringify({version:1,overrides:{},extra:true}),JSON.stringify({version:1,overrides:{unknown:'F4'}}),Buffer.from([255]),' '.repeat(MAX_SHORTCUT_BYTES+1)]){await fs.writeFile(file,content);await assert.rejects(store.get());await assert.rejects(store.save({},{}));assert.deepEqual(await fs.readFile(file),Buffer.from(content));}
});
test('symbolic and hard linked stores cannot be read or overwritten',async t=>{
 const {dir,file,store}=await fixture(t),target=path.join(dir,'target.json'),content=JSON.stringify({version:1,overrides:{}});await fs.writeFile(target,content);await fs.symlink(target,file);await assert.rejects(store.get());await assert.rejects(store.save({},{}));await fs.unlink(file);await fs.link(target,file);await assert.rejects(store.save({},{}));assert.equal(await fs.readFile(target,'utf8'),content);
});
test('atomic install failure preserves the previous shortcut map',async t=>{
 const {file,dir,store}=await fixture(t);await store.save({},{});const before=await fs.readFile(file),rename=fs.rename;fs.rename=async()=>{throw Error('Install failed');};try{await assert.rejects(store.save({open:'Alt+O'},{}),/Install failed/);}finally{fs.rename=rename;}assert.deepEqual(await fs.readFile(file),before);assert.deepEqual(await fs.readdir(dir),['keys.json']);
});

test('explicit Command modifier is rejected outside macOS',()=>{for(const platform of ['win32','linux'])assert.throws(()=>normalize('Command+K',platform),/only on macOS/);assert.equal(normalize('Command+K','darwin'),'Command+K');});
test('committed replacement does not fail on unnecessary temporary cleanup',async t=>{
 const {store}=await fixture(t);await store.save({},{});const rm=fs.rm;fs.rm=async(file,...args)=>{if(String(file).endsWith('.tmp'))throw Error('Cleanup failure');return rm(file,...args);};try{await store.save({open:'Alt+O'},{});}finally{fs.rm=rm;}assert.deepEqual(await store.get(),{open:'Alt+O'});
});

test('native fullscreen and hide-other-apps role shortcuts stay reserved',()=>{
 for(const platform of ['win32','linux'])assert.throws(()=>validate({other:'F11'},catalog,platform),/reserved/);
 for(const shortcut of ['Command+Ctrl+F','CmdOrCtrl+Ctrl+F','Command+Alt+H'])assert.throws(()=>validate({other:shortcut},catalog,'darwin'),/reserved/);
});
