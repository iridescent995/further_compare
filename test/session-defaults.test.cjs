'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {DEFAULT_TYPES,MAX_DEFAULTS_BYTES,captureSessionDefaults:capture,validateDefaultProfile:validate,SessionDefaults}=require('../desktop/session-defaults.cjs');
const profile=(type='text-compare',options={ignoreCase:true})=>({type,options});
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-defaults-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'defaults.json');return {dir,file,store:new SessionDefaults(file)};}
test('text projection preserves preferences and never reads content or carries search state',()=>{
 const source={type:'text-compare',options:{ignoreWhitespace:true,ignoreCase:true,whitespaceScope:'horizontal',showMinor:false,filter:'context',textTools:{wrap:true,whitespace:true,matchCase:false,regex:true,query:'private',replacement:'secret',side:'b',bookmarks:{a:[3],b:[8]}},textFormats:{a:{encoding:'shift-jis',legacyBytes:'PRIVATE SOURCE BYTES',normalizeLegacy:true}},textAlignment:[{a:1,b:2}],folderSearch:'private'}};
 for(const key of ['text','files','folders'])Object.defineProperty(source,key,{get(){throw Error('Content must not be read');}});
 const result=capture(source);assert.deepEqual(result,profile('text-compare',{ignoreWhitespace:true,ignoreCase:true,whitespaceScope:'horizontal',showMinor:false,filter:'context',textTools:{wrap:true,whitespace:true,matchCase:false,regex:true,query:'',replacement:'',side:'a',bookmarks:{a:[],b:[]}}}));
 source.options.textTools.wrap=false;assert.equal(result.options.textTools.wrap,true);
});
test('folder projection keeps view and rules but drops paths, search and alignment',()=>{
 const options={direction:'b-to-a',filter:'newer-left',folderInclude:'*.js',folderExclude:'node_modules/**',folderView:{mode:'filename',sort:'size-left',descending:true,alwaysShowFolders:false,hideLegend:true},folderRules:{mode:'size-modified',timeToleranceMs:2000},folderSyncMode:'update-both',folderSearch:'secret',folderAlignment:[{a:'secret',b:'private'}]};
 const sync=capture({type:'folder-sync',options});assert.equal(sync.options.folderSyncMode,'update-both');assert.equal(sync.options.folderRules.timeToleranceMs,2000);assert.ok(!('folderSearch' in sync.options));assert.ok(!('folderAlignment' in sync.options));
 for(const type of ['folder-compare','folder-merge'])assert.ok(!('folderSyncMode' in capture({type,options}).options));
});
test('advanced projections preserve only options meaningful to their comparison type',()=>{
 const cases={
 'binary-compare':{binaryAlignment:'aligned'},
 'table-compare':{delimiter:'\t',keys:'1, 3',headers:true,onlyDifferences:true,workbookMode:'formulas',compareFormatting:true,compareLayout:true},
 'picture-compare':{threshold:4,view:'overlay',opacity:0.6,zoom:'2'},
 'audio-compare':{offset:-0.02,tolerance:0.3},
 'registry-compare':{filter:'changed'}
 };
 for(const [type,expected]of Object.entries(cases)){
  const advanced={options:{...expected,tableResult:[['SECRET']],tableCopyBinding:{context:'SECRET',rowIds:['0:0']},tableCellEdits:{cells:[{type:'formula',value:'PRIVATE'}]},tableStyleEdits:{cells:[{sourceSheet:'SECRET',sourceHash:'PRIVATE'}]},tableStructure:{sourceHash:'SECRET',operations:[{index:99}]},resultText:'SECRET',sheeta:4,sheetb:9,choices:{1:'left'},output:'SECRET'}};
  Object.defineProperty(advanced,'inputs',{get(){throw Error('Inputs must not be read');}});
  const result=capture({type,options:{ignoreCase:true,direction:'a-to-b'},advanced});assert.deepEqual(result,{type,options:{},advancedOptions:expected});
 }
});
test('all supported types can capture empty preferences and unsupported types reject',()=>{
 for(const type of DEFAULT_TYPES)assert.equal(capture({type,options:{}}).type,type);
 for(const type of ['archive-compare','folder-merge3','text-merge3'])assert.throws(()=>capture({type,options:{}}),/This comparison type has no reusable session defaults/);
 assert.throws(()=>capture({type:'unknown',options:{}}));
});
test('strict profiles reject content, unknown fields, cross-type options and malformed shapes',()=>{
 const invalid=[{...profile(),text:{a:'secret'}},profile('text-compare',{folderSearch:'secret'}),profile('folder-compare',{folderSyncMode:'mirror'}),{...profile(),advancedOptions:{}},profile('text-compare',{textTools:{query:'secret'}}),profile('text-compare',{textTools:{bookmarks:{a:[1],b:[]}}}),profile('text-compare',{textTools:{side:'b'}}),profile('folder-sync',{folderView:{mode:'tree',sort:'name',descending:false,paths:[]}}),profile('folder-sync',{folderRules:{mode:'size',authority:'secret'}}),{type:'table-compare',options:{},advancedOptions:{tableResult:[]}},Object.assign(Object.create({}),profile()),{type:'text-compare',options:[]},{type:'text-compare',options:{[Symbol('hidden')]:true}}];
 for(const item of invalid)assert.throws(()=>validate(item));
});
test('strict values enforce comparison option bounds',()=>{
 const invalid=[profile('text-compare',{ignoreCase:1}),profile('text-compare',{filter:'changed'}),profile('folder-sync',{folderInclude:'x'.repeat(4097)}),profile('folder-sync',{folderExclude:'a\0b'}),profile('folder-sync',{folderRules:{mode:'content',timeToleranceMs:86400001}}),...[
 ['binary-compare',{binaryAlignment:'unknown'}],['table-compare',{keys:'0,1'}],['table-compare',{keys:'513'}],['table-compare',{delimiter:'xx'}],['picture-compare',{threshold:1.5}],['picture-compare',{opacity:NaN}],['picture-compare',{zoom:2}],['audio-compare',{offset:3601}],['audio-compare',{tolerance:-1}],['registry-compare',{filter:'diff'}]
 ].map(([type,advancedOptions])=>({type,options:{},advancedOptions}))];
 for(const item of invalid)assert.throws(()=>validate(item));
});
test('store survives reload, replaces one type, returns isolated objects, removes only selected type',async t=>{
 const {file,store}=await fixture(t);assert.deepEqual(await store.all(),[]);assert.equal(await store.get('text-compare'),null);assert.equal(await store.get('archive-compare'),null);
 await store.save(profile());await store.save(profile('folder-sync',{folderSyncMode:'update'}));
 const fresh=new SessionDefaults(file);assert.equal((await fresh.all()).length,2);const saved=await fresh.get('text-compare');saved.options.ignoreCase=false;assert.equal((await fresh.get('text-compare')).options.ignoreCase,true);
 await fresh.save(profile('text-compare',{ignoreCase:false}));assert.equal((await store.get('text-compare')).options.ignoreCase,false);
 await store.remove('text-compare');assert.equal(await fresh.get('text-compare'),null);assert.equal((await fresh.all()).length,1);
});
test('simultaneous store instances serialize updates without losing profiles',async t=>{
 const {file,store}=await fixture(t);await Promise.all(DEFAULT_TYPES.map(type=>new SessionDefaults(file).save({type,options:{}})));assert.equal((await store.all()).length,DEFAULT_TYPES.length);
});
test('stale review cannot replace or remove newer defaults; equivalent reordered profiles work',async t=>{
 const {store}=await fixture(t),first=profile('text-compare',{ignoreCase:true,showMinor:false});await store.save(first,null);
 await assert.rejects(store.save(profile(),null),/changed since review/);await store.save(profile('text-compare',{ignoreCase:false}),{options:{showMinor:false,ignoreCase:true},type:'text-compare'});
 await assert.rejects(store.remove('text-compare',first),/changed since review/);assert.equal((await store.get('text-compare')).options.ignoreCase,false);
 await store.remove('text-compare',profile('text-compare',{ignoreCase:false}));assert.equal(await store.get('text-compare'),null);
});
test('corrupt, extra, duplicate, unsupported and oversized stores are rejected without replacement',async t=>{
 const {file,store}=await fixture(t);
 for(const value of ['{',JSON.stringify({version:2,profiles:[]}),JSON.stringify({version:1,profiles:[],secret:'x'}),JSON.stringify({version:1,profiles:[profile(),profile()]}),JSON.stringify({version:1,profiles:[{...profile(),files:{}}]}),' '.repeat(MAX_DEFAULTS_BYTES+1)]){
  await fs.writeFile(file,value);await assert.rejects(store.all());await assert.rejects(store.save(profile()));assert.equal(await fs.readFile(file,'utf8'),value);
 }
});
test('symlinks and hard links are rejected and external targets remain untouched',async t=>{
 const {file,dir,store}=await fixture(t),other=path.join(dir,'other.json'),content=JSON.stringify({version:1,profiles:[]});await fs.writeFile(other,content);await fs.symlink(other,file);
 await assert.rejects(store.all());await assert.rejects(store.save(profile()));assert.equal(await fs.readFile(other,'utf8'),content);
 await fs.unlink(file);await fs.link(other,file);await assert.rejects(store.remove('text-compare'));assert.equal(await fs.readFile(other,'utf8'),content);
});
test('invalid save does not modify store or leave temporary files',async t=>{
 const {store,file,dir}=await fixture(t);await store.save(profile());const before=await fs.readFile(file,'utf8');await assert.rejects(store.save(profile('text-compare',{text:'secret'})));assert.equal(await fs.readFile(file,'utf8'),before);assert.deepEqual(await fs.readdir(dir),['defaults.json']);
});
test('profile lists are detached, bounded, dense, and unique',()=>{
 const {validateDefaultProfiles}=require('../desktop/session-defaults.cjs');
 const input=[profile()];const clean=validateDefaultProfiles(input);clean[0].options.ignoreCase=false;assert.equal(input[0].options.ignoreCase,true);assert.deepEqual(validateDefaultProfiles([]),[]);
 for(const value of [undefined,null,{},[profile(),profile()],new Array(1),Object.assign([],{secret:'data'}),Array(11).fill(profile()),[{...profile(),files:{a:'secret'}}]])assert.throws(()=>validateDefaultProfiles(value));
 const oversized=['folder-compare','folder-merge','folder-sync'].map(type=>profile(type,{folderInclude:'\u0001'.repeat(4096),folderExclude:'\u0001'.repeat(4096)}));assert.throws(()=>validateDefaultProfiles(oversized),/too large/);
});
test('whole-list replacement replaces all types, empty list clears, and requires reviewed state',async t=>{
 const {store}=await fixture(t),first=[profile(),profile('folder-sync',{folderSyncMode:'update'})];
 await store.replaceAll(first,[]);assert.deepEqual(await store.all(),first);
 const next=[{type:'picture-compare',options:{},advancedOptions:{zoom:'2'}}];
 await store.replaceAll(next,[...first].reverse());assert.deepEqual(await store.all(),next);assert.equal(await store.get('text-compare'),null);
 await assert.rejects(store.replaceAll([],first),/changed since review/);assert.deepEqual(await store.all(),next);
 await assert.rejects(store.replaceAll([]));assert.deepEqual(await store.all(),next);
 await store.replaceAll([],next);assert.deepEqual(await store.all(),[]);
});
test('whole-list replacement rejects stale review following another type update',async t=>{
 const {store,file}=await fixture(t);await store.save(profile());const reviewed=await store.all();await new SessionDefaults(file).save(profile('folder-compare',{}));
 await assert.rejects(store.replaceAll([],reviewed),/changed since review/);assert.equal((await store.all()).length,2);
});
test('failed whole-list validation and failed atomic install preserve entire previous store',async t=>{
 const {store,file,dir}=await fixture(t);await store.save(profile());const reviewed=await store.all(),before=await fs.readFile(file,'utf8');
 await assert.rejects(store.replaceAll([profile(),profile()],reviewed));assert.equal(await fs.readFile(file,'utf8'),before);
 const rename=fs.rename;fs.rename=async()=>{throw Error('Injected install failure');};try{await assert.rejects(store.replaceAll([profile('folder-compare',{})],reviewed),/Injected install failure/);}finally{fs.rename=rename;}
 assert.equal(await fs.readFile(file,'utf8'),before);assert.deepEqual(await fs.readdir(dir),['defaults.json']);
});

test('committed replacement does not fail from unnecessary temporary cleanup',async t=>{
 const {store,dir}=await fixture(t),old=[profile()],next=[profile('folder-compare',{filter:'diff'})];await store.replaceAll(old,[]);
 const rm=fs.rm;fs.rm=async(file,...args)=>{if(String(file).endsWith('.tmp'))throw Error('Injected cleanup failure');return rm(file,...args);};
 try{assert.deepEqual(await store.replaceAll(next,old),next);}finally{fs.rm=rm;}
 assert.deepEqual(await store.all(),next);assert.deepEqual(await fs.readdir(dir),['defaults.json']);
});

test('folder filename matching defaults retain policy without manual paths',()=>{
 const result=capture({type:'folder-compare',options:{folderNameRules:{ignoreCase:true,normalizeUnicode:true},folderAlignment:[{a:'private',b:'other',kind:'file'}]}});
 assert.deepEqual(result.options,{folderNameRules:{ignoreCase:true,normalizeUnicode:true}});
 assert.deepEqual(validate({type:'folder-sync',options:{folderNameRules:{ignoreCase:false}}}).options.folderNameRules,{});
 for(const rules of [null,[],{ignoreCase:1},{normalizeUnicode:'true'},{extension:true}])assert.throws(()=>validate({type:'folder-compare',options:{folderNameRules:rules}}));
});

test('all precise whitespace scopes survive text and folder defaults',()=>{
 for(const scope of require('../src/text-whitespace.cjs').WHITESPACE_SCOPES){
  assert.equal(validate(profile('text-compare',{ignoreWhitespace:true,whitespaceScope:scope})).options.whitespaceScope,scope);
  const folder=validate(profile('folder-compare',{folderRules:{mode:'text-whitespace-case',textWhitespaceScope:scope}}));
  assert.equal(folder.options.folderRules.textWhitespaceScope,scope==='horizontal'?undefined:scope);
 }
 assert.throws(()=>validate(profile('text-compare',{whitespaceScope:'unknown'})));
});

test('blank line rules survive text and folder defaults independently of whitespace rules',()=>{
 assert.equal(validate(profile('text-compare',{ignoreWhitespace:false,ignoreBlankLines:true})).options.ignoreBlankLines,true);
 assert.equal(validate(profile('folder-compare',{folderRules:{mode:'text-content',ignoreBlankLines:true}})).options.folderRules.ignoreBlankLines,true);
 assert.throws(()=>validate(profile('text-compare',{ignoreBlankLines:'true'})));
});

test('ignored text preferences survive defaults and empty rules clear cleanly',()=>{
 const result=validate(profile('text-compare',{ignoredTextPatterns:[{pattern:'id=\\d+'}]}));assert.deepEqual(result.options.ignoredTextPatterns,[{pattern:'id=\\d+',matchCase:true}]);
 assert.equal(validate(profile('text-compare',{ignoredTextPatterns:[]})).options.ignoredTextPatterns,undefined);
 const folder=validate(profile('folder-compare',{folderRules:{mode:'text-content',ignoredTextPatterns:[{pattern:'id',matchCase:false}]}}));assert.deepEqual(folder.options.folderRules.ignoredTextPatterns,[{pattern:'id',matchCase:false}]);
});

test('code structure alignment is a reusable two-way text default only',()=>{
 for(const type of ['text-compare','text-merge'])for(const syntaxAlignment of [true,false]){
  const source={type,options:{syntaxAlignment}};assert.deepEqual(capture(source),source);assert.deepEqual(validate(source),source);
 }
 for(const value of ['true',1,null,[],{}])assert.throws(()=>validate(profile('text-compare',{syntaxAlignment:value})),/boolean/);
 assert.throws(()=>validate(profile('folder-compare',{syntaxAlignment:true})),/fields/);
 assert.deepEqual(capture({type:'folder-compare',options:{syntaxAlignment:true}}),profile('folder-compare',{}));
});

test('moved text defaults store only strict preference for text sessions',()=>{
 for(const type of ['text-compare','text-merge'])for(const showMovedBlocks of [true,false]){const source={type,options:{showMovedBlocks}};assert.deepEqual(capture(source),source);assert.deepEqual(validate(source),source);}
 for(const value of ['true',1,null,[],{}])assert.throws(()=>validate(profile('text-compare',{showMovedBlocks:value})),/boolean/);
 assert.throws(()=>validate(profile('folder-compare',{showMovedBlocks:true})),/fields/);
 assert.throws(()=>validate(profile('text-compare',{movedBlocks:{pairs:[]}})),/fields/);
 assert.deepEqual(capture({type:'folder-compare',options:{showMovedBlocks:true}}),profile('folder-compare',{}));
});
