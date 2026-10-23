'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

function validate(side, paths) {
  if (!['a', 'b'].includes(side)) throw new Error('Invalid folder side.');
  if (!Array.isArray(paths) || !paths.length || paths.length > 1000 || new Set(paths).size !== paths.length) throw new Error('Select between 1 and 1000 unique files or folders.');
  for (const relative of paths) {
    if (typeof relative !== 'string' || !relative || relative.length > 32768 || /[\\\0:]/.test(relative) || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid relative path.');
  }
}
const revision = (stat, includeAccessTime = true) => [stat.dev, stat.ino, stat.mode, stat.size, stat.uid, stat.gid, stat.mtimeNs, stat.ctimeNs, includeAccessTime ? stat.atimeNs : null, stat.birthtimeNs].join(':');
function milliseconds(ns) {
  if (typeof ns !== 'bigint' || ns < -8640000000000000000000n || ns > 8640000000000000000000n) return null;
  const value = Number(ns) / 1e6;
  return Number.isFinite(value) && Math.abs(value) <= 8640000000000000 ? value : null;
}
function permissions(mode) {
  const bits = Number(mode & 0o7777n);
  const chars = [...'---------'];
  for (let index = 0; index < 9; index++) if (bits & (1 << (8 - index))) chars[index] = 'rwx'[index % 3];
  if (bits & 0o4000) chars[2] = bits & 0o100 ? 's' : 'S';
  if (bits & 0o2000) chars[5] = bits & 0o010 ? 's' : 'S';
  if (bits & 0o1000) chars[8] = bits & 0o001 ? 't' : 'T';
  return chars.join('');
}

async function readFolderProperties(safe, side, paths) {
  validate(side, paths);
  const requested = [...paths], entries = [];
  let total = 0n, files = 0, folders = 0;
  for (const relative of requested) {
    // The caller supplies the native selected-root authority, never a renderer path.
    const absolutePath = await safe(side, relative);
    const before = await fs.lstat(absolutePath, {bigint: true});
    if (!before.isFile() && !before.isDirectory()) throw new Error('Properties are available only for regular files and folders.');
    if (await safe(side, relative) !== absolutePath) throw new Error(`“${relative}” changed. Refresh and try again.`);
    const after = await fs.lstat(absolutePath, {bigint: true});
    if (revision(before) !== revision(after) || await safe(side, relative) !== absolutePath) throw new Error(`“${relative}” changed. Refresh and try again.`);
    const file = before.isFile();
    if (file) { files++; total += before.size; } else folders++;
    const posix = process.platform !== 'win32';
    entries.push({
      path: relative, absolutePath, name: path.posix.basename(relative),
      kind: file ? 'file' : 'directory', sizeBytes: file ? String(before.size) : null,
      modifiedMs: milliseconds(before.mtimeNs), accessedMs: milliseconds(before.atimeNs), createdMs: milliseconds(before.birthtimeNs),
      permissions: posix ? permissions(before.mode) : null,
      mode: posix ? (before.mode & 0o7777n).toString(8).padStart(4, '0') : null,
      ownerId: posix ? String(before.uid) : null, groupId: posix ? String(before.gid) : null,
    });
  }
  return {side, entries, totalFileBytes: String(total), files, folders};
}
const directoryRevision=stat=>[stat.dev,stat.ino,stat.mode,stat.mtimeNs,stat.ctimeNs].join(':');
async function readFolderSize(safe,side,relative,{maxEntries=50000,signal}={}) {
  validate(side,[relative]);
  if(!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>50000)throw Error('Invalid folder size limit.');
  let bytes=0n,files=0,folders=0,skipped=0,visited=0,limited=false;
  const deadline=Date.now()+10000;
  const check=()=>{if(signal?.aborted)throw Error('Folder size calculation cancelled.');};
  async function walk(current) {
    check();
    if(visited>=maxEntries||Date.now()>deadline){limited=true;return;}
    const absolute=await safe(side,current),before=await fs.lstat(absolute,{bigint:true});
    if(!before.isDirectory())throw Error('Choose a regular folder to calculate its size.');
    const directory=await fs.opendir(absolute);
    try { for await(const item of directory){
      check();
      if(visited>=maxEntries||Date.now()>deadline){limited=true;break;}
      visited++;
      if(item.isSymbolicLink()||(!item.isFile()&&!item.isDirectory())){skipped++;continue;}
      const child=current+'/'+item.name;
      const file=await safe(side,child),stat=await fs.lstat(file,{bigint:true});
      if(stat.isDirectory()){folders++;await walk(child);}
      else if(stat.isFile()){if(await safe(side,child)!==file)throw Error('Folder changed while calculating size.');const after=await fs.lstat(file,{bigint:true});if(revision(stat,false)!==revision(after,false))throw Error('File changed while calculating size.');bytes+=stat.size;files++;}
      else throw Error('Folder entry changed while calculating size.');
      if(limited)break;
    }} finally { await directory.close().catch(error=>{if(error.code!=='ERR_DIR_CLOSED')throw error;}); }
    if(await safe(side,current)!==absolute||directoryRevision(before)!==directoryRevision(await fs.lstat(absolute,{bigint:true})))throw Error('Folder changed while calculating size. Refresh and try again.');
  }
  await walk(relative);check();
  return {sizeBytes:String(bytes),files,folders,skipped,limited,complete:!limited&&!skipped};
}
module.exports = {readFolderProperties,readFolderSize};
