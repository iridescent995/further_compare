'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {validateSettings,invocation,ExternalEditor,checkExecutable}=require('../desktop/external-editor.cjs');
const custom=(executable,args=[])=>({mode:'custom',executable,args});
test('editor plans retain literal file paths and arguments without shell expansion',()=>{
  const file='/tmp/name;$(touch pwned) "quoted".txt';
  assert.deepEqual(invocation(custom('/usr/bin/editor',['--wait','{file}','--name={file}']),file,'darwin'),{mode:'custom',command:'/usr/bin/editor',args:['--wait',file,`--name=${file}`]});
  assert.deepEqual(invocation(custom('/usr/bin/editor',['--wait']),file,'darwin').args,['--wait',file]);
  const win='C:\\docs\\name & calc.txt';
  assert.deepEqual(invocation(custom('C:\\Editors\\edit.exe',['{file}']),win,'win32').args,[win]);
  assert.deepEqual(invocation(custom('/Applications/Edit.app',['--wait']),file,'darwin'),{mode:'custom',command:'/usr/bin/open',args:['-a','/Applications/Edit.app',file,'--args','--wait']});
  assert.throws(()=>validateSettings(custom('/Applications/Edit.app',['{file}']),'darwin'),/automatically/);
});
test('editor settings reject invalid paths, shell scripts, malformed and oversized arguments',()=>{
  for(const value of [null,[],{},custom('relative'),custom('/bin/editor',[null]),custom('/bin/editor',Array(33).fill('x')),custom('/bin/editor',['x'.repeat(4097)]),custom('/bin/editor',['\0']),{...custom('/bin/editor'),shell:true}]) assert.throws(()=>validateSettings(value,'darwin'));
  for(const extension of ['cmd','bat','ps1','com']) assert.throws(()=>validateSettings(custom(`C:\\edit.${extension}`),'win32'),/exe/);
  assert.deepEqual(validateSettings({mode:'system',executable:'',args:[]}),{mode:'system',executable:'',args:[]});
  assert.throws(()=>invocation(custom('/bin/editor'),'relative','darwin'),/file path/);
});
test('editor settings persist atomically and validate executables without launching them',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-editor-'));
  try {
    const editor=new ExternalEditor(path.join(root,'settings.json'),'darwin');
    assert.equal((await editor.settings()).mode,'system');
    const executable=path.join(root,'editor'); await fs.writeFile(executable,'#!/bin/sh\nexit 0\n',{mode:0o700});
    const settings=custom(executable,['{file}']);
    await editor.save(settings);
    assert.deepEqual(await new ExternalEditor(editor.file,'darwin').settings(),settings);
    await assert.rejects(editor.save(custom(root)),/executable file/);
    assert.deepEqual(await editor.settings(),settings);
    await assert.rejects(editor.save(custom(executable,Array(32).fill('界'.repeat(4096)))),/too large/);
    assert.deepEqual(await editor.settings(),settings);
    assert.equal((await fs.readdir(root)).some(name=>name.endsWith('.tmp')),false);
    const app=path.join(root,'Editor.app'); await fs.mkdir(path.join(app,'Contents'),{recursive:true});
    await assert.rejects(checkExecutable(custom(app),'darwin'));
    await fs.writeFile(path.join(app,'Contents','Info.plist'),'<plist/>'); await editor.save(custom(app));
    await fs.writeFile(editor.file,'invalid JSON'); await assert.rejects(editor.settings());
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('system editor launch requires a regular file and propagates OS errors',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-editor-open-'));
  try {
    const editor=new ExternalEditor(path.join(root,'settings.json'));
    const file=path.join(root,'file.txt'); await fs.writeFile(file,'test');
    let received; assert.deepEqual(await editor.launch(file,async value=>{received=value;return '';}),{launched:true,name:'file.txt'}); assert.equal(received,file);
    await assert.rejects(editor.launch(file,async()=> 'No application is registered.'),/registered/);
    await assert.rejects(editor.launch(file,async()=>assert.fail('Must not launch after failed authority recheck'),async()=>{throw new Error('Authority changed');}),/Authority changed/);
    await assert.rejects(editor.launch(root,async()=> assert.fail()),/regular file/);
    const link=path.join(root,'link'); await fs.symlink(file,link);
    await assert.rejects(editor.launch(link,async()=> assert.fail()),/regular file/);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

const {selectEditor}=require('../desktop/external-editor.cjs');
const system=()=>({mode:'system',executable:'',args:[]});
const profile=(id,patterns,config=custom('/bin/editor'),enabled=true)=>({id,name:'Editor '+id,patterns,enabled,...config});
test('filename profiles choose the first enabled match and fall back to the legacy default',()=>{
  const settings={...custom('/bin/default'),profiles:[profile('off',['*'],custom('/bin/off'),false),profile('source',['*.js','readme.?d'],custom('/bin/source')),profile('later',['*'],system())]};
  assert.deepEqual(selectEditor(settings,'/tmp/SCRIPT.JS','linux'),custom('/bin/source'));
  assert.deepEqual(selectEditor(settings,'/tmp/README.md','linux'),custom('/bin/source'));
  assert.deepEqual(selectEditor(settings,'/tmp/photo.png','linux'),system());
  assert.deepEqual(selectEditor({...settings,profiles:settings.profiles.slice(0,2)},'/tmp/photo.png','linux'),custom('/bin/default'));
  assert.deepEqual(validateSettings({...system(),profiles:[]}),system());
  assert.deepEqual(selectEditor(custom('/bin/default'),'/tmp/a','linux'),custom('/bin/default'));
  const normalized=validateSettings({...system(),profiles:[{...profile('one',['*.txt']),name:'  My text editor  '}]});
  assert.equal(normalized.profiles[0].name,'My text editor');
});
test('profile glob matching treats punctuation literally and matches filename rather than directories',()=>{
  const selected=custom('/bin/selected');
  const choose=(pattern,file)=>selectEditor({...system(),profiles:[profile('one',[pattern],selected)]},file,'linux');
  for(const name of ['file[1].txt','name$(touch x);.txt','a+b.(txt)','file{a,b}.txt','plain^$.txt']) {
    assert.deepEqual(choose(name,'/tmp/'+name),selected);
    assert.deepEqual(choose(name,'/tmp/'+name+'x'),system());
  }
  assert.deepEqual(choose('*.js','/tmp/folder.js/file.txt'),system());
  assert.deepEqual(choose('*a','/tmp/*ba'),selected);
  assert.deepEqual(choose('a?c','/tmp/a😀c'),selected);
  assert.deepEqual(choose('a?c','/tmp/ac'),system());
  assert.deepEqual(choose('a**b*c?','/tmp/axybzbc1'),selected);
  assert.deepEqual(choose('*a'.repeat(60)+'b','/tmp/'+'a'.repeat(240)+'c'),system());
  assert.deepEqual(choose('*.TXT','/tmp/.hidden.txt'),selected);
});
test('profile invocation selects platform-specific plans without shell interpretation',()=>{
  const win='C:\\files\\a & b.TXT';
  const windows={...system(),profiles:[profile('one',['*.txt'],custom('C:\\Editors\\edit.exe',['--file={file}']))]};
  assert.deepEqual(invocation(windows,win,'win32'),{mode:'custom',command:'C:\\Editors\\edit.exe',args:['--file='+win]});
  const mac={...system(),profiles:[profile('one',['*.png'],custom('/Applications/Image.app',['--new-window']))]};
  assert.deepEqual(invocation(mac,'/tmp/test.png','darwin'),{mode:'custom',command:'/usr/bin/open',args:['-a','/Applications/Image.app','/tmp/test.png','--args','--new-window']});
});
test('profile validation rejects malformed, duplicate and oversized data',()=>{
  const good=profile('one',['*.txt']);
  const mutations=[null,[],{...good,shell:true},{...good,id:''},{...good,id:' '},{...good,id:'x'.repeat(65)},{...good,id:'x\0'},
    {...good,name:' '},{...good,name:'x'.repeat(81)},{...good,enabled:1},{...good,patterns:[]},{...good,patterns:'*.txt'},
    ...['',' ','a/b','a\\b','a\0b','x'.repeat(129)].map(pattern=>({...good,patterns:[pattern]})),
    {...good,patterns:Array(33).fill('*')},{...good,mode:'other'},{...good,executable:'relative'}];
  for(const invalid of mutations)assert.throws(()=>validateSettings({...system(),profiles:[invalid]},'linux'));
  assert.throws(()=>validateSettings({...system(),profiles:[good,good]},'linux'));
  assert.throws(()=>validateSettings({...system(),profiles:Array.from({length:33},(_,i)=>profile(String(i),['*']))},'linux'));
  assert.throws(()=>validateSettings({...system(),profiles:[profile('large',['*'],custom('/bin/editor',Array(32).fill('界'.repeat(4096))))]},'linux'),/too large/);
  assert.throws(()=>validateSettings({...system(),profiles:[profile('off',['*'],custom('relative'),false)]},'linux'),/absolute/);
});
test('profiles persist atomically while disabled missing editors remain configurable',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-editor-profiles-'));
  try {
    const editor=new ExternalEditor(path.join(root,'settings.json'),'linux');
    const executable=path.join(root,'editor');await fs.writeFile(executable,'#!/bin/sh\nexit 0\n',{mode:0o700});
    const settings={...system(),profiles:[profile('working',['*.txt'],custom(executable,['{file}'])),profile('missing',['*.bin'],custom(path.join(root,'missing')),false)]};
    assert.deepEqual(await editor.save(settings),settings);
    assert.deepEqual(await new ExternalEditor(editor.file,'linux').settings(),settings);
    const enabled=structuredClone(settings);enabled.profiles[1].enabled=true;
    await assert.rejects(editor.save(enabled),/ENOENT/);
    assert.deepEqual(await editor.settings(),settings);
    assert.equal((await fs.readdir(root)).some(name=>name.endsWith('.tmp')),false);
    await editor.save({...system(),profiles:[]});
    assert.deepEqual(await editor.settings(),system());
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('launch checks only the selected profile and still runs the native authority guard',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-editor-selected-'));
  try {
    const editor=new ExternalEditor(path.join(root,'settings.json'),'linux');
    const file=path.join(root,'example.TXT');await fs.writeFile(file,'original');
    // An installed default can disappear after saving; a system profile must still work.
    const settings={...custom(path.join(root,'missing-default')),profiles:[profile('text',['*.txt'],system()),profile('other',['*.png'],custom(path.join(root,'missing-other')))]};
    await fs.writeFile(editor.file,JSON.stringify(settings));
    const calls=[];
    await editor.launch(file,async value=>{calls.push(value);return '';},async()=>calls.push('authority'));
    assert.deepEqual(calls,['authority',file]);
    await assert.rejects(editor.launch(file,async()=>assert.fail('Guard should prevent launch'),async()=>{throw Error('Changed authority');}),/Changed authority/);
    const other=path.join(root,'image.png');await fs.writeFile(other,'image');
    await assert.rejects(editor.launch(other,async()=>assert.fail('Missing custom profile should fail')),/ENOENT/);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('successful editor commit is not reported failed by unnecessary temporary cleanup',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-editor-commit-')),file=path.join(dir,'editor.json'),editor=new ExternalEditor(file);
 const originalRm=fs.rm;let cleanupCalls=0;
 try{
  fs.rm=async(target,...args)=>{if(String(target).startsWith(file+'.')){cleanupCalls++;throw Error('cleanup denied');}return originalRm(target,...args);};
  await editor.save({mode:'system',executable:'',args:[]});
  assert.equal(cleanupCalls,0);assert.equal((await editor.settings()).mode,'system');
 }finally{fs.rm=originalRm;await fs.rm(dir,{recursive:true,force:true});}
});
