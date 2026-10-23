'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {FolderService} = require('../desktop/folders.cjs');
const {validateFolderRules} = require('../desktop/folder-rules.cjs');
const {encodeText, MAX_BYTES} = require('../src/text-codec.cjs');
async function fixture(t, left, right) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'fc-text-rules-')));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  const a = path.join(root, 'a'), b = path.join(root, 'b');
  await fs.mkdir(a); await fs.mkdir(b);
  await fs.writeFile(path.join(a, 'x'), left); await fs.writeFile(path.join(b, 'x'), right);
  const service = new FolderService(path.join(root, 'backups'));
  await service.select('a', a); await service.select('b', b);
  const compare = async () => (await service.compareNode('', {mode:'text-whitespace'})).rows[0];
  return {service, a, b, compare};
}
test('text rules normalize horizontal whitespace and line endings but preserve exact provenance', async t => {
  const {compare, a, b} = await fixture(t, 'one two\r\n\tthree\r', 'onetwo\nthree\n');
  assert.equal((await compare()).status, 'equal');
  assert.equal((await compare()).comparison, 'text-normalized');
  await fs.copyFile(path.join(a, 'x'), path.join(b, 'x'));
  assert.equal((await compare()).status, 'equal');
  assert.equal((await compare()).comparison, 'content');
});
test('text rules retain content, blank lines, final newline and non-ASCII whitespace', async t => {
  const {compare, b} = await fixture(t, 'a b\nc\n', 'ab\nd\n');
  for (const text of ['ab\nd\n', 'ab\n\nc\n', 'ab\nc', 'a\u00a0b\nc\n', 'abc\n']) {
    await fs.writeFile(path.join(b, 'x'), text);
    const row = await compare();
    assert.equal(row.status, 'changed', JSON.stringify(text));
    assert.equal(row.comparison, 'text-normalized');
  }
});
test('BOM UTF-16 LE and BE normalize against UTF-8', async t => {
  const {compare, a} = await fixture(t, '', 'hello世界\n');
  for (const encoding of ['utf16le', 'utf16be']) {
    await fs.writeFile(path.join(a, 'x'), encodeText('hello 世界\r\n', {encoding,bom:true,lineEnding:'crlf'}));
    assert.equal((await compare()).status, 'equal');
    assert.equal((await compare()).comparison, 'text-normalized');
  }
});
test('binary, undecodable and oversized content falls back to byte comparison', async t => {
  const {compare, a, b} = await fixture(t, '', 'ab');
  for (const bytes of [Buffer.from('a\0b'), Buffer.from([0xff,0x20]), Buffer.from('a\x01 b'), Buffer.from('a\u0085 b'), Buffer.alloc(MAX_BYTES+1, 32)]) {
    await fs.writeFile(path.join(a, 'x'), bytes);
    assert.equal((await compare()).status, 'changed');
    assert.equal((await compare()).comparison, 'content');
  }
  await fs.copyFile(path.join(a, 'x'), path.join(b, 'x'));
  assert.equal((await compare()).status, 'equal');
  assert.equal((await compare()).comparison, 'content');
});
test('normalized cache stores only hashes and invalidates even with restored size and mtime', async t => {
  const {compare, service, b} = await fixture(t, 'a b', 'ab ');
  assert.equal((await compare()).status, 'equal');
  for (const entry of service.hashCache.values()) {
    assert.deepEqual(Object.keys(entry).sort(), ['hash','normalizedHash']);
    assert.match(entry.hash, /^[a-f0-9]{64}$/);
    assert.match(entry.normalizedHash, /^[a-f0-9]{64}$/);
  }
  const file = path.join(b, 'x'), before = await fs.stat(file);
  await fs.writeFile(file, 'cd '); await fs.utimes(file, before.atime, before.mtime);
  assert.equal((await compare()).status, 'changed');
});
test('copy previews remain exact for text-normalized equal files', async t => {
  const {compare, service} = await fixture(t, 'a b\r\n', 'ab\n');
  assert.equal((await compare()).status, 'equal');
  const plan = await service.previewAction('copy', 'a', ['x']);
  assert.ok(plan.operations.some(op => op.path === 'x' && op.action === 'copy' && op.overwrite));
});
test('text normalization does not hide IO or revision failures', async t => {
  const {compare, b} = await fixture(t, 'a b', 'ab');
  const originalOpen = fs.open;
  fs.open = async (...args) => {
    if (args[0] === path.join(b, 'x')) throw new Error('Injected read failure');
    return originalOpen(...args);
  };
  try { await assert.rejects(compare(), /Injected read failure/); }
  finally { fs.open = originalOpen; }
  fs.open = async (...args) => {
    const handle = await originalOpen(...args);
    if (args[0] === path.join(b, 'x')) {
      const stat = handle.stat.bind(handle);
      let calls = 0;
      handle.stat = async (...statArgs) => {
        const value = await stat(...statArgs);
        if (++calls === 2) value.ctimeNs += 1n;
        return value;
      };
    }
    return handle;
  };
  try { await assert.rejects(compare(), /file changed while being read/); }
  finally { fs.open = originalOpen; }
});
test('text rules retain strict validation', () => {
  assert.deepEqual(validateFolderRules({mode:'text-whitespace'}), {mode:'text-whitespace',timeToleranceMs:0});
  for (const value of [{mode:'text-whitespace',ignoreCase:true},{mode:'text-whitespace',timeToleranceMs:-1},{mode:'text whitespace'},null]) {
    assert.throws(() => validateFolderRules(value), /folder comparison rules/);
  }
});

test('text-content ignores encoding and line endings while retaining case and spacing', async t => {
 const {service,a,b}=await fixture(t,'','Hello world\n');
 const compare=async()=> (await service.compareNode('',{mode:'text-content'})).rows[0];
 for(const encoding of ['utf8','utf16le','utf16be']){
  await fs.writeFile(path.join(a,'x'),encodeText('Hello world\r\n',{encoding,bom:true,lineEnding:'crlf'}));
  const row=await compare();assert.equal(row.status,'equal');assert.equal(row.comparison,'text-normalized');
 }
 for(const value of ['hello world\n','Helloworld\n','Hello\tworld\n','Hello world','Hello world\n\n']){
  await fs.writeFile(path.join(b,'x'),value);assert.equal((await compare()).status,'changed',JSON.stringify(value));
 }
 await fs.writeFile(path.join(b,'x'),'Hello world\n');
 assert.equal((await compare()).status,'equal');
 const plan=await service.previewAction('copy','a',['x']);assert.ok(plan.operations.some(op=>op.action==='copy'&&op.overwrite));
});
test('text-content retains byte fallback for invalid text and mode-isolated caching', async t=>{
 const {service,a,b}=await fixture(t,'Hello world','helloworld');
 assert.equal((await service.compareNode('',{mode:'text-whitespace-case'})).rows[0].status,'equal');
 assert.equal((await service.compareNode('',{mode:'text-content'})).rows[0].status,'changed');
 for(const value of [Buffer.from([0xff,0x20]),Buffer.from('Hello\0world')]){
  await fs.writeFile(path.join(a,'x'),value);let row=(await service.compareNode('',{mode:'text-content'})).rows[0];assert.equal(row.status,'changed');assert.equal(row.comparison,'content');
  await fs.writeFile(path.join(b,'x'),value);row=(await service.compareNode('',{mode:'text-content'})).rows[0];assert.equal(row.status,'equal');assert.equal(row.comparison,'content');
 }
});
