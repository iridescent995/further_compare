'use strict';

function validPath(value) {
  return typeof value === 'string' && value.length > 0 &&
    !value.includes('\\') && !value.includes('\0') &&
    value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

/**
 * Incrementally list a paired folder tree, including directories opposite files.
 * Counts describe published nodes/rows; a node that would exceed a limit is not
 * published. `complete` describes traversal, while `skipped` reports entries
 * the underlying provider could not list. The caller may await onNode.
 */
async function walkFolders({
  listNode, onNode, isCancelled = () => false,
  maxNodes = 5000, maxEntries = 50000, root = ''
}) {
  if (typeof listNode !== 'function' || typeof onNode !== 'function' ||
      typeof isCancelled !== 'function') throw new TypeError('Folder walk requires callbacks.');
  if (![maxNodes, maxEntries].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new RangeError('Folder walk limits must be non-negative safe integers.');
  }
  const result = { nodes: 0, entries: 0, complete: false, cancelled: false, limited: false, skipped: 0 };
  if (root !== '' && root !== 'root') throw new TypeError('Invalid folder walk root.');
  const native = root === 'root';
  const queue = [root], seen = new Set(queue);
  for (let index = 0; index < queue.length; index++) {
    if (isCancelled()) { result.cancelled = true; return result; }
    if (result.nodes >= maxNodes) { result.limited = true; return result; }
    const node = queue[index];
    const listing = await listNode(node);
    // A completed I/O operation can belong to a cancelled or superseded view.
    if (isCancelled()) { result.cancelled = true; return result; }
    if (!listing || !Array.isArray(listing.rows) ||
        (listing.skipped != null && (!Number.isSafeInteger(listing.skipped) || listing.skipped < 0))) {
      throw new TypeError('Invalid folder listing.');
    }
    if (listing.rows.length > maxEntries - result.entries) {
      result.limited = true; return result;
    }
    const directories = [];
    for (const row of listing.rows) {
      if (native) {
        if (!row || typeof row.id !== 'string' || !row.id || row.id === 'root' || row.parentId !== node ||
            ![row.pathA, row.pathB].some(value => typeof value === 'string') ||
            [row.pathA, row.pathB].some(value => value != null && !validPath(value))) {
          throw new TypeError('Invalid aligned folder entry.');
        }
      } else if (!row || !validPath(row.path)) throw new TypeError('Invalid relative folder entry path.');
      if (!row.alignmentConflict && (row.kindA === 'directory' || row.kindB === 'directory')) directories.push(native ? row.id : row.path);
    }
    if (isCancelled()) { result.cancelled = true; return result; }
    await onNode(node, listing.rows);
    result.nodes++;
    result.entries += listing.rows.length;
    result.skipped += listing.skipped || 0;
    if (isCancelled()) { result.cancelled = true; return result; }
    for (const path of directories) {
      if (!seen.has(path)) { seen.add(path); queue.push(path); }
    }
  }
  result.complete = true;
  return result;
}

module.exports = { walkFolders };
