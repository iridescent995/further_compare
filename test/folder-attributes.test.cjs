'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {previewFolderAttributes:preview,setFolderAttributes:apply,validateAttributeSelection,validateAttributeChanges}=require('../desktop/folder-attributes.cjs');
const posix={skip:process.platform==='win32'?'POSIX permissions; Windows adapter tested separately':false};
async function fixture(run) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-attrs-'));
  try {
    for (const name of ['a','b']) {await fs.writeFile(path.join(root,name),name);await fs.chmod(path.join(root,name),0o640);}
    await fs.mkdir(path.join(root,'dir'));await fs.chmod(path.join(root,'dir'),0o750);
    await fs.writeFile(path.join(root,'dir/child'),'child');await fs.chmod(path.join(root,'dir/child'),0o640);
    const safe=async(side,relative)=>path.join(root,relative);
    await run({root,safe,mode:async name=>(await fs.stat(path.join(root,name))).mode & 0o7777});
  } finally { await fs.chmod(path.join(root,'dir'),0o750).catch(()=>{});await fs.rm(root,{recursive:true,force:true}); }
}
test('attribute validation bounds selection and portable editable masks',()=>{
  for(const paths of [[],[''],['../a'],['a/../b'],['/a'],['C:\\a'],['a\\b'],['a\0b'],['a','a'],Array.from({length:1001},(_,i)=>String(i))]) assert.throws(()=>validateAttributeSelection('a',paths));
  assert.throws(()=>validateAttributeSelection('x',['a']));
  for(const changes of [{},{setMask:0o1000,clearMask:0},{setMask:1,clearMask:1},{setMask:-1,clearMask:0},{setMask:1.5,clearMask:0},{setMask:0,clearMask:0,other:1}]) assert.throws(()=>validateAttributeChanges(changes,'posix'));
  validateAttributeChanges({setMask:0o777,clearMask:0},'posix');
  validateAttributeChanges({setMask:0x27,clearMask:0},'win32');
  assert.throws(()=>validateAttributeChanges({setMask:0x10,clearMask:0},'win32'));
});
test('preview is JSON-safe and permissions apply only to selected entries',posix,()=>fixture(async({safe,mode})=>{
  const result=await preview(safe,'a',['a','dir']);
  assert.equal(result.platform,'posix');assert.equal(result.entries[0].mode,0o640);assert.deepEqual(JSON.parse(JSON.stringify(result)),result);
  const outcome=await apply(safe,'a',['a','dir'],{setMask:0o004,clearMask:0o020},result.entries);
  assert.equal(outcome.changed,2);assert.equal(await mode('a'),0o644);assert.equal(await mode('dir'),0o754);assert.equal(await mode('dir/child'),0o640);
}));
test('special permission bits are preserved and no-op changes do not touch ctime',posix,()=>fixture(async({root,safe,mode})=>{
  await fs.chmod(path.join(root,'dir'),0o1750);
  const first=await preview(safe,'a',['dir']);await apply(safe,'a',['dir'],{setMask:0o004,clearMask:0},first.entries);assert.equal(await mode('dir'),0o1754);
  const before=await fs.stat(path.join(root,'dir'),{bigint:true}),next=await preview(safe,'a',['dir']);
  assert.equal((await apply(safe,'a',['dir'],{setMask:0o004,clearMask:0},next.entries)).changed,0);
  assert.equal((await fs.stat(path.join(root,'dir'),{bigint:true})).ctimeNs,before.ctimeNs);
}));
test('reviewed selection and changed contents reject before any write',posix,()=>fixture(async({root,safe,mode})=>{
  const review=await preview(safe,'a',['a','b']);
  await assert.rejects(apply(safe,'a',['b','a'],{setMask:1,clearMask:0},review.entries),/Review/);
  await fs.appendFile(path.join(root,'b'),'changed');
  await assert.rejects(apply(safe,'a',['a','b'],{setMask:1,clearMask:0},review.entries),/changed/);
  assert.equal(await mode('a'),0o640);
}));
test('symlinks, hard links and missing paths are rejected before changes',posix,()=>fixture(async({root,safe,mode})=>{
  await fs.symlink(path.join(root,'b'),path.join(root,'link'));await fs.link(path.join(root,'b'),path.join(root,'hard'));
  await assert.rejects(preview(safe,'a',['link']),/regular/);await assert.rejects(preview(safe,'a',['hard']),/Hard-linked/);
  const review=await preview(safe,'a',['a']);
  await fs.unlink(path.join(root,'a'));await fs.symlink(path.join(root,'b'),path.join(root,'a'));
  await assert.rejects(apply(safe,'a',['a'],{setMask:1,clearMask:0},review.entries),/regular/);
  assert.equal(await mode('b'),0o640);await assert.rejects(preview(safe,'a',['missing']),/ENOENT/);
}));
test('replacement since review rejects mutation',posix,()=>fixture(async({root,safe,mode})=>{
  const review=await preview(safe,'a',['a']);await fs.rename(path.join(root,'a'),path.join(root,'old'));await fs.writeFile(path.join(root,'a'),'replacement');await fs.chmod(path.join(root,'a'),0o600);
  await assert.rejects(apply(safe,'a',['a'],{setMask:1,clearMask:0},review.entries),/changed/);assert.equal(await mode('a'),0o600);assert.equal(await mode('old'),0o640);
}));
test('failure on a later item rolls back previous permission writes',posix,()=>fixture(async({safe,mode})=>{
  const review=await preview(safe,'a',['a','b']),counts={};
  const fault=async(side,relative)=>{counts[relative]=(counts[relative]||0)+1;if(relative==='b'&&counts.b===4)throw Error('Injected failure');return safe(side,relative);};
  await assert.rejects(apply(fault,'a',['a','b'],{setMask:1,clearMask:0},review.entries),/Earlier permission changes were restored/);
  assert.equal(await mode('a'),0o640);assert.equal(await mode('b'),0o640);
}));
test('rollback refuses replaced paths and reports incomplete restoration',posix,()=>fixture(async({root,safe,mode})=>{
  const review=await preview(safe,'a',['a','b']),counts={};
  const fault=async(side,relative)=>{counts[relative]=(counts[relative]||0)+1;if(relative==='b'&&counts.b===4){await fs.rename(path.join(root,'a'),path.join(root,'old'));await fs.writeFile(path.join(root,'a'),'replacement');await fs.chmod(path.join(root,'a'),0o600);throw Error('Injected failure');}return safe(side,relative);};
  await assert.rejects(apply(fault,'a',['a','b'],{setMask:1,clearMask:0},review.entries),/Rollback incomplete: 1/);
  assert.equal(await mode('a'),0o600);assert.equal(await mode('old'),0o641);
}));

test('selected parent and child apply deepest first',posix,()=>fixture(async({safe,mode})=>{
  const review=await preview(safe,'a',['dir','dir/child']);
  const checks=[];
  const traced=async(side,relative)=>{checks.push(relative);return safe(side,relative);};
  const result=await apply(traced,'a',['dir','dir/child'],{setMask:0o004,clearMask:0},review.entries);
  assert.equal(result.changed,2);assert.equal(await mode('dir'),0o754);assert.equal(await mode('dir/child'),0o644);
  assert.deepEqual(checks.slice(-4),['dir/child','dir/child','dir','dir']);
}));
