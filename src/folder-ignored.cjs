'use strict';

// View-only marks: they never replace native comparison results or authorize file operations.
const MAX_IGNORED_MARKS = 1000;
const SIDES = ['A', 'B'];
const validPath = value => typeof value === 'string' && value.length > 0 && value.length <= 32768 && !value.includes('\0') && !value.startsWith('/') && !value.split('/').some(part => !part || part === '.' || part === '..');
const key = row => JSON.stringify([row.pathA ?? null, row.pathB ?? null]);
const inside = (child, parent) => child === parent || child.startsWith(`${parent}/`);
const directory = row => SIDES.every(side => !row[`path${side}`] || row[`kind${side}`] === 'directory');

function snapshot(row) {
  if (!row || typeof row !== 'object') throw new TypeError('Choose loaded folder entries to ignore.');
  const mark = {};
  for (const side of SIDES) {
    const path = row[`path${side}`] ?? null;
    const kind = row[`kind${side}`] ?? null;
    const version = row[`version${side}`] ?? null;
    if (path === null ? kind !== null || version !== null : !validPath(path) || !['file', 'directory'].includes(kind) || typeof version !== 'string' || !version.length || version.length > 256) throw new TypeError('Ignore marks need current entry paths, types and versions.');
    mark[`path${side}`] = path;
    mark[`kind${side}`] = kind;
    mark[`version${side}`] = version;
  }
  if (!mark.pathA && !mark.pathB) throw new TypeError('Choose an existing folder entry to ignore.');
  return mark;
}
function normalize(marks) {
  if (!Array.isArray(marks) || marks.length > MAX_IGNORED_MARKS) throw new RangeError(`Ignore at most ${MAX_IGNORED_MARKS} entries per folder tab.`);
  return [...new Map(marks.map(mark => { const copy = snapshot(mark); return [key(copy), copy]; })).values()];
}
function covers(mark, row) {
  if (key(mark) === key(row)) return true;
  if (!directory(mark)) return false;
  let present = false;
  for (const side of SIDES) {
    const path = row[`path${side}`];
    if (path == null) continue;
    present = true;
    const parent = mark[`path${side}`];
    if (!parent || !inside(path, parent)) return false;
  }
  return present;
}
function sameVersion(mark, row) {
  return SIDES.every(side => ['path', 'kind', 'version'].every(field => (mark[`${field}${side}`] ?? null) === (row[`${field}${side}`] ?? null)));
}
function addIgnoredRows(marks, selectedRows) {
  if (!Array.isArray(selectedRows)) throw new TypeError('Choose loaded folder entries to ignore.');
  const result = new Map(normalize(marks).map(mark => [key(mark), mark]));
  for (const row of selectedRows) { const mark = snapshot(row); result.set(key(mark), mark); }
  if (result.size > MAX_IGNORED_MARKS) throw new RangeError(`Ignore at most ${MAX_IGNORED_MARKS} entries per folder tab.`);
  return [...result.values()];
}
function removeIgnoredRows(marks, selectedRows) {
  if (!Array.isArray(selectedRows)) throw new TypeError('Choose folder entries to restore.');
  // Restoring a child also restores a containing ignored folder, avoiding hidden exceptions.
  return normalize(marks).filter(mark => !selectedRows.some(row => covers(mark, row) || covers(row, mark)));
}
function pruneIgnoredMarks(rows, marks) {
  if (!Array.isArray(rows)) throw new TypeError('Choose loaded folder entries.');
  const normalized = normalize(marks);
  if (!normalized.length) return [];
  const byEndpoint = {A: new Map(), B: new Map()};
  for (const row of rows) for (const side of SIDES) if (row[`path${side}`]) byEndpoint[side].set(row[`path${side}`], row);
  return normalized.filter(mark => SIDES.every(side => {
    const row = byEndpoint[side].get(mark[`path${side}`]);
    // An absent row can merely be collapsed or filtered. Never infer deletion from absence.
    return !row || sameVersion(mark, row);
  }));
}
function projectIgnoredRows(rows, marks) {
  const active = pruneIgnoredMarks(rows, marks);
  if (!active.length) return rows.map(row => ({...row}));
  const exact = new Set(active.map(key)), directories = {A: new Map(), B: new Map()};
  for (const mark of active) {
    if (!directory(mark)) continue;
    for (const side of SIDES) {
      const path = mark[`path${side}`];
      if (!path) continue;
      const candidates = directories[side].get(path) || [];
      candidates.push(mark); directories[side].set(path, candidates);
    }
  }
  const isIgnored = row => {
    if (exact.has(key(row))) return true;
    // Only a directory at an actual ancestor of the first present endpoint can
    // cover this row. Still validate the other endpoint for aligned pairs.
    const side = row.pathA != null ? 'A' : 'B';
    let path = row[`path${side}`];
    while (path) {
      const candidates = directories[side].get(path);
      if (candidates?.some(mark => covers(mark, row))) return true;
      const slash = path.lastIndexOf('/');
      path = slash < 0 ? '' : path.slice(0, slash);
    }
    return false;
  };
  return rows.map(row => isIgnored(row) ? {...row, ignored: true, actualStatus: row.actualStatus ?? row.status, status: 'ignored'} : {...row});
}
function ignoredPaths(marks) {
  const valid = normalize(marks);
  return {a: [...new Set(valid.map(mark => mark.pathA).filter(Boolean))], b: [...new Set(valid.map(mark => mark.pathB).filter(Boolean))]};
}
module.exports = {MAX_IGNORED_MARKS, addIgnoredRows, removeIgnoredRows, pruneIgnoredMarks, projectIgnoredRows, ignoredPaths};
