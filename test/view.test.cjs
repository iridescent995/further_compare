const {test} = require('node:test');
const assert = require('node:assert/strict');
const {compare, merge} = require('../src/diff.cjs');
const {filterRows} = require('../src/view.cjs');

test('views preserve actual row references, indices and hunk coordinates', () => {
  const a = 'same\nrepeat\nrepeat\nleft\nrepeat\nend';
  const b = 'same\nrepeat\nright\nrepeat\nrepeat\nend\nextra';
  const result = compare(a, b);
  const before = JSON.stringify(result);
  for (const mode of ['all', 'diff', 'same', 'context']) {
    for (const entry of filterRows(result, mode)) {
      if (entry.gap) continue;
      assert.equal(entry.row, result.rows[entry.index]);
      if (mode === 'diff') assert.notEqual(entry.row.type, 'equal');
      if (mode === 'same') assert.equal(entry.row.type, 'equal');
    }
  }
  assert.equal(JSON.stringify(result), before);
  const all = filterRows(result);
  assert.equal(all.length, result.rows.length);
  const partitions = [...filterRows(result, 'diff'), ...filterRows(result, 'same')]
    .sort((x, y) => x.index - y.index);
  assert.deepEqual(partitions, all);
  let merged = b;
  for (const h of [...result.hunks].reverse()) merged = merge(a, merged, h, 'a');
  assert.equal(merged, a);
});

test('context includes three equal neighbors with exact leading, middle and trailing gaps', () => {
  const left = Array.from({length: 30}, (_, i) => `line ${i}`);
  const right = [...left];
  right[7] = 'change one';
  right[21] = 'change two';
  const entries = filterRows(compare(left.join('\n'), right.join('\n')), 'context');
  assert.deepEqual(entries.filter(entry => entry.gap), [
    {gap: true, count: 4, index: 0},
    {gap: true, count: 7, index: 11},
    {gap: true, count: 5, index: 25},
  ]);
  assert.deepEqual(entries.filter(entry => !entry.gap).map(entry => entry.index),
    [4,5,6,7,8,9,10,18,19,20,21,22,23,24]);
});

test('context joins adjacent windows and handles changes at both boundaries', () => {
  const a = Array.from({length: 15}, (_, i) => `line ${i}`);
  const b = [...a];
  for (const i of [0, 6, 14]) b[i] = `changed ${i}`;
  const entries = filterRows(compare(a.join('\n'), b.join('\n')), 'context');
  assert.deepEqual(entries.filter(entry => entry.gap), [{gap: true, count: 1, index: 10}]);
  assert.equal(entries[0].index, 0);
  assert.equal(entries.at(-1).index, 14);
});

test('context preserves all rows for identical files and handles empty comparisons', () => {
  for (const [a, b] of [['same\nsame\n', 'same\nsame\n'], ['', ''], ['', 'added'], ['removed', '']]) {
    const result = compare(a, b);
    assert.deepEqual(filterRows(result, 'context'), filterRows(result, 'all'));
  }
  assert.deepEqual(filterRows(compare('same', 'same'), 'diff'), []);
  assert.deepEqual(filterRows(compare('', 'new'), 'same'), []);
});

test('context includes every row of a long changed section', () => {
  const result = compare('header\nfooter', `header\n${Array.from({length: 20}, (_, i) => i).join('\n')}\nfooter`);
  assert.deepEqual(filterRows(result, 'context'), filterRows(result, 'all'));
  assert.equal(filterRows(result, 'diff').length, 20);
});

test('unknown view modes fail explicitly', () => {
  assert.throws(() => filterRows(compare('', ''), 'invalid'), RangeError);
});

test('show minor changes only view membership and preserves original text, coordinates and merge hunks',()=>{
  const a=' HEADER\nunchanged\nleft\n Anchor ',b='header\nunchanged\nright\nanchor';
  const result=compare(a,b,true,[{a:3,b:3}],true),before=JSON.stringify(result);
  assert.deepEqual(filterRows(result,'diff').map(entry=>entry.index),[2]);
  assert.deepEqual(filterRows(result,'diff',true).map(entry=>entry.index),[0,2,3]);
  assert.deepEqual(filterRows(result,'same').map(entry=>entry.index),[0,1,3]);
  assert.deepEqual(filterRows(result,'same',true).map(entry=>entry.index),[1]);
  assert.deepEqual(filterRows(result,'all',true),filterRows(result,'all'));
  for(const showMinor of [false,true]){
    for(const mode of ['all','same','diff','context']){
      for(const entry of filterRows(result,mode,showMinor)){
        if(!entry.gap)assert.equal(entry.row,result.rows[entry.index]);
      }
    }
    const partition=[...filterRows(result,'same',showMinor),...filterRows(result,'diff',showMinor)].sort((x,y)=>x.index-y.index);
    assert.deepEqual(partition,filterRows(result,'all'));
  }
  assert.equal(JSON.stringify(result),before);
  assert.equal(merge(a,b,result.hunks[0],'a'),'header\nunchanged\nleft\nanchor');
  assert.equal(merge(a,b,result.hunks[0],'b'),' HEADER\nunchanged\nright\n Anchor ');
});

test('minor-only context uses three neighboring rows when enabled and defaults to all rows',()=>{
  const a=Array.from({length:30},(_,i)=>`line ${i}`),b=[...a];
  b[7]='LINE 7';b[21]=' line21 ';
  const result=compare(a.join('\n'),b.join('\n'),true,[],true);
  assert.equal(result.hunks.length,0);
  assert.deepEqual(filterRows(result,'context'),filterRows(result,'all'));
  assert.deepEqual(filterRows(result,'context',true).filter(entry=>entry.gap),[
    {gap:true,count:4,index:0},{gap:true,count:7,index:11},{gap:true,count:5,index:25}
  ]);
  assert.deepEqual(filterRows(result,'diff',true).map(entry=>entry.index),[7,21]);
});
