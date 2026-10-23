'use strict';
// Native-only executor. Input roots are read-only; a failed apply retains its recovery journal.
const fs = require('node:fs/promises');
const path = require('node:path');
const {constants} = require('node:fs');
const {createHash, randomUUID} = require('node:crypto');
const identity = s => `${s.dev}:${s.ino}`;
const revision = s => `${identity(s)}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
const stat = p => fs.lstat(p, {bigint:true});
const optionalStat = p => stat(p).catch(e => {if(e.code === 'ENOENT') return null; throw e;});
const folded = p => p.normalize('NFC').toLowerCase();
function relative(p) {
  if(typeof p !== 'string' || !p || p.length > 32768 || /[\\\x00-\x1f\x7f<>:"|?*]/.test(p) || p.split('/').some(x=>!x || x==='.' || x==='..' || /[. ]$/.test(x) || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(x))) throw new Error('Invalid output path.');
}
async function syncDirectory(directory) {
  if(process.platform === 'win32') return;
  const handle = await fs.open(directory, 'r');
  try {await handle.sync();} finally {await handle.close();}
}
async function copyExclusive(source, destination, expected, onCreated=async()=>{}) {
  const input = await fs.open(source, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  let output;
  try {
    const before = await input.stat({bigint:true});
    if(!before.isFile() || (expected.revision && revision(before)!==expected.revision)) throw new Error('Source changed before copying.');
    output = await fs.open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), (expected.mode ?? Number(before.mode)) & 0o777);
    await onCreated(await output.stat({bigint:true}));
    const hash = createHash('sha256'), buffer = Buffer.alloc(128*1024); let size = 0;
    for(;;) {
      const {bytesRead} = await input.read(buffer,0,buffer.length,null); if(!bytesRead) break;
      hash.update(buffer.subarray(0,bytesRead)); size += bytesRead;
      for(let offset=0;offset<bytesRead;) {const n=(await output.write(buffer,offset,bytesRead-offset,null)).bytesWritten;if(!n)throw new Error('File write made no progress.');offset+=n;}
    }
    const after=await input.stat({bigint:true}), current=await stat(source);
    if(current.isSymbolicLink() || revision(before)!==revision(after) || revision(after)!==revision(current) || size!==expected.size || hash.digest('hex')!==expected.hash) throw new Error('Source changed while copying.');
    await output.chmod((expected.mode ?? Number(before.mode)) & 0o777);
    await output.utimes(Number(before.atimeNs)/1e9,Number(before.mtimeNs)/1e9);
    await output.sync();
    return {kind:'file',hash:expected.hash,size,revision:revision(await output.stat({bigint:true})),mode:Number(before.mode)};
  } catch(error) {
    // A handled write failure must not leave a partial sibling that blocks recovery.
    // Remove only the exact file opened by this invocation, never a replacement path.
    if(output){try{const own=await output.stat({bigint:true}),current=await stat(destination);if(current.isFile()&&!current.isSymbolicLink()&&revision(current)===revision(own))await fs.unlink(destination);}catch{/* Preserve the original error and journal. */}}
    throw error;
  } finally {await output?.close();await input.close();}
}
async function executeThreeWayPlan(args, {beforeStep=async()=>{}}={}) {
  const {id,inputs,output,inputSnapshots,targetSnapshot,checkRoots,validatePreview,backupRoot}=args;
  if(typeof id!=='string' || !id || typeof checkRoots!=='function' || typeof validatePreview!=='function' || typeof beforeStep!=='function' || !Array.isArray(args.operations)) throw new Error('Invalid native merge plan.');
  const operations=structuredClone(args.operations), expected=new Map(structuredClone([...targetSnapshot.entries]));
  for(const op of operations) {
    relative(op.path);
    if(!['delete-file','delete-directory','create-directory','copy-file'].includes(op.type)) throw new Error('Invalid merge operation.');
    if(op.type==='copy-file') {relative(op.sourcePath);if(!['base','left','right'].includes(op.sourceSide))throw new Error('Invalid merge source.');}
  }
  const services={...inputs,output}, snapshots={...inputSnapshots,output:targetSnapshot}, roots={}, directories={};
  await checkRoots(); await validatePreview();
  for(const [side,service] of Object.entries(services)) {
    roots[side]=await service.directoryPath('a');
    const s=await stat(roots[side]);
    if(!s.isDirectory() || s.isSymbolicLink() || identity(s)!==snapshots[side].identity) throw new Error('Selected root changed.');
    directories[side]=new Map([['',identity(s)],...[...snapshots[side].entries].filter(([,v])=>v.kind==='directory').map(([p,v])=>[p,v.identity])]);
  }
  // The output and backup trees must never overlap any input or each other.
  const overlaps=(a,b)=>{const rel=path.relative(a,b);return !rel || (!rel.startsWith('..'+path.sep) && rel!=='..' && !path.isAbsolute(rel));};
  const canonicalBackup=await fs.realpath(backupRoot);
  if(canonicalBackup!==path.resolve(backupRoot))throw new Error('Backup root must be canonical.');
  for(const side of ['base','left','right']) if(overlaps(roots[side],roots.output)||overlaps(roots.output,roots[side]))throw new Error('Output must be separate from inputs.');
  for(const root of Object.values(roots))if(overlaps(root,canonicalBackup)||overlaps(canonicalBackup,root))throw new Error('Backup root overlaps a selected folder.');
  const backupRootStat=await stat(canonicalBackup),backupRootIdentity=identity(backupRootStat);
  if(!backupRootStat.isDirectory()||backupRootStat.isSymbolicLink())throw new Error('Invalid backup root.');
  async function safe(side,rel) {
    await checkRoots();
    const service=services[side],root=roots[side];
    if(await service.directoryPath('a')!==root)throw new Error('Selected root changed.');
    const full=await service.safe('a',rel,true),parts=rel.split('/');
    for(let i=0;i<parts.length;i++) {
      const parent=parts.slice(0,i).join('/'),directory=path.join(root,parent),s=await stat(directory);
      if(!s.isDirectory()||s.isSymbolicLink()||identity(s)!==directories[side].get(parent))throw new Error('Parent directory changed.');
      const matches=(await fs.readdir(directory)).filter(n=>folded(n)===folded(parts[i]));
      if(matches.some(n=>n!==parts[i]) || matches.length>1)throw new Error('Case or Unicode name collision.');
    }
    return full;
  }
  async function assertEntry(side,rel,entry) {
    const full=await safe(side,rel),s=await optionalStat(full);
    if(!entry){if(s)throw new Error('An unexpected output entry appeared.');return full;}
    if(!s||s.isSymbolicLink()||(entry.kind==='file' ? !s.isFile()||revision(s)!==entry.revision : !s.isDirectory()||identity(s)!==entry.identity))throw new Error('An entry changed since preview.');
    return full;
  }
  const backupPath=path.join(canonicalBackup,'threeway-'+randomUUID());
  await fs.mkdir(backupPath,{mode:0o700});
  const backupIdentity=identity(await stat(backupPath));
  await syncDirectory(canonicalBackup);
  async function assertBackup() {
    const root=await stat(canonicalBackup),own=await stat(backupPath);
    if(!root.isDirectory()||root.isSymbolicLink()||identity(root)!==backupRootIdentity||await fs.realpath(canonicalBackup)!==canonicalBackup||!own.isDirectory()||own.isSymbolicLink()||identity(own)!==backupIdentity)throw new Error('Backup directory changed.');
  }
  let completed=0,activeOperation=null;
  const backups=[],staged=[],temporaryFiles=[],temporaryIdentities=[];
  async function manifest(status,error=null) {
    await assertBackup();
    const temp=path.join(backupPath,'.manifest-'+randomUUID()),handle=await fs.open(temp,'wx',0o600);
    try {await handle.writeFile(JSON.stringify({version:2,id,status,roots,rootIdentities:Object.fromEntries(Object.entries(snapshots).map(([side,snapshot])=>[side,snapshot.identity])),operations,originalTarget:[...targetSnapshot.entries],backups,staged,completed,activeOperation,temporaryFiles,temporaryIdentities,error},null,2));await handle.sync();}finally{await handle.close();}
    await assertBackup();await fs.rename(temp,path.join(backupPath,'manifest.json'));await syncDirectory(backupPath);
  }
  try {
    await manifest('preparing');
    const saved=new Set();
    for(let index=0;index<operations.length;index++) {
      const op=operations[index],old=expected.get(op.path);
      if(old?.kind==='file' && ['delete-file','copy-file'].includes(op.type) && !saved.has(op.path)) {
        await beforeStep({phase:'backup',index,path:op.path});
        const source=await assertEntry('output',op.path,old),name=`backup-${backups.length}`;
        await assertBackup();const stored=await copyExclusive(source,path.join(backupPath,name),old);await assertEntry('output',op.path,old);await assertBackup();
        backups.push({path:op.path,file:name,...old,backupRevision:stored.revision});saved.add(op.path);await manifest('preparing');
      }
      if(op.type==='copy-file') {
        await beforeStep({phase:'stage',index,path:op.path});
        const entry=inputSnapshots[op.sourceSide].entries.get(op.sourcePath);
        if(entry?.kind!=='file'||entry.hash!==op.hash||entry.size!==op.size)throw new Error('Plan source does not match the input snapshot.');
        const source=await assertEntry(op.sourceSide,op.sourcePath,entry),name=`staged-${index}`;
        await assertBackup();const descriptor=await copyExclusive(source,path.join(backupPath,name),entry);await assertEntry(op.sourceSide,op.sourcePath,entry);await assertBackup();
        staged.push({index,file:name,...descriptor});await manifest('preparing');
      }
    }
    await manifest('prepared');await beforeStep({phase:'prepared'});await checkRoots();await validatePreview();
    async function assertSaved(item) {
      await assertBackup();const s=await stat(path.join(backupPath,item.file));
      if(!s.isFile()||s.isSymbolicLink()||revision(s)!==item.backupRevision)throw new Error('A recovery backup changed.');
    }
    for(const item of backups)await assertSaved(item);
    const stagedByIndex=new Map(staged.map(item=>[item.index,item])),backupByPath=new Map(backups.map(item=>[item.path,item]));
    for(let index=0;index<operations.length;index++) {
      const op=operations[index];await beforeStep({phase:'apply',index,path:op.path,operation:structuredClone(op)});
      await assertBackup();await checkRoots();
      const prior=expected.get(op.path),full=await assertEntry('output',op.path,prior);
      activeOperation=index;await manifest('applying');
      if(backupByPath.has(op.path))await assertSaved(backupByPath.get(op.path));
      if(op.type==='delete-file') {
        if(prior?.kind!=='file'||prior.hash!==op.hash||prior.size!==op.size)throw new Error('Invalid file removal plan.');
        await assertEntry('output',op.path,prior);await fs.unlink(full);expected.delete(op.path);
      } else if(op.type==='delete-directory') {
        if(prior?.kind!=='directory')throw new Error('Invalid directory removal plan.');
        await assertEntry('output',op.path,prior);await fs.rmdir(full);expected.delete(op.path);directories.output.delete(op.path);
      } else if(op.type==='create-directory') {
        if(prior)throw new Error('Output directory already exists.');
        await assertEntry('output',op.path,null);await fs.mkdir(full);
        const s=await stat(full);if(!s.isDirectory()||s.isSymbolicLink())throw new Error('Created directory changed.');
        expected.set(op.path,{kind:'directory',identity:identity(s)});directories.output.set(op.path,identity(s));
      } else {
        const source=inputSnapshots[op.sourceSide].entries.get(op.sourcePath);await assertEntry(op.sourceSide,op.sourcePath,source);
        const saved=stagedByIndex.get(index);if(!saved)throw new Error('Staged content is missing.');
        if(prior && (prior.kind!=='file'||prior.hash!==op.oldHash||prior.size!==op.oldSize))throw new Error('Output overwrite no longer matches the plan.');
        const sibling=path.join(path.dirname(full),'.fc-threeway-'+randomUUID());temporaryFiles.push(sibling);await manifest('applying');
        await assertBackup();const stagedCopy=await copyExclusive(path.join(backupPath,saved.file),sibling,saved,async own=>{temporaryIdentities.push({path:sibling,identity:identity(own)});await manifest('applying');});await assertBackup();
        await assertEntry(op.sourceSide,op.sourcePath,source);await assertEntry('output',op.path,prior);
        if(backupByPath.has(op.path))await assertSaved(backupByPath.get(op.path));
        const siblingStat=await stat(sibling);if(!siblingStat.isFile()||siblingStat.isSymbolicLink()||revision(siblingStat)!==stagedCopy.revision)throw new Error('Staged output changed.');
        if(prior)await fs.unlink(full);
        // link() is an exclusive publication: a concurrently appearing target is never replaced.
        await safe('output',op.path);await fs.link(sibling,full);
        const published=await stat(full),own=await stat(sibling);
        if(!published.isFile()||published.isSymbolicLink()||identity(published)!==identity(own)||identity(own)!==identity(siblingStat))throw new Error('Published output changed.');
        await fs.unlink(sibling);temporaryFiles.splice(temporaryFiles.indexOf(sibling),1);temporaryIdentities.splice(temporaryIdentities.findIndex(item=>item.path===sibling),1);
        expected.set(op.path,{kind:'file',hash:op.hash,size:op.size,revision:revision(await stat(full))});
      }
      await syncDirectory(path.dirname(full));completed++;activeOperation=null;await manifest('applying');
    }
    await manifest('completed');return {id,completed,backupPath};
  } catch(error) {
    try {await manifest('failed',String(error.message||error));}catch(journalError){error.manifestError=String(journalError.message||journalError);}
    error.backupPath=backupPath;error.completed=completed;throw error;
  }
}
module.exports={executeThreeWayPlan};
