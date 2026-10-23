'use strict';
const {createHash} = require('node:crypto');
const SIDES = ['base', 'left', 'right'];
const MAX_ENTRIES = 100000, MAX_PATH_BYTES = 16 * 1024 * 1024;
const parent = path => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function safePath(path) {
  if (typeof path !== 'string' || !path || path.length > 32768 || /[\\\x00-\x1f\x7f]/.test(path) || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split('/').some(x => !x || x === '.' || x === '..') || path.split('/').length > 256) throw new TypeError('Invalid root-relative folder path.');
}
function prepare(input) {
  if (!input || typeof input !== 'object') throw new TypeError('Three folder snapshots are required.');
  const snapshots = {}, aliases = new Map(), paths = new Set();
  for (const side of SIDES) {
    const snapshot = input[side];
    if (!snapshot || !(snapshot.entries instanceof Map) || snapshot.entries.size > MAX_ENTRIES || !Number.isSafeInteger(snapshot.skipped) || snapshot.skipped < 0 || typeof snapshot.identity !== 'string' || !snapshot.identity || snapshot.identity.length > 32768) throw new TypeError('A folder snapshot with an identity and a valid skipped count is required.');
    const entries = new Map(), children = new Map(), fingerprints = new Map();
    let bytes = 0;
    for (const [path, entry] of snapshot.entries) {
      safePath(path);
      bytes += Buffer.byteLength(path);
      if (bytes > MAX_PATH_BYTES) throw new RangeError('Folder paths exceed the comparison limit.');
      const alias = path.normalize('NFC').toLowerCase();
      if (aliases.has(alias) && aliases.get(alias) !== path) throw new Error('Case or Unicode path aliases cannot be merged.');
      aliases.set(alias, path); paths.add(path);
      if (!entry || !['file', 'directory'].includes(entry.kind)) throw new TypeError('Unsupported folder entry kind.');
      if (entry.size !== undefined && (!Number.isSafeInteger(entry.size) || entry.size < 0)) throw new TypeError('Invalid folder entry size.');
      const copy = {kind: entry.kind};
      if (entry.kind === 'file') {
        if (typeof entry.hash !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.hash) || !Number.isSafeInteger(entry.size) || entry.size < 0) throw new TypeError('Files require a SHA-256 hash and a valid size.');
        copy.hash = entry.hash.toLowerCase(); copy.size = entry.size;
      }
      entries.set(path, Object.freeze(copy));
      const p = parent(path);
      if (!children.has(p)) children.set(p, []);
      children.get(p).push(path);
    }
    for (const path of entries.keys()) {
      const p = parent(path);
      if (p && entries.get(p)?.kind !== 'directory') throw new Error('Every entry must have an existing directory parent.');
    }
    const ordered = [...entries.keys()].sort((a,b) => b.split('/').length - a.split('/').length || compare(a,b));
    for (const path of ordered) {
      const entry = entries.get(path);
      const content = entry.kind === 'file' ? ['file', entry.hash, entry.size] : ['directory', ...(children.get(path) || []).sort(compare).map(child => [child.slice(path.length+1), fingerprints.get(child)])];
      fingerprints.set(path, createHash('sha256').update(JSON.stringify(content)).digest('hex'));
    }
    snapshots[side] = {entries, fingerprints};
  }
  if (paths.size > MAX_ENTRIES * 2) throw new RangeError('Too many combined folder entries.');
  return {snapshots, paths: [...paths].sort(compare)};
}
function classifyPrepared({snapshots, paths}) {
  const rows = [], byPath = new Map();
  for (const path of paths) {
    const [base, left, right] = SIDES.map(side => snapshots[side].entries.get(path));
    const [b, l, r] = SIDES.map(side => snapshots[side].fingerprints.get(path) || null);
    let status, reason = null;
    if (l === b && r === b) status = 'unchanged';
    else if (l === r) status = 'both';
    else if (l === b) status = 'right';
    else if (r === b) status = 'left';
    else if (left?.kind === 'directory' && right?.kind === 'directory' && (!base || base.kind === 'directory')) status = 'merged';
    else {
      status = 'conflict';
      reason = !left || !right ? 'delete-versus-change' : left.kind !== right.kind || base && base.kind !== left.kind ? 'type-change' : 'different-content';
    }
    const ancestor = byPath.get(parent(path));
    const blockedBy = ancestor?.blockedBy || (ancestor?.status === 'conflict' ? ancestor.path : null);
    const row = {path, status, reason, blockedBy};
    for (const side of SIDES) {
      const entry = snapshots[side].entries.get(path), suffix = side[0].toUpperCase()+side.slice(1);
      row['kind'+suffix] = entry?.kind || null;
      row['hash'+suffix] = entry?.hash || null;
      row['size'+suffix] = entry?.kind === 'file' ? entry.size : null;
    }
    Object.freeze(row); rows.push(row); byPath.set(path, row);
  }
  return Object.freeze(rows);
}
function classifyThreeWay(input) { return classifyPrepared(prepare(input)); }
function resolveThreeWay(input, choices = {}) {
  const prepared = prepare(input), rows = classifyPrepared(prepared);
  if (!choices || ![Object.prototype, null].includes(Object.getPrototypeOf(choices)) || Object.getOwnPropertySymbols(choices).length) throw new TypeError('Resolution choices must be a path-to-side object.');
  const byPath = new Map(rows.map(row => [row.path, row]));
  for (const path of Object.keys(choices)) {
    safePath(path);
    const row = byPath.get(path);
    if (!SIDES.includes(choices[path]) || !row || row.status !== 'conflict' || row.blockedBy) throw new Error('Choose a side only at an unblocked conflict anchor.');
  }
  if (SIDES.some(side => input[side].skipped > 0)) throw new Error('Cannot resolve an incomplete scan: skipped entries remain.');
  const entries = new Map(), conflicts = [], inherited = new Map();
  for (const row of rows) {
    const p = parent(row.path);
    let side;
    if (inherited.has(p)) side = inherited.get(p);
    else if (row.status === 'conflict') {
      side = Object.hasOwn(choices, row.path) ? choices[row.path] : null;
      if (side === null) conflicts.push(row.path);
    } else if (row.status === 'merged') {
      entries.set(row.path, Object.freeze({kind: 'directory'})); continue;
    } else side = row.status === 'right' ? 'right' : 'left';
    // A decision at a directory owns the whole subtree, including absent entries.
    inherited.set(row.path, side);
    const entry = side && prepared.snapshots[side].entries.get(row.path);
    if (entry) entries.set(row.path, Object.freeze({...entry, ...(entry.kind === 'file' ? {sourceSide: side, sourcePath: row.path} : {})}));
  }
  return {entries: new Map([...entries].sort(([a],[b]) => compare(a,b))), conflicts};
}
module.exports = {classifyThreeWay, resolveThreeWay};
