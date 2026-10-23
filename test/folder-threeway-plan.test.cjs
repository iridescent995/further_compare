'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildThreeWayPlan} = require('../desktop/folder-threeway-plan.cjs');
const hash = 'a'.repeat(64), changedHash = 'b'.repeat(64);
const file = (path, extra = {}) => ({kind:'file', hash, size:3, sourceSide:'left', sourcePath:path, ...extra});
const dir = () => ({kind:'directory'});
const plan = (desired = [], target = []) => buildThreeWayPlan({entries:new Map(desired), conflicts:[]}, {entries:new Map(target), skipped:0});

test('mirror plans retain identical content and overwrite changed content without deleting first', () => {
  const result = plan([['same',file('same')],['changed',file('changed',{hash:changedHash})],['new',file('new',{sourceSide:'right'})]], [['same',file('same',{hash:hash.toUpperCase()})],['changed',file('changed')],['obsolete',file('obsolete')]]);
  assert.deepEqual(result, [
    {type:'delete-file',path:'obsolete',hash,size:3},
    {type:'copy-file',path:'changed',sourceSide:'left',sourcePath:'changed',hash:changedHash,size:3,oldHash:hash,oldSize:3},
    {type:'copy-file',path:'new',sourceSide:'right',sourcePath:'new',hash,size:3,oldHash:null,oldSize:null}
  ]);
  assert.ok(Object.isFrozen(result)); assert.ok(result.every(Object.isFrozen));
});
test('nested type transitions remove children before parents and create parents before children', () => {
  const desired = [['to-file',file('to-file')],['to-dir',dir()],['to-dir/nested',dir()],['to-dir/nested/file',file('to-dir/nested/file')]];
  const target = [['to-file',dir()],['to-file/sub',dir()],['to-file/sub/old',file('to-file/sub/old')],['to-dir',file('to-dir')]];
  const result = plan(desired.reverse(), target.reverse());
  assert.deepEqual(result.map(({type,path})=>[type,path]), [
    ['delete-file','to-file/sub/old'],['delete-file','to-dir'],
    ['delete-directory','to-file/sub'],['delete-directory','to-file'],
    ['create-directory','to-dir'],['create-directory','to-dir/nested'],
    ['copy-file','to-dir/nested/file'],['copy-file','to-file']
  ]);
  // Interpret operations against a model filesystem; no operation may require recursive deletion.
  const state = new Map(target);
  for (const op of result) {
    const parent = op.path.includes('/') ? op.path.slice(0,op.path.lastIndexOf('/')) : '';
    if (op.type === 'delete-directory') assert.ok(![...state.keys()].some(p => p.startsWith(op.path+'/')));
    if (op.type.startsWith('delete')) state.delete(op.path);
    else {
      if (parent) assert.equal(state.get(parent)?.kind,'directory');
      assert.ok(!state.has(op.path));
      state.set(op.path,op.type === 'create-directory' ? dir() : file(op.path));
    }
  }
  assert.deepEqual([...state.keys()].sort(), desired.map(([p])=>p).sort());
});
test('empty outputs and complete deletions are deterministic without input mutation', () => {
  assert.deepEqual(plan(),[]);
  const entry = file('dir/f'), target = [['dir',dir()],['dir/f',entry]];
  assert.deepEqual(plan([],target).map(o=>o.type),['delete-file','delete-directory']);
  assert.equal(entry.sourcePath,'dir/f'); assert.equal(target.length,2);
  assert.deepEqual(plan([['empty',dir()]]),[{type:'create-directory',path:'empty'}]);
});
test('size disagreement requires copy even if hashes match and returned operations are detached', () => {
  const source = file('f'), result = plan([['f',source]],[['f',file('f',{size:4})]]);
  source.hash = changedHash;
  assert.equal(result[0].hash,hash); assert.equal(result[0].oldSize,4);
});
test('rejects conflicts and incomplete target scans rather than deleting unknown content', () => {
  for (const conflicts of [undefined,['f'],{}]) assert.throws(()=>buildThreeWayPlan({entries:new Map(),conflicts},{entries:new Map(),skipped:0}),/conflict/);
  for (const skipped of [undefined,1,-1,'0',NaN]) assert.throws(()=>buildThreeWayPlan({entries:new Map(),conflicts:[]},{entries:new Map(),skipped}),/incomplete/);
});
test('rejects hazardous portable paths on both desired and output sides', () => {
  for (const path of ['../x','/root','a//b','a\\b','x:stream','nul','CON.txt','com1.log','LPT²','x.','x ','a?','a*','a|','a<','a"','a\0','a/../b']) {
    assert.throws(()=>plan([[path,file(path)]]),/path/);
    assert.throws(()=>plan([],[[path,file(path)]]),/path/);
  }
});
test('rejects case and Unicode aliases across desired and output including directories', () => {
  assert.throws(()=>plan([['A',file('A')]],[['a',file('a')]]),/aliases/);
  assert.throws(()=>plan([['é',file('é')]],[['e\u0301',file('e\u0301')]]),/aliases/);
  assert.throws(()=>plan([['Dir',dir()],['Dir/a',file('Dir/a')]],[['dir',dir()]]),/aliases/);
});
test('rejects missing and non-directory ancestors and malformed source authorities', () => {
  assert.throws(()=>plan([['dir/f',file('dir/f')]]),/parent/);
  assert.throws(()=>plan([], [['dir',file('dir')],['dir/f',file('dir/f')]]),/parent/);
  for (const extra of [{sourceSide:'output'},{sourceSide:null},{sourcePath:'elsewhere'},{sourcePath:'../f'},{hash:'bad'},{size:-1},{kind:'symlink'}]) assert.throws(()=>plan([['f',file('f',extra)]]));
  let accessed = false;
  assert.throws(()=>plan([['f',{get kind(){accessed=true;return 'file';}}]]),/plain data/);
  assert.equal(accessed,false);
});
test('enforces depth, entry count, and cumulative path-byte limits before planning', () => {
  assert.throws(()=>plan([['a/'.repeat(256)+'z',file('a/'.repeat(256)+'z')]]),/path/);
  const entries = new Map(Array.from({length:100001},(_,i)=>['f'+i,file('f'+i)]));
  assert.throws(()=>buildThreeWayPlan({entries:new Map(),conflicts:[]},{entries,skipped:0}),/bounded/);
  const long = 'x'.repeat(32000);
  const large = Array.from({length:525},(_,i)=>[long+i,dir()]);
  assert.throws(()=>plan([],large),/planning limit/);
});
