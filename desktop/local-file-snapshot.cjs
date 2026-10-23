'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {readDataLimited} = require('./sessions.cjs');
const retained = new WeakMap();
const signature = stat => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
const revision = stat => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
const identity = stat => `${stat.dev}:${stat.ino}`;
const changed = () => new Error('The selected file or its location changed while opening. Open it again.');
async function parents(file) {
  const result = [];
  let directory = path.dirname(file);
  for (;;) {
    const stat = await fs.lstat(directory,{bigint:true});
    if (!stat.isDirectory()) throw changed();
    result.push([directory,identity(stat)]);
    const next = path.dirname(directory);
    if (next === directory) return result;
    directory = next;
  }
}
async function inspect(original, canonical) {
  if (await fs.realpath(original) !== canonical || await fs.realpath(canonical) !== canonical) throw changed();
  const beforeParents = await parents(canonical);
  const before = await fs.lstat(canonical,{bigint:true});
  const stat = await fs.lstat(canonical);
  const after = await fs.lstat(canonical,{bigint:true});
  const afterParents = await parents(canonical);
  if (!before.isFile() || !stat.isFile() || !after.isFile() || signature(before) !== signature(after) || JSON.stringify(beforeParents) !== JSON.stringify(afterParents) || await fs.realpath(original) !== canonical || await fs.realpath(canonical) !== canonical) throw changed();
  return {dev:before.dev,ino:before.ino,signature:signature(before),revision:revision(stat),parents:beforeParents};
}
async function capture(file) {
  if (typeof file !== 'string' || !file || file.includes('\0') || !path.isAbsolute(file)) throw new Error('Choose an absolute path to a regular file.');
  const original = path.resolve(file);
  const canonical = await fs.realpath(original);
  const state = await inspect(original,canonical);
  const snapshot = Object.freeze({path:canonical,dev:state.dev,ino:state.ino,signature:state.signature,revision:state.revision});
  retained.set(snapshot,{original,...state});
  return snapshot;
}
async function validate(snapshot) {
  const expected = retained.get(snapshot);
  if (!expected) throw new Error('Invalid local file snapshot.');
  const current = await inspect(expected.original,snapshot.path);
  if (current.signature !== expected.signature || current.revision !== expected.revision || JSON.stringify(current.parents) !== JSON.stringify(expected.parents)) throw changed();
  return snapshot;
}
async function read(file,limit) {
  const snapshot = await capture(file);
  const bytes = await readDataLimited(snapshot.path,limit);
  await validate(snapshot);
  return {bytes,snapshot};
}
module.exports = {capture,validate,read};
