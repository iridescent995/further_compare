'use strict';
const {validateTextGrammar,hasTextGrammar,TEXT_GRAMMAR_VERSION}=require('../src/text-grammar.cjs');
const {folderComparisonKey}=require('../src/text-comparison-keys.cjs');
const {validateTextProfile,validateTextProfileMappings,resolveTextProfile,TEXT_PROFILE_RULES_VERSION}=require('../src/text-profile.cjs');
const fs = require('node:fs/promises');
const {LocalFolderMetadata}=require('./local-folder-metadata.cjs');
const providerListing=require('./folder-provider-listing.cjs');
const providerComparison=require('./folder-provider-comparison.cjs');
const {openLocalFileReader}=require('./local-folder-reader.cjs');
const path = require('node:path');
const crypto = require('node:crypto');
const {validateWhitespaceScope}=require('../src/text-whitespace.cjs');
const {validateIgnoreBlankLines}=require('../src/text-blank-lines.cjs');
const ignoredTextClient=require('./ignored-text-client.cjs');
const {validateIgnoredTextPatterns}=require('../src/ignored-text-rules.cjs');
const { constants } = require('node:fs');
const {validateFolderRules,effectiveFolderEncoding} = require('./folder-rules.cjs');
const {validateOperationScope,selectOperationEntries}=require('./folder-operation-scope.cjs');
const {assertMetadataPlatform}=require('./folder-metadata-comparison.cjs');
const {classifySnapshotEntries}=require('./folder-snapshot-comparison.cjs');
const {decodeText, ENCODINGS, MAX_BYTES: MAX_TEXT_BYTES} = require('../src/text-codec.cjs');
const IGNORED = new Set(['.git', 'node_modules', '.DS_Store']);
const MAX_ENTRIES = 50000;
const TEXT_MODES = new Set(['text-content', 'text-whitespace', 'text-case', 'text-whitespace-case']);
const inside = (root, p) => {
  const relative = path.relative(root, p);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
};
const depth = p => p.split('/').length;
const identity = stat => `${stat.dev}:${stat.ino}`;
const revision = stat => `${identity(stat)}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
const metadataRevision = stat => `${revision(stat)}:${stat.mode}:${stat.uid}:${stat.gid}`;
async function inspectFile(file, normalizeText = false, captureMetadata = false, textEncoding = 'auto', textWhitespaceScope='horizontal',ignoreBlankLines=false,ignoredTextPatterns=[],textProfile='plain',profilePath=null,textProfileMappings=[],textGrammar) {
  if(textEncoding!=='auto'&&!ENCODINGS.includes(textEncoding))throw new Error('Invalid folder text encoding.');
  textGrammar=validateTextGrammar(textGrammar);
  textProfile=validateTextProfile(textProfile);
  textProfileMappings=validateTextProfileMappings(textProfileMappings);
  const resolvedProfile=resolveTextProfile(textProfile,[profilePath??file],textProfileMappings);
  ignoredTextPatterns=validateIgnoredTextPatterns(ignoredTextPatterns);
  validateWhitespaceScope(textWhitespaceScope);validateIgnoreBlankLines(ignoreBlankLines);
  const textMode = normalizeText === true ? 'text-whitespace' : normalizeText;
  if (textMode && !TEXT_MODES.has(textMode)) throw new Error('Invalid text comparison mode.');
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw new Error('An entry changed type. Scan again.');
    const hash = crypto.createHash('sha256');
    let chunks = textMode && before.size <= BigInt(MAX_TEXT_BYTES) ? [] : null;
    let bytesRead = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      hash.update(chunk);
      if (chunks) {
        bytesRead += chunk.length;
        if (bytesRead > MAX_TEXT_BYTES) chunks = null;
        else chunks.push(chunk);
      }
    }
    const after = await handle.stat({ bigint: true });
    const current = await fs.lstat(file, { bigint: true });
    if (current.isSymbolicLink() || metadataRevision(before) !== metadataRevision(after) || metadataRevision(after) !== metadataRevision(current)) {
      throw new Error('A file changed while being read. Scan again.');
    }
    let normalizedHash = null,plainNormalizedHash=null;
    if (chunks) {
      // Only decoding/unsupported text falls back to bytes. Read and revision
      // errors above remain errors, including files changed during the read.
      let content;
      try { content = decodeText(Buffer.concat(chunks), textEncoding).content; } catch {}
      if (content !== undefined && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/u.test(content)) {
        const normalized = content.replace(/\r\n|\r/g, '\n');
        const normalize=async profile=>{
          let prepared=null;
          if(ignoredTextPatterns.length||profile!=='plain'||hasTextGrammar(textGrammar)){
            if(profile!=='plain'||hasTextGrammar(textGrammar))[prepared]=await ignoredTextClient.prepareTextComparison([normalized],ignoredTextPatterns,profile,textGrammar);
            else {const [keys]=await ignoredTextClient.prepareIgnoredText([normalized],ignoredTextPatterns);prepared={keys};}
          }
          const key=folderComparisonKey(normalized,{mode:textMode,textWhitespaceScope,ignoreBlankLines},prepared);
          return crypto.createHash('sha256').update(key).digest('hex');
        };
        normalizedHash=await normalize(resolvedProfile);
        if(textProfile==='auto')plainNormalizedHash=resolvedProfile==='plain'?normalizedHash:await normalize('plain');
        const afterRules=await handle.stat({bigint:true}),currentRules=await fs.lstat(file,{bigint:true});
        if(currentRules.isSymbolicLink()||metadataRevision(after)!==metadataRevision(afterRules)||metadataRevision(afterRules)!==metadataRevision(currentRules))throw Error('A file changed while applying ignored-text rules. Scan again.');
      }
    }
    return { kind: 'file', size: Number(after.size), hash: hash.digest('hex'), normalizedHash, revision: revision(after), mode: Number(after.mode), ...(captureMetadata ? {uid:Number(after.uid),gid:Number(after.gid),mtimeNs:String(after.mtimeNs),mtimeMs:Number(after.mtimeNs)/1e6,normalizationMode:textMode || null,...(textMode&&hasTextGrammar(textGrammar)?{normalizationTextGrammar:JSON.stringify(textGrammar),normalizationGrammarVersion:TEXT_GRAMMAR_VERSION}:{}),...(textMode&&textProfileMappings.length?{normalizationProfileMappings:JSON.stringify(textProfileMappings)}:{}),...(textMode&&textProfile==='auto'?{normalizationProfilePath:profilePath,normalizationResolvedProfile:resolvedProfile,normalizationProfileVersion:TEXT_PROFILE_RULES_VERSION,plainNormalizedHash}:{}),...(textMode&&textProfile!=='plain'?{normalizationTextProfile:textProfile}:{}),...(textMode&&ignoredTextPatterns.length?{normalizationIgnoredTextPatterns:ignoredTextPatterns}:{}),...(textMode&&ignoreBlankLines?{normalizationIgnoreBlankLines:true}:{}),...(textMode&&textWhitespaceScope!=='horizontal'?{normalizationWhitespaceScope:textWhitespaceScope}:{}),...(textMode&&textEncoding!=='auto'?{normalizationEncoding:textEncoding}:{})} : {}) };
  } finally { await handle.close(); }
}
async function digest(file) { return (await inspectFile(file)).hash; }
class FolderService {
  isIgnoredPath(relative) { return typeof relative === 'string' && relative.split('/').some(component => IGNORED.has(component)); }
  constructor(backupRoot,{extractPdfText,extractDocText}={}) {
    this.extractPdfText=extractPdfText;this.extractDocText=extractDocText;
    if (!backupRoot) throw new Error('A backup directory is required.');
    this.backupRoot = path.resolve(backupRoot);
    this.roots = {}; this.metadata=new LocalFolderMetadata(this); this.plans = new Map(); this.hashCache = new Map();
  }
  openFileReader(side,relative,options={}) { return openLocalFileReader(this,side,relative,options); }
  async inspectRoot(side) { return this.metadata.inspectRoot(side); }
  async inspectEntry(side,relative) { return this.metadata.inspectEntry(side,relative); }
  enumerateDirectory(side,relative='') { return this.metadata.enumerateDirectory(side,relative); }
  async select(side, folder) {
    if (!['a', 'b'].includes(side)) throw new Error('Invalid folder side.');
    const canonical = await fs.realpath(folder);
    if (!(await fs.stat(canonical)).isDirectory()) throw new Error('Select a directory.');
    const other = this.roots[side === 'a' ? 'b' : 'a'];
    if (other && (inside(other, canonical) || inside(canonical, other))) throw new Error('Folders must be separate and cannot contain each other.');
    await fs.mkdir(this.backupRoot, { recursive: true });
    this.backupRoot = await fs.realpath(this.backupRoot);
    if (inside(canonical, this.backupRoot) || inside(this.backupRoot, canonical)) throw new Error('The folder cannot overlap the backup directory.');
    this.roots[side] = canonical; this.plans.clear();
    return { name: path.basename(canonical), path: canonical };
  }
  async safe(side, relative, allowMissing = false) {
    const root = this.roots[side];
    if (!root) throw new Error('Choose both folders first.');
    if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(relative)) throw new Error('Invalid relative path.');
    if (await fs.realpath(root) !== root) throw new Error('A selected root changed. Select it again.');
    let current = root;
    for (const component of relative.split('/')) {
      current = path.join(current, component);
      try {
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink()) throw new Error('Symbolic links are not followed.');
      } catch (error) { if (allowMissing && error.code === 'ENOENT') continue; throw error; }
    }
    return current;
  }
  entryName(name) {
    if (typeof name !== 'string' || !name || name.length > 255 || /[\x00-\x1f<>:"/\\|?*]/.test(name) || /[. ]$/.test(name) || ['.', '..'].includes(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
      throw new Error('Enter a valid file or folder name without path separators.');
    }
    return name;
  }
  async directoryPath(side, relative = '') {
    if (!['a', 'b'].includes(side) || !this.roots[side]) throw new Error('Choose a folder first.');
    const full = relative ? await this.safe(side, relative) : this.roots[side];
    if (await fs.realpath(this.roots[side]) !== this.roots[side]) throw new Error('A selected root changed. Select it again.');
    const stat = await fs.lstat(full);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Choose a regular directory.');
    return full;
  }
  async assertAvailable(directory, name) {
    const folded = name.normalize('NFC').toLowerCase();
    if ((await fs.readdir(directory)).some(entry => entry.normalize('NFC').toLowerCase() === folded)) throw new Error('An entry with this name already exists.');
  }
  async renameEntry(side, relative, newName) {
    this.entryName(newName);
    const source = await this.safe(side, relative);
    const sourceStat = await fs.lstat(source, {bigint:true});
    if (!sourceStat.isFile() && !sourceStat.isDirectory()) throw new Error('Choose a regular file or directory.');
    const parent = path.posix.dirname(relative);
    const directory = await this.directoryPath(side, parent === '.' ? '' : parent);
    if (path.basename(source) === newName) return {path:relative, name:newName};
    await this.assertAvailable(directory, newName);
    const nextRelative = parent === '.' ? newName : parent + '/' + newName;
    const destination = await this.safe(side, nextRelative, true);
    if (sourceStat.isDirectory()) {
      await require('./rename-directory.cjs').renameDirectory(this.roots[side], relative, newName, sourceStat);
      this.plans.clear();
      return {path:nextRelative,name:newName};
    }
    // link() atomically refuses an existing destination. rename() would silently
    // overwrite a file created by another process after our collision check.
    await fs.link(source, destination);
    try {
      const current = await fs.lstat(await this.safe(side, relative), {bigint:true});
      const linked = await fs.lstat(await this.safe(side, nextRelative), {bigint:true});
      if (!current.isFile() || identity(current) !== identity(sourceStat) || identity(linked) !== identity(sourceStat)) throw new Error('The file changed during rename. Refresh the folder.');
      await fs.unlink(source);
    } catch (error) {
      // Remove only our own link, never a replacement made by another process.
      const linked = await fs.lstat(destination, {bigint:true}).catch(() => null);
      if (linked && identity(linked) === identity(sourceStat)) await fs.unlink(destination);
      throw error;
    }
    this.plans.clear();
    return {path:nextRelative, name:newName};
  }
  async createDirectory(side, parent, name) {
    this.entryName(name);
    const directory = await this.directoryPath(side, parent);
    await this.assertAvailable(directory, name);
    const relative = parent ? parent + '/' + name : name;
    const target = await this.safe(side, relative, true);
    await fs.mkdir(target); // Exclusive creation; never replaces an existing entry.
    this.plans.clear();
    return {path:relative, name};
  }
  async createFile(side, parent, name) {
    this.entryName(name);
    const directory = await this.directoryPath(side, parent);
    await this.assertAvailable(directory, name);
    const relative = parent ? parent + '/' + name : name;
    const target = await this.safe(side, relative, true);
    const handle = await fs.open(target, 'wx', 0o600);
    await handle.close();
    this.plans.clear();
    return {path:relative, name};
  }
  async list(relative = '') {
    if (typeof relative !== 'string') throw new Error('Invalid relative path.');
    const listing = async side => {
      if (!this.roots[side]) return { entries: new Map(), skipped: 0 };
      const root = this.roots[side];
      if (await fs.realpath(root) !== root) throw new Error('A selected root changed. Select it again.');
      let items;
      try { const dir = relative ? await this.safe(side, relative, true) : root; items = await fs.readdir(dir, { withFileTypes: true }); }
      catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) return { entries: new Map(), skipped: 0 }; throw error; }
      const entries = new Map(); let skipped = 0;
      for (const item of items) {
        if (IGNORED.has(item.name) || item.isSymbolicLink() || (!item.isFile() && !item.isDirectory())) { skipped++; continue; }
        const rel = relative ? relative + '/' + item.name : item.name;
        let stat;
        try {
          const full = await this.safe(side, rel);
          stat = await fs.lstat(full);
        } catch (error) {
          // A child may disappear between readdir and stat during live refresh.
          if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue;
          throw error;
        }
        if (!stat.isFile() && !stat.isDirectory()) { skipped++; continue; }
        entries.set(item.name, { kind: stat.isDirectory() ? 'directory' : 'file', size: stat.isFile() ? stat.size : null, mtime: stat.mtimeMs });
        if (entries.size > MAX_ENTRIES) throw new Error('Folder exceeds the 50,000 entry limit.');
      }
      return { entries, skipped };
    };
    const a = await listing('a'), b = await listing('b');
    const rows = [...new Set([...a.entries.keys(), ...b.entries.keys()])].map(name => {
      const left = a.entries.get(name), right = b.entries.get(name);
      const conflict = left && right && left.kind !== right.kind;
      return { name, path: relative ? relative + '/' + name : name,
        kind: conflict ? 'conflict' : (left || right).kind,
        kindA: left?.kind ?? null, kindB: right?.kind ?? null,
        sizeA: left?.size ?? null, sizeB: right?.size ?? null,
        mtimeA: left?.mtime ?? null, mtimeB: right?.mtime ?? null,
        status: !left ? 'right' : !right ? 'left' : conflict ? 'conflict' : left.kind === 'directory' ? 'directory' : left.size !== right.size ? 'different' : 'unchecked' };
    }).sort((a,b) => Number(b.kind === 'directory') - Number(a.kind === 'directory') || a.name.localeCompare(b.name));
    return { relative, rows, skipped: a.skipped + b.skipped };
  }
  // Read one logical node from independently resolved directories. Actual side
  // paths remain distinct from the row ID, including for missing counterparts.
  async listDirectoryPair(nodes,options={}) { return providerListing.listDirectoryPair(this,nodes,options); }
  // Compare only the immediate files in an expanded node. Directories remain
  // unclassified until their children are requested. Metadata matches are
  // explicitly distinguished from verified content matches.
  async compareNode(relative = '', rules = {}, options = {}) {
    rules = validateFolderRules(rules);
    const result = await this.list(relative);
    return this.compareRows(result, rules, options);
  }
  // Native alignment will supply separate, already-resolved endpoints. This
  // primitive deliberately does not resolve display IDs or authorize transfers.
  async compareFilePairs(pairs, rules = {}, options = {}) { return providerComparison.compareFilePairs(this,pairs,rules,options); }
  async compareRows(result, rules, options = {}) { return providerComparison.compareRows(this,result,rules,options); }
  async snapshot(side, selectedPaths = null, rules = null, options = {}) {
    if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='includeIgnored')||(options.includeIgnored!==undefined&&typeof options.includeIgnored!=='boolean'))throw Error('Invalid snapshot options.');
    const comparisonRules = rules === null ? null : validateFolderRules(rules);
    assertMetadataPlatform(comparisonRules);
    const root = this.roots[side];
    if (!root || await fs.realpath(root) !== root) throw new Error('Choose both folders again.');
    const entries = new Map(); let skipped = 0;
    const rootBefore = await fs.lstat(root, { bigint: true });
    const walk = async relative => {
      const dir = relative ? await this.safe(side, relative) : root;
      for (const item of (await fs.readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
        if ((!options.includeIgnored && IGNORED.has(item.name)) || item.isSymbolicLink() || (!item.isFile() && !item.isDirectory())) { skipped++; continue; }
        const rel = relative ? relative + '/' + item.name : item.name;
        if (selectedPaths && !selectedPaths.some(p => rel === p || rel.startsWith(p + '/') || p.startsWith(rel + '/'))) continue;
        if (entries.size >= MAX_ENTRIES) throw new Error('Folder exceeds the 50,000 entry limit. Choose a smaller folder.');
        const full = await this.safe(side, rel);
        if (item.isDirectory()) {
          const before = await fs.lstat(full, { bigint: true });
          if (!before.isDirectory()) throw new Error('A directory changed while scanning. Scan again.');
          entries.set(rel, { kind: 'directory', identity: identity(before), mode: Number(before.mode), ...(comparisonRules?{uid:Number(before.uid),gid:Number(before.gid)}:{}) });
          await walk(rel);
          const after = await fs.lstat(full, { bigint: true });
          if (metadataRevision(before) !== metadataRevision(after)) throw new Error('A directory changed while scanning. Scan again.');
        } else entries.set(rel, await inspectFile(full, comparisonRules && TEXT_MODES.has(comparisonRules.mode) ? comparisonRules.mode : false, comparisonRules !== null, effectiveFolderEncoding(comparisonRules,side),comparisonRules?.textWhitespaceScope??'horizontal',comparisonRules?.ignoreBlankLines===true,comparisonRules?.ignoredTextPatterns??[],comparisonRules?.textProfile??'plain',rel,comparisonRules?.textProfileMappings,comparisonRules?.textGrammar)); 
      }
    };
    await walk('');
    const rootAfter = await fs.lstat(root, { bigint: true });
    if (metadataRevision(rootBefore) !== metadataRevision(rootAfter)) throw new Error('A folder changed while scanning. Scan again.');
    return { entries, skipped, identity: identity(rootAfter), ...(comparisonRules ? {comparisonRules} : {}) };
  }
  async pair(selectedPaths = null, onlySide = null, rules = null) {
    const empty = () => ({ entries: new Map(), skipped: 0, identity: null });
    const a = onlySide === 'b' ? empty() : await this.snapshot('a', selectedPaths, rules);
    const b = onlySide === 'a' ? empty() : await this.snapshot('b', selectedPaths, rules);
    return { a, b };
  }
  rows(pair) {
    const conflicts = []; const rows = [];
    for (const rel of [...new Set([...pair.a.entries.keys(), ...pair.b.entries.keys()])].sort()) {
      if (conflicts.some(p => rel.startsWith(p + '/'))) continue;
      const a = pair.a.entries.get(rel), b = pair.b.entries.get(rel);
      const conflict = a && b && a.kind !== b.kind;
      if (conflict) conflicts.push(rel);
      rows.push({ path: rel, kind: conflict ? 'conflict' : (a || b).kind,
        status: conflict ? 'conflict' : !a ? 'right' : !b ? 'left' : a.hash === b.hash ? 'equal' : 'changed',
        sizeA: a?.size ?? null, sizeB: b?.size ?? null });
    }
    return rows;
  }
  async scan() { const pair = await this.pair(); return { rows: this.rows(pair), skipped: pair.a.skipped + pair.b.skipped }; }
  signature(pair) { return JSON.stringify(['a','b'].map(s => ({ identity: pair[s].identity, entries: [...pair[s].entries].sort(([a],[b]) => a.localeCompare(b)) }))); }
  async previewAction(action, side, paths, scope = null) {
    if (!['copy', 'delete'].includes(action) || !['a', 'b'].includes(side) || !Array.isArray(paths) || !paths.length || paths.some(p => typeof p !== 'string')) throw new Error('Invalid file action.');
    for (const rel of paths) await this.safe(side, rel);
    // Check sibling spelling without opening unrelated files.
    for (const rel of action === 'copy' ? paths : []) {
      let current = rel;
      while (current !== '.') {
        const parent = path.posix.dirname(current);
        const listing = await this.list(parent === '.' ? '' : parent);
        const name = path.posix.basename(current).normalize('NFC').toLowerCase();
        if (listing.rows.filter(r => r.name.normalize('NFC').toLowerCase() === name).length > 1) throw new Error(`Conflicting filename spelling at ${current}.`);
        current = parent;
      }
    }
    const source = action === 'copy' ? side : side === 'a' ? 'b' : 'a';
    return this.preview('merge', source === 'a' ? 'a-to-b' : 'b-to-a', paths, action, scope);
  }
  async preview(mode, direction, selectedPaths, action = null, scope = null) {
    if (!['merge','sync'].includes(mode) || !['a-to-b','b-to-a'].includes(direction)) throw new Error('Invalid operation.');
    if (selectedPaths != null && (!Array.isArray(selectedPaths) || selectedPaths.some(p => typeof p !== 'string'))) throw new Error('Invalid selection.');
    scope = scope === null ? null : validateOperationScope(scope);
    const deleteTarget = direction === 'a-to-b' ? 'b' : 'a';
    const onlySide = action === 'delete' && !scope ? deleteTarget : null;
    const pair = await this.pair(action ? selectedPaths : null, onlySide, scope?.rules ?? null);
    const rows = action === 'delete' ? [...pair[deleteTarget].entries.keys()].map(path => ({ path })) : this.rows(pair);
    const rowPaths = new Set(rows.map(r => r.path));
    if (selectedPaths?.some(p => !rowPaths.has(p))) throw new Error('Selection changed. Scan again.');
    const selection = selectedPaths == null ? null : new Set(selectedPaths);
    const selected = rel => selection === null || selection.has(rel) || (action && selectedPaths.some(p => rel.startsWith(p + "/")));
    const source = direction === 'a-to-b' ? 'a' : 'b', target = source === 'a' ? 'b' : 'a';
    let eligible=null;
    if(scope){
      const inventory=[...new Set([...pair.a.entries.keys(),...pair.b.entries.keys()])].map(relative=>{
        const a=pair.a.entries.get(relative),b=pair.b.entries.get(relative);
        return {id:relative,parentId:relative.includes('/')?relative.slice(0,relative.lastIndexOf('/')):'root',pathA:a?relative:null,pathB:b?relative:null,kindA:a?.kind??null,kindB:b?.kind??null,sizeA:a?.size,sizeB:b?.size,mtimeA:a?.mtimeMs,mtimeB:b?.mtimeMs,...classifySnapshotEntries(a,b,scope.rules,{a:relative,b:relative})};
      });
      eligible={source:selectOperationEntries(inventory,scope,source),target:selectOperationEntries(inventory,scope,target)};
    }
    const operations = [];
    for (const row of rows.filter(r => selected(r.path))) {
      if(eligible){
        const removing=action==='delete'||(!pair[source].entries.has(row.path)&&mode==='sync'),entry=pair[removing?target:source].entries.get(row.path),set=eligible[removing?'target':'source'];
        if(!entry||!(entry.kind==='file'?set.fileIds:removing?set.removableDirectoryIds:set.directoryIds).has(row.path))continue;
      }
      if (row.status === 'conflict' && action !== 'delete') throw new Error(`Resolve the file/folder conflict at ${row.path} before merging or syncing.`);
      const src = pair[source].entries.get(row.path), dst = pair[target].entries.get(row.path);
      if (action === 'delete') {
        if (dst) operations.push({ path: row.path, action: dst.kind === 'directory' ? 'delete-folder' : 'delete', overwrite: true });
      } else if (src && (!dst || src.hash !== dst.hash)) operations.push({ path: row.path, action: src.kind === 'directory' ? 'create-folder' : 'copy', overwrite: !!dst });
      else if (!src && dst && mode === 'sync') operations.push({ path: row.path, action: dst.kind === 'directory' ? 'delete-folder' : 'delete', overwrite: true });
    }
    // Copying a selected child also requires its missing parent directories.
    const operationPaths = new Set(operations.map(o => o.path));
    for (const op of [...operations].filter(o => o.action === 'copy' || o.action === 'create-folder')) {
      let parent = path.posix.dirname(op.path);
      while (parent !== '.') {
        const existing = pair[target].entries.get(parent);
        if (existing && existing.kind !== 'directory') throw new Error(`Resolve the file/folder conflict at ${parent}.`);
        if (!existing && !operationPaths.has(parent)) {
          operations.push({ path: parent, action: 'create-folder', overwrite: false });
          operationPaths.add(parent);
        }
        parent = path.posix.dirname(parent);
      }
    }
    // Refuse ambiguous spelling on case-insensitive or Unicode-normalizing filesystems.
    // Checking on every platform also keeps a preview portable between Mac and Windows.
    const aliases = new Map();
    for (const rel of new Set([...pair.a.entries.keys(), ...pair.b.entries.keys()])) {
      const key = rel.normalize('NFC').toLowerCase();
      if (!aliases.has(key)) aliases.set(key, new Set());
      aliases.get(key).add(rel);
    }
    for (const op of operations) {
      let rel = op.path;
      while (rel !== '.') {
        if (aliases.get(rel.normalize('NFC').toLowerCase())?.size > 1) throw new Error(`Conflicting filename spelling at ${rel}. Rename case or Unicode variants before merging or syncing.`);
        rel = path.posix.dirname(rel);
      }
    }
    operations.sort((a,b) => (a.action.startsWith('delete') ? 1 : 0) - (b.action.startsWith('delete') ? 1 : 0) || (a.action.startsWith('delete') ? depth(b.path)-depth(a.path) : depth(a.path)-depth(b.path)) || a.path.localeCompare(b.path));
    for (const op of operations) {
      await this.safe(target, op.path, true);
      if (op.action === 'copy') await this.safe(source, op.path);
    }
    const id = crypto.randomUUID();
    this.plans.clear(); this.plans.set(id, { source, target, signature: this.signature(pair), operations, pair, selectedPaths: action ? selectedPaths : null, onlySide, scope });
    return { id, mode: action || mode, direction, operations, skipped: pair.a.skipped + pair.b.skipped };
  }
  async execute(id) {
    const plan = this.plans.get(id);
    if (!plan) throw new Error('Preview the operation again.');
    this.plans.delete(id);
    if (this.signature(await this.pair(plan.selectedPaths, plan.onlySide, plan.scope?.rules ?? null)) !== plan.signature) throw new Error('Folders changed after preview. Scan and preview again.');
    if (await fs.realpath(this.backupRoot) !== this.backupRoot) throw new Error('Backup directory changed.');
    const backupPath = path.join(this.backupRoot, new Date().toISOString().replace(/[:.]/g,'-') + '-' + id);
    await fs.mkdir(backupPath, { recursive: true });
    const overwrittenPaths = new Set(plan.operations.filter(op => op.overwrite).map(op => op.path));
    await fs.writeFile(path.join(backupPath, 'manifest.json'), JSON.stringify({ target: this.roots[plan.target], operations: plan.operations, originals: [...plan.pair[plan.target].entries].filter(([rel]) => overwrittenPaths.has(rel)) }, null, 2));
    // Complete all file backups before applying any changes.
    for (const op of plan.operations.filter(o => o.overwrite && plan.pair[plan.target].entries.get(o.path)?.kind === 'file')) {
      const original = await this.safe(plan.target, op.path);
      const backup = path.join(backupPath, 'files', ...op.path.split('/'));
      await fs.mkdir(path.dirname(backup), { recursive: true }); await fs.copyFile(original, backup, constants.COPYFILE_EXCL);
      if (await digest(backup) !== plan.pair[plan.target].entries.get(op.path).hash) throw new Error('Target changed while backing up. No changes applied. Preview again.');
    }
    let completed = 0; let retainedDirectories = 0;
    try {
      for (const op of plan.operations) {
        const destination = await this.safe(plan.target, op.path, true);
        const expected = plan.pair[plan.target].entries.get(op.path);
        const validateTarget = async () => {
          if (expected?.kind === 'file' && (await inspectFile(destination)).revision !== expected.revision) throw new Error('Target changed during execution.');
          if (expected?.kind === 'directory' && identity(await fs.lstat(destination, { bigint: true })) !== expected.identity) throw new Error('Target directory changed during execution.');
          if (!expected) {
            try { await fs.lstat(destination); throw new Error('Target appeared during execution.'); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
          }
        };
        await validateTarget();
        if (op.action === 'create-folder') { await fs.mkdir(destination); await this.onDirectoryCreated?.(plan.target, op.path, destination); }
        if (op.action === 'copy') {
          const source = await this.safe(plan.source, op.path);
          if (await digest(source) !== plan.pair[plan.source].entries.get(op.path).hash) throw new Error('Source changed during execution.');
          const temporary = path.join(path.dirname(destination), '.further-' + crypto.randomUUID());
          try {
            await fs.copyFile(source, temporary, constants.COPYFILE_EXCL);
            if (await digest(temporary) !== plan.pair[plan.source].entries.get(op.path).hash) throw new Error('Source changed during copy.');
            await this.safe(plan.target, op.path, true);
            await validateTarget();
            await fs.rename(temporary, destination);
          } finally { await fs.rm(temporary, { force: true }); }
        }
        if (op.action === 'delete') await fs.unlink(destination);
        // Nonrecursive removal preserves ignored files and anything created during execution.
        if (op.action === 'delete-folder') {
          try { await fs.rmdir(destination); }
          catch(e) {
            if (e.code !== 'ENOTEMPTY' && e.code !== 'EEXIST') throw e;
            retainedDirectories++; continue;
          }
        }
        completed++;
      }
    } catch(error) { throw new Error(`${error.message} Stopped after ${completed} operations. Backups: ${backupPath}`); }
    return { completed, retainedDirectories, backupPath };
  }
  async read(side, relative, encoding = 'auto') {
    const full = await this.safe(side, relative);
    const handle = await fs.open(full, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    let buffer,openedRevision;
    try {
      const before = await handle.stat({ bigint: true });
      const documentInput=require('../src/text-input.cjs').isDocumentInput(full);
      const limit = (documentInput?32:10) * 1024 * 1024;
      const limitMessage=documentInput?'Open a PDF, DOCX, RTF or ODT document smaller than 32 MB.':'Open a text file smaller than 10 MB.';
      if (!before.isFile() || before.size > BigInt(limit)) throw new Error(limitMessage);
      const chunks = []; let bytes = 0;
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        bytes += chunk.length;
        if (bytes > limit) throw new Error(limitMessage);
        chunks.push(chunk);
      }
      const current = await fs.lstat(await this.safe(side, relative), {bigint:true});
      if (!current.isFile() || revision(before) !== revision(current) || revision(before) !== revision(await handle.stat({ bigint: true }))) throw new Error('File changed while opening. Try again.');
      buffer = Buffer.concat(chunks);openedRevision=revision(before);
    } finally { await handle.close(); }
    const decoded = await require('../src/text-input.cjs').decodeTextInput(buffer,path.basename(full),encoding,{extractPdfText:this.extractPdfText,extractDocText:this.extractDocText});
    const after=await fs.lstat(await this.safe(side,relative),{bigint:true});
    if(!after.isFile()||revision(after)!==openedRevision)throw Error('File changed while opening. Try again.');
    return { name: path.basename(full), path: relative, ...decoded };
  }
}
module.exports = { FolderService };
