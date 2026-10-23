'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {FolderService} = require('./folders.cjs');

// The destination comes only from the native chooser, never renderer input.
async function previewCopyToFolder(active, side, paths, chooseDirectory) {
  if (!['a','b'].includes(side) || !Array.isArray(paths) || !paths.length || paths.length > 1000 ||
      new Set(paths).size !== paths.length || paths.some(value => typeof value !== 'string' ||
        value.length > 32768 || value.includes('\0') || value.includes('\\') || path.isAbsolute(value) ||
        value.split('/').some(part => !part || part === '.' || part === '..'))) {
    throw new Error('Select between 1 and 1,000 unique file or folder paths.');
  }
  paths = [...paths];
  const source = await active.directoryPath(side);
  const original = await fs.lstat(source,{bigint:true});
  for (const relative of paths) {
    const stat = await fs.lstat(await active.safe(side,relative));
    if (!stat.isFile() && !stat.isDirectory()) throw new Error('Select regular files or folders.');
  }
  const destination = await chooseDirectory();
  if (!destination) return null;
  const current = await fs.lstat(await active.directoryPath(side),{bigint:true});
  if (active.roots[side] !== source || original.dev !== current.dev || original.ino !== current.ino) {
    throw new Error('The source folder changed. Select it again.');
  }
  const service = new FolderService(active.backupRoot);
  await service.select('a',source);
  await service.select('b',destination);
  const preview = await service.previewAction('copy','a',paths);
  return {service, preview, source:service.roots.a, destination:service.roots.b};
}

module.exports = {previewCopyToFolder};
