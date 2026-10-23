'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { validateArchiveExtraction: validate, extractArchiveEntries: extract, MAX_ENTRIES, MAX_TOTAL } = require('../desktop/archive-extract.cjs');
const file = (name, data = Buffer.from([0, 255, 128, 10])) => ({ path: name, kind: 'file', data: data.toString('base64') });
const dir = name => ({ path: name, kind: 'directory' });
async function fixture(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'archive-extract-test-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }

test('extracts exact bytes, implicit parents and empty directories into distinct private outputs', async t => {
  const root = await fixture(t), items = [file('nested/payload.bin'), dir('empty'), dir('nested')];
  const plan = validate(items);
  items[0].data = Buffer.from('changed').toString('base64');
  const first = await extract(root, plan), second = await extract(root, plan);
  assert.notEqual(first.path, second.path);
  assert.deepEqual({ files: first.files, directories: first.directories, bytes: first.bytes }, { files: 1, directories: 2, bytes: 4 });
  for (const result of [first, second]) {
    assert.deepEqual(await fs.readFile(path.join(result.path, 'nested/payload.bin')), Buffer.from([0,255,128,10]));
    assert.deepEqual(await fs.readdir(path.join(result.path, 'empty')), []);
    if (process.platform !== 'win32') {
      assert.equal((await fs.stat(result.path)).mode & 0o777, 0o700);
      assert.equal((await fs.stat(path.join(result.path, 'nested'))).mode & 0o777, 0o700);
      assert.equal((await fs.stat(path.join(result.path, 'nested/payload.bin'))).mode & 0o777, 0o600);
    }
  }
});

test('rejects unsafe names and collisions before any output exists', async t => {
  const root = await fixture(t);
  for (const name of ['', '/abs', '../x', 'a/../b', './x', 'a//b', 'x/', 'C:/x', 'a\\b', 'a\0b', 'a\nb', 'a\x7fb', 'a?', 'x.', 'x ', 'NUL', 'COM1.txt', 'LPT¹.txt', 'a'.repeat(256)]) assert.throws(() => validate([file('okay'), file(name)]), undefined, name);
  for (const items of [[file('x'), file('x')], [file('x'), file('X')], [file('café'), file('cafe\u0301')], [file('a'), file('a/b')], [file('a/b'), file('a')], [file('A/b'), file('a/c')], [dir('x'), dir('x')]]) assert.throws(() => validate(items));
  assert.deepEqual(await fs.readdir(root), []);
});

test('bounds entry counts including implicit parents, depth and decoded bytes', () => {
  assert.throws(() => validate([]));
  assert.throws(() => validate(Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => dir(String(i)))));
  assert.throws(() => validate(Array.from({ length: 2501 }, (_, i) => file(`${i}/x`))));
  assert.throws(() => validate([file(Array(129).fill('a').join('/'))]));
  assert.equal(validate([file('max', Buffer.alloc(MAX_TOTAL))]).bytes, MAX_TOTAL);
  assert.throws(() => validate([file('max', Buffer.alloc(MAX_TOTAL)), file('more')]));
  for (const data of ['a', '!!!!', 'AA=A', 'AB==', '====']) assert.throws(() => validate([{ path: 'x', kind: 'file', data }]));
  assert.equal(validate([file('empty', Buffer.alloc(0))]).bytes, 0);
});

test('rejects an invalid plan or file destination without modifying destination', async t => {
  const root = await fixture(t), target = path.join(root, 'existing');
  await fs.writeFile(target, 'keep');
  await assert.rejects(extract(root, { files: 0 }));
  await assert.rejects(extract(target, validate([file('x')])));
  assert.equal(await fs.readFile(target, 'utf8'), 'keep');
  assert.deepEqual(await fs.readdir(root), ['existing']);
});

test('cleans partial output after a write failure and preserves existing destination files', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'keep'), 'keep');
  const original = fs.writeFile;
  let writes = 0;
  fs.writeFile = async (...args) => { if (++writes === 2) throw new Error('Injected write failure'); return original(...args); };
  try { await assert.rejects(extract(root, validate([file('a'), file('nested/b')])), /Injected write failure/); }
  finally { fs.writeFile = original; }
  assert.deepEqual(await fs.readdir(root), ['keep']);
  assert.equal(await fs.readFile(path.join(root, 'keep'), 'utf8'), 'keep');
});
