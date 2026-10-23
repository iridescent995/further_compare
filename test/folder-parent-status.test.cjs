'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {parentsWithDifferences,filterEntries}=require('../src/folder-view.cjs');
const dir=(id,parentId='root')=>({id,parentId,pathA:id,pathB:id,kindA:'directory',kindB:'directory',status:'directory'});
const file=(id,parentId,status)=>({id,parentId,pathA:id,pathB:id,kindA:'file',kindB:'file',status});
test('loaded differences mark each logical ancestor without modifying rows',()=>{const rows=[dir('src'),dir('opaque','src'),file('changed','opaque','changed')],before=JSON.stringify(rows);assert.deepEqual([...parentsWithDifferences(rows)],['opaque','src']);assert.equal(JSON.stringify(rows),before);});
test('equal, pending and unopened folders do not imply differences or equality',()=>{assert.equal(parentsWithDifferences([dir('src'),dir('unopened','src'),file('same','src','equal'),file('pending','src','unchecked')]).size,0);});
test('one-sided children and conflicts mark paired ancestors, without recoloring one-sided parents',()=>{const only={...dir('only','src'),kindB:null,status:'left'};assert.deepEqual([...parentsWithDifferences([dir('src'),only,file('bad','only','conflict')])],['src']);});
test('summaries follow filename filters and terminate on malformed cycles',()=>{const rows=[dir('src'),file('change.log','src','changed'),file('same.txt','src','equal')];assert.equal(parentsWithDifferences(filterEntries(rows,{exclude:'*.log'})).size,0);assert.deepEqual([...parentsWithDifferences([dir('a','b'),dir('b','a'),file('x','a','changed')])],['a','b']);});
const {createFolderSummaryCache}=require('../src/folder-view.cjs');
test('collapsed summaries survive navigation and propagate through open ancestors',()=>{
 const cache=createFolderSummaryCache(),full=[dir('src'),dir('inner','src'),file('bad','inner','changed')];
 assert.deepEqual([...cache.summarize(full,new Set(['src','inner']),'session')].sort(),['inner','src']);
 assert.deepEqual([...cache.summarize(full.slice(0,2),new Set(['src']),'session')].sort(),['inner','src']);
 assert.deepEqual([...cache.summarize(full.slice(0,1),new Set(),'session')],['src']);
 cache.reset();assert.equal(cache.summarize(full.slice(0,1),new Set(),'session').size,0);
});
test('changed context and reloaded equal children invalidate remembered differences',()=>{
 const cache=createFolderSummaryCache(),rows=[dir('src'),file('bad','src','changed')];
 cache.summarize(rows,new Set(['src']),'first');assert.equal(cache.summarize(rows.slice(0,1),new Set(),'other-filters').size,0);
 cache.summarize(rows,new Set(['src']),'first');assert.equal(cache.summarize([dir('src'),file('bad','src','equal')],new Set(['src']),'first').size,0);
 assert.equal(cache.summarize(rows.slice(0,1),new Set(),'first').size,0);
});
