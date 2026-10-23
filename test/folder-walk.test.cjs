'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { walkFolders } = require('../src/folder-walk.cjs');
const directory = path => ({ path, kindA: 'directory', kindB: null });
const file = path => ({ path, kindA: 'file', kindB: 'file' });

test('walk lists both sides, conflicts and descendants once, incrementally', async () => {
  const tree = {
    '': { rows: [directory('left'), { path: 'right', kindA: 'file', kindB: 'directory' }], skipped: 2 },
    left: { rows: [directory('left/child'), directory('left/child')], skipped: 1 },
    right: { rows: [file('right/text')] },
    'left/child': { rows: [directory('left')] } // Repeated ancestors cannot create an endless walk.
  };
  const calls = [], published = [];
  const result = await walkFolders({
    listNode: async path => { calls.push(path); assert.equal(published.length, calls.length - 1); return tree[path]; },
    onNode: async (path, rows) => { await Promise.resolve(); published.push([path, rows]); }
  });
  assert.deepEqual(calls, ['', 'left', 'right', 'left/child']);
  assert.deepEqual(published.map(([path]) => path), calls);
  assert.deepEqual(result, { nodes: 4, entries: 6, skipped: 3, complete: true, cancelled: false, limited: false });
});

test('empty root completes, and exact limits do not imply truncation', async () => {
  const result = await walkFolders({ listNode: async () => ({ rows: [] }), onNode: () => {}, maxNodes: 1, maxEntries: 0 });
  assert.equal(result.complete, true);
  assert.equal(result.nodes, 1);
  assert.equal(result.entries, 0);
  const exact = await walkFolders({ listNode: async () => ({ rows: [file('one')] }), onNode: () => {}, maxNodes: 1, maxEntries: 1 });
  assert.equal(exact.complete, true);
});

test('node cap stops before another read; entry cap rejects the entire overflowing node', async () => {
  const calls = [], published = [];
  const options = {
    listNode: async path => { calls.push(path); return { rows: path ? [file('dir/a'), file('dir/b')] : [directory('dir')] }; },
    onNode: (path, rows) => published.push([path, rows])
  };
  let result = await walkFolders({ ...options, maxNodes: 1 });
  assert.deepEqual(calls, ['']);
  assert.equal(result.limited, true);
  assert.equal(result.complete, false);
  calls.length = published.length = 0;
  result = await walkFolders({ ...options, maxEntries: 2 });
  assert.deepEqual(calls, ['', 'dir']);
  assert.deepEqual(published.map(([path]) => path), ['']);
  assert.equal(result.entries, 1);
  assert.equal(result.nodes, 1);
  assert.equal(result.limited, true);
});

test('cancellation before or during a read never publishes stale results', async () => {
  let cancelled = true, calls = 0, published = 0;
  const options = {
    listNode: async () => { calls++; cancelled = true; return { rows: [file('a')] }; },
    onNode: () => published++,
    isCancelled: () => cancelled
  };
  assert.equal((await walkFolders(options)).cancelled, true);
  assert.equal(calls, 0);
  cancelled = false;
  const result = await walkFolders(options);
  assert.equal(result.cancelled, true);
  assert.equal(result.nodes, 0);
  assert.equal(result.entries, 0);
  assert.equal(calls, 1);
  assert.equal(published, 0);
});

test('cancellation during async publication prevents subsequent node reads', async () => {
  let cancelled = false, calls = 0;
  const result = await walkFolders({
    listNode: async () => { calls++; return { rows: [directory('child')] }; },
    onNode: async () => { await Promise.resolve(); cancelled = true; },
    isCancelled: () => cancelled
  });
  assert.equal(calls, 1);
  assert.equal(result.nodes, 1);
  assert.equal(result.cancelled, true);
  assert.equal(result.complete, false);
});

test('provider and publication errors propagate, malformed paths and limits reject', async () => {
  const failure = new Error('Cannot read this folder');
  await assert.rejects(walkFolders({ listNode: async () => { throw failure; }, onNode: () => {} }), error => error === failure);
  await assert.rejects(walkFolders({ listNode: async () => ({ rows: [] }), onNode: () => { throw failure; } }), error => error === failure);
  for (const path of ['../escape', '/absolute', 'x//y', 'x/./y', 'x\\y', 'x\0y', '']) {
    await assert.rejects(walkFolders({ listNode: async () => ({ rows: [directory(path)] }), onNode: () => assert.fail('Invalid node published') }), /relative/);
  }
  await assert.rejects(walkFolders({ listNode: () => {}, onNode: () => {}, maxNodes: -1 }), /limits/);
});

test('aligned walk traverses opaque IDs and explicit parents across independently named paths', async () => {
 const calls=[];
 const tree={root:{rows:[
  {id:'directory-id',parentId:'root',pathA:'old',pathB:'other/new',kindA:'directory',kindB:'directory'},
  {id:'conflict-id',parentId:'root',pathA:'changed',pathB:'changed',kindA:'directory',kindB:'directory',alignmentConflict:true}
 ]},'directory-id':{rows:[{id:'file-id',parentId:'directory-id',pathA:'old/a',pathB:'outside/b',kindA:'file',kindB:'file'}]}};
 const result=await walkFolders({root:'root',listNode:async id=>{calls.push(id);return tree[id];},onNode:()=>{}});
 assert.deepEqual(calls,['root','directory-id']);
 assert.equal(result.complete,true);assert.equal(result.entries,3);
});

test('aligned walk refuses malformed parentage and unsafe actual paths before publishing',async()=>{
 for(const row of [
  {id:'entry',parentId:'wrong',pathA:'a',pathB:null},
  {id:'entry',parentId:'root',pathA:'../a',pathB:null},
  {id:'root',parentId:'root',pathA:'a',pathB:null},
  {id:'entry',parentId:'root',pathA:null,pathB:null}
 ]) await assert.rejects(walkFolders({root:'root',listNode:async()=>({rows:[row]}),onNode:()=>assert.fail('Invalid native rows published')}),/aligned/);
});
