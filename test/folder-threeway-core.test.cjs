'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {classifyThreeWay, resolveThreeWay} = require('../desktop/folder-threeway-core.cjs');
const file = text => ({kind:'file', hash:createHash('sha256').update(text).digest('hex'), size:Buffer.byteLength(text)});
const dir = () => ({kind:'directory'});
const snapshot = entries => ({entries:new Map(Object.entries(entries)), skipped:0, identity:'root'});
const inputs = (base={},left=base,right=base) => ({base:snapshot(base),left:snapshot(left),right:snapshot(right)});
const row = (input,path) => classifyThreeWay(input).find(row => row.path===path);
test('three-way unchanged content ignores file and directory metadata', () => {
  const input=inputs({d:dir(),'d/f':file('a')});
  input.left.entries.get('d').mtime=15;
  input.right.entries.get('d/f').mode=777;
  assert.ok(classifyThreeWay(input).every(row=>row.status==='unchanged'));
  assert.equal(resolveThreeWay(input).entries.get('d/f').hash,file('a').hash);
});
test('three-way unilateral additions edits and deletions resolve to their source', () => {
  const input=inputs({gone:file('g'),edit:file('old')},{edit:file('new'),added:file('a')});
  assert.deepEqual(classifyThreeWay(input).map(row=>[row.path,row.status]),[['added','left'],['edit','left'],['gone','left']]);
  const result=resolveThreeWay(input);
  assert.deepEqual([...result.entries.keys()],['added','edit']);
  assert.equal(result.entries.get('edit').sourceSide,'left');
  const right=resolveThreeWay(inputs({f:file('old')},undefined,{f:file('new')}));
  assert.equal(right.entries.get('f').sourceSide,'right');
});
test('three-way identical edits additions and deletions are both', () => {
  const input=inputs({gone:file('g'),edit:file('old')},{edit:file('new'),added:file('a')},{edit:file('new'),added:file('a')});
  assert.ok(classifyThreeWay(input).every(row=>row.status==='both'));
  assert.deepEqual([...resolveThreeWay(input).entries.keys()],['added','edit']);
});
test('three-way independent nested branches combine without a parent conflict', () => {
  const base={d:dir(),'d/n':dir(),'d/n/a':file('a'),'d/b':file('b')};
  const input=inputs(base,{...base,'d/n/a':file('left')},{...base,'d/b':file('right')});
  assert.equal(row(input,'d').status,'merged');
  const resolved=resolveThreeWay(input);
  assert.deepEqual(resolved.conflicts,[]);
  assert.equal(resolved.entries.get('d/n/a').sourceSide,'left');
  assert.equal(resolved.entries.get('d/b').sourceSide,'right');
});
test('three-way independently added directories merge children', () => {
  const result=resolveThreeWay(inputs({}, {d:dir(),'d/a':file('a')}, {d:dir(),'d/b':file('b')}));
  assert.deepEqual([...result.entries.keys()],['d','d/a','d/b']);
});
test('three-way distinct edits conflict and explicit base left right choices resolve', () => {
  const input=inputs({f:file('base')},{f:file('left')},{f:file('right')});
  assert.equal(row(input,'f').reason,'different-content');
  assert.deepEqual(resolveThreeWay(input).conflicts,['f']);
  assert.equal(resolveThreeWay(input).entries.size,0);
  for(const side of ['base','left','right']) {
    const result=resolveThreeWay(input,{f:side});
    assert.deepEqual(result.conflicts,[]);
    assert.equal(result.entries.get('f').sourceSide,side);
    assert.equal(result.entries.get('f').hash,file(side).hash);
  }
});
test('three-way directory deletion versus descendant edit or addition conflicts at parent', () => {
  for(const changed of [{'d/a':file('edit')},{'d/a':file('a'),'d/b':file('new')}]) {
    const input=inputs({d:dir(),'d/a':file('a')},{},{d:dir(),...changed});
    assert.equal(row(input,'d').reason,'delete-versus-change');
    assert.equal(row(input,'d/a').blockedBy,'d');
    assert.deepEqual(resolveThreeWay(input).conflicts,['d']);
    assert.equal(resolveThreeWay(input,{d:'left'}).entries.size,0);
    assert.deepEqual([...resolveThreeWay(input,{d:'right'}).entries.keys()],['d',...Object.keys(changed)].sort());
    assert.equal(resolveThreeWay(input,{d:'base'}).entries.get('d/a').hash,file('a').hash);
  }
});
test('three-way file directory transitions preserve whole selected subtree', () => {
  const base={d:dir(),'d/f':file('a')};
  const unilateral=inputs(base,{d:file('replacement')});
  assert.deepEqual([...resolveThreeWay(unilateral).entries.keys()],['d']);
  const conflict=inputs(base,{d:file('replacement')},{...base,'d/f':file('edit')});
  assert.equal(row(conflict,'d').reason,'type-change');
  assert.deepEqual(resolveThreeWay(conflict).conflicts,['d']);
  assert.deepEqual([...resolveThreeWay(conflict,{d:'right'}).entries.keys()],['d','d/f']);
  const both=inputs({d:file('old')},{d:dir(),'d/a':file('a')},{d:dir(),'d/b':file('b')});
  assert.equal(row(both,'d').status,'conflict');
});
test('three-way choices reject arbitrary unnecessary and nested conflict anchors', () => {
  const input=inputs({d:dir(),'d/f':file('base')},{},{d:dir(),'d/f':file('right')});
  for(const choices of [{missing:'left'},{'d/f':'right'},{d:'other'},{d:'left','d/f':'right'}]) assert.throws(()=>resolveThreeWay(input,choices));
  assert.throws(()=>resolveThreeWay(inputs({f:file('x')}),{f:'left'}));
});
test('three-way descriptors are independent of caller mutation and frozen', () => {
  const input=inputs({d:dir(),'d/f':file('base')});
  const rows=classifyThreeWay(input), result=resolveThreeWay(input);
  input.left.entries.get('d/f').hash='0'.repeat(64);
  input.left.entries.clear();
  assert.equal(rows.find(x=>x.path==='d/f').hashLeft,file('base').hash);
  assert.equal(result.entries.get('d/f').hash,file('base').hash);
  assert.ok(Object.isFrozen(rows)); assert.ok(Object.isFrozen(rows[0]));
  assert.ok(Object.isFrozen(result.entries.get('d/f')));
});
test('three-way validates paths aliases hierarchy kind hash size and snapshot completeness', () => {
  for(const path of ['../x','/a','a//b','a\\b','C:/a','a\0b']) assert.throws(()=>classifyThreeWay(inputs({[path]:file('a')})));
  for(const entries of [{'a/b':file('a')},{a:file('a'),'a/b':file('b')},{x:{kind:'symlink'}},{x:{kind:'file',hash:'x',size:1}},{x:{...file('a'),size:-1}}]) assert.throws(()=>classifyThreeWay(inputs(entries)));
  assert.throws(()=>classifyThreeWay(inputs({A:file('a'),a:file('a')})));
  assert.throws(()=>classifyThreeWay(inputs({'é':file('a')},{'e\u0301':file('a')})));
  const incomplete=inputs({f:file('a')}); incomplete.left.skipped=1;
  assert.equal(classifyThreeWay(incomplete).length,1);
  assert.throws(()=>resolveThreeWay(incomplete),/incomplete scan/);
  incomplete.left.skipped=-1; assert.throws(()=>classifyThreeWay(incomplete));
});
test('three-way deep conflicts block every descendant without hiding unrelated resolved files', () => {
  const base={d:dir(),'d/n':dir(),'d/n/f':file('x'),safe:file('x')};
  const input=inputs(base,{safe:file('left')},{...base,'d/n/f':file('right')});
  assert.equal(row(input,'d/n/f').blockedBy,'d');
  const result=resolveThreeWay(input);
  assert.deepEqual(result.conflicts,['d']);
  assert.deepEqual([...result.entries.keys()],['safe']);
});

test('three-way applies bounded input limits and rejects malformed identities', () => {
  const huge=inputs();
  huge.left.entries=new Map(Array.from({length:100001},(_,i)=>['f'+i,dir()]));
  assert.throws(()=>classifyThreeWay(huge));
  const deep=Array.from({length:257},()=> 'd').join('/');
  assert.throws(()=>classifyThreeWay(inputs({[deep]:dir()})));
  assert.throws(()=>classifyThreeWay(inputs({['a'.repeat(32769)]:file('a')})));
  const bad=inputs(); bad.base.identity=''; assert.throws(()=>classifyThreeWay(bad));
  assert.throws(()=>classifyThreeWay(inputs({d:{kind:'directory',size:-1}})));
});
