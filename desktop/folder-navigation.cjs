'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const LIMIT = 40;
class FolderNavigation {
  constructor(file) {
    this.file = file; this.recent = []; this.contexts = new WeakMap();
    this.ready = this.load();
  }
  async load() {
    if (!this.file) return;
    try {
      const stat = await fs.stat(this.file);
      if (stat.size > 1024 * 1024) return;
      const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (Array.isArray(data)) this.recent = [...new Set(data.filter(validPath))].slice(0,LIMIT);
    } catch {} // Recent paths are optional; malformed preferences never prevent opening folders.
  }
  state(service) {
    if (!this.contexts.has(service)) this.contexts.set(service,{a:{entries:[],index:-1},b:{entries:[],index:-1}});
    const state = this.contexts.get(service);
    for (const side of ['a','b']) {
      const current = service.roots[side];
      if (current && state[side].entries[state[side].index] !== current) state[side] = {entries:[current],index:0};
      if (!current) state[side] = {entries:[],index:-1};
    }
    return state;
  }
  async snapshot(service) {
    await this.ready;
    const state = this.state(service), result = {};
    for (const side of ['a','b']) {
      const current = service.roots[side] || '', item = state[side];
      result[side] = {path:current,canParent:!!current && path.dirname(current)!==current,canBack:item.index>0,canForward:item.index<item.entries.length-1,history:[...this.recent]};
    }
    return result;
  }
  async persist() {
    if (!this.file) return;
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await fs.mkdir(path.dirname(this.file),{recursive:true});
      await fs.writeFile(temporary,JSON.stringify(this.recent),{flag:'wx',mode:0o600});
      await fs.rename(temporary,this.file);
    } catch {} finally { await fs.rm(temporary,{force:true}).catch(()=>{}); }
  }
  async navigate(service,side,action,value) {
    await this.ready;
    if (!['a','b'].includes(side)) throw new Error('Choose a valid folder side.');
    if (!['path','parent','back','forward'].includes(action)) throw new Error('Invalid folder navigation action.');
    const item = this.state(service)[side];
    let target, index;
    if (action==='path') {
      if (!validPath(value)) throw new Error('Enter an absolute folder path.');
      target=value;
    } else if (action==='parent') {
      if (!service.roots[side] || path.dirname(service.roots[side])===service.roots[side]) throw new Error('This folder has no parent.');
      target=path.dirname(service.roots[side]);
    } else {
      index=item.index+(action==='back'?-1:1);
      if (index<0 || index>=item.entries.length) throw new Error('No folder is available in that direction.');
      target=item.entries[index];
    }
    // select validates before replacing the root; rejected destinations leave history intact.
    const result = await service.select(side,target);
    service.hashCache.clear();
    if (index!==undefined) { item.index=index; item.entries[index]=result.path; }
    else if (item.entries[item.index]!==result.path) {
      item.entries=item.entries.slice(0,item.index+1); item.entries.push(result.path);
      if (item.entries.length>LIMIT) item.entries.shift();
      item.index=item.entries.length-1;
    }
    this.recent=[result.path,...this.recent.filter(entry=>entry!==result.path)].slice(0,LIMIT);
    await this.persist();
    return result;
  }
  async navigateParents(service) {
    await this.ready;
    const original = {...service.roots}, targets = {}, result = {a:null,b:null};
    let moving = false;
    for (const side of ['a','b']) {
      if (!original[side]) continue;
      targets[side] = path.dirname(original[side]);
      moving ||= targets[side] !== original[side];
    }
    if (!moving) throw new Error('These folders have no parent.');
    // Validate against the final pair, not the other side's old root. Staging
    // also keeps plans, roots and history intact if either destination fails.
    const staged = Object.create(service);
    staged.roots = {}; staged.plans = new Map(); staged.hashCache = new Map();
    for (const side of ['a','b']) {
      if (!targets[side]) continue;
      await fs.access(targets[side], fs.constants.R_OK | fs.constants.X_OK);
      result[side] = await staged.select(side,targets[side]);
    }
    if (['a','b'].some(side => service.roots[side] !== original[side])) throw new Error('The selected folders changed. Try again.');
    const state = this.state(service);
    service.roots = {...staged.roots};
    service.backupRoot = staged.backupRoot;
    service.plans.clear(); service.hashCache.clear();
    for (const side of ['a','b']) {
      if (!result[side] || targets[side] === original[side]) continue;
      const item = state[side];
      item.entries = item.entries.slice(0,item.index+1);
      item.entries.push(result[side].path);
      if (item.entries.length > LIMIT) item.entries.shift();
      item.index = item.entries.length-1;
      this.recent = [result[side].path,...this.recent.filter(entry => entry !== result[side].path)].slice(0,LIMIT);
    }
    await this.persist();
    return result;
  }
  swap(service) { const state=this.state(service); [state.a,state.b]=[state.b,state.a]; }
  reset(service) { this.contexts.delete(service); }
  remap(service,transform) {
    const state=this.contexts.get(service);
    if (state) for (const side of ['a','b']) state[side].entries=state[side].entries.map(transform);
    this.recent=[...new Set(this.recent.map(transform))];
  }
}
function validPath(value) { return typeof value==='string' && value.length>0 && value.length<=32768 && !value.includes('\0') && path.isAbsolute(value); }
module.exports={FolderNavigation};
