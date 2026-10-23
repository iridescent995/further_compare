const test=require('node:test'),assert=require('node:assert/strict');
const {TableEditHistory}=require('../src/table-history.cjs');
test('table history retains null, ragged and empty results through mixed edits',()=>{
 const h=new TableEditHistory(),states=[null,[['a','b'],['c']], [['a','b'],['c'],[]], [['a'],['c'],[]], [], [['']]];let value=null;
 for(const next of states.slice(1))value=h.apply(value,next);
 for(let i=states.length-2;i>=0;i--){value=h.undo(value);assert.deepEqual(value,states[i]);}
 assert.equal(h.canUndo,false);
 for(const next of states.slice(1)){value=h.redo(value);assert.deepEqual(value,next);}
});
test('typing groups cells, flush separates edits, no-op preserves redo',()=>{
 const h=new TableEditHistory();let value=h.apply(null,[['a']]);
 value=h.apply(value,[['ab']],'cell');value=h.apply(value,[['abc']],'cell');
 value=h.undo(value);assert.deepEqual(value,[['a']]);value=h.apply(value,[['a']]);assert.equal(h.canRedo,true);
 value=h.redo(value);assert.deepEqual(value,[['abc']]);h.flush();value=h.apply(value,[['abcd']],'cell');value=h.undo(value);assert.deepEqual(value,[['abc']]);
 value=h.apply(value,[['new']],'other');assert.equal(h.canRedo,false);
});
test('immutable snapshots resist caller mutation and restore only branded captures',()=>{
 const h=new TableEditHistory(),source=[['old']];let value=h.apply(null,source);source[0][0]='bad';assert.deepEqual(value,[['old']]);
 value=h.apply(value,[['new']]);const saved=h.capture();h.clear();assert.equal(h.restore({}),false);assert.equal(new TableEditHistory().restore(saved),false);assert.equal(h.restore(saved),true);assert.deepEqual(h.undo(value),[['old']]);h.clear();assert.equal(h.restore(saved),true);assert.deepEqual(h.undo(value),[['old']]);
});
test('bounded history trims oldest transitions while preserving current adjacency',()=>{
 const h=new TableEditHistory({maxEntries:2});let value=null;for(const word of ['a','b','c','d'])value=h.apply(value,[[word]]);
 value=h.undo(value);assert.deepEqual(value,[['c']]);value=h.undo(value);assert.deepEqual(value,[['b']]);assert.equal(h.canUndo,false);value=h.redo(value);assert.deepEqual(value,[['c']]);value=h.redo(value);assert.deepEqual(value,[['d']]);
 const tiny=new TableEditHistory({maxBytes:1});value=tiny.apply(null,[['large']]);value=tiny.apply(value,[['next']]);assert.equal(tiny.canUndo,false);assert.deepEqual(value,[['next']]);
});
test('copy-on-write shares untouched rows without retaining mutable arrays',()=>{
 const h=new TableEditHistory();let value=h.apply(null,[['a'],['b']]);const row=value[1],next=value.slice();next[0]=['c'];value=h.apply(value,next);assert.equal(value[1],row);assert.ok(Object.isFrozen(value));assert.ok(Object.isFrozen(row));
});

test('invalid literal values reject atomically, including foreign frozen rows',()=>{
 const h=new TableEditHistory();let value=h.apply(null,[['a']]);value=h.apply(value,[['b']]);
 for(const invalid of [[[{bad:true}]],Object.freeze([Object.freeze([{bad:true}])]),[[NaN]],[[Infinity]],['row']])assert.throws(()=>h.apply(value,invalid));
 assert.deepEqual(h.undo(value),[['a']]);
});
