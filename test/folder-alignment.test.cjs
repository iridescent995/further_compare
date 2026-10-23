'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {FolderAlignment}=require('../desktop/folder-alignment.cjs');
const file=(a,b)=>({a,b,kind:'file'}),dir=(a,b)=>({a,b,kind:'directory'});
test('file and directory mappings reserve counterparts while ordinary paths remain implicit',()=>{
 const model=new FolderAlignment([file('old.txt','new.txt'),dir('src','source')]);
 assert.equal(model.counterpart('a','old.txt'),'new.txt');assert.equal(model.counterpart('b','new.txt'),'old.txt');
 assert.equal(model.counterpart('a','new.txt'),null);assert.equal(model.counterpart('b','old.txt'),null);
 assert.equal(model.counterpart('a','src/nested/x'),'source/nested/x');assert.equal(model.counterpart('a','source/nested/x'),null);
 assert.equal(model.counterpart('a','old.txt/child'),'old.txt/child','file anchors match exactly');
 assert.equal(model.counterpart('a','other'),'other');assert.equal(model.counterpart('b',''),'');
});
test('coherent nested overrides use the longest directory prefix and reserve renamed children',()=>{
 const model=new FolderAlignment([dir('src','code'),dir('src/old','code/new'),file('src/old/a','code/new/b')]);
 assert.equal(model.counterpart('a','src/old/sub/file'),'code/new/sub/file');
 assert.equal(model.counterpart('a','src/old/a'),'code/new/b');assert.equal(model.counterpart('b','code/new/b'),'src/old/a');
 assert.equal(model.counterpart('a','src/new/z'),null);assert.equal(model.counterpart('a','src/old/b'),null);
});
test('cross-parent file pairs and sibling swaps remain bijective',()=>{
 const model=new FolderAlignment([file('first/a','second/b'),file('first/b','second/a')]);
 assert.equal(model.counterpart('a','first/a'),'second/b');assert.equal(model.counterpart('a','first/b'),'second/a');
 const siblings=new FolderAlignment([file('x','y'),file('y','x')]);
 assert.equal(siblings.counterpart('a','x'),'y');assert.equal(siblings.counterpart('a','y'),'x');
 assert.equal(siblings.swap().counterpart('a','y'),'x');assert.equal(model.swap().swap().revision,model.revision);
});
test('canonical immutable descriptors have stable revisions independent of order and input mutation',()=>{
 const pairs=[file('z','y'),dir('a','b')],model=new FolderAlignment(pairs);
 assert.equal(model.revision,new FolderAlignment([...pairs].reverse()).revision);assert.match(model.revision,/^[0-9a-f]{64}$/);
 pairs[0].a='changed';pairs.push(file('c','d'));assert.equal(model.counterpart('a','z'),'y');
 assert.ok(Object.isFrozen(model));assert.ok(Object.isFrozen(model.pairs));assert.ok(model.pairs.every(Object.isFrozen));
 assert.throws(()=>model.pairs[0].a='changed',TypeError);assert.throws(()=>model.pairs.push(file('c','d')),TypeError);
 assert.notEqual(model.revision,new FolderAlignment([file('z','x'),dir('a','b')]).revision);
});
test('renames remap one side and descendants atomically and invalidate revision',()=>{
 const model=new FolderAlignment([dir('old','target'),file('old/a','target/b')]);
 const renamed=model.rename('a','old','new');assert.equal(renamed.counterpart('a','new/a'),'target/b');assert.equal(model.counterpart('a','old/a'),'target/b');
 assert.notEqual(renamed.revision,model.revision);assert.equal(model.rename('b','absent','other').revision,model.revision);
 assert.equal(renamed.rename('b','target','destination').counterpart('a','new/a'),'destination/b');
 assert.throws(()=>model.rename('a','old','old/inside'),/descendant/);
 const collision=new FolderAlignment([file('x','y'),file('z','w')]);assert.throws(()=>collision.rename('a','x','z'),/unique/);assert.equal(collision.counterpart('a','x'),'y');
 assert.throws(()=>model.rename('a','old/a','elsewhere'),/ancestor/);assert.equal(model.pairs[1].a,'old/a');
});
test('alignment rejects duplicate endpoints, file ancestors and conflicting ancestry',()=>{
 for(const pairs of [[file('a','b'),file('a','c')],[file('a','b'),file('c','b')],[file('a','b'),file('a/x','b/y')],[dir('a','b'),file('a/x','c')],[dir('a','b/x'),dir('a/x','b')],[dir('a','b'),file('x','b/y')]])assert.throws(()=>new FolderAlignment(pairs));
});
test('hostile paths and malformed descriptors cannot enter mappings or rename operations',()=>{
 const paths=['','/absolute','C:/absolute','C:relative','a\\b','a\0b','.','..','a/../b','a/./b','a//b','a/','x'.repeat(32769),null,1];
 for(const value of paths){assert.throws(()=>new FolderAlignment([file(value,'safe')]));assert.throws(()=>new FolderAlignment([file('safe',value)]));assert.throws(()=>new FolderAlignment().rename('a',value,'safe'));if(value!=='')assert.throws(()=>new FolderAlignment().counterpart('a',value));}
 for(const pairs of [null,{},[null],[{...file('a','b'),extra:true}],[{a:'a',b:'b',kind:'symlink'}],new Array(1)])assert.throws(()=>new FolderAlignment(pairs));
 assert.throws(()=>new FolderAlignment([dir('a','b'.repeat(32768))]).counterpart('a','a/x'));
 assert.throws(()=>new FolderAlignment().counterpart('other','x'));assert.throws(()=>new FolderAlignment().rename('other','a','b'));
});
test('alignment supports 1000 pairs and rejects larger models without disk access',()=>{
 const pairs=Array.from({length:1000},(_,i)=>file('a'+i,'b'+i));const model=new FolderAlignment(pairs);
 assert.equal(model.pairs.length,1000);assert.equal(model.counterpart('a','a999'),'b999');
 assert.throws(()=>new FolderAlignment([...pairs,file('extra','other')]),/1,000/);
});
