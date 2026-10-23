'use strict';

// Pure planning only. A caller must revalidate roots and snapshots before writing.
const MAX_ENTRIES = 100000, MAX_PATH_BYTES = 16 * 1024 * 1024;
const parent = path => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const depth = path => path.split('/').length;
function safePath(path) {
  if (typeof path !== 'string' || !path || path.length > 32768 || /[\\\x00-\x1f\x7f<>:"|?*]/.test(path)) throw new TypeError('Invalid portable folder path.');
  const parts = path.split('/');
  if (parts.length > 256 || parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))) throw new TypeError('Invalid portable folder path.');
}
function dataObject(value) {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('Folder entries must be plain data objects.');
}
function prepare(entries, desired, aliases) {
  // Resolution can combine entries from all three individually bounded snapshots.
  if (!(entries instanceof Map) || entries.size > MAX_ENTRIES * (desired ? 2 : 1)) throw new TypeError('A bounded folder entry map is required.');
  const result = new Map();
  let bytes = 0;
  for (const [path, entry] of entries) {
    safePath(path);
    bytes += Buffer.byteLength(path);
    if (bytes > MAX_PATH_BYTES * (desired ? 3 : 1)) throw new RangeError('Folder paths exceed the planning limit.');
    const alias = path.normalize('NFC').toLowerCase();
    if (aliases.has(alias) && aliases.get(alias) !== path) throw new Error('Case or Unicode path aliases cannot be written.');
    aliases.set(alias, path);
    dataObject(entry);
    if (!['file', 'directory'].includes(entry.kind)) throw new TypeError('Unsupported folder entry kind.');
    if (entry.size !== undefined && (!Number.isSafeInteger(entry.size) || entry.size < 0)) throw new TypeError('Invalid folder entry size.');
    const copy = {kind: entry.kind};
    if (entry.kind === 'file') {
      if (typeof entry.hash !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.hash) || !Number.isSafeInteger(entry.size) || entry.size < 0) throw new TypeError('Files require a SHA-256 hash and a valid size.');
      copy.hash = entry.hash.toLowerCase(); copy.size = entry.size;
      if (desired) {
        if (!['base', 'left', 'right'].includes(entry.sourceSide) || entry.sourcePath !== path) throw new TypeError('Invalid resolved file source mapping.');
        copy.sourceSide = entry.sourceSide; copy.sourcePath = entry.sourcePath;
      }
    }
    result.set(path, copy);
  }
  for (const path of result.keys()) {
    const p = parent(path);
    if (p && result.get(p)?.kind !== 'directory') throw new Error('Every entry must have an existing directory parent.');
  }
  return result;
}
function buildThreeWayPlan(resolution, targetSnapshot) {
  dataObject(resolution); dataObject(targetSnapshot);
  if (!Array.isArray(resolution.conflicts) || resolution.conflicts.length) throw new Error('Resolve every conflict before planning output.');
  if (targetSnapshot.skipped !== 0) throw new Error('Cannot plan an incomplete output scan: skipped entries remain.');
  const aliases = new Map(), desired = prepare(resolution.entries, true, aliases), target = prepare(targetSnapshot.entries, false, aliases);
  const removals = [], directories = [], copies = [];
  for (const [path, entry] of target) {
    if (desired.get(path)?.kind === entry.kind) continue;
    removals.push(entry.kind === 'file' ? {type: 'delete-file', path, hash: entry.hash, size: entry.size} : {type: 'delete-directory', path});
  }
  // All removed children precede their directory, including directory-to-file transitions.
  removals.sort((a, b) => (a.type === 'delete-file' ? 0 : 1) - (b.type === 'delete-file' ? 0 : 1) || depth(b.path) - depth(a.path) || compare(a.path, b.path));
  for (const [path, entry] of desired) {
    const old = target.get(path);
    if (entry.kind === 'directory') {
      if (old?.kind !== 'directory') directories.push({type: 'create-directory', path});
    } else if (old?.kind !== 'file' || old.hash !== entry.hash || old.size !== entry.size) {
      copies.push({type: 'copy-file', path, sourceSide: entry.sourceSide, sourcePath: entry.sourcePath, hash: entry.hash, size: entry.size, oldHash: old?.kind === 'file' ? old.hash : null, oldSize: old?.kind === 'file' ? old.size : null});
    }
  }
  directories.sort((a, b) => depth(a.path) - depth(b.path) || compare(a.path, b.path));
  copies.sort((a, b) => compare(a.path, b.path));
  return Object.freeze([...removals, ...directories, ...copies].map(op => Object.freeze(op)));
}
module.exports = {buildThreeWayPlan};
