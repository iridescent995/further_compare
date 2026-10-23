'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {FolderService} = require('./folders.cjs');
const {readDataLimited} = require('./sessions.cjs');
const {comparisonType} = require('./shell-requests.cjs');
const {decodeTextInput,isDocumentInput} = require('../src/text-input.cjs');
const fileSnapshots = require('./local-file-snapshot.cjs');
const stagedPairs = new WeakMap();
async function validateStagedPair(staged) {
  const retained=stagedPairs.get(staged);
  if(!retained)throw Error('The selected pair is no longer available. Select it again.');
  await retained.validate();
  return retained.snapshots;
}
const identity = stat => `${stat.dev}:${stat.ino}:${stat.mode}`;
const signature = stat => `${identity(stat)}:${stat.uid}:${stat.gid}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
function relativePath(value) {
  if (typeof value !== 'string' || !value || value.length > 32768 || /[\0\\]/.test(value) || path.isAbsolute(value) || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Choose a file or folder inside each selected root.');
  return value;
}
// Stage both sides completely before the caller creates a new session or changes authority.
async function stageFolderPair(active, leftRelative, rightRelative, read = readDataLimited, encoding='auto',options={}) {
  const encodings=require('./folder-rules.cjs').validateFolderTextEncodings(encoding);
  const relatives = {a:relativePath(leftRelative),b:relativePath(rightRelative)};
  const roots = {}, entries = {}, values = {}, revisions = {}, snapshots = {};
  for (const side of ['a','b']) {
    const root = await active.directoryPath(side);
    roots[side] = {path:root,stat:await fs.lstat(root,{bigint:true})};
    const file = await active.safe(side,relatives[side]);
    const stat = await fs.lstat(file,{bigint:true});
    if (!stat.isFile() && !stat.isDirectory()) throw new Error('Choose regular files or folders.');
    entries[side] = {path:file,stat};
  }
  const directories = entries.a.stat.isDirectory();
  if (directories !== entries.b.stat.isDirectory()) throw new Error('Choose two files or two folders to compare.');
  const name = `${path.basename(entries.a.path)} ↔ ${path.basename(entries.b.path)}`.slice(0,200);
  let service, metadata, mode;
  if (directories) {
    service = new FolderService(active.backupRoot,{extractPdfText:options.extractPdfText||active.extractPdfText,extractDocText:options.extractDocText||active.extractDocText});
    metadata = {};
    for (const side of ['a','b']) metadata[side] = await service.select(side,entries[side].path);
    mode = 'folder-compare';
  } else {
    for(const side of ['a','b'])snapshots[side]=await fileSnapshots.capture(entries[side].path);
    for (const side of ['a','b']) {
      const file = entries[side].path;
      values[side] = {name:path.basename(file),path:file,bytes:await read(file)};
    }
    const aMode = comparisonType(entries.a.path), bMode = comparisonType(entries.b.path);
    const projected=Object.values(values).some(value=>isDocumentInput(value.name));
    if(projected&&[aMode,bMode].some(type=>type&&type!=='text-compare'))throw Error('Compare a document with another PDF, DOCX document or text file.');
    mode = projected?'text-compare':aMode === bMode ? aMode : 'binary-compare';
    if (!mode || mode==='text-compare') {
      try { for (const [side,value] of Object.entries(values)) Object.assign(value,await decodeTextInput(value.bytes,value.name,encodings[side],{extractPdfText:active.extractPdfText,extractDocText:active.extractDocText,...options})); mode = 'text-compare'; }
      catch(error) { if(projected)throw error;mode = 'binary-compare'; }
    }
    for (const value of Object.values(values)) {
      if (mode !== 'text-compare') { value.data = value.bytes.toString('base64'); delete value.content; delete value.format; }
      delete value.bytes;
    }
  }
  // Reading the right file must not conceal replacement of the already-read left file.
  const validate=async()=>{for (const side of ['a','b']) {
    const root = await active.directoryPath(side);
    if (root !== roots[side].path || identity(await fs.lstat(root,{bigint:true})) !== identity(roots[side].stat)) throw new Error('A selected root changed. Select it again.');
    const file = await active.safe(side,relatives[side]);
    if (file !== entries[side].path || signature(await fs.lstat(file,{bigint:true})) !== signature(entries[side].stat)) throw new Error('A selected entry changed while opening. Select the pair again.');
    if(snapshots[side])await fileSnapshots.validate(snapshots[side]);
  }};
  await validate();
  for(const side of ['a','b'])if(snapshots[side])revisions[side]=snapshots[side].revision;
  const staged=directories ? {mode,name,folders:metadata,service} : {mode,name,...values,revisions};
  stagedPairs.set(staged,{snapshots,validate});
  return staged;
}
module.exports = {stageFolderPair,validateStagedPair};
