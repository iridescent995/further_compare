const test = require('node:test');
const assert = require('node:assert/strict');
const {alignBinary, compareBinary} = require('../src/structured-diff.cjs');

function verify(left, right, options) {
  const out = alignBinary(left, right, options);
  const reconstructedLeft = [], reconstructedRight = [];
  let position = 0, a = 0, b = 0, differences = 0;
  for (const segment of out.segments) {
    assert.equal(segment.start, position);
    assert.equal(segment.leftStart, a);
    assert.equal(segment.rightStart, b);
    assert.equal(segment.end - segment.start, Math.max(segment.leftLength, segment.rightLength));
    assert.ok(segment.end > segment.start);
    const l = left.subarray(a, a + segment.leftLength), r = right.subarray(b, b + segment.rightLength);
    // Push individually so large-file fixtures do not exceed the argument limit.
    for (const byte of l) reconstructedLeft.push(byte);
    for (const byte of r) reconstructedRight.push(byte);
    if (segment.status === 'equal') assert.deepEqual(l, r);
    if (out.alignment === 'aligned') {
      if (segment.status === 'left') assert.equal(segment.rightLength, 0);
      if (segment.status === 'right') assert.equal(segment.leftLength, 0);
      if (segment.status === 'changed') assert.equal(segment.leftLength, segment.rightLength);
      if (segment.status !== 'equal') differences += segment.end - segment.start;
    }
    a += segment.leftLength; b += segment.rightLength; position = segment.end;
  }
  assert.equal(position, out.length);
  assert.deepEqual(Uint8Array.from(reconstructedLeft), Uint8Array.from(left));
  assert.deepEqual(Uint8Array.from(reconstructedRight), Uint8Array.from(right));
  if (out.alignment === 'aligned') assert.equal(out.differingBytes, differences);
  return out;
}

test('binary insertion and deletion align the unchanged tail and preserve real byte offsets', () => {
  const a = Buffer.from('abcdef'), b = Buffer.from('abXYcdef');
  const out = verify(a, b);
  assert.equal(out.alignment, 'aligned');
  assert.equal(out.differingBytes, 2);
  assert.deepEqual(out.ranges, [{start: 2, end: 4}]);
  assert.deepEqual(out.segments.map(s => [s.status, s.leftStart, s.rightStart, s.leftLength, s.rightLength]),
    [['equal', 0, 0, 2, 2], ['right', 2, 2, 0, 2], ['equal', 2, 4, 4, 4]]);
  assert.deepEqual(verify(b, a).segments.map(s => s.status), ['equal', 'left', 'equal']);
  assert.ok(compareBinary(a, b).differingBytes > out.differingBytes);
});

test('binary replacement pairs changed bytes and separates the remaining insertion', () => {
  const out = verify(Buffer.from('abcde'), Buffer.from('aXYZde'));
  assert.deepEqual(out.segments.map(s => [s.status, s.leftLength, s.rightLength]),
    [['equal', 1, 1], ['changed', 2, 2], ['right', 0, 1], ['equal', 2, 2]]);
  assert.equal(out.differingBytes, 3);
  assert.equal(out.rangeCount, 1);
  assert.deepEqual(out.ranges, [{start: 1, end: 4}]);
});

test('binary empty inputs, identities, and repeated bytes reconstruct both files', () => {
  const fixtures = ['', 'a', 'aaaa', 'abababab', 'babababa', 'abXabaYab', '\0\xff\0\xff'];
  for (const a of fixtures) for (const b of fixtures) {
    const out = verify(Buffer.from(a, 'latin1'), Buffer.from(b, 'latin1'));
    assert.equal(out.alignment, 'aligned');
    assert.equal(out.differingBytes === 0, a === b);
  }
  assert.deepEqual(alignBinary(new Uint8Array(), new Uint8Array()).segments, []);
});

test('binary multiple interior changes retain equality between ranges and cap stored ranges', () => {
  const a = Buffer.from('abc-def-ghi-jkl'), b = Buffer.from('aXc-deYf-ghi-jZkl');
  const out = verify(a, b, {maxRanges: 2});
  assert.equal(out.rangeCount, 3);
  assert.equal(out.ranges.length, 2);
  assert.equal(out.truncated, true);
  assert.equal(out.differingBytes, 3);
});

test('large common regions and one-sided insertions avoid the middle diff budget', () => {
  const a = Buffer.alloc(300000, 7);
  const b = Buffer.concat([a.subarray(0, 150000), Buffer.from([8]), a.subarray(150000)]);
  const out = verify(a, b, {maxMiddleBytes: 0});
  assert.equal(out.alignment, 'aligned');
  assert.equal(out.differingBytes, 1);
  assert.equal(out.segments.length, 3);
  assert.equal(verify(a, a, {maxMiddleBytes: 0}).segments.length, 1);
  assert.equal(alignBinary(new Uint8Array(), a, {maxMiddleBytes: 0}).segments.length, 1);
});

test('size and edit budget failures explicitly return bounded offset output with exact counts', () => {
  const a = Buffer.alloc(150000, 1), b = Buffer.alloc(150000, 2);
  const size = verify(a, b);
  assert.equal(size.alignment, 'offset');
  assert.match(size.fallbackReason, /size limit/);
  assert.equal(size.segments.length, 1);
  assert.equal(size.differingBytes, a.length);
  const edit = verify(Buffer.from('abc'), Buffer.from('xyz'), {maxEditLength: 1});
  assert.equal(edit.alignment, 'offset');
  assert.match(edit.fallbackReason, /complexity/);
  const alternating = new Uint8Array(300000);
  for (let i = 0; i < alternating.length; i += 2) alternating[i] = 1;
  const out = alignBinary(new Uint8Array(alternating.length), alternating, {maxRanges: 2});
  assert.equal(out.segments.length, 1);
  assert.equal(out.ranges.length, 2);
  assert.equal(out.rangeCount, 150000);
  assert.equal(out.truncated, true);
});

test('explicit offset mode preserves legacy difference positions without claiming a fallback', () => {
  const a = Buffer.from('abc'), b = Buffer.from('Xabc');
  const out = verify(a, b, {mode: 'offset'});
  const legacy = compareBinary(a, b);
  assert.equal(out.alignment, 'offset');
  assert.equal(out.fallbackReason, null);
  assert.equal(out.differingBytes, legacy.differingBytes);
  assert.deepEqual(out.ranges, legacy.ranges.map(({start, end}) => ({start, end})));
});

test('binary alignment rejects unsafe or unbounded options', () => {
  const bytes = new Uint8Array();
  assert.throws(() => alignBinary([], bytes), /Uint8Array/);
  for (const options of [{mode: 'x'}, {timeout: 0}, {timeout: 201}, {timeout: Infinity},
    {maxMiddleBytes: -1}, {maxMiddleBytes: 262145}, {maxEditLength: 2049},
    {maxRanges: 0}, {maxRanges: 10001}, {maxRanges: 1.5}]) {
    assert.throws(() => alignBinary(bytes, bytes, options), TypeError);
  }
});
