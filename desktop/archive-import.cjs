'use strict';
const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const path = require('node:path');
const MAX_FILES = 5000, MAX_BYTES = 32 * 1024 * 1024;
const stamp = stat => [stat.dev,stat.ino,stat.mode,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
function modifiedTime(ms) {
  const date = new Date(Number(ms)), pad = value => String(value).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
// Inputs come only from the native picker. Return content snapshots, never disk authority.
async function readArchiveFiles(files, {io=fs,check=()=>{}}={}) {
  if (!Array.isArray(files) || !files.length || files.length > MAX_FILES) throw Error('Choose between 1 and 5,000 files.');
  const entries=[]; let total=0;
  for (const selected of files) {
    check();
    if (typeof selected !== 'string' || !path.isAbsolute(selected)) throw Error('Choose regular files from disk.');
    const before=await io.lstat(selected,{bigint:true});
    if (!before.isFile() || before.isSymbolicLink()) throw Error('Choose regular files; folders and symbolic links cannot be added.');
    total+=Number(before.size);
    if (total>MAX_BYTES) throw Error('Selected files exceed 32 MiB in total.');
    const file=await io.realpath(selected);
    entries.push({selected,file,before});
  }
  const output=[];
  for (const {selected,file,before} of entries) {
    check();
    const handle=await io.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
    try {
      const opened=await handle.stat({bigint:true});
      if (!opened.isFile() || stamp(opened)!==stamp(before)) throw Error('A selected file changed. Choose the files again.');
      // One extra byte detects growth without allowing unbounded reads.
      const bytes=Buffer.alloc(Number(before.size)+1); let count=0;
      while(count<bytes.length) {
        check();
        const {bytesRead}=await handle.read(bytes,count,bytes.length-count,count);
        if(!bytesRead)break;
        count+=bytesRead;
      }
      const after=await handle.stat({bigint:true}), current=await io.lstat(selected,{bigint:true});
      if(count!==Number(before.size)||stamp(after)!==stamp(before)||stamp(current)!==stamp(before)||await io.realpath(selected)!==file) throw Error('A selected file changed while reading. Choose the files again.');
      check();
      output.push({name:path.basename(selected),data:bytes.subarray(0,count).toString('base64'),modified:modifiedTime(before.mtimeMs),...(process.platform!=='win32'?{permissions:Number(before.mode)&0o777}:{})});
    } finally { await handle.close(); }
  }
  check();return output;
}
module.exports={readArchiveFiles,MAX_FILES,MAX_BYTES};
