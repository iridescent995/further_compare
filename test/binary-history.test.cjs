const test = require('node:test');
const assert = require('node:assert/strict');
const {BinaryEditHistory} = require('../src/binary-history.cjs');
const bytes = text => Uint8Array.from(Buffer.from(text));
const text = value => Buffer.from(value).toString();

test('binary history undoes and redoes a mixed sequence of byte and range edits', () => {
  const history = new BinaryEditHistory(), original = bytes('abcdef'), states = [original];
  let current = original;
  for (const [start, end, replacement] of [[1, 2, 'X'], [3, 3, 'HELLO'], [0, 3, ''], [2, 5, 'YZ']]) {
    current = history.apply(current, start, end, bytes(replacement));
    states.push(current);
  }
  for (let i = states.length - 2; i >= 0; i--) {
    assert.equal(history.canUndo, true);
    current = history.undo(current);
    assert.deepEqual(current, states[i]);
  }
  assert.equal(history.canUndo, false);
  assert.strictEqual(history.undo(current), current);
  for (let i = 1; i < states.length; i++) {
    assert.equal(history.canRedo, true);
    current = history.redo(current);
    assert.deepEqual(current, states[i]);
  }
  assert.equal(history.canRedo, false);
  assert.strictEqual(history.redo(current), current);
  assert.equal(text(original), 'abcdef');
});

test('new edits clear redo while no-op and invalid edits preserve it', () => {
  const history = new BinaryEditHistory();
  let current = history.apply(bytes('abc'), 1, 2, bytes('X'));
  current = history.undo(current);
  assert.strictEqual(history.apply(current, 0, 1, bytes('a')), current);
  assert.strictEqual(history.apply(current, 1, 1, bytes('')), current);
  assert.throws(() => history.apply(current, -1, 0, bytes('z')));
  assert.equal(history.canRedo, true);
  current = history.redo(current);
  assert.equal(text(current), 'aXc');
  current = history.undo(current);
  current = history.apply(current, 1, 2, bytes('Y'));
  assert.equal(history.canRedo, false);
  assert.equal(text(history.undo(current)), 'abc');
});

test('history entry cap retains the nearest continuous undo and redo chain', () => {
  const history = new BinaryEditHistory({maxEntries: 2});
  let current = bytes('0');
  for (const value of ['1', '2', '3', '4']) current = history.apply(current, 0, 1, bytes(value));
  current = history.undo(current); assert.equal(text(current), '3');
  current = history.undo(current); assert.equal(text(current), '2');
  assert.equal(history.canUndo, false);
  current = history.redo(current); assert.equal(text(current), '3');
  current = history.redo(current); assert.equal(text(current), '4');
  assert.equal(history.canRedo, false);
});

test('undo growth trims farthest undo entries before the nearest redo chain', () => {
  const history = new BinaryEditHistory({maxBytes: 3});
  let current = history.apply(bytes('a'), 0, 1, bytes('b')); // stored: a
  current = history.apply(current, 1, 1, bytes('XYZ')); // stored: a, empty
  current = history.undo(current); // redo stores XYZ; evicts a
  assert.equal(text(current), 'b');
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);
  current = history.redo(current);
  assert.equal(text(current), 'bXYZ');
  assert.equal(text(history.undo(current)), 'b');
});

test('undo growth retains the nearest redo entry when the redo stack itself exceeds the budget', () => {
  const history = new BinaryEditHistory({maxBytes: 3});
  let current = history.apply(bytes('XYZ'), 0, 3, bytes(''));
  current = history.apply(current, 0, 0, bytes('Q'));
  current = history.undo(current); // redo Q and undo XYZ exceed budget, evicts XYZ
  assert.equal(history.canUndo, false);
  current = history.redo(current);
  current = history.apply(current, 0, 1, bytes('XYZ')); // undo empty, Q
  current = history.undo(current); // undo empty and redo XYZ
  current = history.undo(current); // redo XYZ and Q exceed budget, evicts farthest XYZ
  assert.equal(text(current), '');
  current = history.redo(current);
  assert.equal(text(current), 'Q');
  assert.equal(history.canRedo, false);


});

test('redo captures deleted bytes again while respecting the combined stack budget', () => {
  const history = new BinaryEditHistory({maxBytes: 6});
  let current = history.apply(bytes('XYZ'), 0, 3, bytes(''));
  current = history.apply(current, 0, 0, bytes('ABC'));
  current = history.undo(current);
  current = history.undo(current);
  assert.equal(text(current), 'XYZ');
  current = history.redo(current); // stores XYZ in undo, ABC remains in redo
  assert.equal(text(current), '');
  assert.equal(history.canUndo && history.canRedo, true);
  current = history.redo(current);
  assert.equal(text(current), 'ABC');
  current = history.undo(current);
  current = history.undo(current);
  assert.equal(text(current), 'XYZ');
});

test('over-budget inverse operations succeed but do not leave a broken history chain', () => {
  const history = new BinaryEditHistory({maxBytes: 0});
  let current = history.apply(bytes(''), 0, 0, bytes('large insertion'));
  assert.equal(history.canUndo, true); // insertion needs no removed-byte storage
  current = history.undo(current);
  assert.equal(text(current), '');
  assert.equal(history.canRedo, false); // its inverse cannot fit
  current = history.apply(bytes('abc'), 0, 3, bytes('x'));
  assert.equal(text(current), 'x');
  assert.equal(history.canUndo, false);
});

test('failed undo and redo are atomic and history data never aliases caller buffers', () => {
  const history = new BinaryEditHistory(), original = bytes('abc'), replacement = bytes('XYZ');
  let current = history.apply(original, 1, 2, replacement);
  original.fill(0); replacement.fill(0);
  assert.equal(text(current), 'aXYZc');
  assert.throws(() => history.undo(bytes('')));
  assert.equal(history.canUndo, true);
  current = history.undo(current);
  assert.equal(text(current), 'abc');
  assert.throws(() => history.redo(bytes('')));
  assert.equal(history.canRedo, true);
  current = history.redo(current);
  assert.equal(text(current), 'aXYZc');
  assert.equal(text(history.undo(current)), 'abc');
});

test('clear resets both stacks and constructor rejects unbounded history settings', () => {
  const history = new BinaryEditHistory();
  let current = history.apply(bytes('a'), 0, 1, bytes('b'));
  current = history.apply(current, 0, 1, bytes('c'));
  current = history.undo(current);
  assert.equal(history.canUndo && history.canRedo, true);
  history.clear();
  assert.equal(history.canUndo || history.canRedo, false);
  assert.strictEqual(history.undo(current), current);
  assert.strictEqual(history.redo(current), current);
  for (const maxEntries of [0, 101, 1.5, Infinity]) assert.throws(() => new BinaryEditHistory({maxEntries}));
  for (const maxBytes of [-1, 32 * 1024 * 1024 + 1, 0.5, Infinity]) assert.throws(() => new BinaryEditHistory({maxBytes}));
});

test('opaque history snapshots survive clear, restore repeatedly, and do not expose bytes', () => {
  const history = new BinaryEditHistory();
  let current = history.apply(bytes('abc'), 1, 2, bytes('XYZ'));
  current = history.apply(current, 0, 1, bytes('Q'));
  current = history.undo(current);
  const savedBytes = Uint8Array.from(current), snapshot = history.capture();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(JSON.stringify(snapshot), '{}');
  assert.deepEqual(Object.keys(snapshot), []);
  history.clear();
  assert.equal(history.canUndo || history.canRedo, false);
  assert.equal(history.restore(snapshot), true);
  current = history.redo(savedBytes);
  assert.equal(text(current), 'QXYZc');
  current.fill(0);
  history.clear();
  assert.equal(history.restore(snapshot), true);
  current = history.undo(savedBytes);
  assert.equal(text(current), 'abc');
  assert.equal(text(history.redo(current)), 'aXYZc');
  assert.equal(text(history.redo(savedBytes)), 'QXYZc');
});

test('forged, serialized and foreign history snapshots are rejected without altering stacks', () => {
  const history = new BinaryEditHistory(), other = new BinaryEditHistory();
  const current = history.apply(bytes('abc'), 1, 2, bytes('X'));
  const snapshot = history.capture();
  for (const token of [null, undefined, 4, {}, JSON.parse(JSON.stringify(snapshot)), other.capture()]) {
    assert.equal(history.restore(token), false);
    assert.equal(history.canUndo, true);
    assert.equal(history.canRedo, false);
  }
  assert.equal(text(history.undo(current)), 'abc');
});

test('snapshots retain only history already trimmed to entry and byte limits', () => {
  const history = new BinaryEditHistory({maxEntries: 2, maxBytes: 2});
  let current = bytes('0');
  for (const value of ['1', '2', '3']) current = history.apply(current, 0, 1, bytes(value));
  const snapshot = history.capture();
  history.clear();history.restore(snapshot);
  current = history.undo(current);assert.equal(text(current), '2');
  current = history.undo(current);assert.equal(text(current), '1');
  assert.equal(history.canUndo, false);
});
