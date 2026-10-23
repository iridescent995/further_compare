'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { filenameMatches } = require('../src/filename-search.cjs');

const entries = names => names.map((name, index) => ({ id: String(index), side: 'a', name }));
const search = (names, options) => filenameMatches(entries(names), { left: true, ...options });

test('literal filename search escapes regex syntax and respects case', () => {
  assert.deepEqual(search(['A[1].txt', 'a[1].TXT', 'a1.txt', 'a[11].txt'], { query: 'a[1].' }), [0, 1]);
  assert.deepEqual(search(['A[1].txt', 'a[1].TXT'], { query: 'a[1].', matchCase: true }), [1]);
  assert.deepEqual(search(['a+b?(c)$^|{x}\\', 'other'], { query: '+b?(c)$^|{x}\\' }), [0]);
  assert.deepEqual(search(['foo', ' foo '], { query: ' ' }), [1]);
  assert.deepEqual(search(['foo'], { query: '' }), []);
});

test('matches preserve entry indices and require explicitly enabled sides', () => {
  const rows = [{ id: 'same', side: 'a', name: 'file' }, { id: 'same', side: 'b', name: 'file' }, { side: 'x', name: 'file' }];
  assert.deepEqual(filenameMatches(rows, { query: 'file', left: true }), [0]);
  assert.deepEqual(filenameMatches(rows, { query: 'file', right: true }), [1]);
  assert.deepEqual(filenameMatches(rows, { query: 'file', left: true, right: true }), [0, 1]);
  assert.deepEqual(filenameMatches(rows, { query: 'file', left: 'true', right: 1 }), []);
  assert.deepEqual(filenameMatches(rows, { query: 'file' }), []);
});

test('whole words use Unicode letters, numbers, and underscore boundaries', () => {
  const names = ['猫.txt', '大猫.txt', '猫咪.txt', '_猫', '猫_1', '(猫)', '猫２', '𐐀猫', '猫-猫'];
  assert.deepEqual(search(names, { query: '猫', wholeWords: true }), [0, 5, 8]);
  assert.deepEqual(search(['CAFÉ.txt', 'café.txt', 'décafé.txt'], { query: 'café', wholeWords: true }), [0, 1]);
  assert.deepEqual(search(['file.txt', 'file_copy.txt', 'profile.txt', 'file-file'], { query: 'file', wholeWords: true }), [0, 3]);
});

test('regex search supports alternation, Unicode, anchors, and zero-length matches once per entry', () => {
  assert.deepEqual(search(['cat.txt', 'dog.txt', 'catdog.txt', 'a-dog.txt'], { query: 'cat|dog', regex: true, wholeWords: true }), [0, 1, 3]);
  assert.deepEqual(search(['猫.txt', 'ab.txt', '12.txt'], { query: '^\\p{L}\\.txt$', regex: true }), [0]);
  assert.deepEqual(search(['aaa', 'bbb', ''], { query: '(?=a)', regex: true }), [0]);
  assert.deepEqual(search(['aaa', 'bbb', ''], { query: '^', regex: true }), [0, 1, 2]);
  assert.deepEqual(search(['A.txt', 'a.txt'], { query: '^a', regex: true, matchCase: true }), [1]);
  assert.throws(() => search(['a'], { query: '[', regex: true }), SyntaxError);
});

test('input bounds reject oversized or malformed values including disabled entries', () => {
  assert.deepEqual(search(['x'.repeat(32768)], { query: 'x'.repeat(4096) }), [0]);
  assert.throws(() => search(['a'], { query: 'x'.repeat(4097) }), /4096/);
  assert.throws(() => search(['a'], { query: 12 }), /4096/);
  assert.throws(() => search(['x'.repeat(32769)], { query: '' }), /32768/);
  assert.throws(() => filenameMatches([{ side: 'b', name: null }], { query: 'a', left: true }), /32768/);
  assert.throws(() => filenameMatches([null], { query: 'a' }), /32768/);
  assert.throws(() => filenameMatches(null), /200000/);
  const many = Array(200000).fill({ side: 'a', name: 'a' });
  assert.deepEqual(filenameMatches(many, { query: 'a' }), []);
  assert.throws(() => filenameMatches([...many, many[0]], { query: '' }), /200000/);
});
