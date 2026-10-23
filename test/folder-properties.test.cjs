'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {readFolderProperties} = require('../desktop/folder-properties.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'further-properties-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  return {root, safe: async (side, relative) => path.join(root, relative)};
}
test('properties report exact selected-file bytes, metadata, and nonrecursive directories', async t => {
  const {root, safe} = await fixture(t);
  await fs.mkdir(path.join(root, 'folder'));
  await fs.writeFile(path.join(root, 'folder', 'unselected'), 'not included');
  await fs.writeFile(path.join(root, 'empty'), '');
  await fs.writeFile(path.join(root, 'a 雪.txt'), Buffer.from([0, 255, 1, 2, 3]));
  const stamp = new Date('2020-02-03T04:05:06.000Z');
  await fs.utimes(path.join(root, 'a 雪.txt'), stamp, stamp);
  if (process.platform !== 'win32') await fs.chmod(path.join(root, 'a 雪.txt'), 0o640);
  const stat = await fs.lstat(path.join(root, 'a 雪.txt'), {bigint:true});
  const result = await readFolderProperties(safe, 'b', ['folder', 'empty', 'a 雪.txt']);
  assert.equal(result.side, 'b');
  assert.equal(result.totalFileBytes, '5');
  assert.equal(result.files, 2);
  assert.equal(result.folders, 1);
  assert.equal(result.entries[0].kind, 'directory');
  assert.equal(result.entries[0].sizeBytes, null);
  assert.equal(result.entries[1].sizeBytes, '0');
  const entry = result.entries[2];
  assert.equal(entry.path, 'a 雪.txt');
  assert.equal(entry.name, 'a 雪.txt');
  assert.equal(entry.absolutePath, path.join(root, 'a 雪.txt'));
  assert.equal(entry.sizeBytes, '5');
  assert.equal(entry.modifiedMs, stamp.getTime());
  assert.equal(entry.accessedMs, stamp.getTime());
  assert.equal(entry.createdMs, Number(stat.birthtimeNs) / 1e6);
  if (process.platform !== 'win32') {
    assert.equal(entry.permissions, 'rw-r-----');
    assert.equal(entry.mode, '0640');
    assert.equal(entry.ownerId, String(stat.uid));
    assert.equal(entry.groupId, String(stat.gid));
  } else for (const field of ['permissions', 'mode', 'ownerId', 'groupId']) assert.equal(entry[field], null);
  assert.deepEqual(await fs.readFile(path.join(root, 'a 雪.txt')), Buffer.from([0, 255, 1, 2, 3]));
});
test('POSIX permissions include executable and nonexecutable special bits', {skip: process.platform === 'win32'}, async t => {
  const {root, safe} = await fixture(t);
  await fs.mkdir(path.join(root, 'folder'));
  for (const [mode, expected] of [[0o7777, 'rwsrwsrwt'], [0o7666, 'rwSrwSrwT']]) {
    await fs.chmod(path.join(root, 'folder'), mode);
    const stat = await fs.lstat(path.join(root, 'folder'));
    // macOS may clear setuid/setgid on directories. Verify the actual stored bits.
    let storedExpected = expected;
    if (!(stat.mode & 0o4000)) storedExpected = storedExpected.slice(0,2) + (stat.mode & 0o100 ? 'x' : '-') + storedExpected.slice(3);
    if (!(stat.mode & 0o2000)) storedExpected = storedExpected.slice(0,5) + (stat.mode & 0o010 ? 'x' : '-') + storedExpected.slice(6);
    const result = await readFolderProperties(safe, 'a', ['folder']);
    assert.equal(result.entries[0].permissions, storedExpected);
    assert.equal(result.entries[0].mode, (stat.mode & 0o7777).toString(8).padStart(4, '0'));
  }
});
test('invalid selections are refused before native path authority is called', async () => {
  const safe = () => { throw new Error('Authority should not be called'); };
  for (const side of [null, '', 'left', 'c']) await assert.rejects(readFolderProperties(safe, side, ['ok']), /Invalid folder side/);
  for (const paths of [null, [], ['a','a'], Array.from({length:1001}, (_,i)=>String(i))]) await assert.rejects(readFolderProperties(safe, 'a', paths), /1000 unique/);
  for (const relative of ['', '.', '..', '/tmp/file', 'C:/file', 'C:file', 'a\\b', 'a\0b', 'a//b', 'a/../b', 'a/./b', 'a/', 3, 'a'.repeat(32769)]) await assert.rejects(readFolderProperties(safe, 'a', [relative]), /Invalid relative path/);
});
test('symlinks and path authority failures are rejected', async t => {
  const {root, safe} = await fixture(t);
  await fs.writeFile(path.join(root, 'file'), 'data');
  await assert.rejects(readFolderProperties(async()=> {throw new Error('Stale root');}, 'a', ['file']), /Stale root/);
  try { await fs.symlink(path.join(root, 'file'), path.join(root, 'link')); }
  catch (error) { if (process.platform === 'win32' && error.code === 'EPERM') return; throw error; }
  await assert.rejects(readFolderProperties(safe, 'a', ['link']), /regular files and folders/);
});
test('replacement or redirection during metadata lookup is rejected', async t => {
  const {root, safe} = await fixture(t);
  const file = path.join(root, 'file');
  await fs.writeFile(file, 'same');
  await fs.writeFile(path.join(root, 'replacement'), 'same');
  let calls = 0;
  await assert.rejects(readFolderProperties(async (side, relative) => {
    if (++calls === 2) { await fs.unlink(file); await fs.rename(path.join(root, 'replacement'), file); }
    return safe(side, relative);
  }, 'a', ['file']), /changed/);
  calls = 0;
  await assert.rejects(readFolderProperties(async () => ++calls === 1 ? file : path.join(root, 'elsewhere'), 'a', ['file']), /changed/);
});

test('metadata formatting handles special bits, exact large sizes and invalid dates', async t => {
  const {root, safe} = await fixture(t);
  await fs.writeFile(path.join(root, 'file'), '');
  const original = fs.lstat;
  const stat = await original(path.join(root, 'file'), {bigint:true});
  t.after(() => { fs.lstat = original; });
  for (const [mode, expected] of [[0o7777n, 'rwsrwsrwt'], [0o7666n, 'rwSrwSrwT']]) {
    fs.lstat = async () => Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, {
      mode: 0o100000n | mode, size: 9007199254740993n,
      mtimeNs: 8640000000000000000001n, atimeNs: -8640000000000000000001n,
    });
    const result = await readFolderProperties(safe, 'a', ['file']);
    assert.equal(result.totalFileBytes, '9007199254740993');
    assert.equal(result.entries[0].sizeBytes, '9007199254740993');
    assert.equal(result.entries[0].modifiedMs, null);
    assert.equal(result.entries[0].accessedMs, null);
    if (process.platform !== 'win32') assert.equal(result.entries[0].permissions, expected);
  }
  fs.lstat = async () => Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, {mode: 0o010600n});
  await assert.rejects(readFolderProperties(safe, 'a', ['file']), /regular files and folders/);
});
