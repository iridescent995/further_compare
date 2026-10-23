'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {setFolderModified,validateTimestampRequest}=require('../desktop/folder-timestamps.cjs');
const {FolderService}=require('../desktop/folders.cjs');
const initial=1600000000000, target=1700000000123, accessed=1500000000000;
async function fixture(run) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-times-'));
  try {
    const folder=path.join(root,'files'); await fs.mkdir(folder);
    for (const name of ['a','b']) await fs.writeFile(path.join(folder,name),name);
    await fs.mkdir(path.join(folder,'dir'));
    const service=new FolderService(path.join(root,'backups'));await service.select('a',folder);
    // Background readers on macOS can access newly created files asynchronously.
    // Let creation-triggered readers finish before installing the timestamp fixture.
    if (process.platform === 'darwin') await new Promise(resolve => setTimeout(resolve,100));
    for (const name of ['a','b']) await fs.utimes(path.join(folder,name),accessed/1000,initial/1000);
    await run(service,folder);
  } finally {await fs.rm(root,{recursive:true,force:true});}
}
test('timestamp requests reject traversal, roots, duplicates, invalid dates and oversized selections',()=>{
  for(const paths of [[],[''],['..'],['../a'],['dir/../a'],['/a'],['C:\\a'],['a\\b'],['a\0b'],['a','a'],Array.from({length:1001},(_,i)=>String(i))]) assert.throws(()=>validateTimestampRequest('a',paths,target));
  for(const date of [NaN,Infinity,1.2,-62135596800001,253402300800000,'1700000000000']) assert.throws(()=>validateTimestampRequest('a',['a'],date));
  assert.throws(()=>validateTimestampRequest('other',['a'],target));
  validateTimestampRequest('b',['dir/a'],-62135596800000);
});
test('timestamps update files and directories while preserving access time and content',()=>fixture(async(service,folder)=>{
  const result=await setFolderModified(service.safe.bind(service),'a',['a','dir'],target);
  assert.deepEqual(result,{changed:2});
  const stat=await fs.stat(path.join(folder,'a'));
  assert.ok(Math.abs(stat.mtimeMs-target)<1);assert.ok(Math.abs(stat.atimeMs-accessed)<1, `Access time changed from ${accessed} to ${stat.atimeMs}`);
  assert.equal(await fs.readFile(path.join(folder,'a'),'utf8'),'a');
  assert.ok(Math.abs((await fs.stat(path.join(folder,'dir'))).mtimeMs-target)<1);
}));
test('all entries preflight before mutation, including missing entries and symlinks',()=>fixture(async(service,folder)=>{
  await assert.rejects(setFolderModified(service.safe.bind(service),'a',['a','missing'],target),/ENOENT/);
  await fs.symlink(path.join(folder,'b'),path.join(folder,'link'));
  await assert.rejects(setFolderModified(service.safe.bind(service),'a',['a','link'],target),/Symbolic links/);
  assert.equal((await fs.stat(path.join(folder,'a'))).mtimeMs,initial);
  await assert.rejects(setFolderModified(service.safe.bind(service),'b',['a'],target),/Choose/);
}));
test('later permission failure rolls back earlier timestamp changes',{skip:process.platform==='win32'?'POSIX descriptor fault injection; Windows helper has separate runtime coverage':false},()=>fixture(async(service,folder)=>{
  const counts={};
  const safe=async(side,relative)=>{counts[relative]=(counts[relative]||0)+1;if(relative==='b'&&counts.b===3)throw new Error('EACCES: permission denied');return service.safe(side,relative);};
  await assert.rejects(setFolderModified(safe,'a',['a','b'],target),/Earlier timestamp changes were restored/);
  assert.ok(Math.abs((await fs.stat(path.join(folder,'a'))).mtimeMs-initial)<1);
  assert.equal((await fs.stat(path.join(folder,'b'))).mtimeMs,initial);
}));
test('replaced entries are never overwritten by rollback and report incomplete restoration',{skip:process.platform==='win32'?'POSIX descriptor fault injection; Windows helper has separate runtime coverage':false},()=>fixture(async(service,folder)=>{
  const counts={};
  const safe=async(side,relative)=>{
    counts[relative]=(counts[relative]||0)+1;
    if(relative==='b'&&counts.b===3){await fs.rename(path.join(folder,'a'),path.join(folder,'old-a'));await fs.writeFile(path.join(folder,'a'),'replacement');throw new Error('Entry changed');}
    return service.safe(side,relative);
  };
  await assert.rejects(setFolderModified(safe,'a',['a','b'],target),/Rollback incomplete: 1/);
  assert.equal(await fs.readFile(path.join(folder,'a'),'utf8'),'replacement');
  assert.ok(Math.abs((await fs.stat(path.join(folder,'old-a'))).mtimeMs-target)<1);
}));
test('revision changes during preflight prevent any timestamp mutation',{skip:process.platform==='win32'?'POSIX descriptor fault injection; Windows helper has separate runtime coverage':false},()=>fixture(async(service,folder)=>{
  let calls=0;
  const safe=async(side,relative)=>{if(++calls===3)await fs.appendFile(path.join(folder,'a'),'changed');return service.safe(side,relative);};
  await assert.rejects(setFolderModified(safe,'a',['a','b'],target),/changed/);
  assert.equal((await fs.stat(path.join(folder,'b'))).mtimeMs,initial);
  assert.equal(await fs.readFile(path.join(folder,'a'),'utf8'),'achanged');
}));
test('pre-epoch modified dates use explicit Date values instead of being interpreted as now',()=>fixture(async(service,folder)=>{
  const date=-100000000000;
  await setFolderModified(service.safe.bind(service),'a',['a'],date);
  assert.ok(Math.abs((await fs.stat(path.join(folder,'a'))).mtimeMs-date)<1);
}));
