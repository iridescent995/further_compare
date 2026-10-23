'use strict';

const MAX_BYTES = 32 * 1024 * 1024;
const integer = value => Number.isSafeInteger(value) && value >= 0;

// Segment offsets describe cursors, including the empty side of an insertion.
// Clamping the visual delta handles an offset fallback's unequal tail lengths.
function binaryRangeOffsets(segments, range) {
  if (!Array.isArray(segments) || !range || !integer(range.start) || !integer(range.end) || range.end <= range.start) throw new TypeError('Expected a nonempty binary range and segments.');
  let visual = 0, left = 0, right = 0;
  for (const segment of segments) {
    if (!segment || !['start', 'end', 'leftStart', 'rightStart', 'leftLength', 'rightLength'].every(key => integer(segment[key])) ||
      segment.start !== visual || segment.end <= segment.start || segment.leftStart !== left || segment.rightStart !== right ||
      segment.end - segment.start !== Math.max(segment.leftLength, segment.rightLength)) throw new TypeError('Invalid binary alignment segments.');
    visual = segment.end;
    left += segment.leftLength;
    right += segment.rightLength;
    if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) throw new TypeError('Binary segment offsets exceed safe bounds.');
  }
  if (range.end > visual) throw new RangeError('Binary range is outside the alignment.');
  const point = position => {
    const segment = segments.find(item => position >= item.start && position <= item.end);
    if (!segment) throw new RangeError('Binary range is outside the alignment.');
    const delta = position - segment.start;
    return [segment.leftStart + Math.min(delta, segment.leftLength), segment.rightStart + Math.min(delta, segment.rightLength)];
  };
  const [leftStart, rightStart] = point(range.start), [leftEnd, rightEnd] = point(range.end);
  return {leftStart, leftEnd, rightStart, rightEnd};
}

function replaceBinaryRange(bytes, start, end, replacement, {maxBytes = MAX_BYTES} = {}) {
  if (!(bytes instanceof Uint8Array) || !(replacement instanceof Uint8Array)) throw new TypeError('Binary edits require Uint8Array values.');
  if (!integer(start) || !integer(end) || end < start || end > bytes.length) throw new RangeError('Binary edit range is outside the file.');
  if (!integer(maxBytes) || maxBytes > MAX_BYTES) throw new RangeError('Binary edit limit must be from 0 to 32 MiB.');
  const length = bytes.length - (end - start) + replacement.length;
  if (length > maxBytes) throw new RangeError('Binary edit exceeds the file size limit.');
  const result = new Uint8Array(length);
  result.set(bytes.subarray(0, start));
  result.set(replacement, start);
  result.set(bytes.subarray(end), start + replacement.length);
  // Uint8Array.from also copies Buffer inputs; Buffer.slice would alias them.
  return {bytes: result, undo: {offset: start, removed: Uint8Array.from(bytes.subarray(start, end)), insertedLength: replacement.length}};
}

function undoBinaryEdit(bytes, edit, options) {
  if (!edit || !integer(edit.offset) || !integer(edit.insertedLength) || !(edit.removed instanceof Uint8Array) ||
    !Number.isSafeInteger(edit.offset + edit.insertedLength)) throw new TypeError('Invalid binary undo entry.');
  return replaceBinaryRange(bytes, edit.offset, edit.offset + edit.insertedLength, edit.removed, options).bytes;
}

module.exports = {binaryRangeOffsets, replaceBinaryRange, undoBinaryEdit};
