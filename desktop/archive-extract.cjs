'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const MAX_ENTRIES = 5000;
const MAX_TOTAL = 64 * 1024 * 1024;
const plans = new WeakMap();

function validateArchiveExtraction(items) {
  if (!Array.isArray(items) || !items.length || items.length > MAX_ENTRIES) throw new Error('Select between 1 and 5000 archive entries.');
  const nodes = new Map(), explicit = new Set();
  let bytes = 0;
  for (const item of items) {
    if (!item || !['file', 'directory'].includes(item.kind) || typeof item.path !== 'string') throw new Error('Invalid archive entry.');
    const relative = item.path;
    const parts = relative.split('/');
    if (!relative || Buffer.byteLength(relative) > 4096 || parts.length > 128 || parts.some(part =>
      !part || part === '.' || part === '..' || Buffer.byteLength(part) > 255 ||
      /[\x00-\x1f\x7f-\x9f\\<>:"|?*]/u.test(part) || /[. ]$/.test(part) ||
      /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(part))) throw new Error('Unsafe archive entry path.');
    let prefix = '';
    for (let i = 0; i < parts.length; i++) {
      prefix += (i ? '/' : '') + parts[i];
      const key = prefix.normalize('NFC').toLowerCase().normalize('NFC');
      const leaf = i === parts.length - 1;
      const kind = leaf ? item.kind : 'directory';
      const previous = nodes.get(key);
      if (previous && (previous.path !== prefix || previous.kind !== kind)) throw new Error('Archive paths collide or a file is used as a folder.');
      if (leaf && explicit.has(key)) throw new Error('Duplicate archive entry path.');
      if (!previous) nodes.set(key, { path: prefix, kind });
      if (nodes.size > MAX_ENTRIES) throw new Error('Archive extraction exceeds 5000 files and folders.');
      if (leaf) {
        explicit.add(key);
        if (kind === 'file') {
          const encoded = item.data;
          if (typeof encoded !== 'string' || encoded.length > Math.ceil((MAX_TOTAL - bytes) / 3) * 4 ||
              encoded.length % 4 || /[^A-Za-z0-9+/=]/.test(encoded) || (encoded.indexOf('=') !== -1 && !/^={1,2}$/.test(encoded.slice(encoded.indexOf('='))))) throw new Error('Invalid or oversized archive file data.');
          const data = Buffer.from(encoded, 'base64');
          if (data.toString('base64') !== encoded) throw new Error('Invalid archive file data.');
          bytes += data.length;
          if (bytes > MAX_TOTAL) throw new Error('Archive extraction exceeds 64 MiB.');
          nodes.get(key).data = data;
        }
      }
    }
  }
  const entries = [...nodes.values()];
  const plan = Object.freeze({ files: entries.filter(entry => entry.kind === 'file').length, directories: entries.filter(entry => entry.kind === 'directory').length, bytes });
  plans.set(plan, entries);
  return plan;
}

async function extractArchiveEntries(destination, plan) {
  const entries = plans.get(plan);
  if (!entries) throw new Error('Invalid archive extraction plan.');
  const parent = await fs.realpath(destination);
  if (!(await fs.stat(parent)).isDirectory()) throw new Error('Choose a destination folder.');
  let output;
  try {
    output = await fs.mkdtemp(path.join(parent, 'Further Compare-'));
    await fs.chmod(output, 0o700);
    for (const entry of entries) {
      const target = path.join(output, ...entry.path.split('/'));
      if (entry.kind === 'directory') await fs.mkdir(target, { mode: 0o700 });
      else await fs.writeFile(target, entry.data, { flag: 'wx', mode: 0o600 });
    }
    return { path: output, ...plan };
  } catch (error) {
    if (output) await fs.rm(output, { recursive: true, force: true });
    throw error;
  }
}
module.exports = { validateArchiveExtraction, extractArchiveEntries, MAX_ENTRIES, MAX_TOTAL };
