'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {FolderService} = require('../desktop/folders.cjs');
const {previewCopyToFolder} = require('../desktop/copy-destination.cjs');
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'further-copy-destination-')));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const a = path.join(root,'left'), b = path.join(root,'right'), dest = path.join(root,'destination');
  for (const dir of [a,b,dest]) await fs.mkdir(dir);
  await fs.mkdir(path.join(a,'nested'));
  await fs.writeFile(path.join(a,'nested','one.txt'),'new');
  await fs.writeFile(path.join(a,'unselected.txt'),'keep out');
  const service = new FolderService(path.join(root,'backups'));
  await service.select('a',a); await service.select('b',b);
  return {root,a,b,dest,service};
}
test('copy to chosen folder preserves hierarchy, original roots, unrelated files and backups',async t => {
  const {a,b,dest,service} = await fixture(t);
  await fs.mkdir(path.join(dest,'nested'));
  await fs.writeFile(path.join(dest,'nested','one.txt'),'old');
  await fs.writeFile(path.join(dest,'unrelated.txt'),'stay');
  const plan = await previewCopyToFolder(service,'a',['nested','nested/one.txt'],async () => dest);
  assert.equal(plan.source,a); assert.equal(plan.destination,dest);
  assert.equal(await fs.readFile(path.join(dest,'nested','one.txt'),'utf8'),'old');
  const result = await plan.service.execute(plan.preview.id);
  assert.equal(await fs.readFile(path.join(dest,'nested','one.txt'),'utf8'),'new');
  assert.equal(await fs.readFile(path.join(result.backupPath,'files','nested','one.txt'),'utf8'),'old');
  assert.equal(await fs.readFile(path.join(dest,'unrelated.txt'),'utf8'),'stay');
  await assert.rejects(fs.stat(path.join(dest,'unselected.txt')),{code:'ENOENT'});
  assert.deepEqual(service.roots,{a,b});
});
test('copy chooser cancellation leaves filesystem and active roots unchanged',async t => {
  const {a,b,dest,service} = await fixture(t);
  assert.equal(await previewCopyToFolder(service,'a',['nested/one.txt'],async () => null),null);
  assert.deepEqual(await fs.readdir(dest),[]);
  assert.deepEqual(service.roots,{a,b});
});
test('invalid selections and missing paths are rejected before opening chooser',async t => {
  const {service} = await fixture(t);
  let calls = 0; const choose = async () => {calls++; return null;};
  for (const paths of [[],[''],['../escape'],['nested/one.txt','nested/one.txt'],['nested\\one.txt'],['bad\0'],Array.from({length:1001},(_,i)=>String(i))]) {
    await assert.rejects(previewCopyToFolder(service,'a',paths,choose),/Select/);
  }
  await assert.rejects(previewCopyToFolder(service,'a',['missing'],choose),{code:'ENOENT'});
  assert.equal(calls,0);
});
test('destination overlap, backup directory and symlink traversal are refused',async t => {
  const {a,dest,root,service} = await fixture(t);
  for (const target of [a,path.join(a,'nested'),root,service.backupRoot]) {
    await assert.rejects(previewCopyToFolder(service,'a',['nested/one.txt'],async () => target),/separate|overlap/);
  }
  await fs.symlink(a,path.join(dest,'nested'),'dir');
  await assert.rejects(previewCopyToFolder(service,'a',['nested/one.txt'],async () => dest),/Symbolic/);
});
test('source or destination edits after preview stop external copy before writes',async t => {
  const {a,dest,service} = await fixture(t);
  let plan = await previewCopyToFolder(service,'a',['nested/one.txt'],async () => dest);
  await fs.writeFile(path.join(a,'nested','one.txt'),'changed');
  await assert.rejects(plan.service.execute(plan.preview.id),/changed after preview/);
  assert.deepEqual(await fs.readdir(dest),[]);
  plan = await previewCopyToFolder(service,'a',['nested/one.txt'],async () => dest);
  await fs.mkdir(path.join(dest,'nested'));
  await fs.writeFile(path.join(dest,'nested','one.txt'),'appeared');
  await assert.rejects(plan.service.execute(plan.preview.id),/changed after preview/);
  assert.equal(await fs.readFile(path.join(dest,'nested','one.txt'),'utf8'),'appeared');
});
test('right-side selection copies to chosen folder and creates required parents only',async t => {
  const {b,dest,service} = await fixture(t);
  await fs.mkdir(path.join(b,'sub'));
  await fs.writeFile(path.join(b,'sub','right.txt'),'right');
  const plan = await previewCopyToFolder(service,'b',['sub/right.txt'],async () => dest);
  await plan.service.execute(plan.preview.id);
  assert.equal(plan.source,b);
  assert.equal(await fs.readFile(path.join(dest,'sub','right.txt'),'utf8'),'right');
});
