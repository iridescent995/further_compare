'use strict';
const path=require('node:path').posix;
const {createHash}=require('node:crypto');
const {MAX_DATA_BYTES,MAX_TEXT_BYTES}=require('./sessions.cjs');
const {decodeTextInput,isDocumentInput}=require('../src/text-input.cjs');
const {comparisonType}=require('./shell-requests.cjs');
const {validateFolderTextEncodings}=require('./folder-rules.cjs');
const {checkSignal}=require('./local-folder-reader.cjs');
const validPath=value=>typeof value==='string'&&value.length>0&&value.length<=32768&&!/[\\\0]/.test(value)&&!value.split('/').some(part=>!part||part==='.'||part==='..');
const same=(a,b)=>!!a&&!!b&&a.path===b.path&&a.identity===b.identity&&a.stamp===b.stamp&&a.kind===b.kind;
function metadata(value,relative){if(!value||value.path!==relative||value.kind!=='file'||!Number.isSafeInteger(value.size)||value.size<0||typeof value.identity!=='string'||!value.identity||typeof value.stamp!=='string'||!value.stamp)throw Error('Choose an unchanged regular file.');return {...value};}
function authority(value){if(!value||typeof value.path!=='string'||!value.path||typeof value.identity!=='string'||!value.identity)throw Error('Choose a folder first.');return {...value};}
// Stage complete provider bytes before a caller publishes a child session. Values
// intentionally contain no disk paths or save authority, even for a local side.
async function stageProviderFolderOpen(service,pairs,{mode='auto',encoding='auto',signal,extractPdfText,extractDocText}={}){
 if(!service||!['inspectRoot','inspectEntry','openFileReader'].every(name=>typeof service[name]==='function'))throw Error('Choose a folder service.');
 if(!pairs||typeof pairs!=='object'||Array.isArray(pairs)||Object.keys(pairs).some(key=>!['a','b'].includes(key))||!['a','b'].every(side=>pairs[side]===null||validPath(pairs[side]))||pairs.a===null&&pairs.b===null)throw Error('Choose a file pair inside the selected roots.');
 if(!['auto','text','data'].includes(mode))throw Error('Choose a supported file opening mode.');
 const encodings=validateFolderTextEncodings(encoding),limitFor=side=>mode==='text'&&!isDocumentInput(pairs[side])?MAX_TEXT_BYTES:MAX_DATA_BYTES,roots={...service.roots},observations={},readers=[],bytes={},values={a:null,b:null};let failed=false;
 const inspect=async side=>{
  checkSignal(signal);if((service.roots?.[side]??null)!==(roots[side]??null))throw Error('A selected root changed while opening.');
  const root=authority(await service.inspectRoot(side,{signal})),info=metadata(await service.inspectEntry(side,pairs[side],{signal}),pairs[side]);checkSignal(signal);return {root,metadata:info};
 };
 try{
  for(const side of ['a','b'])if(pairs[side]!==null){const observed=await inspect(side),limit=limitFor(side);if(observed.metadata.size>limit)throw Error(limit===MAX_TEXT_BYTES?'Text file exceeds 10 MB.':'File exceeds 32 MB.');observations[side]=observed;}
  for(const side of ['a','b'])if(pairs[side]!==null){
   checkSignal(signal);const reader=await service.openFileReader(side,pairs[side],{signal});readers.push({side,reader});
   if(!same(metadata(reader.metadata,pairs[side]),observations[side].metadata))throw Error('A file changed before opening.');
   const limit=limitFor(side),chunks=[];let total=0;
   while(true){
    checkSignal(signal);const requested=Math.min(65536,limit-total+1),chunk=await reader.read(requested);checkSignal(signal);if(chunk===null)break;
    if(!(chunk instanceof Uint8Array)||chunk.length<1||chunk.length>requested)throw Error('Invalid provider file chunk.');
    total+=chunk.length;if(total>limit||total>observations[side].metadata.size)throw Error('A file grew while opening.');chunks.push(Buffer.from(chunk));
   }
   if(total!==observations[side].metadata.size)throw Error('A file changed size while opening.');bytes[side]=Buffer.concat(chunks,total);observations[side].sha256=createHash('sha256').update(bytes[side]).digest('hex');
  }
  // Recheck retained handles and paths after BOTH reads: mutation of the earlier
  // side during the later read cannot silently publish a stale pair.
  for(const {side,reader} of readers){checkSignal(signal);if(!same(metadata(await reader.validate(),pairs[side]),observations[side].metadata))throw Error('A file changed while opening.');}
  for(const side of Object.keys(observations)){const current=await inspect(side),before=observations[side];if(current.root.path!==before.root.path||current.root.identity!==before.root.identity||!same(current.metadata,before.metadata))throw Error('A selected file or root changed while opening.');}
  const projected=Object.keys(bytes).some(side=>isDocumentInput(pairs[side]));
  let resultMode=mode==='text'?'text-compare':mode==='data'?'binary-compare':null;
  if(mode==='auto'){const types=Object.keys(bytes).map(side=>comparisonType(pairs[side]));if(projected&&types.some(type=>type&&type!=='text-compare'))throw Error('Compare a document with another PDF, DOCX, RTF, ODT document or text file.');resultMode=projected?'text-compare':types.every(type=>type===types[0])?types[0]:'binary-compare';}
  if(mode==='auto'&&!resultMode&&Object.values(bytes).some(value=>value.length>MAX_TEXT_BYTES))resultMode='binary-compare';
  if(!resultMode||resultMode==='text-compare'){
   try{for(const side of Object.keys(bytes))values[side]={name:path.basename(pairs[side]),...await decodeTextInput(bytes[side],path.basename(pairs[side]),encodings[side],{extractPdfText,extractDocText,signal})};resultMode='text-compare';}
   catch(error){if(mode==='text'||projected)throw error;resultMode='binary-compare';}
  }
  if(resultMode!=='text-compare')for(const side of Object.keys(bytes))values[side]={name:path.basename(pairs[side]),data:bytes[side].toString('base64')};
  // Document extraction is asynchronous: revalidate after conversion as well.
  if(projected&&resultMode==='text-compare'){
   for(const {side,reader} of readers){checkSignal(signal);if(!same(metadata(await reader.validate(),pairs[side]),observations[side].metadata))throw Error('A file changed while opening.');}
   for(const side of Object.keys(observations)){const current=await inspect(side),before=observations[side];if(current.root.path!==before.root.path||current.root.identity!==before.root.identity||!same(current.metadata,before.metadata))throw Error('A selected file or root changed while opening.');}
  }
  checkSignal(signal);return {mode:resultMode,name:Object.keys(bytes).map(side=>path.basename(pairs[side])).join(' ↔ ').slice(0,200),...values,observations};
 }catch(error){failed=true;throw error;}
 finally{const closed=await Promise.allSettled(readers.map(({reader})=>Promise.resolve().then(()=>reader.close())));if(!failed){checkSignal(signal);const failure=closed.find(result=>result.status==='rejected');if(failure)throw failure.reason;}}
}
module.exports={stageProviderFolderOpen};
