'use strict';
const {FolderAlignment} = require('./folder-alignment.cjs');
const {FilenameMatching} = require('./folder-filename-matching.cjs');
const {PathNameMatching}=require('./folder-name-matching.cjs');

function validPath(value) {
  if (typeof value !== 'string' || !value || value.length > 32768 || /[\\\0]/.test(value) || value.startsWith('/') || /^[A-Za-z]:/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) throw new TypeError('Invalid snapshot path.');
  return value;
}
function parents(relative) {
  const result = []; let index = relative.indexOf('/');
  while (index !== -1) { result.push(relative.slice(0,index)); index = relative.indexOf('/',index+1); }
  return result;
}
function validateNamespace(entries) {
  const aliases = new Map();
  for (const [relative] of entries) {
    for (const part of [...parents(relative),relative]) {
      const key = part.normalize('NFC').toLowerCase(), prior = aliases.get(key);
      if (prior !== undefined && prior !== part) throw new Error(`Conflicting filename spelling at ${part}.`);
      aliases.set(key,part);
    }
    for (const parent of parents(relative)) if (entries.get(parent)?.kind === 'file') throw new Error(`A file cannot contain another entry at ${parent}.`);
  }
}
function validateEntry(entry) {
  if (!entry || Object.getPrototypeOf(entry) !== Object.prototype || !['file','directory'].includes(entry.kind) || !Number.isSafeInteger(entry.mode) || entry.mode < 0) throw new TypeError('Invalid snapshot entry.');
  if (entry.kind === 'directory') {
    if (typeof entry.identity !== 'string' || !entry.identity) throw new TypeError('Invalid directory identity.');
  } else if (!Number.isSafeInteger(entry.size) || entry.size < 0 || typeof entry.hash !== 'string' || !/^[a-f0-9]{64}$/.test(entry.hash) || typeof entry.revision !== 'string' || !entry.revision || (entry.normalizedHash !== null && entry.normalizedHash !== undefined && (typeof entry.normalizedHash !== 'string' || !/^[a-f0-9]{64}$/.test(entry.normalizedHash)))) throw new TypeError('Invalid file snapshot metadata.');
}
function validateSnapshot(snapshot) {
  if (!snapshot || !(snapshot.entries instanceof Map) || !Number.isSafeInteger(snapshot.skipped) || snapshot.skipped < 0 || (snapshot.identity !== null && (typeof snapshot.identity !== 'string' || !snapshot.identity))) throw new TypeError('Invalid folder snapshot.');
  for (const [relative,entry] of snapshot.entries) { validPath(relative); validateEntry(entry); }
  validateNamespace(snapshot.entries);
}

// This accepts a complete source snapshot, not a selected subtree snapshot.
// Reserved entries are exclusions, never permission to delete their targets.
// Synthetic directories describe target scaffolding and have no source to stat.
function projectSnapshot(snapshot, alignment, sourceSide) {
  if (!(alignment instanceof FolderAlignment || alignment instanceof FilenameMatching || alignment instanceof PathNameMatching) || !['a','b'].includes(sourceSide)) throw new TypeError('Invalid snapshot alignment.');
  validateSnapshot(snapshot);
  const entries = new Map(), reserved = [];
  for (const [sourcePath,entry] of snapshot.entries) {
    const targetPath = alignment.counterpart(sourceSide,sourcePath);
    if (targetPath === null) { reserved.push(sourcePath); continue; }
    validPath(targetPath);
    if (entries.has(targetPath)) throw new Error(`Multiple source entries map to ${targetPath}.`);
    entries.set(targetPath,{...entry,sourcePath,synthetic:false});
  }
  validateNamespace(entries);
  for (const relative of [...entries.keys()]) for (const parent of parents(relative)) {
    if (!entries.has(parent)) entries.set(parent,{kind:'directory',sourcePath:null,synthetic:true,identity:`projection:${alignment.revision}:${sourceSide}:${parent}`,mode:0o755});
  }
  return {entries:new Map([...entries].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)), skipped:snapshot.skipped, identity:snapshot.identity, reserved:reserved.sort()};
}
// Context Copy selects actual source content recursively. Ancestors included by
// the scanner prove source coverage, but are not content selected for copying.
function projectSelectedSnapshot(snapshot, alignment, sourceSide, selectedSourcePaths) {
  validateSnapshot(snapshot);
  if (!Array.isArray(selectedSourcePaths) || !selectedSourcePaths.length) throw new TypeError('Choose source paths to copy.');
  const selected = new Set();
  for (const relative of selectedSourcePaths) {
    validPath(relative);
    if (!snapshot.entries.has(relative)) throw new Error(`Selected source entry is missing or excluded: ${relative}.`);
    selected.add(relative);
  }
  const entries = new Map([...snapshot.entries].filter(([relative]) => selected.has(relative) || parents(relative).some(parent => selected.has(parent))));
  const projected = projectSnapshot({...snapshot,entries},alignment,sourceSide);
  if (projected.reserved.length) throw new Error(`Cannot copy a displaced source entry: ${projected.reserved[0]}.`);
  const coverage = [...snapshot.entries].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([relative,entry]) => [relative,{...entry}]);
  return {...projected,coverage};
}
module.exports = {projectSnapshot,projectSelectedSnapshot};
