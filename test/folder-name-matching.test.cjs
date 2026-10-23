'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {FolderAlignment}=require('../desktop/folder-alignment.cjs');
const {buildPathNameMatching,validateFolderNameRules}=require('../desktop/folder-name-matching.cjs');
const ns=entries=>({entries:new Map(entries.map(value=>typeof value==='string'?[value,{kind:'file'}]:[value[0],{kind:value[1]}]))});
const model=(a,b,rules={ignoreCase:true},manual=[])=>buildPathNameMatching({a:ns(a),b:ns(b)},new FolderAlignment(manual),rules);
test('path name rules are strict and canonical true-only',()=>{
 assert.deepEqual(validateFolderNameRules({ignoreCase:false,normalizeUnicode:true}),{normalizeUnicode:true});
 for(const value of [null,[],{ignoreCase:1},{unknown:true},{normalizeUnicode:undefined}])assert.throws(()=>validateFolderNameRules(value));
});
test('node name matching reserves exact names before unique folded groups and leaves ambiguity separate',()=>{
 const matching=model(['FOO','Foo','foo','BAR','Bar'],['FOO','fOo','bar']);
 assert.equal(matching.counterpart('a','FOO'),'FOO');
 assert.equal(matching.counterpart('a','Foo'),'Foo');assert.equal(matching.counterpart('a','foo'),'foo');
 assert.equal(matching.counterpart('b','fOo'),'fOo');assert.equal(matching.counterpart('b','bar'),'bar');
 const unique=model(['FOO','Foo'],['FOO','foo']);assert.equal(unique.counterpart('a','Foo'),'foo');
});
test('Unicode normalization and case policies are independently opt-in',()=>{
 const a='caf\u00e9.txt',b='cafe\u0301.txt';
 assert.equal(model([a],[b],{}).counterpart('a',a),a);
 assert.equal(model([a],[b],{normalizeUnicode:true}).counterpart('a',a),b);
 assert.equal(model([a.toUpperCase()],[b],{normalizeUnicode:true,ignoreCase:true}).counterpart('a',a.toUpperCase()),b);
});
test('full snapshot matching pairs unopened descendants without crossing directory structure',()=>{
 const m=model([['Source','directory'],['Source/closed','directory'],'Source/closed/deep.txt',['other','directory'],'other/deep.txt'],[['SOURCE','directory'],['SOURCE/CLOSED','directory'],'SOURCE/CLOSED/DEEP.TXT',['OTHER','directory'],'OTHER/stray.txt']);
 assert.equal(m.counterpart('a','Source/closed/deep.txt'),'SOURCE/CLOSED/DEEP.TXT');
 assert.equal(m.counterpart('a','other/deep.txt'),'OTHER/deep.txt');
 assert.equal(m.swap().counterpart('a','SOURCE/CLOSED/DEEP.TXT'),'Source/closed/deep.txt');
 assert.equal(m.counterpart('a','Source/closed/new.txt'),'SOURCE/CLOSED/new.txt');
});
test('manual reservations win over exact names and automatic pairing',()=>{
 const m=model(['file','FILE','chosen'],['file','FILE','target'],{ignoreCase:true},[{a:'file',b:'target',kind:'file'}]);
 assert.equal(m.counterpart('a','file'),'target');assert.equal(m.counterpart('b','file'),null);
 assert.equal(m.counterpart('a','FILE'),'FILE');
});
test('computed cross-kind matching retains conflicts and inventory changes invalidate revision',()=>{
 const m=model([['Dir','directory']],['DIR']);assert.equal(m.counterpart('a','Dir'),'DIR');assert.equal(m.pairs[0].kind,'directory');
 const next=m.forSnapshots({a:ns([['Dir','directory']]),b:ns(['DIR','dir'])});assert.notEqual(next.revision,m.revision);assert.equal(next.counterpart('a','Dir'),'Dir');
 assert.equal(model(['Foo'],['foo']).revision,model(['Foo'],['foo']).revision);
});
