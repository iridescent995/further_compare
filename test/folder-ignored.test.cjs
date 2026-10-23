'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {MAX_IGNORED_MARKS,addIgnoredRows,removeIgnoredRows,pruneIgnoredMarks,projectIgnoredRows,ignoredPaths} = require('../src/folder-ignored.cjs');
const row = (a,b,kind='file',status='different') => ({pathA:a,pathB:b,kindA:a?kind:null,kindB:b?kind:null,versionA:a?'a1':null,versionB:b?'b1':null,status});
test('file marks project copies without asserting equality or changing underlying results',()=>{
 const original=Object.freeze(row('file.txt','renamed.txt'));
 const marks=addIgnoredRows([], [original,original]);
 assert.equal(marks.length,1);
 const [projected,other]=projectIgnoredRows([original,row('file.txt/sub','renamed.txt/sub')],marks);
 assert.equal(projected.status,'ignored');assert.equal(projected.actualStatus,'different');assert.equal(projected.ignored,true);
 assert.equal(original.status,'different');assert.equal(other.status,'different');assert.notEqual(other,original);
 assert.deepEqual(ignoredPaths(marks),{a:['file.txt'],b:['renamed.txt']});
});
test('aligned directory scope uses both actual endpoints and component boundaries',()=>{
 const parent=row('java/left','other/right','directory','directory');
 const marks=addIgnoredRows([], [parent]);
 const entries=[parent,row('java/left/a','other/right/a'),row('java/left/b',null),row(null,'other/right/c'),row('java/leftish/a','other/rightish/a'),row('java/left/d','outside/d')];
 assert.deepEqual(projectIgnoredRows(entries,marks).map(value=>value.status),['ignored','ignored','ignored','ignored','different','different']);
});
test('one-sided directory marks never cover a counterpart outside marked authority',()=>{
 const parent=row('left',null,'directory');
 const entries=[parent,row('left/a',null),row('left/b','right/b'),row(null,'left/c')];
 assert.deepEqual(projectIgnoredRows(entries,addIgnoredRows([], [parent])).map(value=>value.status),['ignored','ignored','different','different']);
});
test('file and directory version changes clear marks; collapsed absence retains them',()=>{
 for(const kind of ['file','directory']){
  const original=row('x','y',kind),marks=addIgnoredRows([], [original]);
  assert.deepEqual(pruneIgnoredMarks([],marks),marks);
  assert.equal(pruneIgnoredMarks([{...original,versionA:'changed'}],marks).length,0);
  assert.equal(projectIgnoredRows([{...original,versionB:'changed'}],marks)[0].status,'different');
  assert.equal(pruneIgnoredMarks([{...original,kindA:kind==='file'?'directory':'file'}],marks).length,0);
 }
});
test('counterpart disappearance, appearance and realignment revoke original marks',()=>{
 const original=row('x','y'),marks=addIgnoredRows([], [original]);
 assert.equal(pruneIgnoredMarks([row('x',null)],marks).length,0);
 assert.equal(pruneIgnoredMarks([row('x','z')],marks).length,0);
 assert.equal(pruneIgnoredMarks([row('z','y')],marks).length,0);
 assert.equal(pruneIgnoredMarks([original],addIgnoredRows([], [row('x',null)])).length,0);
});
test('unignore child restores containing scope; unignore parent removes nested marks',()=>{
 const parent=row('a','b','directory'),child=row('a/c','b/c'),unrelated=row('other','other');
 const marks=addIgnoredRows([], [parent,child,unrelated]);
 assert.deepEqual(removeIgnoredRows(marks,[child]),addIgnoredRows([], [unrelated]));
 assert.deepEqual(removeIgnoredRows(marks,[parent]),addIgnoredRows([], [unrelated]));
 assert.equal(marks.length,3);
});
test('mixed type conflict marks apply only to exact pair',()=>{
 const conflict={...row('x','y'),kindA:'directory',status:'conflict'};
 assert.deepEqual(projectIgnoredRows([conflict,row('x/a','y/a')],addIgnoredRows([], [conflict])).map(value=>value.status),['ignored','different']);
});
test('marks are bounded and validated without partially mutating caller arrays',()=>{
 const marks=Array.from({length:MAX_IGNORED_MARKS},(_,i)=>row(`a${i}`,`b${i}`));
 assert.equal(addIgnoredRows(marks,[marks[0]]).length,MAX_IGNORED_MARKS);
 assert.throws(()=>addIgnoredRows(marks,[row('extra','extra')]),/at most/);assert.equal(marks.length,MAX_IGNORED_MARKS);
 for(const invalid of [row('../x','x'),row('/x','x'),row(null,null),{...row('x','y'),versionA:null}])assert.throws(()=>addIgnoredRows([], [invalid]));
});
test('large unrelated mark sets avoid per-row scans of every mark',()=>{
 const entries=Array.from({length:20000},(_,i)=>row(`loaded/sub/file-${i}`,`right/sub/file-${i}`));
 const marks=addIgnoredRows([],Array.from({length:1000},(_,i)=>row(`unrelated-${i}`,`other-${i}`,'directory')));
 const started=performance.now();
 const result=projectIgnoredRows(entries,marks);
 const elapsed=performance.now()-started;
 assert.equal(result.length,entries.length);assert.ok(result.every(entry=>entry.status==='different'));
 assert.notEqual(result[0],entries[0]);
 assert.ok(elapsed<3000,`Projection took ${elapsed.toFixed(0)} ms; unrelated marks must be indexed.`);
});
test('no-mark projection still copies rows and accepts empty inputs',()=>{
 const entries=[row('a','b')],result=projectIgnoredRows(entries,[]);
 assert.deepEqual(result,entries);assert.notEqual(result[0],entries[0]);
 assert.deepEqual(projectIgnoredRows([],[]),[]);
});
