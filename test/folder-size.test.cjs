'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {readFolderSize}=require('../desktop/folder-properties.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-size-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'dir','nested'),{recursive:true});await fs.writeFile(path.join(root,'dir','a'),'12345');await fs.writeFile(path.join(root,'dir','nested','b'),'1234567');return {root,safe:async(side,relative)=>path.join(root,relative)};}
test('folder sizes sum metadata recursively without reading file contents',async t=>{const {safe,root}=await fixture(t);const original=fs.readFile;fs.readFile=async()=>{throw Error('Contents must not be read');};try{assert.deepEqual(await readFolderSize(safe,'a','dir'),{sizeBytes:'12',files:2,folders:1,skipped:0,limited:false,complete:true});}finally{fs.readFile=original;}assert.equal(await fs.readFile(path.join(root,'dir','a'),'utf8'),'12345');});
test('folder size limits return explicit partial results',async t=>{const {safe}=await fixture(t);const result=await readFolderSize(safe,'b','dir',{maxEntries:1});assert.equal(result.complete,false);assert.equal(result.limited,true);assert.ok(result.files+result.folders<=1);for(const limit of [0,50001,1.5])await assert.rejects(readFolderSize(safe,'b','dir',{maxEntries:limit}));});
test('folder sizing skips links instead of following targets or cycles',async t=>{const {safe,root}=await fixture(t);try{await fs.symlink(path.join(root,'dir'),path.join(root,'dir','loop'),'dir');}catch(error){if(process.platform==='win32'&&error.code==='EPERM'){t.skip('Symlink privilege unavailable');return;}throw error;}const result=await readFolderSize(safe,'a','dir');assert.equal(result.sizeBytes,'12');assert.equal(result.skipped,1);assert.equal(result.complete,false);await assert.rejects(readFolderSize(safe,'a','dir/loop'),/regular folder/);});
test('folder sizes reject invalid paths, nonfolders and changing directory authority',async t=>{const {safe,root}=await fixture(t);for(const relative of ['../escape','/absolute','dir//nested'])await assert.rejects(readFolderSize(safe,'a',relative));await assert.rejects(readFolderSize(safe,'a','dir/a'),/regular folder/);await assert.rejects(readFolderSize(safe,'z','dir'));let calls=0;await assert.rejects(readFolderSize(async(side,relative)=>{if(relative==='dir'&&++calls===2)return path.join(root,'other');return safe(side,relative);},'a','dir'),/changed/);});

test('folder sizing observes cancellation before and during traversal',async t=>{const {safe}=await fixture(t);const early=new AbortController();early.abort();let calls=0;await assert.rejects(readFolderSize(async()=>{calls++;throw Error('must not read');},'a','dir',{signal:early.signal}),/cancelled/);assert.equal(calls,0);const active=new AbortController();await assert.rejects(readFolderSize(async(side,relative)=>{if(relative!=='dir')active.abort();return safe(side,relative);},'a','dir',{signal:active.signal}),/cancelled/);});

test('folder sizing tolerates access-time-only changes but rejects size or identity changes',async t=>{
 const {safe}=await fixture(t),original=fs.lstat;
 try{
  let sequence=0;fs.lstat=async(...args)=>{const stat=await original(...args);if(stat.isFile())stat.atimeNs+=BigInt(++sequence);return stat;};
  assert.equal((await readFolderSize(safe,'a','dir')).sizeBytes,'12');
  for(const field of ['size','ino','mtimeNs','ctimeNs','mode']){sequence=0;fs.lstat=async(...args)=>{const stat=await original(...args);if(stat.isFile())stat[field]+=BigInt(++sequence)*2n;return stat;};await assert.rejects(readFolderSize(safe,'a','dir'),/changed/);}
 }finally{fs.lstat=original;}
});
