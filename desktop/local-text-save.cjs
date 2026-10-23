'use strict';
const nodeFs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const localSnapshot = require('./local-file-snapshot.cjs');
const {renameFileExclusive} = require('./rename-directory.cjs');
const identity = stat => `${stat.dev}:${stat.ino}`;
const signature = stat => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
const changed = () => new Error('The destination or its location changed while saving. Choose it again.');
// Dependency injection is confined to each saver instance, including tests.
function createLocalTextSaver({fs=nodeFs,snapshots=localSnapshot,uuid=randomUUID,platform=process.platform,renameExclusive=renameFileExclusive}={}) {
  async function missingOrStat(file) {
    try {return await fs.lstat(file,{bigint:true});} catch(error) {if(error.code==='ENOENT')return null;throw error;}
  }
  async function parentState(original,canonical) {
    if(await fs.realpath(original)!==canonical || await fs.realpath(canonical)!==canonical)throw changed();
    const state=[];
    for(let directory=canonical;;directory=path.dirname(directory)) {
      const stat=await fs.lstat(directory,{bigint:true});
      if(!stat.isDirectory())throw changed();
      state.push([directory,identity(stat)]);
      if(path.dirname(directory)===directory)break;
    }
    return JSON.stringify(state);
  }
  return async function saveLocalText(file,bytes,{current=()=>{},validateTarget=()=>{}}={}) {
    if(typeof file!=='string'||!file||file.includes('\0')||!path.isAbsolute(file))throw Error('Choose an absolute file destination.');
    if(!(bytes instanceof Uint8Array))throw Error('Save requires encoded file bytes.');
    const originalParent=path.dirname(file), canonicalParent=await fs.realpath(originalParent);
    const parents=await parentState(originalParent,canonicalParent);
    const target=path.join(canonicalParent,path.basename(file));
    const previous=await missingOrStat(target);
    if(previous&&!previous.isFile())throw Error('Choose a regular file destination; symbolic links are not followed.');
    const existing=previous?await snapshots.capture(target):null;
    if(existing&&existing.signature!==signature(previous))throw changed();
    await validateTarget(target,existing);
    const temporary=path.join(canonicalParent,`.${path.basename(file)}.${uuid()}.tmp`);
    let handle,owned;
    try {
      current();
      handle=await fs.open(temporary,'wx',0o600);
      owned=await handle.stat({bigint:true});
      await handle.writeFile(bytes);
      if(previous&&platform!=='win32')await handle.chmod(Number(previous.mode&0o777n));
      await handle.sync();
      await handle.close();handle=null;
      const staged=await snapshots.read(temporary,bytes.byteLength);
      const written=staged.snapshot;
      if(written.dev!==owned.dev||written.ino!==owned.ino||!Buffer.from(staged.bytes).equals(Buffer.from(bytes)))throw changed();
      if(await parentState(originalParent,canonicalParent)!==parents)throw changed();
      if(existing)await snapshots.validate(existing);
      else if(await missingOrStat(target))throw changed();
      await snapshots.validate(written);
      current();
      // Node offers no conditional replacement primitive: overwrites retain a narrow
      // validation-to-rename race. This is not an atomic compare-and-swap guarantee.
      // A new destination is published exclusively, so concurrent creation wins.
      if(existing)await fs.rename(temporary,target);
      else {
        try {await fs.link(temporary,target);} catch(error) {
          if(!['ENOTSUP','EOPNOTSUPP','EPERM'].includes(error.code))throw error;
          // Some removable/network volumes do not support hard links. The native
          // primitive still refuses replacement and verifies the source identity.
          if(await parentState(originalParent,canonicalParent)!==parents)throw changed();
          await snapshots.validate(written);current();
          await renameExclusive(canonicalParent,path.basename(temporary),path.basename(target),owned);
        }
      }
      return written;
    } finally {
      if(handle)await handle.close().catch(()=>{});
      // Never remove another process's file if the staging pathname was replaced.
      if(owned) {
        try {const now=await missingOrStat(temporary);if(now&&identity(now)===identity(owned))await fs.unlink(temporary);}catch{}
      }
    }
  };
}
module.exports={saveLocalText:createLocalTextSaver(),createLocalTextSaver};
