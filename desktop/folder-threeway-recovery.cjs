'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {executeThreeWayPlan}=require('./folder-threeway-execute.cjs');
const {constants}=require('node:fs');
const {createHash,randomUUID}=require('node:crypto');
const {FolderService}=require('./folders.cjs');
const {validateRecoveryManifest,planThreeWayRecovery}=require('./folder-threeway-recovery-core.cjs');
const identity=s=>`${s.dev}:${s.ino}`;
const revision=s=>`${identity(s)}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
const validId=id=>typeof id==='string'&&/^threeway-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);
const signature=s=>JSON.stringify({identity:s.identity,skipped:s.skipped,entries:[...s.entries].sort(([a],[b])=>a<b?-1:a>b?1:0)});
async function readVerified(file,limit,keepBytes=false){
 const handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const before=await handle.stat({bigint:true});
  if(!before.isFile()||before.size>BigInt(limit))throw Error('Recovery data is not a regular file or exceeds its size limit.');
  const hash=createHash('sha256'),chunks=[];let size=0;
  for await(const chunk of handle.createReadStream({autoClose:false})){size+=chunk.length;if(size>limit)throw Error('Recovery data exceeds its size limit.');hash.update(chunk);if(keepBytes)chunks.push(chunk);}
  const after=await handle.stat({bigint:true}),current=await fs.lstat(file,{bigint:true});
  if(current.isSymbolicLink()||revision(before)!==revision(after)||revision(after)!==revision(current))throw Error('Recovery data changed while being read.');
  return {kind:'file',hash:hash.digest('hex'),size,revision:revision(after),mode:Number(after.mode),...(keepBytes?{bytes:Buffer.concat(chunks)}:{})};
 }finally{await handle.close();}
}
async function verifyTemporaryPrefix(file,authority,source,expected){
 const stored=await readVerified(source,expected.size);
 if(stored.hash!==expected.hash||stored.size!==expected.size||stored.revision!==expected.revision)throw Error('Recovery staged source changed.');
 const temporary=await readVerified(file,expected.size);
 if(temporary.revision.split(':').slice(0,2).join(':')!==authority.identity)throw Error('Temporary output identity changed.');
 const input=await fs.open(source,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const before=await input.stat({bigint:true});if(!before.isFile()||revision(before)!==stored.revision)throw Error('Recovery staged source changed.');
  const hash=createHash('sha256'),buffer=Buffer.alloc(128*1024);let remaining=temporary.size;
  while(remaining){const {bytesRead}=await input.read(buffer,0,Math.min(buffer.length,remaining),null);if(!bytesRead)throw Error('Recovery staged source shortened.');hash.update(buffer.subarray(0,bytesRead));remaining-=bytesRead;}
  const after=await input.stat({bigint:true}),current=await fs.lstat(source,{bigint:true});
  if(current.isSymbolicLink()||revision(after)!==stored.revision||revision(current)!==stored.revision||hash.digest('hex')!==temporary.hash)throw Error('Temporary output does not match the staged content prefix.');
  return temporary;
 }finally{await input.close();}
}
async function stageVerified(source,destination,expected,mode){
 const input=await fs.open(source,constants.O_RDONLY|(constants.O_NOFOLLOW||0));let output;
 try{
  const before=await input.stat({bigint:true});if(!before.isFile()||revision(before)!==expected.revision)throw Error('Recovery backup changed before staging.');
  output=await fs.open(destination,'wx',mode&0o777);const hash=createHash('sha256');let size=0;
  for await(const chunk of input.createReadStream({autoClose:false})){
   size+=chunk.length;if(size>expected.size)throw Error('Recovery backup grew while staging.');hash.update(chunk);
   for(let offset=0;offset<chunk.length;){const n=(await output.write(chunk,offset,chunk.length-offset)).bytesWritten;if(!n)throw Error('Recovery staging made no progress.');offset+=n;}
  }
  const after=await input.stat({bigint:true}),current=await fs.lstat(source,{bigint:true});
  if(current.isSymbolicLink()||revision(before)!==revision(after)||revision(after)!==revision(current)||size!==expected.size||hash.digest('hex')!==expected.hash)throw Error('Recovery backup changed while staging.');
  await output.chmod(mode&0o777);await output.utimes(Number(before.atimeNs)/1e9,Number(before.mtimeNs)/1e9);await output.sync();
 }finally{await output?.close();await input.close();}
}
// Native recovery authority. Only reviewed, privately retained plans can execute.
class ThreeWayRecovery{
 #backupRoot;#previews=new Map();#executing=false;
 constructor(backupRoot){this.#backupRoot=path.resolve(backupRoot);}
 async #capture(id){
  if(!validId(id))throw Error('Choose a recovery record from the backup list.');
  const root=await fs.realpath(this.#backupRoot),rootStat=await fs.lstat(root,{bigint:true}),directory=path.join(root,id),own=await fs.lstat(directory,{bigint:true});
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||!own.isDirectory()||own.isSymbolicLink()||await fs.realpath(directory)!==directory)throw Error('Recovery directory changed or is a symbolic link.');
  const check=async()=>{const r=await fs.lstat(root,{bigint:true}),d=await fs.lstat(directory,{bigint:true});if(await fs.realpath(this.#backupRoot)!==root||identity(r)!==identity(rootStat)||r.isSymbolicLink()||identity(d)!==identity(own)||d.isSymbolicLink()||!d.isDirectory())throw Error('Recovery directory changed.');};
  const raw=await readVerified(path.join(directory,'manifest.json'),64*1024*1024,true);await check();
  const manifest=validateRecoveryManifest(JSON.parse(raw.bytes.toString('utf8')));
  return {root,directory,manifest,hash:raw.hash,authority:`${root}:${identity(rootStat)}:${identity(own)}`,check};
 }
 async list(){
  let entries;try{entries=await fs.readdir(this.#backupRoot,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return [];throw error;}
  const names=entries.filter(e=>e.isDirectory()&&!e.isSymbolicLink()&&validId(e.name)).map(e=>e.name).sort();
  if(names.length>1000)throw Error('There are more than 1,000 recovery records. Archive older backups before browsing recovery.');
  const result=[];
  for(const id of names){try{const {manifest}=await this.#capture(id);result.push({id,status:manifest.status,completed:manifest.completed,total:manifest.operations.length,output:manifest.roots.output});}catch(error){result.push({id,error:error.message});}}
  return result;
 }
 async #inspect(id){
  const record=await this.#capture(id),{manifest}=record,output=new FolderService(record.root);
  const descriptor=await output.select('a',manifest.roots.output);
  if(descriptor.path!==manifest.roots.output)throw Error('The recovery output path changed.');
  const current=await output.snapshot('a');
  if(current.identity!==manifest.rootIdentities.output)throw Error('The output root was replaced. Recovery cannot target the replacement.');
  const verified=new Map();
  for(const backup of manifest.backups){
   await record.check();const stored=await readVerified(path.join(record.directory,backup.file),backup.size);await record.check();
   if(stored.hash!==backup.hash||stored.size!==backup.size||stored.revision!==backup.backupRevision)throw Error(`Recovery backup changed: ${backup.path}`);
   verified.set(backup.path,stored);
  }
  const verifiedTemporary=new Map();
  for(const authority of manifest.temporaryIdentities||[]){
   const relative=path.relative(manifest.roots.output,authority.path).split(path.sep).join('/');
   if(!current.entries.has(relative))continue;
   const staged=manifest.staged.find(item=>item.index===manifest.activeOperation);if(!staged)throw Error('Temporary output has no staged source.');
   await output.safe('a',relative);await record.check();
   verifiedTemporary.set(relative,await verifyTemporaryPrefix(authority.path,authority,path.join(record.directory,staged.file),staged));await record.check();
  }
  const plan=planThreeWayRecovery(manifest,current,verified,verifiedTemporary);await record.check();
  const latest=await output.snapshot('a');if(signature(current)!==signature(latest))throw Error('Output changed while preparing recovery. Review it again.');
  return {record,plan,descriptor,output,current,verified,outputSignature:signature(current)};
 }
 async inspect(id){
  if(this.#executing)throw Error('Recovery is already running.');
  const inspected=await this.#inspect(id),token=randomUUID();this.#previews.clear();
  this.#previews.set(token,{id,journalHash:inspected.record.hash,authority:inspected.record.authority,outputSignature:inspected.outputSignature});
  return {token,id,output:inspected.descriptor,status:inspected.record.manifest.status,completed:inspected.record.manifest.completed,operations:structuredClone(inspected.plan.operations)};
 }
 async execute(token,options={}){
  if(this.#executing)throw Error('Recovery is already running.');
  const preview=this.#previews.get(token);if(!preview)throw Error('Review the recovery record again.');
  this.#previews.delete(token);this.#executing=true;
  let staging,stagingIdentity;
  try{
   const reviewed=await this.#inspect(preview.id);
   const assertReview=async()=>{const latest=await this.#inspect(preview.id);if(preview.authority!==latest.record.authority||preview.journalHash!==latest.record.hash||preview.outputSignature!==latest.outputSignature)throw Error('Recovery data or output changed after review.');};
   await assertReview();
   const tempRoot=await fs.realpath(os.tmpdir());
   const overlaps=(a,b)=>{const rel=path.relative(a,b);return !rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
   // Do not create even temporary staging content inside the selected output or backups.
   if(overlaps(reviewed.descriptor.path,tempRoot)||overlaps(reviewed.record.root,tempRoot))throw Error('The system temporary directory must be separate from the recovery output and backups.');
   staging=await fs.mkdtemp(path.join(tempRoot,'fc-recovery-stage-'));await fs.chmod(staging,0o700);
   stagingIdentity=identity(await fs.lstat(staging,{bigint:true}));
   const checkStaging=async()=>{const own=await fs.lstat(staging,{bigint:true});if(!own.isDirectory()||own.isSymbolicLink()||identity(own)!==stagingIdentity||await fs.realpath(staging)!==staging)throw Error('Recovery staging directory changed.');};
   const stageDirectories=new Map([[staging,stagingIdentity]]);
   const stageParents=async(relative)=>{
    await checkStaging();let directory=staging;
    for(const component of relative.split('/').slice(0,-1)){
     directory=path.join(directory,component);
     if(!stageDirectories.has(directory)){await fs.mkdir(directory,{mode:0o700});const created=await fs.lstat(directory,{bigint:true});if(!created.isDirectory()||created.isSymbolicLink())throw Error('Recovery staging parent changed.');stageDirectories.set(directory,identity(created));}
     const own=await fs.lstat(directory,{bigint:true});if(!own.isDirectory()||own.isSymbolicLink()||identity(own)!==stageDirectories.get(directory))throw Error('Recovery staging parent changed.');
    }
   };
   const operations=[];
   for(const op of reviewed.plan.operations){
    if(op.type!=='copy-file'){operations.push({...op});continue;}
    // The pure planner identifies an original backup. Resolve it only through this captured record.
    const entry=reviewed.plan.desired.get(op.path);
    if(entry.sourceKind!=='backup')throw Error('Recovery copy has no verified backup source.');
    const expected=reviewed.verified.get(op.path),source=path.join(reviewed.record.directory,entry.sourceFile),destination=path.join(staging,...op.path.split('/'));
    await reviewed.record.check();await stageParents(op.path);
    await stageVerified(source,destination,expected,entry.mode);await reviewed.record.check();await stageParents(op.path);
    const {sourceKind,sourceFile,...rest}=op;operations.push({...rest,sourceSide:'base',sourcePath:op.path});
   }
   const input=new FolderService(reviewed.record.root);await input.select('a',staging);const snapshot=await input.snapshot('a');
   if(snapshot.skipped)throw Error('Recovery staging scan was incomplete.');
   const checkRoots=async()=>{await reviewed.record.check();await checkStaging();};
   const validatePreview=async()=>{await assertReview();await checkRoots();if(signature(await input.snapshot('a'))!==signature(snapshot))throw Error('Recovery staged content changed.');};
   return await executeThreeWayPlan({id:randomUUID(),operations,inputs:{base:input,left:input,right:input},inputSnapshots:{base:snapshot,left:snapshot,right:snapshot},output:reviewed.output,targetSnapshot:reviewed.current,backupRoot:reviewed.record.root,checkRoots,validatePreview},options);
  }finally{
   // Never traverse a replacement staging directory during cleanup.
   if(staging){try{const own=await fs.lstat(staging,{bigint:true});if(own.isDirectory()&&!own.isSymbolicLink()&&identity(own)===stagingIdentity)await fs.rm(staging,{recursive:true,force:true});}catch{/* Staging cleanup must not hide a recovery result or its journal. */}}
   this.#executing=false;
  }
 }

 async verify(token){
  if(this.#executing)throw Error('Recovery is already running.');
  const preview=this.#previews.get(token);if(!preview)throw Error('Review the recovery record again.');
  try{const current=await this.#inspect(preview.id);if(preview.authority!==current.record.authority||preview.journalHash!==current.record.hash||preview.outputSignature!==current.outputSignature)throw Error('Recovery data or output changed after review.');return {token,id:preview.id,output:current.descriptor,operations:structuredClone(current.plan.operations)};}
  catch(error){this.#previews.delete(token);throw error;}
 }
}
module.exports={ThreeWayRecovery};
