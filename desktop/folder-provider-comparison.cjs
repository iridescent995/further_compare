'use strict';
const {hasTextGrammar,TEXT_GRAMMAR_VERSION}=require('../src/text-grammar.cjs');
const {folderComparisonKey}=require('../src/text-comparison-keys.cjs');
const crypto=require('node:crypto');
const {resolveTextProfile,TEXT_PROFILE_RULES_VERSION}=require('../src/text-profile.cjs');
const path=require('node:path');
const {validateFolderRules,effectiveFolderEncoding}=require('./folder-rules.cjs');
const {assertMetadataPlatform,applyMetadataComparison}=require('./folder-metadata-comparison.cjs');
const {timestampsEqualNs}=require('../src/folder-time.cjs');
const {decodeText,MAX_BYTES:MAX_TEXT_BYTES}=require('../src/text-codec.cjs');
const ignoredTextClient=require('./ignored-text-client.cjs');
const {checkSignal}=require('./local-folder-reader.cjs');
const TEXT_MODES=new Set(['text-content','text-whitespace','text-case','text-whitespace-case']);
const same=(a,b)=>!!a&&!!b&&a.path===b.path&&a.identity===b.identity&&a.stamp===b.stamp&&a.kind===b.kind;
function validateMetadata(info){
 if(!info||typeof info.path!=='string'||!info.path||typeof info.identity!=='string'||!info.identity||typeof info.stamp!=='string'||!info.stamp||!['file','directory'].includes(info.kind)||info.kind==='file'&&(!Number.isSafeInteger(info.size)||info.size<0)||!Number.isFinite(info.mtime)||(info.mtimeNs!==undefined&&(typeof info.mtimeNs!=='string'||! /^-?\d+$/.test(info.mtimeNs)))||(info.strongRevision!==undefined&&typeof info.strongRevision!=='boolean'))throw Error('Invalid provider comparison metadata.');
 return info;
}
function validateRoot(info){if(!info||typeof info.path!=='string'||!info.path||typeof info.identity!=='string'||!info.identity)throw Error('Invalid provider root authority.');return info;}
const validPath=p=>typeof p==='string'&&p&&!/[\\\0]/.test(p)&&!p.split('/').some(x=>!x||x==='.'||x==='..');
async function hashReader(service,entry,rules,textMode,signal){
 checkSignal(signal);
 const reader=await service.openFileReader(entry.side,entry.relative,{signal});
 try{
  validateMetadata(reader.metadata);
  if(!same(reader.metadata,entry.metadata))throw Error('A file changed while comparing. Refresh the folder.');
  const validateRead=async()=>{const current=validateMetadata(await reader.validate());if(!same(current,entry.metadata))throw Error('A file changed while being read. Refresh the folder.');};
  const hash=crypto.createHash('sha256');let chunks=textMode&&entry.metadata.size<=MAX_TEXT_BYTES?[]:null,bytes=0;
  while(true){checkSignal(signal);const chunk=await reader.read(65536);checkSignal(signal);if(chunk===null)break;if(!(chunk instanceof Uint8Array)||!chunk.length||chunk.length>65536)throw Error('Invalid provider file chunk.');hash.update(chunk);bytes+=chunk.length;if(chunks){if(bytes>MAX_TEXT_BYTES)chunks=null;else chunks.push(Buffer.from(chunk));}}
  if(bytes!==entry.metadata.size)throw Error('A file changed while being read. Refresh the folder.');
  await validateRead();checkSignal(signal);
  let normalizedHash=null;
  if(chunks){
   let content;try{content=decodeText(Buffer.concat(chunks),effectiveFolderEncoding(rules,entry.side)).content;}catch{}
   if(content!==undefined&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/u.test(content)){
    let normalized=content.replace(/\r\n|\r/g,'\n'),prepared=null;
    if(rules.ignoredTextPatterns?.length||(rules.textProfile??'plain')!=='plain'||hasTextGrammar(rules.textGrammar)){
     checkSignal(signal);
     // The shared worker has a bounded deadline. Await it even on cancellation;
     // no detached normalization job or reader survives comparison settlement.
     if((rules.textProfile??'plain')!=='plain'||hasTextGrammar(rules.textGrammar))[prepared]=await ignoredTextClient.prepareTextComparison([normalized],rules.ignoredTextPatterns,rules.textProfile,rules.textGrammar);
     else {const [keys]=await ignoredTextClient.prepareIgnoredText([normalized],rules.ignoredTextPatterns);prepared={keys};}
     checkSignal(signal);await validateRead();
    }
    normalized=folderComparisonKey(normalized,rules,prepared);
    normalizedHash=crypto.createHash('sha256').update(normalized).digest('hex');
   }
  }
  checkSignal(signal);await validateRead();checkSignal(signal);
  return textMode?{hash:hash.digest('hex'),normalizedHash}:hash.digest('hex');
 }finally{await reader.close();}
}
async function compareRows(service,result,value,options={}){
 const rules=validateFolderRules(value);assertMetadataPlatform(rules);
 if(options.captureEvidence!==undefined&&typeof options.captureEvidence!=='boolean')throw Error('Invalid comparison evidence option.');
 const evidence=options.captureEvidence?new Map():null;
 const recordEvidence=(entry,value)=>{if(!evidence)return;const scalar=info=>Object.freeze(Object.fromEntries(Object.entries(info).filter(([key,v])=>['path','identity','stamp','kind','size','mode','uid','gid','mtime','mtimeNs','strongRevision'].includes(key)&&(v===null||['string','number','boolean'].includes(typeof v)))));evidence.set(JSON.stringify([entry.side,entry.relative]),Object.freeze({side:entry.side,relative:entry.relative,root:scalar(entry.root),metadata:scalar(entry.metadata),sha256:value===null?null:typeof value==='string'?value:value.hash,normalizedHash:value===null||typeof value==='string'?null:value.normalizedHash}));};
 const controller=new AbortController(),external=options.signal,abort=()=>controller.abort();
 if(external?.aborted)controller.abort();external?.addEventListener('abort',abort,{once:true});
 const signal=controller.signal,roots={...service.roots},authorities={},cache=service.hashCache,updates=[],pendingCache=new Map();let cursor=0,failure;
 const inspect=async(side,relative,kind)=>{
  checkSignal(signal);if(!validPath(relative))throw Error('Invalid relative path.');
  if((service.roots[side]||null)!==(roots[side]||null))throw Error('A selected root changed. Refresh the folder.');
  const root=await service.inspectRoot(side,{signal});checkSignal(signal);
  if(!root)throw Error('Choose both folders first.');validateRoot(root);
  if(authorities[side]&&(root.path!==authorities[side].path||root.identity!==authorities[side].identity))throw Error('A selected root changed. Refresh the folder.');
  authorities[side]??={...root};
  const metadata=await service.inspectEntry(side,relative,{signal});checkSignal(signal);
  if(!metadata||metadata.path!==relative||metadata.kind!==kind)throw Error('An entry changed type. Refresh the folder.');
  validateMetadata(metadata);
  return {side,relative,metadata:{...metadata},root:{...root}};
 };
 const hash=async(entry,textMode=false,resolvedProfile='plain')=>{
  checkSignal(signal);const encoding=effectiveFolderEncoding(rules,entry.side);
  const key=(textMode||'content')+'\0'+JSON.stringify([textMode?resolvedProfile:'',textMode?TEXT_PROFILE_RULES_VERSION:'',textMode?JSON.stringify(rules.textProfileMappings??[]):'',textMode?encoding:'',textMode?rules.textWhitespaceScope??'horizontal':'',!!(textMode&&rules.ignoreBlankLines),textMode?rules.ignoredTextPatterns??[]:[],entry.root.path,entry.root.identity,entry.side,entry.relative,entry.metadata.identity,entry.metadata.stamp,...(textMode&&hasTextGrammar(rules.textGrammar)?[TEXT_GRAMMAR_VERSION,JSON.stringify(rules.textGrammar)]:[])]);
  const reusable=entry.metadata.strongRevision===true&&cache instanceof Map;
  if(reusable&&cache.has(key)){const value=cache.get(key);pendingCache.set(key,value);recordEvidence(entry,value);return value;}
  const value=await hashReader(service,entry,{...rules,textProfile:resolvedProfile},textMode,signal);
  if(reusable)pendingCache.set(key,value);recordEvidence(entry,value);return value;
 };
 const files=result.rows.filter(row=>row.kindA===row.kindB&&(row.kindA==='file'||row.kindA==='directory'&&(rules.comparePermissions||rules.compareOwner||rules.compareGroup||rules.compareFilename)));
 const worker=async()=>{try{while(cursor<files.length){
  checkSignal(signal);const row=files[cursor++],a=await inspect('a',row.pathA??row.path,row.kindA),b=await inspect('b',row.pathB??row.path,row.kindB);let equal=false,comparison='content';
  if(row.kindA==='directory'){equal=true;comparison=null;}
  else if(TEXT_MODES.has(rules.mode)){const profile=resolveTextProfile(rules.textProfile,[a.relative,b.relative],rules.textProfileMappings),left=await hash(a,rules.mode,profile),right=await hash(b,rules.mode,profile);equal=left.hash===right.hash;if((!equal||effectiveFolderEncoding(rules,'a')!==effectiveFolderEncoding(rules,'b'))&&left.normalizedHash!==null&&right.normalizedHash!==null){equal=left.normalizedHash===right.normalizedHash;comparison='text-normalized';}}
  else if(rules.mode!=='content'){comparison='metadata';if(rules.mode!=='size'&&(a.metadata.mtimeNs===undefined||b.metadata.mtimeNs===undefined))throw Error('Provider timestamp precision is unavailable.');const timeEqual=rules.mode==='size'?false:timestampsEqualNs(a.metadata.mtimeNs,b.metadata.mtimeNs,rules),sizeEqual=a.metadata.size===b.metadata.size;equal=rules.mode==='size'?sizeEqual:rules.mode==='modified'?timeEqual:sizeEqual&&timeEqual;}
  else if(a.metadata.size===b.metadata.size)equal=a.metadata.size===0||await hash(a)===await hash(b);
  // Native transfer reviews can bind filter eligibility to the exact bytes used
  // by comparison, including size/metadata shortcuts. Publish only on success.
  if(evidence&&row.kindA==='directory')for(const entry of [a,b])recordEvidence(entry,null);
  if(evidence&&row.kindA==='file')for(const entry of [a,b])if(!evidence.has(JSON.stringify([entry.side,entry.relative])))await hash(entry);
  const afterA=await inspect('a',a.relative,row.kindA),afterB=await inspect('b',b.relative,row.kindB);
  if(!same(a.metadata,afterA.metadata)||!same(b.metadata,afterB.metadata))throw Error('A file changed while comparing. Refresh the folder.');
  updates.push({row,value:{sizeA:row.kindA==='file'?a.metadata.size:null,sizeB:row.kindB==='file'?b.metadata.size:null,mtimeA:a.metadata.mtime,mtimeB:b.metadata.mtime,...applyMetadataComparison({status:row.kindA==='directory'?'directory':equal?'equal':'changed',comparison},a.metadata,b.metadata,rules,{a:a.relative,b:b.relative})}});
 }}catch(error){if(!failure)failure=error;controller.abort();}};
 try{
  checkSignal(signal);await Promise.all(Array.from({length:Math.min(4,files.length)},worker));if(failure)throw failure;checkSignal(signal);
  for(const side of Object.keys(authorities)){const current=await service.inspectRoot(side,{signal});if(!current||current.path!==authorities[side].path||current.identity!==authorities[side].identity||(service.roots[side]||null)!==(roots[side]||null))throw Error('A selected root changed. Refresh the folder.');}
  checkSignal(signal);
  for(const {row,value} of updates)Object.assign(row,value);
  for(const [key,value] of pendingCache){cache.delete(key);cache.set(key,value);while(cache.size>2048)cache.delete(cache.keys().next().value);}
  if(evidence)result.evidence=Object.freeze([...evidence.values()].sort((a,b)=>a.side.localeCompare(b.side)|| (a.relative<b.relative?-1:a.relative>b.relative?1:0)));
  result.rules=rules;return result;
 }finally{external?.removeEventListener('abort',abort);}
}
async function compareFilePairs(service,pairs,value={},options={}){
 const rules=validateFolderRules(value);
 if(!Array.isArray(pairs)||pairs.length>50000)throw Error('Invalid aligned file pairs.');
 const used={a:new Set(),b:new Set()},rows=[];
 for(const pair of pairs){
  checkSignal(options.signal);
  if(!pair||typeof pair!=='object'||Array.isArray(pair)||Object.keys(pair).some(key=>!['a','b'].includes(key))||!['a','b'].every(side=>pair[side]===null||validPath(pair[side]))||pair.a===null&&pair.b===null)throw Error('Invalid aligned file pair.');
  const values={};
  for(const side of ['a','b']){const relative=pair[side];if(relative===null){values[side]=null;continue;}if(used[side].has(relative))throw Error('An aligned file can appear only once per side.');used[side].add(relative);const info=await service.inspectEntry(side,relative,{signal:options.signal});checkSignal(options.signal);if(!info||info.path!==relative||info.kind!=='file')throw Error('Choose regular files for file comparison.');validateMetadata(info);values[side]=info;}
  const a=values.a,b=values.b;rows.push({id:JSON.stringify([pair.a,pair.b]),pathA:pair.a,pathB:pair.b,nameA:pair.a===null?null:path.posix.basename(pair.a),nameB:pair.b===null?null:path.posix.basename(pair.b),kindA:a?'file':null,kindB:b?'file':null,sizeA:a?.size??null,sizeB:b?.size??null,mtimeA:a?.mtime??null,mtimeB:b?.mtime??null,status:!a?'right':!b?'left':a.size!==b.size?'different':'unchecked'});
 }
 return compareRows(service,{rows},rules,options);
}
module.exports={compareRows,compareFilePairs};
