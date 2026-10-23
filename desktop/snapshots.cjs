'use strict';
const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const MAX_ENTRIES = 50000, MAX_BYTES = 1024 * 1024 * 1024, MAX_JSON_BYTES = 25 * 1024 * 1024;
const signature = s => `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
function relativePath(value) {
  if (typeof value !== 'string' || !value || value.length > 32768 || value.includes('\0') || value.includes('\\') || path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.split('/').some(x => !x || x === '.' || x === '..')) throw new Error('Invalid snapshot relative path.');
  return value;
}
function validateSnapshot(value) {
  if (!value || value.version !== 1 || value.kind !== 'folder-snapshot' || !Array.isArray(value.entries) || value.entries.length > MAX_ENTRIES || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new Error('Invalid folder snapshot.');
  const seen = new Set(); let bytes = 0;
  const entries = value.entries.map(entry => {
    const name = relativePath(entry.path);
    if (seen.has(name) || !['file','directory'].includes(entry.kind) || !Number.isFinite(entry.mtime) || entry.mtime < 0) throw new Error('Invalid snapshot entry.');
    seen.add(name);
    const clean = {path:name,kind:entry.kind,mtime:entry.mtime};
    if (entry.kind === 'file') {
      if (!Number.isSafeInteger(entry.size) || entry.size < 0 || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid snapshot file.');
      bytes += entry.size;
      if (bytes > MAX_BYTES) throw new Error('Snapshot exceeds the 1 GB content limit.');
      Object.assign(clean,{size:entry.size,sha256:entry.sha256});
    }
    return clean;
  });
  const kinds = new Map(entries.map(e => [e.path,e.kind]));
  for (const entry of entries) {
    let parent = path.posix.dirname(entry.path);
    while (parent !== '.') {
      if (kinds.get(parent) !== 'directory') throw new Error('Snapshot has a missing or invalid parent directory.');
      parent = path.posix.dirname(parent);
    }
  }
  const result = {version:1,kind:'folder-snapshot',createdAt:value.createdAt,entries};
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_JSON_BYTES) throw new Error('Snapshot exceeds 25 MB.');
  return result;
}
async function createSnapshot(root) {
  if (!(await fs.lstat(root)).isDirectory()) throw new Error('Choose a regular directory; symbolic links are not followed.');
  root = await fs.realpath(root);
  const entries = []; let bytes = 0;
  async function walk(directory, relative) {
    const before = await fs.lstat(directory,{bigint:true});
    if (!before.isDirectory()) throw new Error('Symbolic links and special files are not followed.');
    for (const item of (await fs.readdir(directory)).sort()) {
      if (entries.length >= MAX_ENTRIES) throw new Error('Snapshot exceeds 50,000 entries.');
      const rel = relative ? relative + '/' + item : item;
      relativePath(rel);
      const file = path.join(directory,item), stat = await fs.lstat(file,{bigint:true});
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error('Symbolic links and special files are not followed.');
      if (stat.isDirectory()) {
        entries.push({path:rel,kind:'directory',mtime:Number(stat.mtimeNs)/1e6});
        await walk(file,rel);
      } else {
        bytes += Number(stat.size);
        if (bytes > MAX_BYTES) throw new Error('Snapshot exceeds the 1 GB content limit.');
        const handle = await fs.open(file,constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        let count = 0; const hash = crypto.createHash('sha256');
        try {
          if (signature(stat) !== signature(await handle.stat({bigint:true}))) throw new Error('Folder changed while creating snapshot.');
          for await (const chunk of handle.createReadStream({autoClose:false})) {
            count += chunk.length;
            if (count > Number(stat.size)) throw new Error('File grew while creating snapshot.');
            hash.update(chunk);
          }
          if (count !== Number(stat.size) || signature(stat) !== signature(await handle.stat({bigint:true})) || signature(stat) !== signature(await fs.lstat(file,{bigint:true}))) throw new Error('File changed while creating snapshot.');
        } finally { await handle.close(); }
        entries.push({path:rel,kind:'file',size:Number(stat.size),mtime:Number(stat.mtimeNs)/1e6,sha256:hash.digest('hex')});
      }
    }
    if (signature(before) !== signature(await fs.lstat(directory,{bigint:true}))) throw new Error('Folder changed while creating snapshot.');
  }
  await walk(root,'');
  return validateSnapshot({version:1,kind:'folder-snapshot',createdAt:new Date().toISOString(),entries});
}
async function loadSnapshot(file) {
  const {readDataLimited} = require('./sessions.cjs');
  return validateSnapshot(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readDataLimited(file,MAX_JSON_BYTES))));
}
async function saveSnapshot(file, snapshot) {
  const content = JSON.stringify(validateSnapshot(snapshot),null,2);
  if (Buffer.byteLength(content) > MAX_JSON_BYTES) throw new Error('Snapshot exceeds 25 MB.');
  await fs.writeFile(file,content,{flag:'wx',mode:0o600});
}
function compareSnapshots(left,right) {
  const a = new Map(validateSnapshot(left).entries.map(e => [e.path,e]));
  const b = new Map(validateSnapshot(right).entries.map(e => [e.path,e]));
  const rows = [...new Set([...a.keys(),...b.keys()])].sort().map(name => {
    const l = a.get(name), r = b.get(name);
    return {path:name,status:!l?'right':!r?'left':l.kind !== r.kind?'conflict':l.sha256 === r.sha256?'equal':'changed',sizeA:l?.size ?? null,sizeB:r?.size ?? null};
  });
  return {equal:rows.every(row => row.status === 'equal'),rows};
}
module.exports = {createSnapshot,validateSnapshot,loadSnapshot,saveSnapshot,compareSnapshots};
