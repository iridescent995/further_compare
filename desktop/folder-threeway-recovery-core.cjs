'use strict';
// Pure recovery review. Native callers must independently verify roots and backup bytes.
const path = require('node:path');
const {buildThreeWayPlan} = require('./folder-threeway-plan.cjs');
const fail = message => { throw new Error(`Cannot recover merge: ${message}`); };
function object(v, keys) {
  if (!v || ![Object.prototype,null].includes(Object.getPrototypeOf(v)) || Object.getOwnPropertySymbols(v).length) fail('invalid data object.');
  for (const [k,d] of Object.entries(Object.getOwnPropertyDescriptors(v))) if (!Object.hasOwn(d,'value') || (keys && !keys.includes(k))) fail('unexpected journal field.');
}
function relative(p) {
  if (typeof p !== 'string' || !p || p.length>32768 || /[\\\x00-\x1f\x7f<>:"|?*]/.test(p) || p.split('/').length>256 || p.split('/').some(x=>!x||x==='.'||x==='..'||/[. ]$/.test(x)||/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(x))) fail('invalid relative path.');
}
function absolute(p) { if(typeof p!=='string'||p.length>32768||/[\x00-\x1f\x7f]/.test(p)||!path.isAbsolute(p)||path.resolve(p)!==p) fail('invalid root path.'); }
const hash = h => typeof h==='string' && /^[a-f0-9]{64}$/.test(h);
const integer = n => Number.isSafeInteger(n)&&n>=0;
function descriptor(e) {
  object(e,['kind','hash','size','normalizedHash','revision','identity','mode']);
  if(!['file','directory'].includes(e.kind)||!integer(e.mode)) fail('invalid original entry.');
  if(e.kind==='file' && (!hash(e.hash)||!integer(e.size)||typeof e.revision!=='string'||!/^\d+:\d+:\d+:-?\d+:-?\d+$/.test(e.revision))) fail('invalid original file.');
  if(e.kind==='directory' && (typeof e.identity!=='string'||!/^\d+:\d+$/.test(e.identity))) fail('invalid original directory.');
  if(e.normalizedHash!==undefined&&e.normalizedHash!==null&&!hash(e.normalizedHash)) fail('invalid normalized hash.');
}
function entries(list) {
  if(!Array.isArray(list)||list.length>100000)fail('invalid original entries.');
  const map=new Map(),aliases=new Set();let bytes=0;
  for(const pair of list) {
    if(!Array.isArray(pair)||pair.length!==2)fail('invalid original entry pair.');
    const [p,e]=pair;relative(p);descriptor(e);const alias=p.normalize('NFC').toLowerCase();
    if(aliases.has(alias))fail('duplicate or aliased paths.');aliases.add(alias);bytes+=Buffer.byteLength(p);if(bytes>16*1024*1024)fail('path limit exceeded.');map.set(p,e);
  }
  for(const p of map.keys()) { const parent=path.posix.dirname(p);if(parent!=='.'&&map.get(parent)?.kind!=='directory')fail('missing directory parent.'); }
  return map;
}
function validateRecoveryManifest(value) {
  // Validate property descriptors before reading even array elements; never run accessors.
  let nodes=0;
  const walk=(v,depth=0)=>{
    if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number')return;
    if(typeof v!=='object'||depth>16||++nodes>2000000||Object.getOwnPropertySymbols(v).length||(!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v))))fail('invalid journal data.');
    for(const [key,d] of Object.entries(Object.getOwnPropertyDescriptors(v))) {
      if(!Object.hasOwn(d,'value')||!d.enumerable&&!(Array.isArray(v)&&key==='length'))fail('journal must contain plain enumerable data.');
      if(Array.isArray(v)&&key!=='length'&&!/^(0|[1-9]\d*)$/.test(key))fail('invalid array property.');
      walk(d.value,depth+1);
    }
    if(Array.isArray(v)&&Object.keys(v).length!==v.length)fail('sparse journal array.');
  };walk(value);
  object(value,['version','id','status','roots','rootIdentities','operations','originalTarget','backups','staged','completed','activeOperation','temporaryFiles','temporaryIdentities','error']);
  if(value.version!==2||typeof value.id!=='string'||!value.id||value.id.length>1024||!['preparing','prepared','applying','failed','completed'].includes(value.status))fail('unsupported journal.');
  object(value.roots,['base','left','right','output']);for(const side of ['base','left','right','output'])absolute(value.roots[side]);
  object(value.rootIdentities,['base','left','right','output']);for(const side of ['base','left','right','output'])if(typeof value.rootIdentities[side]!=='string'||!/^\d+:\d+$/.test(value.rootIdentities[side]))fail('invalid root identity.');
  const original=entries(value.originalTarget);
  if(!Array.isArray(value.operations)||value.operations.length>400000||!integer(value.completed)||value.completed>value.operations.length)fail('invalid operation count.');
  if(value.activeOperation!==null && (!integer(value.activeOperation)||value.activeOperation!==value.completed||value.activeOperation>=value.operations.length))fail('invalid active operation.');
  if(['preparing','prepared'].includes(value.status)&&(value.completed!==0||value.activeOperation!==null))fail('preparation cannot change output.');
  if(value.status==='completed'&&(value.completed!==value.operations.length||value.activeOperation!==null))fail('incomplete completed journal.');
  if(value.error!==null && typeof value.error!=='string')fail('invalid journal error.');
  const simulated=new Map(original),seen=new Set(),childCounts=new Map(),modifiedFiles=new Set();
  const changeChildren=(p,delta)=>{const parent=path.posix.dirname(p);childCounts.set(parent,(childCounts.get(parent)||0)+delta);};
  for(const p of original.keys())changeChildren(p,1);
  for(const op of value.operations) {
    object(op,op.type==='copy-file'?['type','path','sourceSide','sourcePath','hash','size','oldHash','oldSize']:op.type==='delete-file'?['type','path','hash','size']:['type','path']);relative(op.path);
    const key=op.type+':'+op.path;if(seen.has(key))fail('duplicate operation.');seen.add(key);
    const prior=simulated.get(op.path),parent=path.posix.dirname(op.path);
    if(op.type==='delete-file') {if(prior?.kind!=='file'||prior.hash!==op.hash||prior.size!==op.size)fail('invalid file removal.');simulated.delete(op.path);changeChildren(op.path,-1);modifiedFiles.add(op.path);}
    else if(op.type==='delete-directory') {if(prior?.kind!=='directory'||(childCounts.get(op.path)||0)!==0)fail('invalid directory removal.');simulated.delete(op.path);changeChildren(op.path,-1);}
    else if(op.type==='create-directory') {if(prior||(parent!=='.'&&simulated.get(parent)?.kind!=='directory'))fail('invalid directory creation.');simulated.set(op.path,{kind:'directory'});changeChildren(op.path,1);}
    else if(op.type==='copy-file') {
      if(!['base','left','right'].includes(op.sourceSide)||op.sourcePath!==op.path||!hash(op.hash)||!integer(op.size)||(parent!=='.'&&simulated.get(parent)?.kind!=='directory')||(prior&&prior.kind!=='file')||op.oldHash!==(prior?.hash??null)||op.oldSize!==(prior?.size??null))fail('invalid file copy.');
      if(!prior)changeChildren(op.path,1);modifiedFiles.add(op.path);
      simulated.set(op.path,{kind:'file',hash:op.hash,size:op.size});
    } else fail('unknown operation.');
  }
  // Reuse the planner's portability, aliases, hierarchy and bounds validation.
  buildThreeWayPlan({entries:new Map([...simulated].map(([p,e])=>[p,e.kind==='file'?{...e,sourceSide:'base',sourcePath:p}:e])),conflicts:[]},{entries:original,skipped:0});
  if(!Array.isArray(value.backups)||!Array.isArray(value.staged)||value.backups.length>original.size||value.staged.length>value.operations.length)fail('invalid saved content.');
  const backed=new Set(),staged=new Set();
  for(const [i,b] of value.backups.entries()) {
    object(b,['path','file','kind','hash','size','normalizedHash','revision','mode','backupRevision']);relative(b.path);
    const old=original.get(b.path);
    if(backed.has(b.path)||b.file!==`backup-${i}`||old?.kind!=='file'||b.kind!=='file'||b.hash!==old.hash||b.size!==old.size||b.revision!==old.revision||b.mode!==old.mode||b.normalizedHash!==old.normalizedHash||typeof b.backupRevision!=='string'||!/^\d+:\d+:\d+:-?\d+:-?\d+$/.test(b.backupRevision)||!modifiedFiles.has(b.path))fail('invalid backup record.');backed.add(b.path);
  }
  for(const s of value.staged) {
    object(s,['index','file','kind','hash','size','revision','mode']);const op=value.operations[s.index];
    if(!integer(s.index)||staged.has(s.index)||s.file!==`staged-${s.index}`||op?.type!=='copy-file'||s.kind!=='file'||s.hash!==op.hash||s.size!==op.size||typeof s.revision!=='string'||!/^\d+:\d+:\d+:-?\d+:-?\d+$/.test(s.revision)||!integer(s.mode))fail('invalid staged record.');staged.add(s.index);
  }
  if(!Array.isArray(value.temporaryFiles)||value.temporaryFiles.length>1)fail('invalid temporary files.');
  for(const p of value.temporaryFiles) {
    absolute(p);const op=value.operations[value.activeOperation];
    if(op?.type!=='copy-file'||path.dirname(p)!==path.dirname(path.join(value.roots.output,op.path))||!/^\.fc-threeway-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(path.basename(p)))fail('invalid temporary output path.');
  }
  if(value.temporaryIdentities!==undefined){
    if(!Array.isArray(value.temporaryIdentities)||value.temporaryIdentities.length>1)fail('invalid temporary identities.');
    for(const item of value.temporaryIdentities){object(item,['path','identity']);if(!value.temporaryFiles.includes(item.path)||typeof item.identity!=='string'||!/^\d+:\d+$/.test(item.identity))fail('invalid temporary identity.');}
  }
  return structuredClone(value);
}
function planThreeWayRecovery(value,currentSnapshot,verifiedBackupsMap,verifiedTemporary=new Map()) {
  const manifest=validateRecoveryManifest(value),original=new Map(manifest.originalTarget);
  if(!(verifiedBackupsMap instanceof Map)||currentSnapshot?.skipped!==0||!(currentSnapshot.entries instanceof Map))fail('complete verified scans are required.');
  if(currentSnapshot.identity!==manifest.rootIdentities.output)fail('output root changed.');
  const current=currentSnapshot.entries;
  // Validate current portable shape before interpreting any affected path.
  buildThreeWayPlan({entries:new Map([...original].map(([p,e])=>[p,e.kind==='file'?{...e,sourceSide:'base',sourcePath:p}:e])),conflicts:[]},currentSnapshot);
  const allowed=new Map(),affected=new Set();
  for(const op of manifest.operations.slice(0,manifest.completed+(manifest.activeOperation===null?0:1))) {
    affected.add(op.path);if(!allowed.has(op.path))allowed.set(op.path,[]);
    allowed.get(op.path).push(op.type==='copy-file'?{kind:'file',hash:op.hash,size:op.size}:op.type==='create-directory'?{kind:'directory'}:null);
    if(op.type==='copy-file')allowed.get(op.path).push(null); // Interrupted unlink before exclusive publication.
  }
  const same=(a,b)=>a?.kind===b?.kind && (!a || a.kind==='directory'||a.hash===b.hash&&a.size===b.size);
  const exact=(a,b)=>same(a,b)&&(!a||(a.kind==='file'?a.revision===b.revision:a.identity===b.identity));
  const temps=new Map(manifest.temporaryFiles.map(p=>[path.relative(manifest.roots.output,p).split(path.sep).join('/'),manifest.operations[manifest.activeOperation]]));
  for(const p of new Set([...original.keys(),...current.keys()])) {
    const before=original.get(p),now=current.get(p);
    if(temps.has(p)) {
      const op=temps.get(p),authority=(manifest.temporaryIdentities||[]).find(item=>item.path===path.join(manifest.roots.output,p)),verified=verifiedTemporary.get(p);
      if(before||now&&(now.kind!=='file'||(authority? !verified||verified.revision!==now.revision||verified.hash!==now.hash||verified.size!==now.size||now.revision.split(':').slice(0,2).join(':')!==authority.identity : now.hash!==op.hash||now.size!==op.size)))fail(`temporary output changed: ${p}`);continue;
    }
    if(!affected.has(p)) {if(!exact(before,now))fail(`unrelated entry changed: ${p}`);}
    else if(!exact(before,now)&&!allowed.get(p).some(e=>same(e,now)))fail(`output changed after merge: ${p}`);
  }
  const backupByPath=new Map(manifest.backups.map(b=>[b.path,b])),desired=new Map();
  for(const [p,e] of original) {
    if(e.kind==='directory') {desired.set(p,{...e});continue;}
    if(exact(e,current.get(p)))desired.set(p,{...e,sourceKind:'output',sourceFile:p});
    else {
      const backup=backupByPath.get(p),verified=verifiedBackupsMap.get(p);
      if(!backup||verified?.kind!=='file'||verified.hash!==e.hash||verified.size!==e.size)fail(`verified backup missing or changed: ${p}`);
      desired.set(p,{...e,sourceKind:'backup',sourceFile:backup.file});
    }
  }
  const operations=buildThreeWayPlan({entries:new Map([...desired].map(([p,e])=>[p,e.kind==='file'?{...e,sourceSide:'base',sourcePath:p}:e])),conflicts:[]},currentSnapshot).map(op=>{
    if(op.type!=='copy-file')return {...op};
    const {sourceSide,sourcePath,...rest}=op;return {...rest,sourceKind:desired.get(op.path).sourceKind,sourceFile:desired.get(op.path).sourceFile};
  });
  return {desired,operations};
}
module.exports={validateRecoveryManifest,planThreeWayRecovery};
