'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {FolderAlignment}=require('../desktop/folder-alignment.cjs');
const {PathNameMatching}=require('../desktop/folder-name-matching.cjs');
const {FilenameMatching}=require('../desktop/folder-filename-matching.cjs');
const {selectOperationEntries}=require('../desktop/folder-operation-scope.cjs');
const {validateEndpointKinds,validEndpointRelative}=require('../desktop/folder-endpoint-path-policy.cjs');
const mixed={a:'remote',b:'local'},remote={a:'remote',b:'remote'};
const snapshot=names=>({entries:new Map(names.map(name=>[name,{kind:'file'}])),identity:'root',skipped:0});
const pair=(a,b)=>({a:snapshot(a),b:snapshot(b)});
const row=(a,b)=>({id:'entry',parentId:null,pathA:a,pathB:b,kindA:a===null?null:'file',kindB:b===null?null:'file',status:'changed'});
test('policy is validated and copied, with strict defaults',()=>{
 assert.deepEqual(validateEndpointKinds(),{a:'local',b:'local'});
 for(const bad of [null,{},[],{a:'remote'},{a:'remote',b:'file'},{a:'remote',b:'local',other:1}])assert.throws(()=>validateEndpointKinds(bad));
 const input={...mixed},policy=validateEndpointKinds(input);input.b='remote';assert.equal(policy.b,'local');assert.ok(Object.isFrozen(policy));
});
test('remote permits drive-like filenames but never traversal or absolute paths',()=>{
 assert.equal(validEndpointRelative('C:notes.txt','remote'),true);assert.equal(validEndpointRelative('C:notes.txt'),false);
 for(const kind of ['remote','local'])for(const value of ['', '/etc', '../etc','a/../b','./a','a//b','a/','a\\b','a\0b'])assert.equal(validEndpointRelative(value,kind),false,kind+':'+JSON.stringify(value));
});
test('manual alignment maps remote colon names to explicit local targets',()=>{
 assert.throws(()=>new FolderAlignment([{a:'C:notes',b:'notes',kind:'file'}]));
 const alignment=new FolderAlignment([{a:'C:notes',b:'notes',kind:'file'}],mixed);
 assert.equal(alignment.counterpart('a','C:notes'),'notes');assert.equal(alignment.counterpart('b','notes'),'C:notes');
 assert.throws(()=>alignment.counterpart('a','D:new'));assert.throws(()=>alignment.counterpart('b','D:new'));
 assert.throws(()=>new FolderAlignment([{a:'notes',b:'C:notes',kind:'file'}],mixed));
});
test('manual policy survives swap, rename, and caller mutation',()=>{
 const kinds={...mixed},alignment=new FolderAlignment([{a:'C:notes',b:'notes',kind:'file'}],kinds);kinds.a='local';
 const swapped=alignment.swap();assert.deepEqual(swapped.endpointKinds,{a:'local',b:'remote'});assert.equal(swapped.counterpart('a','notes'),'C:notes');
 const renamed=alignment.rename('a','C:notes','D:notes');assert.equal(renamed.counterpart('a','D:notes'),'notes');assert.deepEqual(renamed.endpointKinds,mixed);
 assert.throws(()=>alignment.rename('b','notes','D:notes'));
 assert.notEqual(new FolderAlignment([],mixed).revision,new FolderAlignment().revision);
});
test('manual directory descendants validate the projected target endpoint',()=>{
 const alignment=new FolderAlignment([{a:'C:folder',b:'folder',kind:'directory'}],mixed);
 assert.equal(alignment.counterpart('a','C:folder/nested.txt'),'folder/nested.txt');
 const both=new FolderAlignment([],remote);assert.equal(both.counterpart('a','C:folder/nested.txt'),'C:folder/nested.txt');
});
for(const Class of [PathNameMatching,FilenameMatching]){
 test(Class.name+' validates namespaces separately and defaults strict',()=>{
  const inventory=pair(['C:notes'],['notes']);assert.throws(()=>new Class(inventory));
  assert.throws(()=>new Class(pair(['notes'],['C:notes']),new FolderAlignment(),{},mixed));
  const alignment=new FolderAlignment([{a:'C:notes',b:'notes',kind:'file'}],mixed),matching=new Class(inventory,alignment);
  assert.equal(matching.counterpart('a','C:notes'),'notes');assert.equal(matching.counterpart('b','notes'),'C:notes');
  assert.deepEqual(matching.swap().endpointKinds,{a:'local',b:'remote'});assert.equal(matching.swap().counterpart('a','notes'),'C:notes');
 });
 test(Class.name+' accepts explicit policy override and rejects unsafe fallback target',()=>{
  const matching=new Class(pair(['C:notes'],[]),new FolderAlignment(),{},mixed);
  assert.throws(()=>matching.counterpart('a','C:notes'));
  const both=new Class(pair(['C:notes'],['C:notes']),new FolderAlignment(),{},remote);
  assert.equal(both.counterpart('a','C:notes'),'C:notes');assert.equal(both.swap().counterpart('b','C:notes'),'C:notes');
  for(const path of ['../bad','/bad','a\\bad','a\0bad'])assert.throws(()=>both.counterpart('a',path));
 });
 test(Class.name+' cannot relax an existing manual local endpoint with invalid policy',()=>{
  const manual=new FolderAlignment([{a:'C:notes',b:'D:notes',kind:'file'}],remote);
  assert.throws(()=>new Class(pair(['C:notes'],['D:notes']),manual,{},mixed));
 });
}
test('path matching forSnapshots keeps endpoint authority',()=>{
 const manual=new FolderAlignment([{a:'C:notes',b:'notes',kind:'file'}],mixed);
 const updated=new PathNameMatching(pair(['C:notes'],['notes']),manual).forSnapshots(pair(['C:notes','D:new'],['notes']));
 assert.deepEqual(updated.endpointKinds,mixed);assert.equal(updated.counterpart('a','C:notes'),'notes');assert.throws(()=>updated.counterpart('a','D:new'));
});
test('scope validates each endpoint independently and retains strict default',()=>{
 const rows=[row('C:notes','notes')];assert.throws(()=>selectOperationEntries(rows,{},'a'));
 assert.deepEqual([...selectOperationEntries(rows,{},'a',mixed).fileIds],['entry']);
 assert.throws(()=>selectOperationEntries([row('notes','C:notes')],{},'a',mixed));
 assert.deepEqual([...selectOperationEntries([row('C:notes','D:notes')],{},'a',remote).fileIds],['entry']);
 for(const bad of ['../bad','/bad','a\\bad','a\0bad'])assert.throws(()=>selectOperationEntries([row(bad,null)],{},'a',remote));
});
test('scope still requires actual ancestors for remote colon paths and respects excludes',()=>{
 const file=row('C:folder/file.txt',null),dir={id:'parent',parentId:null,pathA:'C:folder',pathB:null,kindA:'directory',kindB:null,status:'left'};file.parentId='parent';
 assert.throws(()=>selectOperationEntries([file],{},'a',mixed));
 assert.equal(selectOperationEntries([dir,file],{},'a',mixed).fileIds.size,1);
 assert.equal(selectOperationEntries([dir,file],{exclude:'C:folder'},'a',mixed).fileIds.size,0);
});
