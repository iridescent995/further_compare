const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { FolderService } = require('../desktop/folders.cjs');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'further-folders-'));
  t.after(() => fs.rm(root,{ recursive:true,force:true }));
  const a = path.join(root,'a'), b = path.join(root,'b');
  await fs.mkdir(a); await fs.mkdir(b);
  const service = new FolderService(path.join(root,'backups'));
  await service.select('a',a); await service.select('b',b);
  return {service,a,b,root};
}
test('hashes distinguish equal-sized files; merge backs up replaced content', async t => {
  const {service,a,b} = await fixture(t);
  await fs.writeFile(path.join(a,'x.txt'),'new'); await fs.writeFile(path.join(b,'x.txt'),'old');
  await fs.writeFile(path.join(b,'keep.txt'),'keep'); await fs.mkdir(path.join(a,'empty'));
  assert.equal((await service.scan()).rows.find(r => r.path==='x.txt').status,'changed');
  const plan = await service.preview('merge','a-to-b');
  const result = await service.execute(plan.id);
  assert.equal(await fs.readFile(path.join(b,'x.txt'),'utf8'),'new');
  assert.equal(await fs.readFile(path.join(result.backupPath,'files','x.txt'),'utf8'),'old');
  assert.equal(await fs.readFile(path.join(b,'keep.txt'),'utf8'),'keep');
  assert.ok((await fs.stat(path.join(b,'empty'))).isDirectory());
  await assert.rejects(service.execute(plan.id),/Preview/);
});
test('sync selected directory deletes children and preserves backups', async t => {
  const {service,b} = await fixture(t);
  await fs.mkdir(path.join(b,'extra')); await fs.writeFile(path.join(b,'extra','x'),'delete me');
  await fs.writeFile(path.join(b,'keep'),'keep');
  const result = await service.execute((await service.preview('sync','a-to-b',['extra','extra/x'])).id);
  await assert.rejects(fs.stat(path.join(b,'extra')), {code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(result.backupPath,'files','extra','x'),'utf8'),'delete me');
  assert.equal(await fs.readFile(path.join(b,'keep'),'utf8'),'keep');
});
test('stale content blocks execution even if size is unchanged', async t => {
  const {service,a,b} = await fixture(t);
  await fs.writeFile(path.join(a,'x'),'new'); await fs.writeFile(path.join(b,'x'),'old');
  const plan = await service.preview('merge','a-to-b');
  await fs.writeFile(path.join(b,'x'),'now');
  await assert.rejects(service.execute(plan.id),/changed after preview/);
  assert.equal(await fs.readFile(path.join(b,'x'),'utf8'),'now');
});
test('prevents overlapping roots, traversal, symlink access and binary reads',async t => {
  const {service,a,b,root} = await fixture(t);
  await fs.mkdir(path.join(a,'nested'));
  await assert.rejects(service.select('b',path.join(a,'nested')),/separate/);
  await assert.rejects(service.read('a','../outside'),/Invalid/);
  await fs.writeFile(path.join(root,'outside'),'secret');
  await fs.symlink(path.join(root,'outside'),path.join(a,'link'));
  await assert.rejects(service.read('a','link'),/Symbolic/);
  await fs.writeFile(path.join(a,'binary'),Buffer.from([0,1,2]));
  await assert.rejects(service.read('a','binary'),/Binary/);
  await fs.mkdir(path.join(b,'node_modules')); await fs.writeFile(path.join(b,'node_modules','skip'),'x');
  const scan = await service.scan();
  assert.equal(scan.skipped,2); assert.ok(!scan.rows.some(r=>r.path==='link'));
});
test('selected child creates missing parents and reverse direction works', async t => {
  const {service,a,b} = await fixture(t);
  await fs.mkdir(path.join(b,'nested')); await fs.writeFile(path.join(b,'nested','text'),'hello');
  await service.execute((await service.preview('merge','b-to-a',['nested/text'])).id);
  assert.equal((await service.read('a','nested/text')).content,'hello');
  assert.ok((await service.scan()).rows.every(r => r.status==='equal'));
});
test('file-directory conflicts are surfaced and cannot be merged automatically', async t => {
  const {service,a,b} = await fixture(t);
  await fs.mkdir(path.join(a,'x')); await fs.writeFile(path.join(a,'x','child'),'x');
  await fs.writeFile(path.join(b,'x'),'x');
  assert.deepEqual((await service.scan()).rows.map(r=>[r.path,r.status]),[['x','conflict']]);
  await assert.rejects(service.preview('merge','a-to-b'),/conflict/);
});
test('a symlink destination cannot redirect writes outside selected roots', async t => {
  const {service,a,b,root} = await fixture(t);
  await fs.writeFile(path.join(a,'x'),'replacement'); await fs.writeFile(path.join(root,'outside'),'safe');
  const plan = await service.preview('merge','a-to-b');
  await fs.symlink(path.join(root,'outside'),path.join(b,'x'));
  await assert.rejects(service.execute(plan.id),/Symbolic/);
  assert.equal(await fs.readFile(path.join(root,'outside'),'utf8'),'safe');
});
test('sync never recursively deletes ignored content', async t => {
  const {service,b} = await fixture(t);
  await fs.mkdir(path.join(b,'extra','node_modules'),{recursive:true});
  await fs.writeFile(path.join(b,'extra','node_modules','keep'),'safe');
  const result = await service.execute((await service.preview('sync','a-to-b')).id);
  assert.equal(result.retainedDirectories, 1);
  assert.equal(result.completed, 0);
  assert.equal(await fs.readFile(path.join(b,'extra','node_modules','keep'),'utf8'),'safe');
});

test('exact selection respects deselected children for merge and sync', async t => {
  const {service,a,b} = await fixture(t);
  await fs.mkdir(path.join(a,'source')); await fs.writeFile(path.join(a,'source','unchecked'),'keep out');
  await service.execute((await service.preview('merge','a-to-b',['source'])).id);
  assert.deepEqual(await fs.readdir(path.join(b,'source')), []);
  await fs.mkdir(path.join(b,'extra')); await fs.writeFile(path.join(b,'extra','unchecked'),'keep');
  const result = await service.execute((await service.preview('sync','a-to-b',['extra'])).id);
  assert.equal(result.retainedDirectories,1);
  assert.equal(await fs.readFile(path.join(b,'extra','unchecked'),'utf8'),'keep');
});
test('case aliases across folders cannot silently overwrite a different spelling', async t => {
  const {service,a,b} = await fixture(t);
  await fs.writeFile(path.join(a,'Readme'),'left'); await fs.writeFile(path.join(b,'README'),'right');
  await assert.rejects(service.preview('merge','a-to-b'),/filename spelling/);
  assert.equal(await fs.readFile(path.join(b,'README'),'utf8'),'right');
});
test('changed backup bytes abort before any target writes', async t => {
  const {service,a,b} = await fixture(t);
  await fs.writeFile(path.join(a,'x'),'new'); await fs.writeFile(path.join(b,'x'),'old');
  const plan = await service.preview('merge','a-to-b');
  const originalCopy = fs.copyFile;
  fs.copyFile = async (...args) => {
    await originalCopy(...args);
    if (args[1].includes(path.sep + 'backups' + path.sep)) await fs.writeFile(args[1],'bad');
  };
  try { await assert.rejects(service.execute(plan.id),/backing up/); }
  finally { fs.copyFile = originalCopy; }
  assert.equal(await fs.readFile(path.join(b,'x'),'utf8'),'old');
});
test('target edits during source copying are preserved', async t => {
  const {service,a,b} = await fixture(t);
  await fs.writeFile(path.join(a,'x'),'new'); await fs.writeFile(path.join(b,'x'),'old');
  const plan = await service.preview('merge','a-to-b');
  const originalCopy = fs.copyFile;
  fs.copyFile = async (...args) => {
    await originalCopy(...args);
    if (path.basename(args[1]).startsWith('.further-')) await fs.writeFile(path.join(b,'x'),'user edit');
  };
  try { await assert.rejects(service.execute(plan.id),/Target changed/); }
  finally { fs.copyFile = originalCopy; }
  assert.equal(await fs.readFile(path.join(b,'x'),'utf8'),'user edit');
  assert.deepEqual(await fs.readdir(b),['x']);
});
test('filesystem root selections cannot contain backup storage', async t => {
  const {service,root} = await fixture(t);
  await assert.rejects(service.select('a',path.parse(root).root),/separate|overlap/);
});
test('text reads enforce UTF-8 and size boundaries', async t => {
  const {service,a} = await fixture(t);
  await fs.writeFile(path.join(a,'invalid'),Buffer.from([0xc3,0x28]));
  await assert.rejects(service.read('a','invalid'),/UTF-8/);
  const big = await fs.open(path.join(a,'large'),'w');
  await big.truncate(10 * 1024 * 1024 + 1); await big.close();
  await assert.rejects(service.read('a','large'),/10 MB/);
});
test('copy retains executable permission bits on Unix', {skip:process.platform === 'win32'}, async t => {
  const {service,a,b} = await fixture(t);
  await fs.writeFile(path.join(a,'run.sh'),'#!/bin/sh\nexit 0\n',{mode:0o755});
  await service.execute((await service.preview('merge','a-to-b')).id);
  assert.equal((await fs.stat(path.join(b,'run.sh'))).mode & 0o777,0o755);
});

test('expanded node compares binary bytes even with equal sizes and timestamps', async t => {
  const {service,a,b} = await fixture(t);
  const timestamp = new Date('2025-01-01T00:00:00Z');
  for (const [dir, bytes] of [[a,[0,1,2]],[b,[0,1,3]]]) {
    await fs.writeFile(path.join(dir,'binary'), Buffer.from(bytes));
    await fs.utimes(path.join(dir,'binary'), timestamp, timestamp);
    await fs.writeFile(path.join(dir,'empty'), '');
    await fs.mkdir(path.join(dir,'nested'));
  }
  const rows = (await service.compareNode()).rows;
  assert.equal(rows.find(r => r.name === 'binary').status, 'changed');
  assert.equal(rows.find(r => r.name === 'empty').status, 'equal');
  assert.equal(rows.find(r => r.name === 'nested').status, 'directory');
  assert.equal(typeof rows.find(r => r.name === 'nested').mtimeA, 'number');
});

test('node hashing is lazy, cached and invalidates same-size edits with restored mtime', async t => {
  const {service,a,b} = await fixture(t);
  for (const dir of [a,b]) {
    await fs.writeFile(path.join(dir,'top'), 'same');
    await fs.mkdir(path.join(dir,'nested'));
    await fs.writeFile(path.join(dir,'nested','child'), 'same');
  }
  const opened = [], originalOpen = fs.open;
  fs.open = async (...args) => { opened.push(args[0]); return originalOpen(...args); };
  try {
    assert.equal((await service.compareNode()).rows.find(r => r.name === 'top').status,'equal');
    assert.equal(opened.length, 2);
    assert.ok(opened.every(file => path.basename(file) === 'top'));
    await service.compareNode();
    assert.equal(opened.length, 2, 'unchanged node uses cached hashes');
    const before = await fs.stat(path.join(b,'top'));
    await fs.writeFile(path.join(b,'top'),'diff');
    await fs.utimes(path.join(b,'top'), before.atime, before.mtime);
    opened.length = 0;
    assert.equal((await service.compareNode()).rows.find(r => r.name === 'top').status,'changed');
    assert.deepEqual(opened,[path.join(service.roots.b,'top')]);
    opened.length = 0;
    assert.equal((await service.compareNode('nested')).rows[0].status,'equal');
    assert.equal(opened.length,2);
    assert.ok(opened.every(file => path.basename(file) === 'child'));
  } finally { fs.open = originalOpen; }
});

test('size shortcuts avoid reads and symlinks are excluded from node comparisons', async t => {
  const {service,a,b,root} = await fixture(t);
  await fs.writeFile(path.join(a,'x'),'one'); await fs.writeFile(path.join(b,'x'),'four');
  await fs.writeFile(path.join(root,'secret'),'private');
  await fs.symlink(path.join(root,'secret'),path.join(a,'link'));
  const originalOpen = fs.open;
  fs.open = async () => { throw new Error('Content should not be read'); };
  try {
    const result = await service.compareNode();
    assert.equal(result.rows[0].status,'changed');
    assert.equal(result.rows.length,1);
    assert.equal(result.skipped,1);
  } finally { fs.open = originalOpen; }
});

test('node comparison rejects edits during hashing instead of reporting equal', async t => {
  const {service,a,b} = await fixture(t);
  await fs.writeFile(path.join(a,'x'),'same'); await fs.writeFile(path.join(b,'x'),'same');
  const originalOpen = fs.open;
  fs.open = async (...args) => {
    const handle = await originalOpen(...args);
    if (args[0] === path.join(service.roots.b,'x')) await fs.writeFile(path.join(a,'x'),'edit');
    return handle;
  };
  try { await assert.rejects(service.compareNode(), /changed while comparing/); }
  finally { fs.open = originalOpen; }
});

test('directory creation and file rename validate names and preserve existing entries', async t => {
  const {service,a,root} = await fixture(t);
  assert.deepEqual(await service.createDirectory('a','','new'), {path:'new',name:'new'});
  await fs.writeFile(path.join(a,'new','one'),'content');
  assert.deepEqual(await service.renameEntry('a','new/one','two'),{path:'new/two',name:'two'});
  assert.equal(await fs.readFile(path.join(a,'new','two'),'utf8'),'content');
  await assert.rejects(fs.stat(path.join(a,'new','one')), {code:'ENOENT'});
  await assert.rejects(service.createDirectory('a','','NEW'), /already exists/);
  await fs.writeFile(path.join(a,'new','existing'),'keep');
  await assert.rejects(service.renameEntry('a','new/two','existing'), /already exists/);
  // Directory rename is exercised separately on supported native platforms.
  for (const name of ['../escape', 'a/b', 'a\\b', '..', 'NUL', 'trailing.', '\0']) {
    await assert.rejects(service.createDirectory('a','',name), /valid/);
    await assert.rejects(service.renameEntry('a','new/two',name), /valid/);
  }
  await fs.symlink(root,path.join(a,'link'));
  await assert.rejects(service.createDirectory('a','link','escape'), /Symbolic/);
});

test('file rename refuses a destination appearing after collision checks', async t => {
  const {service,a} = await fixture(t);
  await fs.writeFile(path.join(a,'original'),'source');
  const originalLink = fs.link;
  fs.link = async (source,destination) => {
    await fs.writeFile(destination,'concurrent edit');
    return originalLink(source,destination);
  };
  try { await assert.rejects(service.renameEntry('a','original','new'), {code:'EEXIST'}); }
  finally { fs.link = originalLink; }
  assert.equal(await fs.readFile(path.join(a,'original'),'utf8'),'source');
  assert.equal(await fs.readFile(path.join(a,'new'),'utf8'),'concurrent edit');
});

test('native directory rename moves the whole tree without replacing entries', {skip:!['darwin','win32'].includes(process.platform)}, async t => {
  const {service,a} = await fixture(t);
  await fs.mkdir(path.join(a,'old','nested'),{recursive:true});
  await fs.writeFile(path.join(a,'old','nested','file.txt'),'preserve contents');
  const before=await fs.stat(path.join(a,'old'),{bigint:true});
  assert.deepEqual(await service.renameEntry('a','old','renamed Ω folder'),{path:'renamed Ω folder',name:'renamed Ω folder'});
  await assert.rejects(fs.stat(path.join(a,'old')),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(a,'renamed Ω folder','nested','file.txt'),'utf8'),'preserve contents');
  assert.equal((await fs.stat(path.join(a,'renamed Ω folder'),{bigint:true})).ino,before.ino);
  await fs.mkdir(path.join(a,'existing'));
  await assert.rejects(service.renameEntry('a','renamed Ω folder','existing'),/already exists/);
});
test('native directory rename refuses a destination created after availability checks', {skip:!['darwin','win32'].includes(process.platform)}, async t => {
  const {service,a}=await fixture(t);await fs.mkdir(path.join(a,'source'));await fs.writeFile(path.join(a,'source','keep'),'source');
  const available=service.assertAvailable.bind(service);
  service.assertAvailable=async(dir,name)=>{await available(dir,name);await fs.mkdir(path.join(dir,name));};
  await assert.rejects(service.renameEntry('a','source','new'),/rename failed|Exclusive/i);
  assert.equal(await fs.readFile(path.join(a,'source','keep'),'utf8'),'source');
  assert.deepEqual(await fs.readdir(path.join(a,'new')),[]);
});
test('native directory rename rejects a swapped symlink parent without redirecting', {skip:process.platform!=='darwin'}, async t => {
  const {service,a,root}=await fixture(t);await fs.mkdir(path.join(a,'parent','source'),{recursive:true});await fs.writeFile(path.join(a,'parent','source','keep'),'inside');
  const outside=path.join(root,'outside');await fs.mkdir(path.join(outside,'source'),{recursive:true});await fs.writeFile(path.join(outside,'source','keep'),'outside');
  const available=service.assertAvailable.bind(service);
  service.assertAvailable=async(dir,name)=>{await available(dir,name);await fs.rename(path.join(a,'parent'),path.join(a,'held'));await fs.symlink(outside,path.join(a,'parent'));};
  await assert.rejects(service.renameEntry('a','parent/source','new'),/Symbolic|source path|links/);
  assert.equal(await fs.readFile(path.join(outside,'source','keep'),'utf8'),'outside');assert.equal(await fs.readFile(path.join(a,'held','source','keep'),'utf8'),'inside');
  await assert.rejects(fs.stat(path.join(outside,'new')),{code:'ENOENT'});
  const stat=await fs.stat(path.join(a,'held','source'),{bigint:true});
  await assert.rejects(require('../desktop/rename-directory.cjs').renameDirectory(service.roots.a,'parent/source','new',stat),/source path|links/);
  assert.equal(await fs.readFile(path.join(outside,'source','keep'),'utf8'),'outside');
});

test('folder text opening detects UTF16 BOM and retains raw endings and format',async t=>{
 const {service,a}=await fixture(t),{encodeText}=require('../src/text-codec.cjs');
 const format={encoding:'utf16le',bom:true,lineEnding:'crlf'},content='Ω\r\n世界\r\n';
 await fs.writeFile(path.join(a,'unicode.txt'),encodeText(content,format));
 const opened=await service.read('a','unicode.txt');assert.equal(opened.content,content);assert.deepEqual(opened.format,format);
});
