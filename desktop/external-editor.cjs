'use strict';
const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {spawn} = require('node:child_process');
const defaults = () => ({mode:'system',executable:'',args:[]});
function validateConfiguration(value, platform) {
  if (!['system','custom'].includes(value.mode) || typeof value.executable !== 'string' || value.executable.length > 32768 || value.executable.includes('\0') || !Array.isArray(value.args) || value.args.length > 32 || value.args.some(arg => typeof arg !== 'string' || arg.length > 4096 || arg.includes('\0'))) throw new Error('Invalid external editor settings.');
  if (value.mode === 'system') return defaults();
  const paths = platform === 'win32' ? path.win32 : path.posix;
  if (!paths.isAbsolute(value.executable)) throw new Error('Choose an editor using an absolute path.');
  if (platform === 'win32' && !/\.exe$/i.test(value.executable)) throw new Error('Choose an .exe editor; command scripts are not supported.');
  if (platform === 'darwin' && /\.app\/?$/i.test(value.executable) && value.args.some(arg => arg.includes('{file}'))) throw new Error('Mac apps receive the file automatically. Remove {file} from their arguments.');
  return {mode:'custom',executable:value.executable,args:[...value.args]};
}
const record = value => value && Object.getPrototypeOf(value) === Object.prototype;
function validateSettings(value, platform = process.platform) {
  if (!record(value) || Object.keys(value).some(key => !['mode','executable','args','profiles'].includes(key))) throw new Error('Invalid external editor settings.');
  const settings = validateConfiguration(value,platform);
  if (value.profiles !== undefined) {
    if (!Array.isArray(value.profiles) || value.profiles.length > 32) throw new Error('Choose up to 32 editor profiles.');
    const ids = new Set();
    const profiles = value.profiles.map(profile => {
      if (!record(profile) || Object.keys(profile).some(key => !['id','name','patterns','enabled','mode','executable','args'].includes(key)) ||
          typeof profile.id !== 'string' || !profile.id.trim() || profile.id.length > 64 || profile.id.includes('\0') || ids.has(profile.id) ||
          typeof profile.name !== 'string' || !profile.name.trim() || profile.name.trim().length > 80 || profile.name.includes('\0') || typeof profile.enabled !== 'boolean' ||
          !Array.isArray(profile.patterns) || !profile.patterns.length || profile.patterns.length > 32 ||
          profile.patterns.some(pattern => typeof pattern !== 'string' || !pattern.trim() || pattern.length > 128 || /[\\/\0]/.test(pattern))) throw new Error('Invalid external editor profile.');
      ids.add(profile.id);
      return {id:profile.id,name:profile.name.trim(),patterns:[...profile.patterns],enabled:profile.enabled,...validateConfiguration(profile,platform)};
    });
    if (profiles.length) settings.profiles = profiles;
  }
  if (Buffer.byteLength(JSON.stringify(settings),'utf8') > 180000) throw new Error('External editor settings are too large.');
  return settings;
}
// A bounded bitset advances every possible wildcard position together. This is
// linear in filename length, with no backtracking or user-generated regex.
function matchesFilename(pattern, filename) {
  const glob = Array.from(pattern.toLowerCase()).filter((char,index,all) => char !== '*' || all[index-1] !== '*');
  let stars = 0n, questions = 0n;
  const literals = new Map();
  for (let index = 0; index < glob.length; index++) {
    const bit = 1n << BigInt(index), char = glob[index];
    if (char === '*') stars |= bit;
    else if (char === '?') questions |= bit;
    else literals.set(char,(literals.get(char) || 0n) | bit);
  }
  // Adjacent stars are collapsed, so one epsilon step is sufficient.
  const skipStars = states => states | ((states & stars) << 1n);
  let states = skipStars(1n);
  for (const char of filename.toLowerCase()) {
    states = skipStars((states & stars) | ((states & (questions | (literals.get(char) || 0n))) << 1n));
    if (!states) return false;
  }
  return Boolean(states & (1n << BigInt(glob.length)));
}
function selectEditor(value, file, platform = process.platform) {
  const settings = validateSettings(value,platform);
  const paths = platform === 'win32' ? path.win32 : path.posix;
  if (typeof file !== 'string' || file.includes('\0') || !paths.isAbsolute(file)) throw new Error('Invalid file path.');
  const name = paths.basename(file);
  const selected = settings.profiles?.find(profile => profile.enabled && profile.patterns.some(pattern => matchesFilename(pattern,name))) || settings;
  return {mode:selected.mode,executable:selected.executable,args:[...selected.args]};
}
function invocation(value, file, platform = process.platform) {
  const settings = selectEditor(value, file, platform);
  if (typeof file !== 'string' || file.includes('\0') || !(platform === 'win32' ? path.win32 : path.posix).isAbsolute(file)) throw new Error('Invalid file path.');
  if (settings.mode === 'system') return {mode:'system',file};
  if (platform === 'darwin' && /\.app\/?$/i.test(settings.executable)) return {mode:'custom',command:'/usr/bin/open',args:['-a',settings.executable,file,...(settings.args.length ? ['--args',...settings.args] : [])]};
  const hasFile = settings.args.some(arg => arg.includes('{file}'));
  return {mode:'custom',command:settings.executable,args:[...settings.args.map(arg => arg.replaceAll('{file}', file)),...(hasFile ? [] : [file])]};
}
async function checkExecutable(settings, platform = process.platform) {
  if (settings.mode !== 'custom') return;
  const stat = await fs.stat(settings.executable);
  if (platform === 'darwin' && /\.app\/?$/i.test(settings.executable)) {
    if (!stat.isDirectory() || !(await fs.stat(path.join(settings.executable,'Contents','Info.plist'))).isFile()) throw new Error('Choose a valid Mac application.');
  } else {
    if (!stat.isFile()) throw new Error('Choose an executable file.');
    if (platform !== 'win32') await fs.access(settings.executable,constants.X_OK);
  }
}
class ExternalEditor {
  constructor(file, platform = process.platform) { this.file = file; this.platform = platform; }
  async settings() {
    try {
      if ((await fs.stat(this.file)).size > 180000) throw new Error('External editor settings are too large.');
      return validateSettings(JSON.parse(await fs.readFile(this.file,'utf8')),this.platform);
    } catch (error) { if (error.code === 'ENOENT') return defaults(); throw error; }
  }
  async save(value) {
    const settings = validateSettings(value,this.platform);
    const serialized = JSON.stringify(settings);
    if (Buffer.byteLength(serialized,'utf8') > 180000) throw new Error('External editor settings are too large.');
    await checkExecutable(settings,this.platform);
    for (const profile of settings.profiles || []) if (profile.enabled) await checkExecutable(profile,this.platform);
    await fs.mkdir(path.dirname(this.file),{recursive:true});
    const temp = `${this.file}.${randomUUID()}.tmp`;
    let committed=false;
    try { await fs.writeFile(temp,serialized,{flag:'wx',mode:0o600}); await fs.rename(temp,this.file); committed=true; }
    finally { if(!committed)await fs.rm(temp,{force:true}); }
    return settings;
  }
  async launch(file, openPath, beforeLaunch = async () => {}) {
    const settings = selectEditor(await this.settings(),file,this.platform);
    await checkExecutable(settings,this.platform);
    const stat = await fs.lstat(file);
    if (!stat.isFile()) throw new Error('Choose a regular file to open in an editor.');
    const plan = invocation(settings,file,this.platform);
    await beforeLaunch();
    if (plan.mode === 'system') {
      const error = await openPath(file);
      if (error) throw new Error(error);
    } else {
      await new Promise((resolve,reject) => {
        const child = spawn(plan.command,plan.args,{shell:false,detached:true,stdio:'ignore',windowsHide:false});
        child.once('error',reject);
        if (plan.command === '/usr/bin/open') child.once('exit',(code,signal) => code === 0 ? resolve() : reject(new Error(`The selected Mac app could not open this file (${signal || code}).`)));
        else child.once('spawn',() => { child.unref(); resolve(); });
      });
    }
    return {launched:true,name:path.basename(file)};
  }
}
module.exports = {validateSettings,selectEditor,invocation,checkExecutable,ExternalEditor};
