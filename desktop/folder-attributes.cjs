'use strict';
const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const path = require('node:path');
const revision = stat => [stat.dev,stat.ino,stat.mode,stat.nlink,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
function validateAttributeSelection(side, paths) {
  if (!['a','b'].includes(side)) throw new Error('Invalid folder side.');
  if (!Array.isArray(paths) || !paths.length || paths.length > 1000 || new Set(paths).size !== paths.length) throw new Error('Select between 1 and 1000 unique files or folders.');
  for (const relative of paths) if (typeof relative !== 'string' || !relative || relative.length > 32768 || /[\\\0]/.test(relative) || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid relative path.');
}
function validateAttributeChanges(changes, platform=process.platform) {
  const allowed = platform === 'win32' ? 0x27 : 0o777;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).some(key => !['setMask','clearMask'].includes(key)) || ![changes.setMask, changes.clearMask].every(value => Number.isInteger(value) && value >= 0 && value <= allowed && (value & ~allowed) === 0) || (changes.setMask & changes.clearMask)) throw new Error(platform === 'win32' ? 'Choose non-overlapping Read-only, Hidden, System, or Archive changes.' : 'Choose non-overlapping read, write, or execute permission changes.');
}
function checkType(stat) {
  if ((!stat.isFile() && !stat.isDirectory()) || stat.isSymbolicLink()) throw new Error('Only regular files and folders can have their permissions changed.');
  if (stat.isFile() && stat.nlink !== 1n) throw new Error('Hard-linked files cannot have their permissions changed here.');
}
async function openEntry(safe, side, relative) {
  const file = await safe(side,relative), before = await fs.lstat(file,{bigint:true});
  checkType(before);
  const handle = await fs.open(file,constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  return {file,relative,before,handle};
}
async function current(safe, side, entry, expected) {
  const file = await safe(side,entry.relative);
  const stat = await fs.lstat(file,{bigint:true}), opened = await entry.handle.stat({bigint:true});
  checkType(stat);checkType(opened);
  if (file !== entry.file || revision(stat) !== expected || revision(opened) !== expected) throw new Error(`“${entry.relative}” changed. Refresh and review permissions again.`);
}
const review = entry => ({path:entry.relative,mode:Number(entry.before.mode & 0o7777n),expected:revision(entry.before)});
async function previewFolderAttributes(safe,side,paths) {
  validateAttributeSelection(side,paths);
  if (process.platform === 'win32') return require('./windows-folder-attributes.cjs').previewWindowsFolderAttributes(safe,side,paths);
  const entries=[];
  try {
    for (const relative of paths) { const entry=await openEntry(safe,side,relative);entries.push(entry);await current(safe,side,entry,revision(entry.before)); }
    for (const entry of entries) await current(safe,side,entry,revision(entry.before));
    return {platform:'posix',entries:entries.map(review)};
  } finally { await Promise.allSettled(entries.map(entry=>entry.handle.close())); }
}
async function setFolderAttributes(safe,side,paths,changes,expected) {
  validateAttributeSelection(side,paths);
  if (process.platform === 'win32') return require('./windows-folder-attributes.cjs').setWindowsFolderAttributes(safe,side,paths,changes,expected);
  validateAttributeChanges(changes);
  if (!Array.isArray(expected) || expected.length !== paths.length || expected.some((entry,index)=>!entry || entry.path !== paths[index] || typeof entry.expected !== 'string')) throw new Error('Review the selected permissions before applying changes.');
  const entries=[],changed=[];
  try {
    for (let index=0;index<paths.length;index++) {
      const entry=await openEntry(safe,side,paths[index]);entries.push(entry);
      await current(safe,side,entry,expected[index].expected);
      entry.next=(Number(entry.before.mode & 0o7777n) | changes.setMask) & ~changes.clearMask;
    }
    // Revalidate the whole selection before the first mutation.
    for (const entry of entries) await current(safe,side,entry,revision(entry.before));
    // Children first: removing a parent's traversal permission must not block its children.
    const ordered=[...entries].sort((a,b)=>b.relative.split('/').length-a.relative.split('/').length);
    for (const entry of ordered) {
      await current(safe,side,entry,revision(entry.before));
      if (entry.next === Number(entry.before.mode & 0o7777n)) continue;
      await entry.handle.chmod(entry.next);changed.push(entry);
      entry.after=await entry.handle.stat({bigint:true});
      if (Number(entry.after.mode & 0o7777n) !== entry.next) throw new Error(`The filesystem could not store the requested permissions for “${entry.relative}”.`);
      await current(safe,side,entry,revision(entry.after));
    }
    return {changed:changed.length,entries:entries.map(entry=>({path:entry.relative,mode:entry.next}))};
  } catch (error) {
    const failed=[];
    for (const entry of changed.reverse()) {
      try {
        if (!entry.after) throw new Error('Cannot verify changed permissions.');
        await current(safe,side,entry,revision(entry.after));
        await entry.handle.chmod(Number(entry.before.mode & 0o7777n));
        const restored=await entry.handle.stat({bigint:true});
        if ((restored.mode & 0o7777n) !== (entry.before.mode & 0o7777n)) throw new Error('Permissions could not be restored.');
        await current(safe,side,entry,revision(restored));
      } catch { failed.push(entry.relative); }
    }
    throw new Error(`${error.message}${failed.length ? ` Rollback incomplete: ${failed.length} item(s) could not be safely restored (${failed.slice(0,3).join(', ')}). Refresh before retrying.` : changed.length ? ' Earlier permission changes were restored.' : ''}`);
  } finally { await Promise.allSettled(entries.map(entry=>entry.handle.close())); }
}
module.exports={previewFolderAttributes,setFolderAttributes,validateAttributeSelection,validateAttributeChanges};
