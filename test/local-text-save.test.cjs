'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const snapshots=require('../desktop/local-file-snapshot.cjs');
const {saveLocalText,createLocalTextSaver}=require('../desktop/local-text-save.cjs');
async function fixture(t) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-text-save-')));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 return {root,file:path.join(root,'file.txt')};
}
function afterSync(action,extra={}) {
 return {...fs,...extra,async open(...args){
  const handle=await fs.open(...args),sync=handle.sync.bind(handle);
  handle.sync=async()=>{await sync();await action(args[0]);};return handle;
 }};
}
test('new file publishes complete bytes exclusively and cleans staging',async t=>{
 const {root,file}=await fixture(t);const written=await saveLocalText(file,Buffer.from('complete'));
 assert.equal(await fs.readFile(file,'utf8'),'complete');
 const actual=await snapshots.capture(file);assert.equal(actual.dev,written.dev);assert.equal(actual.ino,written.ino);
 assert.deepEqual(await fs.readdir(root),['file.txt']);
});
test('overwrite preserves ordinary permissions and returns the published identity',async t=>{
 const {root,file}=await fixture(t);await fs.writeFile(file,'old',{mode:0o640});
 const previous=await fs.stat(file,{bigint:true});
 const written=await saveLocalText(file,Buffer.from('replacement'));
 assert.notEqual(written.ino,previous.ino);assert.equal(await fs.readFile(file,'utf8'),'replacement');
 if(process.platform!=='win32')assert.equal((await fs.stat(file)).mode&0o777,0o640);
 assert.deepEqual(await fs.readdir(root),['file.txt']);
});
test('target mutation during staging fails without overwriting concurrent contents',async t=>{
 const {root,file}=await fixture(t);await fs.writeFile(file,'old');
 const save=createLocalTextSaver({fs:afterSync(()=>fs.writeFile(file,'concurrent'))});
 await assert.rejects(save(file,Buffer.from('ours')),/changed/);
 assert.equal(await fs.readFile(file,'utf8'),'concurrent');assert.deepEqual(await fs.readdir(root),['file.txt']);
});
test('new target created during staging is preserved',async t=>{
 const {root,file}=await fixture(t);
 const save=createLocalTextSaver({fs:afterSync(()=>fs.writeFile(file,'concurrent'))});
 await assert.rejects(save(file,Buffer.from('ours')),/changed/);
 assert.equal(await fs.readFile(file,'utf8'),'concurrent');assert.deepEqual(await fs.readdir(root),['file.txt']);
});
test('exclusive link rejects target created after the absence check',async t=>{
 const {root,file}=await fixture(t);
 const save=createLocalTextSaver({fs:{...fs,async link(source,target){await fs.writeFile(target,'concurrent');return fs.link(source,target);}}});
 await assert.rejects(save(file,Buffer.from('ours')),{code:'EEXIST'});
 assert.equal(await fs.readFile(file,'utf8'),'concurrent');assert.deepEqual(await fs.readdir(root),['file.txt']);
});
test('parent replacement during staging aborts publication',async t=>{
 const {root}=await fixture(t),parent=path.join(root,'parent'),moved=path.join(root,'old-parent');
 await fs.mkdir(parent);const file=path.join(parent,'file');await fs.writeFile(file,'old');
 const save=createLocalTextSaver({fs:afterSync(async()=>{await fs.rename(parent,moved);await fs.mkdir(parent);await fs.writeFile(file,'foreign');})});
 await assert.rejects(save(file,Buffer.from('ours')),/changed|ENOENT/);
 assert.equal(await fs.readFile(file,'utf8'),'foreign');assert.equal(await fs.readFile(path.join(moved,'file'),'utf8'),'old');
});
test('symlink parent aliases work but retargeting aborts publication',async t=>{
 const {root}=await fixture(t),first=path.join(root,'first'),second=path.join(root,'second'),alias=path.join(root,'alias');
 await fs.mkdir(first);await fs.mkdir(second);await fs.symlink(first,alias);
 await saveLocalText(path.join(alias,'stable'),Buffer.from('stable'));
 assert.equal(await fs.readFile(path.join(first,'stable'),'utf8'),'stable');
 const save=createLocalTextSaver({fs:afterSync(async()=>{await fs.unlink(alias);await fs.symlink(second,alias);})});
 await assert.rejects(save(path.join(alias,'file'),Buffer.from('ours')),/changed/);
 assert.deepEqual(await fs.readdir(first),['stable']);assert.deepEqual(await fs.readdir(second),[]);
});
test('leaf symlinks and directories are rejected without touching referents',async t=>{
 const {root,file}=await fixture(t),referent=path.join(root,'referent');await fs.writeFile(referent,'old');await fs.symlink(referent,file);
 await assert.rejects(saveLocalText(file,Buffer.from('ours')),/regular file/);
 assert.equal(await fs.readFile(referent,'utf8'),'old');await assert.rejects(saveLocalText(root,Buffer.from('ours')),/regular file/);
});
test('lost owner cancels before publication and cleans its own staging file',async t=>{
 const {root,file}=await fixture(t);let active=true;
 const save=createLocalTextSaver({fs:afterSync(async()=>{active=false;})});
 await assert.rejects(save(file,Buffer.from('ours'),{current(){if(!active)throw Error('owner changed');}}),/owner changed/);
 assert.deepEqual(await fs.readdir(root),[]);
});
test('cleanup preserves a foreign replacement at the staging pathname',async t=>{
 const {root,file}=await fixture(t);
 const save=createLocalTextSaver({fs:afterSync(async temporary=>{await fs.rename(temporary,`${temporary}.ours`);await fs.writeFile(temporary,'evil');})});
 await assert.rejects(save(file,Buffer.from('ours')),/changed/);
 const files=await fs.readdir(root),foreign=files.find(name=>name.endsWith('.tmp'));
 assert.ok(foreign);assert.equal(await fs.readFile(path.join(root,foreign),'utf8'),'evil');
 await assert.rejects(fs.stat(file),{code:'ENOENT'});
});
test('sync failure leaves destination untouched and removes owned staging',async t=>{
 const {root,file}=await fixture(t);await fs.writeFile(file,'old');
 const save=createLocalTextSaver({fs:{...fs,async open(...args){const handle=await fs.open(...args);handle.sync=async()=>{throw Error('disk sync failed');};return handle;}}});
 await assert.rejects(save(file,Buffer.from('ours')),/disk sync failed/);
 assert.equal(await fs.readFile(file,'utf8'),'old');assert.deepEqual(await fs.readdir(root),['file.txt']);
});
test('preexisting staging collision is never deleted',async t=>{
 const {root,file}=await fixture(t),temporary=path.join(root,'.file.txt.fixed.tmp');await fs.writeFile(temporary,'foreign');
 const save=createLocalTextSaver({uuid:()=> 'fixed'});
 await assert.rejects(save(file,Buffer.from('ours')),{code:'EEXIST'});assert.equal(await fs.readFile(temporary,'utf8'),'foreign');
});
test('same-content destination inode replacement during staging is rejected',async t=>{
 const {root,file}=await fixture(t);await fs.writeFile(file,'old');
 const save=createLocalTextSaver({fs:afterSync(async()=>{await fs.rename(file,`${file}.old`);await fs.writeFile(file,'old');})});
 await assert.rejects(save(file,Buffer.from('ours')),/changed/);
 assert.equal(await fs.readFile(file,'utf8'),'old');assert.deepEqual((await fs.readdir(root)).sort(),['file.txt','file.txt.old']);
});
test('failure of exclusive publication never falls back to an overwriting rename',async t=>{
 const {root,file}=await fixture(t);let renamed=false;
 const save=createLocalTextSaver({renameExclusive:async()=>{throw Object.assign(Error('exclusive rename unsupported'),{code:'ENOTSUP'});},fs:{...fs,async link(){throw Object.assign(Error('links unsupported'),{code:'ENOTSUP'});},async rename(){renamed=true;}}});
 await assert.rejects(save(file,Buffer.from('ours')),{code:'ENOTSUP'});assert.equal(renamed,false);assert.deepEqual(await fs.readdir(root),[]);
});
test('same-inode edits between initial stat and snapshot capture cannot authorize stale permissions',async t=>{
 const {root,file}=await fixture(t);await fs.writeFile(file,'old',{mode:0o640});
 const before=await fs.lstat(file,{bigint:true});let mutated=false;
 const save=createLocalTextSaver({snapshots:{...snapshots,async capture(target){
  if(target===file&&!mutated){mutated=true;await fs.writeFile(file,'concurrent update');if(process.platform!=='win32')await fs.chmod(file,0o600);}
  return snapshots.capture(target);
 }}});
 await assert.rejects(save(file,Buffer.from('ours')),/changed/);
 const after=await fs.lstat(file,{bigint:true});assert.equal(after.ino,before.ino);
 assert.equal(await fs.readFile(file,'utf8'),'concurrent update');
 if(process.platform!=='win32')assert.equal(Number(after.mode&0o777n),0o600);
 assert.deepEqual(await fs.readdir(root),['file.txt']);
});

test('native exclusive file rename publishes after unsupported hard links', {skip:process.platform!=='darwin'},async t=>{
 const {root,file}=await fixture(t);
 const save=createLocalTextSaver({fs:{...fs,async link(){throw Object.assign(Error('links unsupported'),{code:'ENOTSUP'});}}});
 const written=await save(file,Buffer.from('complete'));
 assert.equal(await fs.readFile(file,'utf8'),'complete');assert.equal((await fs.lstat(file,{bigint:true})).ino,written.ino);
 assert.deepEqual(await fs.readdir(root),['file.txt']);
});
test('native fallback refuses a target created during exclusive publication', {skip:process.platform!=='darwin'},async t=>{
 const {root,file}=await fixture(t);
 const save=createLocalTextSaver({fs:{...fs,async link(){await fs.writeFile(file,'foreign');throw Object.assign(Error('links unsupported'),{code:'ENOTSUP'});}}});
 await assert.rejects(save(file,Buffer.from('ours')),/Exclusive.*rename failed/);
 assert.equal(await fs.readFile(file,'utf8'),'foreign');assert.deepEqual(await fs.readdir(root),['file.txt']);
});
test('native file helper rejects source symlinks and mismatched identities', {skip:process.platform!=='darwin'},async t=>{
 const {root,file}=await fixture(t),{renameFileExclusive}=require('../desktop/rename-directory.cjs');
 await fs.writeFile(file,'data');const stat=await fs.lstat(file,{bigint:true});
 await assert.rejects(renameFileExclusive(root,'file.txt','destination',{...stat,ino:stat.ino+1n}),/changed/);
 await fs.symlink(file,path.join(root,'alias'));const link=await fs.lstat(path.join(root,'alias'),{bigint:true});
 await assert.rejects(renameFileExclusive(root,'alias','destination',link),/changed/);
 assert.equal(await fs.readFile(file,'utf8'),'data');await assert.rejects(fs.stat(path.join(root,'destination')),{code:'ENOENT'});
});

test('same-inode staged content substitution after sync cannot replace destination',async t=>{
 const {root,file}=await fixture(t);await fs.writeFile(file,'original');
 const save=createLocalTextSaver({fs:afterSync(temporary=>fs.writeFile(temporary,'foreign!'))});
 await assert.rejects(save(file,Buffer.from('intended')),/changed/);
 assert.equal(await fs.readFile(file,'utf8'),'original');assert.deepEqual(await fs.readdir(root),['file.txt']);
});
