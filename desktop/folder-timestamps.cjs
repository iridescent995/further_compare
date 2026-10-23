'use strict';
const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const path = require('node:path');
const {setWindowsFolderModified} = require('./windows-folder-timestamps.cjs');
const seconds = ns => ns < 0n ? new Date(Number(ns / 1000000n)) : Number(ns) / 1e9;
const revision = stat => `${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
function validateTimestampRequest(side, paths, modifiedMs) {
  if (!['a','b'].includes(side)) throw new Error('Invalid folder side.');
  if (!Array.isArray(paths) || !paths.length || paths.length > 1000 || new Set(paths).size !== paths.length) throw new Error('Select between 1 and 1000 unique files or folders.');
  for (const relative of paths) if (typeof relative !== 'string' || !relative || relative.length > 32768 || /[\\\0]/.test(relative) || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid relative path.');
  if (!Number.isInteger(modifiedMs) || modifiedMs < -62135596800000 || modifiedMs > 253402300799999) throw new Error('Choose a valid modified date between years 1 and 9999.');
}
async function setFolderModified(safe, side, paths, modifiedMs) {
  validateTimestampRequest(side, paths, modifiedMs);
  if (process.platform === 'win32') return setWindowsFolderModified(safe, side, paths, modifiedMs);
  const entries = [], changed = [];
  async function current(entry, expected) {
    const file = await safe(side, entry.relative);
    const stat = await fs.lstat(file, {bigint:true});
    const opened = await entry.handle.stat({bigint:true});
    if (file !== entry.file || stat.isSymbolicLink() || revision(stat) !== revision(expected) || revision(opened) !== revision(expected)) throw new Error(`“${entry.relative}” changed. Refresh and try again.`);
  }
  try {
    // Hold descriptors throughout the operation so a path replacement cannot redirect a write.
    for (const relative of paths) {
      const file = await safe(side, relative);
      const before = await fs.lstat(file, {bigint:true});
      if (!before.isFile() && !before.isDirectory()) throw new Error('Only regular files and folders can have their modified date changed.');
      const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
      const entry = {file, relative, handle, before};
      entries.push(entry);
      await current(entry, before);
    }
    for (const entry of entries) {
      await current(entry, entry.before);
      await entry.handle.utimes(seconds(entry.before.atimeNs), new Date(modifiedMs));
      changed.push(entry);
      entry.after = await entry.handle.stat({bigint:true});
      if (Math.abs(Number(entry.after.mtimeNs) / 1e6 - modifiedMs) >= 1) throw new Error(`The filesystem could not store the requested modified time for “${entry.relative}”.`);
      await current(entry, entry.after);
    }
    return {changed:changed.length};
  } catch (error) {
    const failed = [];
    for (const entry of changed.reverse()) {
      try {
        if (!entry.after) throw new Error('Could not verify the written timestamp.');
        await current(entry, entry.after);
        await entry.handle.utimes(seconds(entry.before.atimeNs), seconds(entry.before.mtimeNs));
      } catch { failed.push(entry.relative); }
    }
    if (failed.length) throw new Error(`${error.message} Rollback incomplete: ${failed.length} item(s) could not be safely restored (${failed.slice(0,3).join(', ')}). Refresh before retrying.`);
    throw new Error(`${error.message}${changed.length ? ' Earlier timestamp changes were restored.' : ''}`);
  } finally {
    await Promise.allSettled(entries.map(entry => entry.handle.close()));
  }
}
module.exports = {setFolderModified, validateTimestampRequest};
