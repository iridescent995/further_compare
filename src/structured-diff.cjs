'use strict';
const {diffArrays} = require('diff');

// Strict CSV/TSV parsing. Record delimiters are normalized; quoted cell data is preserved.
function parseDelimited(text, delimiter = ',') {
  if (typeof text !== 'string' || typeof delimiter !== 'string' || delimiter.length !== 1 || /["\r\n]/.test(delimiter)) throw new TypeError('Expected text and a single non-quote delimiter.');
  if (!text.length) return [];
  const rows = []; let row = [], cell = '', quoted = false, closed = false, ended = false;
  const field = () => { row.push(cell); cell = ''; closed = false; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]; ended = false;
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += c;
    } else if (c === delimiter) field();
    else if (c === '\n' || c === '\r') { field(); rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; ended = true; }
    else if (c === '"' && !cell.length && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error(`Invalid quote at character ${i + 1}.`); cell += c; }
  }
  if (quoted) throw new Error('Unterminated quoted field.');
  if (!ended) { field(); rows.push(row); }
  return rows;
}

function compareTables(left, right, {keyColumns = [], maxRows = 100000} = {}) {
  if (![left, right].every(table => Array.isArray(table) && table.every(row => Array.isArray(row) && row.every(cell => typeof cell === 'string')))) throw new TypeError('Tables must contain arrays of string cells.');
  if (!Array.isArray(keyColumns) || keyColumns.some(n => !Number.isInteger(n) || n < 0) || new Set(keyColumns).size !== keyColumns.length) throw new TypeError('Key columns must be distinct nonnegative indices.');
  if (!Number.isInteger(maxRows) || maxRows < 1) throw new TypeError('maxRows must be positive.');
  if (left.length + right.length > maxRows) throw new Error('Table row limit exceeded.');
  const duplicates = [], rows = [];
  const keyOf = row => JSON.stringify(keyColumns.map(i => { if (i >= row.length) throw new Error('Key column is missing from a row.'); return row[i]; }));
  const index = (table, side) => { const map = new Map(); table.forEach((row, i) => { const key = keyOf(row); if (map.has(key)) { const previous = map.get(key); duplicates.push({side, key, rows: [previous, i]}); } else map.set(key, i); }); return map; };
  let pairs;
  if (keyColumns.length) {
    const a = index(left, 'left'), b = index(right, 'right');
    // Ambiguous joins are never silently reduced to the first record.
    if (duplicates.length) return {rows: [], duplicates, equal: false};
    pairs = [...a].map(([key, i]) => [i, b.has(key) ? b.get(key) : null]);
    for (const [key, j] of b) if (!a.has(key)) pairs.push([null, j]);
  } else pairs = Array.from({length: Math.max(left.length, right.length)}, (_, i) => [i < left.length ? i : null, i < right.length ? i : null]);
  for (const [leftIndex, rightIndex] of pairs) {
    const a = leftIndex === null ? null : left[leftIndex], b = rightIndex === null ? null : right[rightIndex];
    const cells = Array.from({length: Math.max(a?.length || 0, b?.length || 0)}, (_, column) => ({column, left: a?.[column] ?? null, right: b?.[column] ?? null, equal: (a?.[column] ?? null) === (b?.[column] ?? null)}));
    rows.push({leftIndex, rightIndex, left: a, right: b, cells, status: !a ? 'right' : !b ? 'left' : cells.every(c => c.equal) ? 'equal' : 'changed'});
  }
  return {rows, duplicates, equal: rows.every(row => row.status === 'equal')};
}

// Offset comparison intentionally does not infer insertion alignment. Memory is O(maxRanges).
function compareBinary(left, right, {maxRanges = 10000} = {}) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) throw new TypeError('Binary inputs must be Uint8Array values.');
  if (!Number.isInteger(maxRanges) || maxRanges < 1) throw new TypeError('maxRanges must be positive.');
  const ranges = []; let start = -1, differingBytes = 0, rangeCount = 0;
  const finish = end => { if (start < 0) return; rangeCount++; if (ranges.length < maxRanges) ranges.push({start, end, leftEnd: Math.min(end, left.length), rightEnd: Math.min(end, right.length)}); start = -1; };
  for (let i = 0, length = Math.max(left.length, right.length); i < length; i++) {
    if (left[i] !== right[i]) { differingBytes++; if (start < 0) start = i; } else finish(i);
  }
  finish(Math.max(left.length, right.length));
  return {equal: differingBytes === 0, leftSize: left.length, rightSize: right.length, differingBytes, rangeCount, ranges, truncated: rangeCount > ranges.length};
}

// Prefix/suffix scans are linear without copies. Only the bounded middle enters
// Myers diff; unrelated large inputs retain an explicitly identified offset view.
function alignBinary(left, right, {mode = 'aligned', maxMiddleBytes = 262144, timeout = 200, maxEditLength = 2048, maxRanges = 10000} = {}) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) throw new TypeError('Binary inputs must be Uint8Array values.');
  if (!['aligned', 'offset'].includes(mode)) throw new TypeError('Unknown binary alignment mode.');
  for (const [name, value, minimum, maximum] of [
    ['maxMiddleBytes', maxMiddleBytes, 0, 262144], ['timeout', timeout, 1, 200],
    ['maxEditLength', maxEditLength, 0, 2048], ['maxRanges', maxRanges, 1, 10000],
  ]) if (!Number.isInteger(value) || value < minimum || value > maximum) throw new TypeError(`${name} must be an integer from ${minimum} to ${maximum}.`);
  const offset = fallbackReason => {
    const result = compareBinary(left, right, {maxRanges}), length = Math.max(left.length, right.length);
    return {alignment: 'offset', fallbackReason, segments: length ? [{start: 0, end: length, leftStart: 0, rightStart: 0, leftLength: left.length, rightLength: right.length, status: result.equal ? 'equal' : 'changed'}] : [],
      length, differingBytes: result.differingBytes, rangeCount: result.rangeCount,
      ranges: result.ranges.map(({start, end}) => ({start, end})), truncated: result.truncated};
  };
  if (mode === 'offset') return offset(null);
  let prefix = 0, suffix = 0;
  const common = Math.min(left.length, right.length);
  while (prefix < common && left[prefix] === right[prefix]) prefix++;
  while (suffix < common - prefix && left[left.length - suffix - 1] === right[right.length - suffix - 1]) suffix++;
  const leftMiddle = left.length - prefix - suffix, rightMiddle = right.length - prefix - suffix;
  let delta;
  if (leftMiddle && rightMiddle) {
    if (leftMiddle + rightMiddle > maxMiddleBytes) return offset('The unmatched middle exceeds the alignment size limit.');
    delta = diffArrays(Array.from(left.subarray(prefix, left.length - suffix)), Array.from(right.subarray(prefix, right.length - suffix)), {timeout, maxEditLength});
    if (!delta) return offset('The alignment time or edit complexity limit was reached.');
  }
  const segments = [], ranges = [];
  let length = 0, leftPosition = 0, rightPosition = 0, differingBytes = 0, rangeCount = 0, rangeStart = null;
  const finishRange = () => {
    if (rangeStart === null) return;
    rangeCount++;
    if (ranges.length < maxRanges) ranges.push({start: rangeStart, end: length});
    rangeStart = null;
  };
  const append = (status, leftLength, rightLength) => {
    const count = Math.max(leftLength, rightLength);
    if (!count) return;
    if (status === 'equal') finishRange();
    else { differingBytes += count; if (rangeStart === null) rangeStart = length; }
    const previous = segments.at(-1);
    if (previous?.status === status) {
      previous.end += count; previous.leftLength += leftLength; previous.rightLength += rightLength;
    } else segments.push({start: length, end: length + count, leftStart: leftPosition, rightStart: rightPosition, leftLength, rightLength, status});
    length += count; leftPosition += leftLength; rightPosition += rightLength;
  };
  const changed = (a, b) => {
    const paired = Math.min(a, b);
    append('changed', paired, paired);
    append('left', a - paired, 0);
    append('right', 0, b - paired);
  };
  append('equal', prefix, prefix);
  if (!delta) changed(leftMiddle, rightMiddle);
  else for (let i = 0; i < delta.length;) {
    const part = delta[i];
    if (!part.added && !part.removed) { append('equal', part.count, part.count); i++; continue; }
    let a = 0, b = 0;
    while (i < delta.length && (delta[i].added || delta[i].removed)) {
      if (delta[i].removed) a += delta[i].count;
      else b += delta[i].count;
      i++;
    }
    changed(a, b);
  }
  append('equal', suffix, suffix);
  finishRange();
  return {alignment: 'aligned', fallbackReason: null, segments, length, differingBytes, rangeCount, ranges, truncated: rangeCount > ranges.length};
}

function mergeText3(base, left, right, {timeout = 2500, maxEditLength = 12000} = {}) {
  if (![base, left, right].every(value => typeof value === 'string')) throw new TypeError('Merge inputs must be strings.');
  const tokenize = value => value.match(/[^\n]*\n|[^\n]+$/g) || [];
  const original = tokenize(base);
  const changes = (text, side) => {
    const delta = diffArrays(original, tokenize(text), {timeout, maxEditLength});
    if (!delta) throw new Error('Merge complexity limit exceeded.');
    const edits = []; let position = 0;
    for (let i = 0; i < delta.length; i++) {
      if (!delta[i].added && !delta[i].removed) { position += delta[i].count; continue; }
      const start = position, replacement = [];
      while (i < delta.length && (delta[i].added || delta[i].removed)) { if (delta[i].removed) position += delta[i].count; else replacement.push(...delta[i].value); i++; }
      i--; edits.push({start, end: position, replacement, side});
    }
    return edits;
  };
  const edits = [...changes(left, 'left'), ...changes(right, 'right')].sort((a, b) => a.start - b.start || a.end - b.end);
  const overlaps = (a, b) => a.start === a.end ? a.start >= b.start && a.start <= b.end : b.start === b.end ? b.start >= a.start && b.start <= a.end : a.start < b.end && b.start < a.end;
  const groups = [];
  for (const edit of edits) { const last = groups[groups.length - 1]; if (last && last.some(other => overlaps(edit, other))) last.push(edit); else groups.push([edit]); }
  const segments = [], conflicts = []; let cursor = 0;
  const plain = text => { if (text) segments.push({type: 'text', text}); };
  for (const group of groups) {
    const start = Math.min(...group.map(e => e.start)), end = Math.max(...group.map(e => e.end));
    plain(original.slice(cursor, start).join(''));
    const render = side => { let p = start; const pieces = []; for (const edit of group.filter(e => e.side === side)) { pieces.push(...original.slice(p, edit.start), ...edit.replacement); p = edit.end; } pieces.push(...original.slice(p, end)); return pieces.join(''); };
    const a = render('left'), b = render('right');
    if (!group.some(e => e.side === 'left')) plain(b);
    else if (!group.some(e => e.side === 'right') || a === b) plain(a);
    else { const conflict = {type: 'conflict', start, end, base: original.slice(start, end).join(''), left: a, right: b}; conflicts.push(conflict); segments.push(conflict); }
    cursor = end;
  }
  plain(original.slice(cursor).join(''));
  return {clean: conflicts.length === 0, text: conflicts.length ? null : segments.map(s => s.text).join(''), segments, conflicts};
}
module.exports = {parseDelimited, compareTables, compareBinary, alignBinary, mergeText3};
