'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {constants} = require('node:fs');
const {FolderService} = require('./folders.cjs');
const identity = s => `${s.dev}:${s.ino}:${s.mode}`;
const revision = s => `${identity(s)}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
const folded = name => name.normalize('NFC').toLowerCase();
const missing = error => { if (error.code === 'ENOENT') return null; throw error; };
const stat = file => fs.lstat(file, {bigint:true});
const depth = name => name.split('/').length;
async function inspect(file) {
  const h = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const before = await h.stat({bigint:true});
    if (!before.isFile()) throw new Error('Only regular files can be moved.');
    const hash = crypto.createHash('sha256');
    for await (const chunk of h.createReadStream({autoClose:false})) hash.update(chunk);
    const after = await h.stat({bigint:true}), current = await stat(file);
    if (revision(before) !== revision(after) || revision(after) !== revision(current)) throw new Error('A file changed while being read. Preview again.');
    return {kind:'file', snapshotRevision:`${after.dev}:${after.ino}:${after.size}:${after.mtimeNs}:${after.ctimeNs}`, revision:revision(after), identity:identity(after), hash:hash.digest('hex'), mode:Number(after.mode), atime:Number(after.atimeNs)/1e9, mtime:Number(after.mtimeNs)/1e9};
  } finally { await h.close(); }
}
async function copyExclusive(source, destination, expected) {
  const input = await fs.open(source, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  let output;
  try {
    const before = await input.stat({bigint:true});
    if (!before.isFile()) throw new Error('Backup source is no longer a file.');
    output = await fs.open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), expected.mode & 0o777);
    const hash = crypto.createHash('sha256'), buffer = Buffer.alloc(128 * 1024);
    for (;;) {
      const {bytesRead} = await input.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0,bytesRead));
      let written = 0;
      while (written < bytesRead) written += (await output.write(buffer, written, bytesRead-written, null)).bytesWritten;
    }
    if (hash.digest('hex') !== expected.hash || revision(before) !== revision(await input.stat({bigint:true})) || revision(before) !== revision(await stat(source))) throw new Error('File changed while copying.');
    await output.chmod(expected.mode & 0o777);
    await output.utimes(expected.atime, expected.mtime);
    await output.sync();
  } finally { await output?.close(); await input.close(); }
}
async function previewMove(active, side, paths, chooseDirectory = null, {beforeStep = async () => {}, targetPath = null, validateContext = async () => {}, selectSourceEntries = null, validateEligibility = async () => {}} = {}) {
  if (!['a','b'].includes(side) || !Array.isArray(paths) || !paths.length || paths.length > 1000 || new Set(paths).size !== paths.length || paths.some(p => typeof p !== 'string' || p.length > 32768 || p.includes('\0') || p.includes('\\') || path.isAbsolute(p) || p.split('/').some(x => !x || x === '.' || x === '..'))) throw new Error('Select between 1 and 1,000 unique relative paths.');
  if (typeof validateEligibility !== 'function' || (selectSourceEntries !== null && typeof selectSourceEntries !== 'function') || (targetPath !== null && typeof targetPath !== 'function') || typeof validateContext !== 'function' || typeof beforeStep !== 'function' || (chooseDirectory !== null && typeof chooseDirectory !== 'function')) throw new Error('Invalid move options.');
  await validateContext();
  const source = await active.directoryPath(side), sourceIdentity = identity(await stat(source));
  const destination = chooseDirectory ? await chooseDirectory() : await active.directoryPath(side === 'a' ? 'b' : 'a');
  if (!destination) return null;
  if (await active.directoryPath(side) !== source || identity(await stat(source)) !== sourceIdentity) throw new Error('Source folder changed.');
  const folders = new FolderService(active.backupRoot);
  await folders.select('a',source); await folders.select('b',destination);
  const backupRootIdentity=identity(await stat(folders.backupRoot));
  const assertBackupRoot=async()=>{const current=await stat(folders.backupRoot); if(!current.isDirectory() || current.isSymbolicLink() || identity(current)!==backupRootIdentity || await fs.realpath(folders.backupRoot)!==folders.backupRoot) throw new Error('Backup directory changed.');};
  const roots = {a:identity(await stat(folders.roots.a)), b:identity(await stat(folders.roots.b))};
  const parents = {a:new Map(), b:new Map()};
  let rollingBack = false;
  async function safe(which, relative, allowMissing = false) {
    if (!rollingBack) await validateContext();
    if (identity(await stat(folders.roots[which])) !== roots[which]) throw new Error('Selected root changed.');
    const full = await folders.safe(which,relative,allowMissing);
    const parts = relative.split('/');
    for (let i=0;i<parts.length;i++) {
      const parent = parts.slice(0,i).join('/'), directory = path.join(folders.roots[which],parent);
      const s = await stat(directory).catch(missing);
      if (!s) { if (allowMissing) break; throw new Error('A parent directory disappeared.'); }
      if (!s.isDirectory() || s.isSymbolicLink()) throw new Error('A parent is not a regular directory.');
      const id = identity(s), known = parents[which].get(parent);
      if (known && known !== id) throw new Error('A parent directory changed.');
      parents[which].set(parent,id);
      const names = await fs.readdir(directory), matches = names.filter(n => folded(n) === folded(parts[i]));
      if (matches.length > 1 || matches.some(n => n !== parts[i])) throw new Error('Case or Unicode name collision.');
    }
    if (!rollingBack) await validateContext();
    return full;
  }
  const selected = [...paths].sort((a,b) => depth(a)-depth(b) || a.localeCompare(b)).filter((p,i,all) => !all.slice(0,i).some(parent => p.startsWith(parent+'/')));
  const entries = new Map(), targets = new Map();
  async function walk(relative) {
    if (entries.size >= 50000) throw new Error('Move exceeds the 50,000 entry limit.');
    const full = await safe('a',relative), s = await stat(full);
    if (s.isSymbolicLink() || (!s.isFile() && !s.isDirectory())) throw new Error('Symbolic links and special entries cannot be moved.');
    if (s.isFile()) entries.set(relative,await inspect(full));
    else {
      const names = (await fs.readdir(full)).sort(), keys = names.map(folded);
      if (new Set(keys).size !== keys.length) throw new Error('Case or Unicode name collision.');
      entries.set(relative,{kind:'directory',snapshotIdentity:`${s.dev}:${s.ino}`,identity:identity(s),mode:Number(s.mode),atime:Number(s.atimeNs)/1e9,mtime:Number(s.mtimeNs)/1e9,names});
      for (const name of names) await walk(relative+'/'+name);
    }
  }
  for (const relative of selected) await walk(relative);
  // Eligibility is computed by a native planner from the complete captured
  // inventory. Keep that inventory intact for execution-time validation.
  let eligible=new Set(entries.keys());
  if(selectSourceEntries){
    const values=await selectSourceEntries(structuredClone(entries));
    if(!Array.isArray(values)||values.length>50000||new Set(values).size!==values.length||values.some(relative=>typeof relative!=='string'||!entries.has(relative)))throw Error('Invalid filtered move selection.');
    eligible=new Set(values);await validateContext();
  }
  const transferEntries=new Map([...entries].filter(([relative])=>eligible.has(relative))),retained=new Set();
  for(const relative of entries.keys())if(!eligible.has(relative)){
    const parts=relative.split('/');for(let n=1;n<parts.length;n++)retained.add(parts.slice(0,n).join('/'));
  }
  const targetBySource = new Map(), sourceByTarget = new Map(), aliases = new Map();
  for (const [relative,entry] of transferEntries) {
    const target = targetPath ? targetPath(relative,entry.kind) : relative;
    if (typeof target !== 'string' || !target || target.length > 32768 || /[\\\0]/.test(target) || target.startsWith('/') || /^[A-Za-z]:/.test(target) || target.split('/').some(p=>!p || p==='.' || p==='..')) throw new Error('Invalid mapped move destination.');
    if (sourceByTarget.has(target)) throw new Error('Multiple source entries map to the same destination.');
    targetBySource.set(relative,target); sourceByTarget.set(target,relative);
    const parts = target.split('/');
    for(let n=1;n<=parts.length;n++) {
      const part=parts.slice(0,n).join('/'), key=folded(part), prior=aliases.get(key);
      if(prior && prior!==part) throw new Error('Case or Unicode name collision.');
      aliases.set(key,part);
    }
  }
  const requiredDirs = new Set();
  for (const [sourceRelative,entry] of transferEntries) {
    const relative = targetBySource.get(sourceRelative), parts = relative.split('/');
    for(let n=1;n<parts.length;n++) requiredDirs.add(parts.slice(0,n).join('/'));
    if(entry.kind === 'directory') requiredDirs.add(relative);
  }
  for (const relative of requiredDirs) if (entries.get(sourceByTarget.get(relative))?.kind === 'file') throw new Error('Mapped file and parent directory conflict.');
  for (const relative of [...new Set([...requiredDirs,...sourceByTarget.keys()])]) {
    const full = await safe('b',relative,true), s = await stat(full).catch(missing), expectedDirectory = requiredDirs.has(relative);
    if (s && (s.isSymbolicLink() || (expectedDirectory ? !s.isDirectory() : !s.isFile()))) throw new Error('Source and destination entry types conflict.');
    targets.set(relative,s ? (expectedDirectory ? {kind:'directory',identity:identity(s)} : await inspect(full)) : null);
  }
  const files = [...transferEntries].filter(([,e]) => e.kind === 'file'), dirs = [...transferEntries].filter(([relative,e]) => e.kind === 'directory'&&!retained.has(relative)).sort((a,b)=>depth(b[0])-depth(a[0]));
  const retainedDirectories=[...entries.values()].filter(entry=>entry.kind==='directory').length-dirs.length;
  const id = crypto.randomUUID(); let used = false;
  const preview = {id,mode:'move',direction:side==='a'?'a-to-b':'b-to-a',operations:[...[...requiredDirs].filter(p=>!targets.get(p)).sort((a,b)=>depth(a)-depth(b)).map(p=>({action:'create-folder',path:p,overwrite:false})),...files.map(([p])=>({action:'move',path:targetBySource.get(p),overwrite:!!targets.get(targetBySource.get(p))})),...dirs.map(([p])=>({action:'move-folder',path:targetBySource.get(p),overwrite:false}))],skipped:0,...(selectSourceEntries?{filteredEntries:entries.size-transferEntries.size,retainedDirectories}: {})};
  if (targetPath) for (const operation of preview.operations) { operation.targetPath=operation.path; operation.sourcePath=sourceByTarget.get(operation.path)??null; }
  await validateContext();
  async function assertEntry(which,relative,expected) {
    const full = await safe(which,relative,!expected), s = await stat(full).catch(missing);
    if (!expected) { if(s) throw new Error('A destination appeared since preview.'); return full; }
    if(!s || s.isSymbolicLink() || identity(s)!==expected.identity) throw new Error('An entry changed since preview.');
    if(expected.kind==='file') { const current=await inspect(full); if(current.revision!==expected.revision || current.hash!==expected.hash) throw new Error('A file changed since preview.'); }
    else if(expected.names && JSON.stringify((await fs.readdir(full)).sort())!==JSON.stringify(expected.names)) throw new Error('A source directory changed since preview.');
    return full;
  }
  async function validate() {
    for(const [relative,entry] of entries) await assertEntry('a',relative,entry);
    for(const [relative,entry] of targets) await assertEntry('b',relative,entry);
  }
  async function execute(requestId) {
    if(used || requestId!==id) throw new Error('Move preview expired. Preview again.');
    used=true;
    await validateEligibility();
    await validate();
    await assertBackupRoot();
    const backupPath=path.join(folders.backupRoot,new Date().toISOString().replace(/[:.]/g,'-')+'-move-'+id);
    await fs.mkdir(backupPath,{mode:0o700});
    const backupIdentity=identity(await stat(backupPath)), backupParents=new Map();
    const assertBackup=async()=>{await assertBackupRoot(); const current=await stat(backupPath); if(!current.isDirectory() || current.isSymbolicLink() || identity(current)!==backupIdentity) throw new Error('Transaction backup directory changed.');};
    const created=[], installed=[], installedByPath=new Map(), removed=[], removedDirs=[];
    const writeManifest=async(status,details={})=>{
      await assertBackup();
      const temporary=path.join(backupPath,'.manifest-'+crypto.randomUUID());
      const handle=await fs.open(temporary,'wx',0o600);
      try { await handle.writeFile(JSON.stringify({id,status,source:folders.roots.a,destination:folders.roots.b,entries:[...entries],targets:[...targets],...(selectSourceEntries?{eligiblePaths:[...eligible],retainedDirectories}:{}),...(targetPath?{mapping:[...targetBySource]}:{}),...details},null,2)); await handle.sync(); }
      finally { await handle.close(); }
      await assertBackup();
      await fs.rename(temporary,path.join(backupPath,'manifest.json'));
      if(process.platform!=='win32') { const directory=await fs.open(backupPath,'r'); try{await directory.sync();}finally{await directory.close();} }
    };
    const backup = async(kind,relative,create=false) => {
      await assertBackup();
      const components=[kind,...relative.split('/')]; let current=backupPath;
      for(const component of components.slice(0,-1)) {
        current=path.join(current,component);
        let existing=await stat(current).catch(missing);
        if(!existing && create) { await fs.mkdir(current,{mode:0o700}); existing=await stat(current); }
        if(!existing || !existing.isDirectory() || existing.isSymbolicLink()) throw new Error('Backup parent directory changed.');
        const known=backupParents.get(current);
        if(known && identity(existing)!==known) throw new Error('Backup parent directory changed.');
        backupParents.set(current,identity(existing));
      }
      return path.join(current,components.at(-1));
    };
    const save = async(kind,relative,entry,which) => {
      const file=await assertEntry(which,relative,entry), target=await backup(kind,relative,true);
      await copyExclusive(file,target,entry);
      if((await inspect(target)).hash!==entry.hash) throw new Error('Backup verification failed.');
    };
    try {
      for(const [relative,entry] of files) {
        await beforeStep({phase:'backup',path:relative});
        await save('source',relative,entry,'a');
        const target=targetBySource.get(relative);
        if(targets.get(target)) await save('destination',target,targets.get(target),'b');
      }
      await writeManifest('prepared');
      // Backups may take time: recheck the comparison that selected these files
      // before any destination mutation changes that comparison ourselves.
      await validateEligibility();
      await validate();
      for(const relative of [...requiredDirs].sort((a,b)=>depth(a)-depth(b))) if(!targets.get(relative)) {
        const full=await assertEntry('b',relative,null); await fs.mkdir(full);
        const own=identity(await stat(full)); created.push({relative,identity:own}); parents.b.set(relative,own);
      }
      for(const [relative,entry] of files) {
        await beforeStep({phase:'install',path:relative});
        const target=targetBySource.get(relative);
        const full=await assertEntry('b',target,targets.get(target));
        await assertEntry('a',relative,entry);
        const record={relative:target,prior:targets.get(target),own:null};
        installedByPath.set(relative,record);
        if(record.prior) { await fs.unlink(full); installed.push(record); }
        else installed.push(record);
        try { await copyExclusive(await backup('source',relative),full,entry); record.own=await inspect(full); }
        catch(error) { const s=await stat(full).catch(missing); if(s?.isFile()) record.uncertain=true; throw error; }
        if(record.own.hash!==entry.hash) throw new Error('Installed file verification failed.');
      }
      for(const [relative,entry] of files) {
        await beforeStep({phase:'remove-source',path:relative});
        const own=installedByPath.get(relative);
        await assertEntry('b',targetBySource.get(relative),own.own);
        const full=await assertEntry('a',relative,entry); await fs.unlink(full); removed.push({relative,entry});
      }
      for(const [relative,entry] of dirs) {
        await beforeStep({phase:'remove-directory',path:relative});
        const full=await safe('a',relative), s=await stat(full);
        if(identity(s)!==entry.identity) throw new Error('Source directory changed.');
        await fs.rmdir(full); removedDirs.push({relative,entry}); parents.a.delete(relative);
      }
      await beforeStep({phase:'complete',path:''});
      await validateContext();
      for(const record of installed) await assertEntry('b',record.relative,record.own);
      for(const {relative} of removed) if(await stat(await safe('a',relative,true)).catch(missing)) throw new Error('An entry appeared at a moved source path.');
      for(const record of [...created].reverse()) {
        const original=entries.get(sourceByTarget.get(record.relative));
        if(!original || original.kind!=='directory') continue;
        const full=await safe('b',record.relative);
        if(identity(await stat(full))!==record.identity) throw new Error('Created directory changed.');
        await fs.chmod(full,original.mode&0o777); await fs.utimes(full,original.atime,original.mtime);
        record.identity=identity(await stat(full)); parents.b.set(record.relative,record.identity);
      }
      await validateContext();
      await writeManifest('completed');
      return {completed:files.length+dirs.length,retainedDirectories,backupPath};
    } catch(error) {
      rollingBack = true;
      const rollbackErrors=[];
      const attempt=async(label,fn)=>{try{await fn();}catch(problem){rollbackErrors.push(`${label}: ${problem.message}`);}};
      for(const {relative,entry} of [...removedDirs].reverse()) await attempt('Restore source directory '+relative,async()=>{
        const full=await safe('a',relative,true); if(await stat(full).catch(missing)) throw new Error('A new entry occupies the original path.');
        await fs.mkdir(full,{mode:entry.mode&0o777}); parents.a.set(relative,identity(await stat(full)));
      });
      for(const {relative,entry} of removed) await attempt('Restore source '+relative,async()=>{
        const full=await safe('a',relative,true); await copyExclusive(await backup('source',relative),full,entry);
      });
      for(const record of [...installed].reverse()) await attempt('Restore destination '+record.relative,async()=>{
        const full=await safe('b',record.relative,true), current=await stat(full).catch(missing);
        if(current) {
          if(!record.own) throw new Error('Destination ownership is uncertain; retained for manual recovery.');
          const inspected=await inspect(full);
          if(inspected.revision!==record.own.revision || inspected.hash!==record.own.hash) throw new Error('Destination changed externally; retained for manual recovery.');
          await fs.unlink(full);
        }
        if(record.prior) await copyExclusive(await backup('destination',record.relative),full,record.prior);
      });
      for(const {relative,identity:own} of [...created].reverse()) await attempt('Remove created directory '+relative,async()=>{
        const full=await safe('b',relative); if(identity(await stat(full))!==own) throw new Error('Directory changed externally.'); await fs.rmdir(full); parents.b.delete(relative);
      });
      for(const {relative,entry} of removedDirs) await attempt('Restore source directory metadata '+relative,async()=>{
        const full=await safe('a',relative), s=await stat(full);
        if(identity(s)!==parents.a.get(relative)) throw new Error('Restored directory changed.');
        await fs.chmod(full,entry.mode&0o777); await fs.utimes(full,entry.atime,entry.mtime);
        parents.a.set(relative,identity(await stat(full)));
      });
      await attempt('Write recovery manifest',()=>writeManifest(rollbackErrors.length?'partial-rollback':'rolled-back',{error:error.message,rollbackErrors:[...rollbackErrors]}));
      const result=new Error(`${error.message} ${rollbackErrors.length?'Partial rollback: '+rollbackErrors.join('; '):'Changes rolled back.'} Backups: ${backupPath}`);
      result.backupPath=backupPath; result.rollbackErrors=rollbackErrors; result.cause=error; throw result;
    }
  }
  return {service:{execute},preview,source:folders.roots.a,destination:folders.roots.b};
}
module.exports={previewMove};
