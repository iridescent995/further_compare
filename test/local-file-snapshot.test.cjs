'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {capture,validate,read} = require('../desktop/local-file-snapshot.cjs');
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-local-snapshot-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file = path.join(root,'file.txt');
  await fs.writeFile(file,'initial');
  return {root,file};
}
test('stable bytes carry the runtime-compatible revision and immutable snapshot',async t=>{
  const {file}=await fixture(t), {bytes,snapshot}=await read(file);
  assert.equal(bytes.toString(),'initial');
  const stat=await fs.lstat(file);
  assert.equal(snapshot.revision,`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`);
  const exact=await fs.lstat(file,{bigint:true});
  assert.equal(snapshot.dev,exact.dev);assert.equal(snapshot.ino,exact.ino);
  assert.ok(Object.isFrozen(snapshot));
  assert.equal(await validate(snapshot),snapshot);
  await assert.rejects(validate({...snapshot}),/Invalid/);
});
test('modified contents and replacement cannot acquire fresh authority',async t=>{
  const {file}=await fixture(t), first=await capture(file);
  await fs.writeFile(file,'changed');
  await assert.rejects(validate(first),/changed/);
  const second=await capture(file);
  await fs.rename(file,`${file}.old`);await fs.writeFile(file,'changed');
  await assert.rejects(validate(second),/changed/);
});
test('canonical input aliases are retained and retargeting is rejected',async t=>{
  const {root,file}=await fixture(t),alias=path.join(root,'alias');
  await fs.symlink(file,alias);
  const snapshot=await capture(alias);
  assert.equal(snapshot.path,file);
  await fs.writeFile(path.join(root,'other'),'initial');
  await fs.unlink(alias);await fs.symlink(path.join(root,'other'),alias);
  await assert.rejects(validate(snapshot),/changed/);
});
test('ancestor replacement is rejected even when the same file inode survives',async t=>{
  const {root}=await fixture(t),directory=path.join(root,'parent');
  await fs.mkdir(directory);const file=path.join(directory,'same');await fs.writeFile(file,'data');
  const replacement=path.join(root,'replacement');await fs.mkdir(replacement);
  await fs.link(file,path.join(replacement,'same'));
  const snapshot=await capture(file);
  await fs.rename(directory,`${directory}.old`);await fs.rename(replacement,directory);
  const stat=await fs.lstat(file,{bigint:true});
  assert.equal(`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`,snapshot.signature);
  await assert.rejects(validate(snapshot),/changed/);
});
test('canonical parent replaced by a symlink is rejected',async t=>{
  const {root}=await fixture(t),directory=path.join(root,'parent');
  await fs.mkdir(directory);const file=path.join(directory,'same');await fs.writeFile(file,'data');
  const snapshot=await capture(file);
  await fs.rename(directory,`${directory}.old`);await fs.symlink(`${directory}.old`,directory);
  await assert.rejects(validate(snapshot),/changed/);
});
test('limits, directories, missing paths, and nonabsolute input fail',async t=>{
  const {root,file}=await fixture(t);
  await assert.rejects(read(file,2),/too large/);
  await assert.rejects(capture(root),/changed/);
  await assert.rejects(capture(path.join(root,'missing')),/ENOENT/);
  await assert.rejects(capture('relative'),/absolute/);
});
test('replacement after bytes are read is rejected by the snapshot boundary',async t=>{
  const {file}=await fixture(t),originalOpen=fs.open;
  fs.open=async function(target,...args) {
    const handle=await originalOpen.call(this,target,...args);
    if(target===file) {
      const close=handle.close.bind(handle);
      handle.close=async()=>{await close();await fs.rename(file,`${file}.old`);await fs.writeFile(file,'replacement');};
    }
    return handle;
  };
  try { await assert.rejects(read(file),/changed/); }
  finally {fs.open=originalOpen;}
});
