const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { FolderService } = require('../desktop/folders.cjs');
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'further-browser-'));
  t.after(() => fs.rm(root, {recursive:true,force:true}));
  const a = path.join(root,'a'), b = path.join(root,'b');
  await fs.mkdir(a); await fs.mkdir(b);
  const service = new FolderService(path.join(root,'backups'));
  await service.select('a',a); await service.select('b',b);
  return {service,a,b};
}
test('browsing is shallow, reports presence, and never claims equal file contents', async t => {
  const {service,a,b} = await setup(t);
  await fs.mkdir(path.join(a,'child')); await fs.writeFile(path.join(a,'child','nested'),'x');
  await fs.writeFile(path.join(a,'same-size'),'one'); await fs.writeFile(path.join(b,'same-size'),'two');
  await fs.writeFile(path.join(b,'right-only'),'r');
  service.snapshot = () => { throw new Error('Browsing must not hash files'); };
  const listing = await service.list();
  assert.equal(listing.rows.length,3);
  assert.equal(listing.rows.find(r=>r.name==='same-size').status,'unchecked');
  assert.equal(listing.rows.find(r=>r.name==='right-only').kindA,null);
  assert.equal(listing.rows.find(r=>r.name==='child').status,'left');
  assert.equal((await service.list('child')).rows[0].path,'child/nested');
  await assert.rejects(service.list('../escape'),/Invalid relative/);
  await fs.symlink(a,path.join(b,'link'));
  await assert.rejects(service.list('link'),/Symbolic/);
});
test('selected folder copy recurses, backs up overwrites, ignores unrelated changes', async t => {
  const {service,a,b} = await setup(t);
  await fs.mkdir(path.join(a,'child')); await fs.mkdir(path.join(b,'child'));
  await fs.writeFile(path.join(a,'child','x'),'new'); await fs.writeFile(path.join(b,'child','x'),'old');
  await fs.writeFile(path.join(b,'unrelated'),'old');
  const plan = await service.previewAction('copy','a',['child']);
  await fs.writeFile(path.join(b,'unrelated'),'changed');
  const result = await service.execute(plan.id);
  assert.equal(await fs.readFile(path.join(b,'child','x'),'utf8'),'new');
  assert.equal(await fs.readFile(path.join(result.backupPath,'files','child','x'),'utf8'),'old');
  assert.equal(await fs.readFile(path.join(b,'unrelated'),'utf8'),'changed');
});
test('delete targets selected side even where its counterpart differs in kind', async t => {
  const {service,a,b} = await setup(t);
  await fs.mkdir(path.join(a,'child')); await fs.writeFile(path.join(a,'child','x'),'keep backup');
  await fs.writeFile(path.join(b,'child'),'counterpart');
  const plan = await service.previewAction('delete','a',['child']);
  const result = await service.execute(plan.id);
  await assert.rejects(fs.stat(path.join(a,'child')), {code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(b,'child'),'utf8'),'counterpart');
  assert.equal(await fs.readFile(path.join(result.backupPath,'files','child','x'),'utf8'),'keep backup');
});
test('targeted actions reject stale selected files and ambiguous filenames', async t => {
  const {service,a,b} = await setup(t);
  await fs.writeFile(path.join(a,'name'),'new'); await fs.writeFile(path.join(b,'name'),'old');
  const plan = await service.previewAction('delete','b',['name']);
  await fs.writeFile(path.join(b,'name'),'edit');
  await assert.rejects(service.execute(plan.id),/changed after preview/);
  await fs.unlink(path.join(b,'name'));
  await fs.writeFile(path.join(b,'NAME'),'alias');
  await assert.rejects(service.previewAction('copy','a',['name']),/Conflicting filename/);
});
test('delete works with only one selected root and still backs up the selected file', async t => {
  const {service,a} = await setup(t);
  delete service.roots.b;
  await fs.writeFile(path.join(a,'alone'),'saved');
  const plan = await service.previewAction('delete','a',['alone']);
  const result = await service.execute(plan.id);
  await assert.rejects(fs.stat(path.join(a,'alone')), {code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(result.backupPath,'files','alone'),'utf8'),'saved');
});
test('refreshing a removed browsed directory returns an empty listing', async t => {
  const {service,a} = await setup(t);
  await fs.mkdir(path.join(a,'temporary'));
  await fs.writeFile(path.join(a,'temporary','file'),'x');
  assert.equal((await service.list('temporary')).rows.length,1);
  await fs.rm(path.join(a,'temporary'),{recursive:true});
  assert.deepEqual((await service.list('temporary')).rows,[]);
});

test('new files are empty, exclusively created and constrained to valid selected directories', async t => {
 const {service,a}=await setup(t);
 await fs.mkdir(path.join(a,'child'));
 assert.deepEqual(await service.createFile('a','child','draft.txt'),{path:'child/draft.txt',name:'draft.txt'});
 assert.equal(await fs.readFile(path.join(a,'child','draft.txt'),'utf8'),'');
 await fs.writeFile(path.join(a,'child','draft.txt'),'preserve');
 await assert.rejects(service.createFile('a','child','draft.txt'),/exists/);
 await assert.rejects(service.createFile('a','child','DRAFT.txt'),/exists/);
 await assert.rejects(service.createFile('a','child','../escape'),/name/);
 await assert.rejects(service.createFile('a','../','escape'),/relative/);
 assert.equal(await fs.readFile(path.join(a,'child','draft.txt'),'utf8'),'preserve');
 const available=service.assertAvailable.bind(service);
 service.assertAvailable=async(directory,name)=>{await available(directory,name);await fs.writeFile(path.join(directory,name),'race winner');};
 await assert.rejects(service.createFile('a','child','race.txt'),/EEXIST/);
 assert.equal(await fs.readFile(path.join(a,'child','race.txt'),'utf8'),'race winner');
});
