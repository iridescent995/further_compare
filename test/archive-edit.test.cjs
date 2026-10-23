'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {editArchive,writeZipEntries}=require('../src/archive-edit.cjs');
const {parseArchiveInput,crc32}=require('../src/archive-core.cjs');
const bytes=s=>new TextEncoder().encode(s),text=b=>new TextDecoder().decode(b);
const file=(path,value,modified='2026-10-20 19:28:46')=>({path,kind:'file',data:bytes(value),modified});
const dir=path=>({path,kind:'directory'});
const archive=async entries=>parseArchiveInput(writeZipEntries(entries));
test('stored ZIP roundtrips Unicode, CRC, timestamps and explicit empty directories',async()=>{
 const result=await archive([file('日本語/été.txt','Hello 🌏'),dir('empty')]);
 assert.equal(text(await result.read('日本語/été.txt')),'Hello 🌏');assert.equal(result.entries.get('日本語/été.txt').modified,'2026-10-20 19:28:46');assert.equal(result.entries.get('日本語/été.txt').crc,crc32(bytes('Hello 🌏')));assert.equal(result.entries.get('empty').kind,'directory');assert.equal(result.entries.get('日本語').implicit,undefined);
});
test('copy merges directories and replaces same-kind files without changing inputs',async()=>{
 const target=await archive([file('dir/common','old'),file('dir/keep','stay')]),source=await archive([file('dir/common','new'),file('dir/nested/add','add'),dir('dir/empty')]);
 const result=await parseArchiveInput(await editArchive(target,{action:'copy',paths:['dir','dir/common'],source}));assert.equal(text(await result.read('dir/common')),'new');assert.equal(text(await result.read('dir/keep')),'stay');assert.equal(text(await result.read('dir/nested/add')),'add');assert.equal(result.entries.get('dir/empty').kind,'directory');assert.equal(text(await target.read('dir/common')),'old');assert.equal(source.entries.has('dir/keep'),false);
});
test('delete removes exactly selected subtrees, including empty archive result',async()=>{
 const target=await archive([file('a/nested/x','x'),file('ab/x','keep')]);const out=await parseArchiveInput(await editArchive(target,{action:'delete',paths:['a']}));assert.deepEqual([...out.entries.keys()],['ab','ab/x']);const empty=await parseArchiveInput(await editArchive(out,{action:'delete',paths:['ab']}));assert.equal(empty.entries.size,0);assert.equal(target.entries.has('a/nested/x'),true);
});
test('rename relocates subtree, creates parents and preserves data/time',async()=>{
 const target=await archive([file('a/nested/x','x'),dir('a/empty')]);const out=await parseArchiveInput(await editArchive(target,{action:'rename',paths:['a'],newPath:'new/renamed'}));assert.equal(out.entries.has('a'),false);assert.equal(text(await out.read('new/renamed/nested/x')),'x');assert.equal(out.entries.get('new/renamed/nested/x').modified,'2026-10-20 19:28:46');assert.equal(out.entries.get('new/renamed/empty').kind,'directory');
});
test('unsafe, nonportable, Unicode and case aliases reject',()=>{
 for(const path of ['../x','a/../b','/x','a\\b','a//b','a/','a.','NUL.txt','a/con','x:y','a\0b','e\u0301','\ud800'])assert.throws(()=>writeZipEntries([file(path,'')]),/Unsafe|Invalid/);
 for(const entries of [[file('a',''),file('A','')],[file('a/x',''),file('A/y','')],[file('a',''),file('a/x','')]])assert.throws(()=>writeZipEntries(entries),/conflict|parent/);
});
test('copy rejects kind collisions and destination aliases',async()=>{
 const target=await archive([file('a','')]),source=await archive([file('a/x','')]);await assert.rejects(editArchive(target,{action:'copy',paths:['a'],source}),/types conflict/);
 const aliases=await archive([file('A','')]);await assert.rejects(editArchive(target,{action:'copy',paths:['A'],source:aliases}),/case-conflicting/);
});
test('rename rejects overwrite, cycles, missing selection and multiple roots',async()=>{
 const target=await archive([file('a/x',''),file('b','')]);for(const newPath of ['a/sub','a','b'])await assert.rejects(editArchive(target,{action:'rename',paths:['a'],newPath}),/itself|exists/);
 await assert.rejects(editArchive(target,{action:'rename',paths:['a/x'],newPath:'a'}),/ancestor/);await assert.rejects(editArchive(target,{action:'rename',paths:['a','b'],newPath:'c'}),/one archive/);await assert.rejects(editArchive(target,{action:'delete',paths:['missing']}),/no longer/);
});
test('integrity failure in unselected source or deleted target rejects before mutation',async()=>{
 const raw=writeZipEntries([file('bad','bad'),file('good','good')]);const admitted=await parseArchiveInput(raw);raw[admitted.entries.get('bad').start]^=1;const parsed=await parseArchiveInput(raw);
 const target=await archive([file('keep','safe')]);await assert.rejects(editArchive(target,{action:'copy',paths:['good'],source:parsed}),/CRC/);await assert.rejects(editArchive(parsed,{action:'delete',paths:['bad']}),/CRC/);assert.equal(text(await target.read('keep')),'safe');
});
test('invalid dates use stable DOS epoch and valid odd seconds round down',async()=>{
 const out=await archive([file('invalid','', '2026-02-30 00:00:00'),file('odd','', '2026-01-01 12:00:01')]);assert.equal(out.entries.get('invalid').modified,'1980-01-01 00:00:00');assert.equal(out.entries.get('odd').modified,'2026-01-01 12:00:00');
});
test('output and entry count limits reject before output allocation',()=>{
 assert.throws(()=>writeZipEntries([{path:'large',kind:'file',data:new Uint8Array(32*1024*1024)}]),/32 MB/);
 assert.throws(()=>writeZipEntries(Array.from({length:50001},(_,i)=>dir('d'+i))),/50,000/);
});
test('copy to an unopened side creates a new ZIP and writeArchive validates all entries',async()=>{
 const source=await archive([file('a','hello')]);const created=await parseArchiveInput(await editArchive(null,{action:'copy',paths:['a'],source}));assert.equal(text(await created.read('a')),'hello');
 const {writeArchive}=require('../src/archive-edit.cjs');const saved=await parseArchiveInput(await writeArchive(source));assert.equal(text(await saved.read('a')),'hello');await assert.rejects(editArchive(null,{action:'delete',paths:['a']}),/parsed archive/);
});
test('TAR UTC timestamps retain calendar value at DOS precision',async()=>{
 const out=await archive([file('tar','', '2023-01-01 00:00:03.000 UTC')]);assert.equal(out.entries.get('tar').modified,'2023-01-01 00:00:02');
});
test('add disk snapshots creates a new archive and overwrites only matching files',async()=>{
 const {prepareArchiveAdd}=require('../src/archive-edit.cjs');const target=await archive([file('folder/a','old'),file('keep','untouched')]),files=[{name:'a',data:bytes('new'),modified:'2026-01-01 12:00:03'},{name:'été.bin',data:new Uint8Array([0,255,13,10])}];
 assert.equal(prepareArchiveAdd(target,files,'folder').overwrites,1);
 const out=await parseArchiveInput(await editArchive(target,{action:'add',files,destination:'folder'}));assert.equal(text(await out.read('folder/a')),'new');assert.deepEqual(await out.read('folder/été.bin'),files[1].data);assert.equal(out.entries.get('folder/a').modified,'2026-01-01 12:00:02');assert.equal(text(await out.read('keep')),'untouched');assert.equal(text(await target.read('folder/a')),'old');
 const created=await parseArchiveInput(await editArchive(null,{action:'add',files,destination:'new/nested'}));assert.equal(text(await created.read('new/nested/a')),'new');
});
test('add review rejects unsafe destinations, basenames, duplicate names and parent conflicts',async()=>{
 const {prepareArchiveAdd}=require('../src/archive-edit.cjs');const target=await archive([file('parent','x'),dir('folder'),file('Case/x','y')]),item=name=>({name,data:bytes('ok')});
 for(const destination of ['../up','/root','trailing/','NUL','a\\b'])assert.throws(()=>prepareArchiveAdd(target,[item('ok')],destination),/Unsafe/);
 for(const name of ['../up','nested/x','x\\y','NUL','e\u0301'])assert.throws(()=>prepareArchiveAdd(target,[item(name)]),/Unsafe|simple/);
 for(const names of [['same','same'],['same','SAME']])assert.throws(()=>prepareArchiveAdd(target,names.map(item)),/Duplicate|case/);
 assert.throws(()=>prepareArchiveAdd(target,[item('folder')]),/types conflict/);assert.throws(()=>prepareArchiveAdd(target,[item('x')],'parent'),/parent directory/);assert.throws(()=>prepareArchiveAdd(target,[item('x')],'case'),/case-conflicting/i);
});
test('add review defers compression size while enforcing expanded-content bounds',()=>{
 const {prepareArchiveAdd}=require('../src/archive-edit.cjs');assert.doesNotThrow(()=>prepareArchiveAdd(null,[{name:'large',data:new Uint8Array(32*1024*1024)}]));
 const target={entries:new Map([['large',{path:'large',kind:'file',size:64*1024*1024}]])};assert.throws(()=>prepareArchiveAdd(target,[{name:'new',data:bytes('small')}]),/64 MB/);
});
test('add snapshots caller bytes before asynchronous target validation and rejects corrupt targets',async()=>{
 const target=await archive([file('keep','old')]),data=bytes('first'),pending=editArchive(target,{action:'add',files:[{name:'new',data}]});data.fill(0);const out=await parseArchiveInput(await pending);assert.equal(text(await out.read('new')),'first');
 const raw=writeZipEntries([file('bad','bad')]),admitted=await parseArchiveInput(raw);raw[admitted.entries.get('bad').start]^=1;const broken=await parseArchiveInput(raw);await assert.rejects(editArchive(broken,{action:'add',files:[{name:'new',data:bytes('new')}]}),/CRC/);
});

test('folder import merges a complete tree, preserving unrelated files and empty directories',async()=>{
 const {prepareArchiveFolderAdd}=require('../src/archive-edit.cjs');const target=await archive([file('dest/root/old','keep'),file('dest/root/a','old'),dir('dest/root')]);
 const records=[dir('root'),file('root/a','new'),dir('root/empty'),file('root/nested/b','binary\u0000')];
 const plan=prepareArchiveFolderAdd(target,records,'dest');assert.equal(plan.overwrites,1);assert.equal(plan.merges,1);
 const result=await parseArchiveInput(await editArchive(target,{action:'add-folder',files:records,destination:'dest'}));
 assert.equal(new TextDecoder().decode(await result.read('dest/root/old')),'keep');assert.equal(new TextDecoder().decode(await result.read('dest/root/a')),'new');assert.equal(result.entries.get('dest/root/empty').kind,'directory');assert.equal(result.entries.get('dest/root/nested').kind,'directory');
});
test('folder import creates an archive from an empty folder',async()=>{
 const result=await parseArchiveInput(await editArchive(null,{action:'add-folder',files:[dir('empty')]}));assert.deepEqual([...result.entries.keys()],['empty']);
});
test('folder import rejects invalid roots, paths, kinds, aliases, and file parents',async()=>{
 const {prepareArchiveFolderAdd}=require('../src/archive-edit.cjs');
 for(const entries of [[file('root','x')],[dir('root'),file('elsewhere/x','x')],[dir('root/child')],[dir('root'),file('root/../x','x')],[dir('root'),file('root/a','x'),file('root/A','x')],[dir('root'),file('root/a','x'),file('root/a/b','x')],[dir('root'),{path:'root/link',kind:'symlink'}]])assert.throws(()=>prepareArchiveFolderAdd(null,entries));
 for(const target of [await archive([file('root','x')]),await archive([dir('ROOT')]),await archive([file('dest','x')])])assert.throws(()=>prepareArchiveFolderAdd(target,[dir('root'),file('root/a','x')],target.entries.has('dest')?'dest':''));
 assert.throws(()=>prepareArchiveFolderAdd(null,[dir('root'),{...file('root/a','x'),modified:{}}]),/modification/);
 assert.throws(()=>prepareArchiveFolderAdd(null,[{...dir('root'),data:bytes('bad')}]),/directory contains data/);
});
test('folder import enforces selection and output limits',()=>{
 const {prepareArchiveFolderAdd}=require('../src/archive-edit.cjs');assert.throws(()=>prepareArchiveFolderAdd(null,[dir('root'),...Array.from({length:5000},(_,i)=>dir('root/'+i))]),/5,000/);
 assert.doesNotThrow(()=>prepareArchiveFolderAdd(null,[dir('root'),{path:'root/large',kind:'file',data:new Uint8Array(32*1024*1024)}]));
});
test('folder import snapshots bytes before awaiting existing archive reads',async()=>{
 const records=[dir('root'),file('root/a','before')],target=await archive([file('keep','untouched')]);const promise=editArchive(target,{action:'add-folder',files:records});records[1].data.fill(0);records[1].path='changed';
 const result=await parseArchiveInput(await promise);assert.equal(new TextDecoder().decode(await result.read('root/a')),'before');
});
