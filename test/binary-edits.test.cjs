const test = require('node:test');
const assert = require('node:assert/strict');
const {alignBinary} = require('../src/structured-diff.cjs');
const {binaryRangeOffsets, replaceBinaryRange, undoBinaryEdit} = require('../src/binary-edits.cjs');
const bytes = value => Buffer.from(value);
const equal = (a, b) => assert.deepEqual([...a], [...b]);

test('copying aligned insertion, deletion and replacement differences produces the left file and can be undone', () => {
  for (const [a, b] of [['abXYcd', 'abcd'], ['abcd', 'abXYcd'], ['abXYcd', 'abZcd'], ['', 'XYZ'], ['XYZ', '']]) {
    const left = bytes(a), right = bytes(b), aligned = alignBinary(left, right);
    assert.equal(aligned.ranges.length, 1);
    const offsets = binaryRangeOffsets(aligned.segments, aligned.ranges[0]);
    const edited = replaceBinaryRange(right, offsets.rightStart, offsets.rightEnd, left.subarray(offsets.leftStart, offsets.leftEnd));
    equal(edited.bytes, left);
    equal(undoBinaryEdit(edited.bytes, edited.undo), right);
    equal(left, bytes(a)); equal(right, bytes(b));
  }
});

test('range mapping spans segments and page boundaries using actual offsets', () => {
  const left = Buffer.concat([Buffer.alloc(4090, 1), Buffer.alloc(32, 2), Buffer.alloc(40, 3)]);
  const right = Buffer.concat([Buffer.alloc(4090, 1), Buffer.alloc(40, 3)]);
  const aligned = alignBinary(left, right);
  assert.deepEqual(binaryRangeOffsets(aligned.segments, aligned.ranges[0]),
    {leftStart: 4090, leftEnd: 4122, rightStart: 4090, rightEnd: 4090});
  assert.deepEqual(binaryRangeOffsets(aligned.segments, {start: 4088, end: 4124}),
    {leftStart: 4088, leftEnd: 4124, rightStart: 4088, rightEnd: 4092});
  assert.deepEqual(binaryRangeOffsets(aligned.segments, {start: 4096, end: 4100}),
    {leftStart: 4096, leftEnd: 4100, rightStart: 4090, rightEnd: 4090});
  const range = binaryRangeOffsets(aligned.segments, {start: 4088, end: 4124});
  equal(replaceBinaryRange(right, range.rightStart, range.rightEnd, left.subarray(range.leftStart, range.leftEnd)).bytes, left);
});

test('offset fallback tails map absent bytes to the end cursor', () => {
  for (const [a, b, expected] of [
    ['abcdef', 'ab', {leftStart: 3, leftEnd: 6, rightStart: 2, rightEnd: 2}],
    ['ab', 'abcdef', {leftStart: 2, leftEnd: 2, rightStart: 3, rightEnd: 6}],
  ]) {
    const left = bytes(a), right = bytes(b), result = alignBinary(left, right, {mode: 'offset'});
    assert.deepEqual(binaryRangeOffsets(result.segments, {start: 3, end: 6}), expected);
    const full = binaryRangeOffsets(result.segments, result.ranges[0]);
    const edit = replaceBinaryRange(right, full.rightStart, full.rightEnd, left.subarray(full.leftStart, full.leftEnd));
    equal(edit.bytes, left);
    equal(undoBinaryEdit(edit.bytes, edit.undo), right);
  }
});

test('sequential byte and size-changing range edits undo in reverse order', () => {
  const original = bytes('abcdef'), history = [];
  let current = original;
  for (const [start, end, replacement] of [[1, 2, 'X'], [3, 3, 'HELLO'], [0, 3, ''], [2, 5, 'YZ']]) {
    const edit = replaceBinaryRange(current, start, end, bytes(replacement));
    current = edit.bytes;
    history.push(edit.undo);
  }
  while (history.length) current = undoBinaryEdit(current, history.pop());
  equal(current, original);
});

test('edits and undo records never alias either input, including Buffer views', () => {
  const source = bytes('abcdef'), replacement = source.subarray(0, 3);
  const edit = replaceBinaryRange(source, 2, 4, replacement);
  equal(edit.bytes, bytes('ababcef'));
  source.fill(0);
  equal(edit.undo.removed, bytes('cd'));
  equal(edit.bytes, bytes('ababcef'));
  const restored = undoBinaryEdit(edit.bytes, edit.undo);
  restored.fill(1);
  equal(edit.bytes, bytes('ababcef'));
  equal(edit.undo.removed, bytes('cd'));
});

test('binary edit validation rejects invalid ranges, types, undo entries and oversized results', () => {
  const source = bytes('abc'), empty = new Uint8Array();
  for (const [start, end] of [[-1, 0], [2, 1], [0, 4], [0.5, 1], [0, Infinity]]) {
    assert.throws(() => replaceBinaryRange(source, start, end, empty), RangeError);
  }
  assert.throws(() => replaceBinaryRange([], 0, 0, empty), TypeError);
  assert.throws(() => replaceBinaryRange(source, 0, 0, []), TypeError);
  assert.throws(() => replaceBinaryRange(source, 0, 0, bytes('x'), {maxBytes: 3}), /size limit/);
  assert.equal(replaceBinaryRange(source, 0, 3, empty, {maxBytes: 0}).bytes.length, 0);
  for (const maxBytes of [-1, 1.5, Infinity, 32 * 1024 * 1024 + 1]) {
    assert.throws(() => replaceBinaryRange(source, 0, 0, empty, {maxBytes}), RangeError);
  }
  const oversized = new Uint8Array(32 * 1024 * 1024);
  assert.throws(() => replaceBinaryRange(oversized, 0, 0, bytes('x')), /size limit/);
  for (const edit of [null, {}, {offset: -1, insertedLength: 1, removed: empty},
    {offset: 0, insertedLength: -1, removed: empty}, {offset: 0, insertedLength: 1, removed: []}]) {
    assert.throws(() => undoBinaryEdit(source, edit), TypeError);
  }
  assert.throws(() => undoBinaryEdit(source, {offset: 2, insertedLength: 2, removed: empty}), RangeError);
  assert.throws(() => undoBinaryEdit(source, {offset: 0, insertedLength: 0, removed: bytes('xx')}, {maxBytes: 4}), /size limit/);
});

test('range mapping rejects missing, discontiguous, inconsistent and out-of-bounds alignments', () => {
  const segments = alignBinary(bytes('abc'), bytes('abc')).segments;
  for (const range of [null, {}, {start: -1, end: 1}, {start: 0, end: 4}, {start: 2, end: 1}, {start: 1, end: 1}, {start: 0.5, end: 1}]) {
    assert.throws(() => binaryRangeOffsets(segments, range));
  }
  assert.throws(() => binaryRangeOffsets([], {start: 0, end: 1}));
  for (const patch of [{start: 1}, {end: 4}, {leftStart: 1}, {rightLength: -1}, {leftLength: 1.5}]) {
    assert.throws(() => binaryRangeOffsets([{...segments[0], ...patch}], {start: 0, end: 1}));
  }
});
