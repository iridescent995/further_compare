'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {readDataLimited, MAX_TEXT_BYTES} = require('./sessions.cjs');
const {decodeTextInput,isDocumentInput} = require('../src/text-input.cjs');
const {parseShellURL} = require('./shell-url.cjs');
const commands = {'--fc-set-left':1,'--fc-compare-left':1,'--fc-clear-left':0,'--fc-compare':2,'--fc-compare-selected':2};
function validPath(value) {
  if (typeof value !== 'string' || !value || value.length > 32768 || value.includes('\0') || !path.isAbsolute(value)) throw new Error('Shell commands require absolute file or folder paths.');
  return value;
}
function parseShellArgs(argv) {
  if (!Array.isArray(argv) || argv.some(value => typeof value !== 'string')) throw new Error('Invalid shell command arguments.');
  const index = argv.findIndex(value => value.startsWith('--fc-'));
  if (index < 0) return null;
  const command = argv[index];
  if (!Object.hasOwn(commands, command) || argv.length - index - 1 !== commands[command]) throw new Error('Invalid Further Compare shell command.');
  const files = argv.slice(index + 1).map(validPath);
  return {command,files};
}
async function shellPath(value, withIdentity = false) {
  validPath(value);
  const canonical = await fs.realpath(value);
  const stat = await fs.lstat(canonical, withIdentity ? {bigint:true} : undefined);
  const kind = stat.isFile() ? 'file' : stat.isDirectory() ? 'folder' : null;
  if (!kind) { const error = new Error('Choose a regular file or folder for shell comparison.'); error.code = 'FC_SHELL_KIND'; throw error; }
  return {name:path.basename(canonical) || canonical,path:canonical,kind,...(withIdentity ? {identity:{dev:stat.dev,ino:stat.ino}} : {})};
}
async function regularPath(value) {
  const entry = await shellPath(value);
  if (entry.kind !== 'file') throw new Error('Choose a regular file for shell comparison.');
  return entry.path;
}
function comparisonType(name) {
  const ext = path.extname(name).slice(1).toLowerCase();
  return ['doc','docx','pdf','rtf','odt'].includes(ext) ? 'text-compare' : ['png','jpg','jpeg','webp','gif'].includes(ext) ? 'picture-compare' : ['wav','aif','aiff','flac','mp3'].includes(ext) ? 'audio-compare' : ['csv','tsv','xlsx','ods','xls','xlsb'].includes(ext) ? 'table-compare' : ['zip','jar','tar','tgz','gz'].includes(ext) ? 'archive-compare' : ext === 'reg' ? 'registry-compare' : ['bin','dat','exe','dll','so','dylib','class','pdf'].includes(ext) ? 'binary-compare' : null;
}
// Explicit filename eligibility for a chosen text decoder; never reinterpret known
// binary containers by changing their names. Unclassified names may use strict
// text decoding, including custom source-code extensions.
const shellTextExtensions=new Set(['txt','text','log','md','markdown','rst','csv','tsv','json','jsonl','xml','yaml','yml','ini','cfg','conf','properties','html','htm','css','scss','js','jsx','mjs','cjs','ts','tsx','java','c','h','cc','cpp','hpp','cs','py','rb','sh','bash','zsh','sql','reg','patch','diff']);
function textChoiceEligible(file){return comparisonType(file)===null||isDocumentInput(file)||shellTextExtensions.has(path.extname(file).slice(1).toLowerCase());}
const snapshots = new WeakMap();
async function fileSnapshot(file) {
  const exact = await fs.lstat(file,{bigint:true});
  const stat = await fs.lstat(file);
  const checked = await fs.lstat(file,{bigint:true});
  const signature = value => `${value.dev}:${value.ino}:${value.size}:${value.mtimeNs}:${value.ctimeNs}`;
  if (signature(exact) !== signature(checked)) throw new Error('A shell file changed while opening. Open it again.');
  if (!stat.isFile() || await fs.realpath(file) !== file) throw new Error('A shell file changed. Open it again.');
  return {path:file,dev:exact.dev,ino:exact.ino,signature:signature(exact),revision:`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`};
}
async function verifySnapshots(values) {
  for (const value of Object.values(values)) {
    const current = await fileSnapshot(value.path);
    if (current.signature !== value.signature || current.revision !== value.revision) throw new Error('A shell file changed while opening. Open it again.');
  }
}
class ShellRequests {
  constructor(file, {publishHint,extractPdfText,extractDocText} = {}) {
    if(publishHint!==undefined&&typeof publishHint!=='function')throw new TypeError('Invalid left hint publisher.');
    this.extractPdfText=extractPdfText;this.extractDocText=extractDocText;this.file=file;this.queue=[];this.publishHint=publishHint;this.stateTail=Promise.resolve();this.hintKey=null;this.hintPending=Promise.resolve();
  }
  sequenceState(task) { const result=this.stateTail.then(task);this.stateTail=result.catch(()=>{});return result; }
  observeState(state) {
    if(this.publishHint){
      const hint={left:state.left?{name:state.left.name,kind:state.left.kind}:null,available:state.available};
      const key=JSON.stringify(hint);
      if(this.hintKey!==key){this.hintKey=key;
        // Hints are advisory: a slow/failed registry update never delays the
        // file operation. The transport serializes its immutable snapshots.
        this.hintPending=Promise.resolve().then(()=>this.publishHint(hint)).catch(()=>{if(this.hintKey===key)this.hintKey=null;});
      }
    }
    return state;
  }
  state() { return this.sequenceState(async()=>this.observeState(await this.readState())); }
  // Explicit integration repair/enable refresh bypasses display deduplication.
  // Ordinary selection operations remain independent of publication latency.
  async refreshHint() {
    const result=await this.sequenceState(async()=>{const state=await this.readState();this.hintKey=null;this.observeState(state);return {state,pending:this.hintPending};});
    await result.pending;return result.state;
  }
  setLeft(value,expectedKind) { return this.sequenceState(async()=>this.observeState(await this.writeLeft(value,expectedKind))); }
  clear() { return this.sequenceState(async()=>{await fs.rm(this.file,{force:true});return this.observeState({left:null,available:false});}); }
  enqueue(argv) {
    // A malformed invocation is delivered once as a visible renderer error.
    try { const request = parseShellArgs(argv); if (request) { if (this.queue.length >= 100) throw new Error('Too many pending shell requests.'); this.queue.push(request); } }
    catch (error) { if (this.queue.length < 100) this.queue.push({error:error.message}); }
  }
  enqueueURL(url) {
    try {
      const request = parseShellURL(url);
      if (this.queue.length >= 100) throw new Error('Too many pending shell requests.');
      this.queue.push({...request,untrustedURL:true});
    } catch (error) { if (this.queue.length < 100) this.queue.push({error:error.message}); }
  }
  async readState() {
    let saved;
    try { saved = JSON.parse((await readDataLimited(this.file, 65536)).toString('utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {left:null,available:false}; throw new Error('The remembered left selection could not be read. Clear the left selection and try again.'); }
    if (!saved || ![1,2].includes(saved.version) || (saved.version === 2 && !['file','folder'].includes(saved.kind))) throw new Error('Invalid remembered left selection. Clear the left selection and try again.');
    const left = {name:path.basename(validPath(saved.path)) || saved.path,path:saved.path,kind:saved.version === 1 ? 'file' : saved.kind};
    try { const current = await shellPath(saved.path); if (current.kind !== left.kind) return {left,available:false}; return {left:current,available:true}; }
    catch (error) { if (['ENOENT','ENOTDIR','EACCES','EPERM','ELOOP','FC_SHELL_KIND'].includes(error.code)) return {left,available:false}; throw error; }
  }
  async writeLeft(value, expectedKind) {
    const entry = await shellPath(value);
    if (expectedKind && entry.kind !== expectedKind) throw new Error('The selected item changed type. Select the left item again.');
    const canonical = entry.path;
    await fs.mkdir(path.dirname(this.file), {recursive:true});
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    try { await fs.writeFile(temporary, JSON.stringify({version:2,path:canonical,kind:entry.kind}) + '\n', {flag:'wx',mode:0o600}); await fs.rename(temporary,this.file); }
    finally { await fs.rm(temporary,{force:true}); }
    return {left:entry,available:true};
  }
  async validateFiles(request) {
    const values = snapshots.get(request);
    if (!values) throw new Error('Shell file snapshots are unavailable. Open the files again.');
    await verifySnapshots(values);
    snapshots.delete(request);
    return values;
  }
  async take({reviewSelection,reviewURL,reviewComparison} = {}) {
    while (this.queue.length) {
      const request = this.queue.shift();
      if (request.error) throw new Error(request.error);
      if (request.untrustedURL) {
        // Custom schemes can be launched by websites. Review literal paths
        // before resolving links, reading selection state, or touching files.
        if (typeof reviewURL !== 'function') throw new Error('Review the external shell request before opening files.');
        const decision = await reviewURL({command:request.command,files:request.files.map(file => ({name:path.basename(file) || file,path:file}))});
        if (decision !== true) return {action:'cancelled'};
      }
      if (request.command === '--fc-clear-left') { await this.clear(); return {action:'clear-left'}; }
      let left, right;
      if (request.command === '--fc-compare-left') {
        const state = await this.state();
        if (!state.left || !state.available) throw new Error(state.left ? 'The remembered left selection is no longer available. Set a left file or folder again.' : 'Set a left file or folder before choosing Compare with Left.');
        left = state.left; right = await shellPath(request.files[0]);
      } else { left = await shellPath(request.files[0], request.command === '--fc-compare-selected'); if (request.files[1]) right = await shellPath(request.files[1], request.command === '--fc-compare-selected'); }
      if (right && left.kind !== right.kind) throw new Error('Choose two files or two folders to compare. A file cannot be compared with a folder.');
      if (request.command === '--fc-compare-selected') {
        if (typeof reviewSelection !== 'function') throw new Error('Review the left and right selection before comparing selected items.');
        const descriptor = entry => ({name:entry.name,path:entry.path});
        const decision = await reviewSelection({left:descriptor(left),right:descriptor(right),kind:left.kind});
        if (decision === 'cancel') return {action:'cancelled'};
        if (!['compare','swap'].includes(decision)) throw new Error('Invalid selected-item review result.');
        // The review can remain open while the filesystem changes. Do not load
        // an item of a different kind or a symlink target the user never reviewed.
        const checked = await Promise.all(request.files.map(file => shellPath(file, true)));
        for (const [index,original] of [left,right].entries()) {
          const current = checked[index];
          if (current.kind !== original.kind || current.path !== original.path || current.identity.dev !== original.identity.dev || current.identity.ino !== original.identity.ino) throw new Error('A selected item changed during review. Select the items again.');
        }
        [left,right] = decision === 'swap' ? checked.reverse() : checked;
      }
      if (left.kind === 'folder') {
        if (request.command === '--fc-set-left') await this.setLeft(left.path, left.kind);
        const descriptor = entry => entry ? {name:entry.name,path:entry.path} : null;
        return {action:request.command === '--fc-set-left' ? 'set-left':'compare',mode:'folder-compare',name:left.name,a:descriptor(left),b:descriptor(right)};
      }
      const reviewed = request.command === '--fc-compare-selected' ? {a:left,b:right} : null;
      left = left.path; right = right?.path;
      const values = {a:null,b:null}, original = {};
      for (const [side,file] of [['a',left],['b',right]]) if (file) original[side] = await fileSnapshot(file);
      if (reviewed) for (const side of ['a','b']) {
        const item=reviewed[side],stamp=original[side];
        if (BigInt(item.identity.dev)!==stamp.dev || BigInt(item.identity.ino)!==stamp.ino) throw new Error('A selected item changed during review. Select the items again.');
      }
      const leftMode = comparisonType(left), rightMode = right ? comparisonType(right) : leftMode;
      const projected=isDocumentInput(left)||(right&&isDocumentInput(right));
      const automaticDocument=projected&&[leftMode,rightMode].every(type=>!type||type==='text-compare');
      let chosenMode=null;
      if(right&&leftMode!==rightMode&&!automaticDocument){
        if(typeof reviewComparison!=='function')throw Error('Choose how to compare these file types before opening them.');
        const choices=Object.freeze(textChoiceEligible(left)&&textChoiceEligible(right)?['text-compare','binary-compare']:['binary-compare']);
        const descriptor=file=>Object.freeze({name:path.basename(file),path:file});
        const decision=await reviewComparison(Object.freeze({left:descriptor(left),right:descriptor(right),choices}));
        if(decision==='cancel')return {action:'cancelled'};
        if(!choices.includes(decision))throw Error('Invalid comparison type review result.');
        chosenMode=decision;
        await verifySnapshots(original);
      }
      for (const [side,file] of [['a',left],['b',right]]) if (file) values[side] = {name:path.basename(file),path:file,bytes:await readDataLimited(file)};
      await verifySnapshots(original);
      let mode = chosenMode||(automaticDocument?'text-compare':leftMode === rightMode ? leftMode : 'binary-compare');
      if (!mode || mode==='text-compare') {
        try { for (const value of Object.values(values)) if (value) { if (!isDocumentInput(value.name)&&value.bytes.length > MAX_TEXT_BYTES) throw new Error('Text file exceeds limit.'); Object.assign(value,await decodeTextInput(value.bytes,value.name,'auto',{extractPdfText:this.extractPdfText,extractDocText:this.extractDocText})); } mode='text-compare'; }
        catch(error) { if(projected||chosenMode==='text-compare')throw error;mode='binary-compare'; }
      }
      for (const value of Object.values(values)) if (value) { if (mode !== 'text-compare') { value.data=value.bytes.toString('base64'); delete value.content; delete value.format; } delete value.bytes; }
      if (request.command === '--fc-set-left') await this.setLeft(left, 'file');
      await verifySnapshots(original);
      const result = {action:request.command === '--fc-set-left' ? 'set-left':'compare',mode,name:path.basename(left),...values};
      snapshots.set(result,original);
      return result;
    }
    return null;
  }
}
module.exports = {ShellRequests,parseShellArgs,regularPath,comparisonType};
