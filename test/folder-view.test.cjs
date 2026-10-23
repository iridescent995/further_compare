const {test}=require('node:test'),assert=require('node:assert/strict');
const {filterEntries,excluded,selectEntries}=require('../src/folder-view.cjs');
const rows=[
 {path:'src',kindA:'directory',kindB:'directory',status:'directory'},
 {path:'src/app.js',kindA:'file',kindB:'file',status:'changed',mtimeA:20,mtimeB:10},
 {path:'src/app.test.js',kindA:'file',kindB:'file',status:'equal',mtimeA:10,mtimeB:20},
 {path:'readme.txt',kindA:'file',kindB:null,status:'left'},
 {path:'only.xml',kindA:null,kindB:'file',status:'right'}
];
test('filename masks filter files while preserving navigable parent directories',()=>{
 assert.deepEqual(filterEntries(rows,{include:'*.js;*.xml',exclude:'*.test.js'}).map(x=>x.path),['src','src/app.js','only.xml']);
 assert.deepEqual(filterEntries(rows,{status:'same'}).map(x=>x.path),['src','src/app.test.js']);
 assert.deepEqual(filterEntries(rows,{status:'context'}).map(x=>x.path),['src','src/app.js','readme.txt','only.xml']);
 assert.deepEqual(filterEntries(rows,{status:'context',exclude:'*.js'}).map(x=>x.path),['readme.txt','only.xml']);
 assert.deepEqual(filterEntries(rows,{include:'src/*.js',query:'app.test'}).map(x=>x.path),['src','src/app.test.js']);
 assert.equal(excluded('src/cache/data.bin','**/cache/**'),true);
 assert.equal(excluded('src/cache','**/cache/**'),true);
 assert.equal(excluded('src/cache/data.bin','cache'),true);
 assert.equal(excluded('src/cache/data.bin','cache.txt'),false);
});
test('selection rules are side-aware and invert only visible existing entries',()=>{
 assert.deepEqual([...selectEntries(rows,'a','newer-left')],['src/app.js']);
 assert.deepEqual([...selectEntries(rows,'b','newer-right')],['src/app.test.js']);
 assert.deepEqual([...selectEntries(rows,'a','right-only')],[]);
 assert.deepEqual([...selectEntries(rows,'b','right-only')],['only.xml']);
 assert.deepEqual([...selectEntries(rows,'a','invert',new Set(['src','src/app.js']))],['src/app.test.js','readme.txt']);
});

test('lazy difference trees retain paired containers without classifying unopened contents',()=>{
 const entries=[
  {id:'src',parentId:'root',pathA:'src',pathB:'src',kindA:'directory',kindB:'directory',status:'directory'},
  {id:'nested',parentId:'src',pathA:'src/nested',pathB:'src/nested',kindA:'directory',kindB:'directory',status:'directory'},
  {id:'same',parentId:'src',pathA:'src/same.txt',pathB:'src/same.txt',kindA:'file',kindB:'file',status:'equal'},
  {id:'pending',parentId:'src',pathA:'src/pending.txt',pathB:'src/pending.txt',kindA:'file',kindB:'file',status:'unchecked'},
 ];
 const before=JSON.stringify(entries),ids=options=>filterEntries(entries,options).map(row=>row.id);
 for(const status of ['diff','context']){
  assert.deepEqual(ids({status}),[],'default filtering retains its existing result semantics');
  assert.deepEqual(ids({status,retainDirectories:true}),['src','nested']);
  assert.deepEqual(filterEntries(entries.slice(0,1),{status,retainDirectories:true}).map(row=>row.id),['src'],'collapsed containers remain navigable');
  assert.deepEqual(ids({status,retainDirectories:true,include:'*.js'}),['src','nested'],'file masks do not prevent traversing directories');
  assert.deepEqual(ids({status,retainDirectories:true,exclude:'src'}),[]);
  assert.deepEqual(ids({status,retainDirectories:true,exclude:'src/nested/**'}),['src']);
  assert.deepEqual(ids({status,retainDirectories:true,query:'nested'}),['src','nested'],'logical ancestors remain available');
  assert.deepEqual(ids({status,retainDirectories:true,query:'missing'}),[]);
 }
 assert.deepEqual(ids({status:'same',retainDirectories:true}),['src','same']);
 assert.deepEqual(ids({status:'same',retainDirectories:true}),ids({status:'same'}));
 assert.deepEqual(ids({status:'all',retainDirectories:true}),ids({status:'all'}));
 assert.equal(JSON.stringify(entries),before,'retention never invents equality or differences');
 assert.deepEqual([...selectEntries(filterEntries(entries,{status:'diff',retainDirectories:true}),'a','changed')],[]);
});

test('glob patterns retain wildcard semantics without exponential backtracking',()=>{
 const {glob}=require('../src/folder-view.cjs');
 assert.equal(glob('src/*.?s').test('src/app.js'),true);
 assert.equal(glob('src/*.js').test('src/deep/app.js'),false);
 assert.equal(glob('src/**.js').test('src/deep/app.js'),true);
 assert.equal(glob('[test].js').test('[TEST].js'),true);
 assert.equal(glob('*a'.repeat(40)+'b').test('a'.repeat(2000)),false);
});

test('aligned filtering follows explicit hierarchy and either actual filename; selection uses IDs',()=>{
 const aligned=[
  {id:'parent',parentId:'root',pathA:'old',pathB:'new',kindA:'directory',kindB:'directory',status:'directory'},
  {id:'child',parentId:'parent',pathA:'old/original.txt',pathB:'elsewhere/renamed.js',kindA:'file',kindB:'file',status:'changed'},
  {id:'other',parentId:'root',pathA:null,pathB:'elsewhere',kindA:null,kindB:'directory',status:'right'}
 ];
 assert.deepEqual(filterEntries(aligned,{include:'*.js',query:'renamed',status:'diff'}).map(x=>x.id),['parent','child']);
 assert.deepEqual(filterEntries(aligned,{include:'*.js',query:'renamed',status:'context'}).map(x=>x.id),['parent','child']);
 assert.deepEqual(filterEntries(aligned,{exclude:'new',query:'renamed'}),[]);
 assert.deepEqual(filterEntries(aligned,{exclude:'elsewhere',status:'diff'}),[]);
 assert.deepEqual([...selectEntries(aligned,'a','changed')],['child']);
 assert.deepEqual([...selectEntries(aligned,'b','invert',new Set(['parent','child']))],['other']);
});


test('path exclusions hide descendants even when disk parents are absent from the logical tree',()=>{
 const aligned=[
  {id:'parent',parentId:'root',pathA:'source',pathB:'target',kindA:'directory',kindB:'directory',status:'directory'},
  {id:'hidden',parentId:'parent',pathA:'source/output.txt',pathB:'build/cache/output.txt',kindA:'file',kindB:'file',status:'changed'},
  {id:'kept',parentId:'parent',pathA:'source/keep.txt',pathB:'build/cache-other/keep.txt',kindA:'file',kindB:'file',status:'changed'}
 ];
 assert.equal(excluded('build/cache/deep/output.txt','build/cache'),true);
 assert.equal(excluded('build/cache/deep/output.txt','build/c?che'),true);
 assert.equal(excluded('BUILD/CACHE/deep/output.txt','build/cache'),true);
 assert.equal(excluded('build/cache-other/output.txt','build/cache'),false);
 assert.equal(excluded('other/build/cache/output.txt','build/cache'),false);
 assert.deepEqual(filterEntries(aligned,{exclude:'build/cache'}).map(row=>row.id),['parent','kept']);
 assert.deepEqual(filterEntries(aligned.slice(1),{exclude:'build/cache'}).map(row=>row.id),['kept']);
});

test('matching selection uses completed results under current rules, excluding directories and pending entries',()=>{
 const entries=[
  {id:'bytes',kindA:'file',kindB:'file',status:'equal',comparison:'content'},
  {id:'text',kindA:'file',kindB:'file',status:'equal',comparison:'text-normalized'},
  {id:'size',kindA:'file',kindB:'file',status:'equal',comparison:'metadata'},
  {id:'pending',kindA:'file',kindB:'file',status:'pending'},
  {id:'dir',kindA:'directory',kindB:'directory',status:'equal'},
  {id:'changed',kindA:'file',kindB:'file',status:'changed'},
  {id:'left',kindA:'file',kindB:null,status:'left'}
 ];
 for(const side of ['a','b'])assert.deepEqual([...selectEntries(entries,side,'matching')],['bytes','text','size']);
 assert.deepEqual([...selectEntries(entries.slice(1), 'a','matching')],['text','size']);
});

test('selected exclusions preserve literal paths, separators, wildcards and ancestors',()=>{
 const {appendExcludedPaths}=require('../src/folder-view.cjs');
 const paths=['a.txt','src/a;"*.txt','space folder','back\\slash?'];
 const mask=appendExcludedPaths('*.log',paths);
 for(const path of paths){assert.equal(excluded(path,mask),true);assert.equal(excluded(path+'/child',mask),true);assert.equal(excluded('other/'+path,mask),false);}
 assert.equal(excluded('src/a;"anything.txt',mask),false);assert.equal(excluded('elsewhere/debug.log',mask),true);
 assert.equal(appendExcludedPaths(mask,paths),mask);
 assert.equal(appendExcludedPaths('',JSON.parse(JSON.stringify(paths))),appendExcludedPaths('',paths));
 assert.throws(()=>appendExcludedPaths('', ['x'.repeat(4096)]),/Too many exclusions/);
 assert.throws(()=>appendExcludedPaths('"unfinished',['safe.txt']),/unfinished quoted path/);
 const aligned=[{id:'paired',pathA:'a.txt',pathB:'different.txt',kindA:'file',kindB:'file',status:'changed'},{id:'keep',pathA:'nested/a.txt',pathB:'nested/a.txt',kindA:'file',kindB:'file',status:'equal'}];
 assert.deepEqual(filterEntries(aligned,{exclude:appendExcludedPaths('',['different.txt'])}).map(row=>row.id),['keep']);
});

test('one-sided filters retain unopened tree containers without showing opposite-side files',()=>{
 const data=[{path:'nested',kindA:'directory',kindB:'directory',status:'unchecked'},{path:'left.txt',kindA:'file',kindB:null,status:'left'},{path:'right.txt',kindA:null,kindB:'file',status:'right'},{path:'same.txt',kindA:'file',kindB:'file',status:'equal'}];
 for(const side of ['left','right']){
  assert.deepEqual(filterEntries(data,{status:side,retainDirectories:true}).map(row=>row.path),['nested',side+'.txt']);
  assert.deepEqual(filterEntries(data,{status:side}).map(row=>row.path),[side+'.txt']);
  assert.deepEqual(filterEntries(data,{status:side,retainDirectories:true,exclude:'nested'}).map(row=>row.path),[side+'.txt']);
 }
});

test('file-only and both-side selection rules choose actual entries on each side',()=>{
 const entries=[{path:'dir',kindA:'directory',kindB:'directory',status:'equal'},{path:'leftdir',kindA:'directory',kindB:null,status:'left'},{path:'new-left',kindA:'file',kindB:'file',mtimeA:20,mtimeB:10,status:'changed'},{path:'new-right',kindA:'file',kindB:'file',mtimeA:10,mtimeB:20,status:'changed'},{path:'same',kindA:'file',kindB:'file',mtimeA:10,mtimeB:10,status:'equal'},{path:'only-right',kindA:null,kindB:'file',status:'right'}];
 assert.deepEqual([...selectEntries(entries,'a','files')],['new-left','new-right','same']);assert.deepEqual([...selectEntries(entries,'b','files-both')],['new-left','new-right','same','only-right']);
 assert.deepEqual([...selectEntries(entries,'a','newer-both')],['new-left']);assert.deepEqual([...selectEntries(entries,'b','newer-both')],['new-right']);
 assert.deepEqual([...selectEntries(entries,'a','one-sided-both')],['leftdir']);assert.deepEqual([...selectEntries(entries,'b','one-sided-both')],['only-right']);
});

test('always show folders bypasses only status for paired and one-sided directories',()=>{
 const entries=[
  {path:'paired',kindA:'directory',kindB:'directory',status:'directory'},
  {path:'left',kindA:'directory',kindB:null,status:'left'},
  {path:'right',kindA:null,kindB:'directory',status:'right'},
  {path:'changed.txt',kindA:'file',kindB:'file',status:'changed',mtimeA:20,mtimeB:10},
  {path:'equal.txt',kindA:'file',kindB:'file',status:'equal',mtimeA:10,mtimeB:10},
  {path:'one.txt',kindA:'file',kindB:null,status:'left'},
 ];
 const before=JSON.stringify(entries);
 for(const [status,files]of [['same',['equal.txt']],['newer-left',['changed.txt']],['newer-right',[]],['diff',['changed.txt','one.txt']]]){
  assert.deepEqual(filterEntries(entries,{status,alwaysShowFolders:true}).map(row=>row.path),['paired','left','right',...files]);
 }
 assert.deepEqual(filterEntries(entries,{status:'same'}).map(row=>row.path),['equal.txt']);
 assert.deepEqual(filterEntries(entries,{status:'same',alwaysShowFolders:false}).map(row=>row.path),['equal.txt']);
 assert.deepEqual(filterEntries(entries,{status:'same',alwaysShowFolders:true,include:'*.xml'}).map(row=>row.path),['paired','left','right']);
 assert.equal(JSON.stringify(entries),before);
});
test('always show folders still honors queries and exclusions on aligned actual paths and ancestors',()=>{
 const entries=[
  {id:'parent',parentId:'root',pathA:'local',pathB:'remote',kindA:'directory',kindB:'directory',status:'directory'},
  {id:'nested',parentId:'parent',pathA:'local/nested',pathB:'remote/nested',kindA:'directory',kindB:'directory',status:'directory'},
  {id:'file',parentId:'nested',pathA:'local/nested/changed.txt',pathB:'remote/nested/renamed.txt',kindA:'file',kindB:'file',status:'changed'},
  {id:'other',parentId:'root',pathA:'unrelated',pathB:null,kindA:'directory',kindB:null,status:'left'},
 ];
 const options={alwaysShowFolders:true,status:'same'};
 assert.deepEqual(filterEntries(entries,{...options,query:'nested'}).map(row=>row.id),['parent','nested']);
 assert.deepEqual(filterEntries(entries,{...options,query:'missing'}),[]);
 assert.deepEqual(filterEntries(entries,{...options,exclude:'remote'}).map(row=>row.id),['other']);
 assert.deepEqual(filterEntries(entries,{...options,exclude:'local'}).map(row=>row.id),['other']);
 assert.deepEqual(filterEntries(entries,{...options,exclude:'"remote/nested"'}).map(row=>row.id),['parent','other']);
 assert.ok(!filterEntries(entries,options).some(row=>row.id==='file'));
});
