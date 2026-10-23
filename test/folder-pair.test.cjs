'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {FolderService} = require('../desktop/folders.cjs');
const {stageFolderPair,validateStagedPair} = require('../desktop/folder-pair.cjs');
const {readDataLimited} = require('../desktop/sessions.cjs');
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'further-folder-pair-')));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const a = path.join(root,'left'), b = path.join(root,'right');
  for (const dir of [a,b]) await fs.mkdir(path.join(dir,'nested'),{recursive:true});
  const service = new FolderService(path.join(root,'backups'));
  await service.select('a',a); await service.select('b',b);
  await fs.writeFile(path.join(a,'nested','old.txt'),'left\r\n');
  await fs.writeFile(path.join(b,'new.txt'),Buffer.from('\ufeffright\n','utf16le'));
  return {root,a,b,service};
}
test('selected pair reads different names and depths and preserves encoding and parent roots', async t => {
  const {a,b,service} = await fixture(t);
  const result = await stageFolderPair(service,'nested/old.txt','new.txt');
  assert.equal(result.mode,'text-compare');
  assert.equal(result.name,'old.txt ↔ new.txt');
  assert.equal(result.a.content,'left\r\n'); assert.equal(result.b.content,'right\n');
  assert.equal(result.a.path,path.join(a,'nested','old.txt'));
  assert.deepEqual(result.b.format,{encoding:'utf16le',bom:true,lineEnding:'lf'});
  for (const side of ['a','b']) {
    const stat = await fs.stat(result[side].path);
    assert.equal(result.revisions[side],`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`);
  }
  assert.deepEqual(service.roots,{a,b});
});
test('selected directories become isolated roots without changing the parent comparison', async t => {
  const {a,b,service} = await fixture(t);
  await fs.mkdir(path.join(b,'other'));
  const result = await stageFolderPair(service,'nested','other');
  assert.equal(result.mode,'folder-compare'); assert.notEqual(result.service,service);
  assert.equal(result.service.backupRoot,service.backupRoot);
  assert.deepEqual(result.folders,{a:{name:'nested',path:path.join(a,'nested')},b:{name:'other',path:path.join(b,'other')}});
  assert.deepEqual(result.service.roots,{a:path.join(a,'nested'),b:path.join(b,'other')});
  assert.deepEqual(service.roots,{a,b});
});
test('selected files route known engines and retain exact bytes; mixed or invalid text routes binary', async t => {
  const {a,b,service} = await fixture(t);
  for (const [left,right,mode] of [['png','jpg','picture'],['wav','wav','audio'],['csv','xlsx','table'],['zip','jar','archive'],['reg','reg','registry'],['bin','dat','binary'],['csv','txt','binary'],['txt','dat','binary'],['unknown','unknown','binary']]) {
    const l = `one.${left}`, r = `two.${right}`;
    await fs.writeFile(path.join(a,l),Buffer.from([0,255,1])); await fs.writeFile(path.join(b,r),Buffer.from([2,0,254]));
    const result = await stageFolderPair(service,l,r);
    assert.equal(result.mode,`${mode}-compare`);
    assert.equal(result.a.data,'AP8B'); assert.equal(result.b.data,'AgD+');
    assert.equal(result.a.content,undefined); assert.equal(result.a.format,undefined);
  }
});
test('invalid, missing, mixed and symlink selections reject without changing roots', async t => {
  const {a,b,service} = await fixture(t);
  for (const relative of ['',null,'../left/nested/old.txt','nested//old.txt','nested/./old.txt','nested\\old.txt','bad\0',a,'x'.repeat(32769),'missing']) {
    await assert.rejects(stageFolderPair(service,relative,'new.txt'));
    await assert.rejects(stageFolderPair(service,'nested/old.txt',relative));
  }
  await assert.rejects(stageFolderPair(service,'nested','new.txt'),/two files or two folders/);
  if (process.platform !== 'win32') {
    await fs.symlink(path.join(a,'nested'),path.join(a,'linked'));
    await fs.symlink(path.join(b,'new.txt'),path.join(b,'linked.txt'));
    await assert.rejects(stageFolderPair(service,'linked/old.txt','new.txt'),/Symbolic/);
    await assert.rejects(stageFolderPair(service,'nested/old.txt','linked.txt'),/Symbolic/);
  }
  assert.deepEqual(service.roots,{a,b});
});
test('first-file mutation during the second read is rejected', async t => {
  const {a,service} = await fixture(t); let reads = 0;
  await assert.rejects(stageFolderPair(service,'nested/old.txt','new.txt',async file => {
    const data = await readDataLimited(file);
    if (++reads === 2) await fs.writeFile(path.join(a,'nested','old.txt'),'changed first side');
    return data;
  }),/changed while opening/);
});
test('selected root replacement during reads is rejected even when the path remains canonical', async t => {
  const {a,service} = await fixture(t); let reads = 0;
  await assert.rejects(stageFolderPair(service,'nested/old.txt','new.txt',async file => {
    const data = await readDataLimited(file);
    if (++reads === 2) { await fs.rename(a,a+'-original'); await fs.mkdir(a); }
    return data;
  }),/selected root changed/);
});
test('selected legacy file pair uses explicit encoding and validates before opening',async t=>{
 const {a,b,service}=await fixture(t),{encodeText}=require('../src/text-codec.cjs');
 const format={encoding:'windows1251',bom:false,lineEnding:'crlf'};
 await fs.writeFile(path.join(a,'nested','old.txt'),encodeText('ЁЖ\n',format));await fs.writeFile(path.join(b,'new.txt'),encodeText('ёж\n',format));
 assert.equal((await stageFolderPair(service,'nested/old.txt','new.txt')).mode,'binary-compare');
 const result=await stageFolderPair(service,'nested/old.txt','new.txt',undefined,'windows1251');assert.equal(result.mode,'text-compare');assert.equal(result.a.content,'ЁЖ\r\n');assert.equal(result.b.content,'ёж\r\n');assert.equal(result.a.format.encoding,'windows1251');
 await assert.rejects(stageFolderPair(service,'nested/old.txt','new.txt',undefined,'invented'),/encoding|rules/i);
});

test('staged pair retains private identities and rejects replacement before native adoption',async t=>{
 const {a,b,service}=await fixture(t);
 const staged=await stageFolderPair(service,'nested/old.txt','new.txt');
 const original=await validateStagedPair(staged);
 assert.equal(original.a.path,staged.a.path);
 assert.equal(original.a.revision,staged.revisions.a);
 assert.doesNotThrow(()=>JSON.stringify(staged));
 assert.equal(staged.snapshots,undefined);
 await fs.rename(path.join(a,'nested','old.txt'),path.join(a,'nested','retained.txt'));
 await fs.writeFile(path.join(a,'nested','old.txt'),'replacement');
 await assert.rejects(validateStagedPair(staged),/changed|replaced/i);
 assert.deepEqual(service.roots,{a,b});
});
test('binary pair rejects mutation after staging and never returns replacement authority',async t=>{
 const {a,b,service}=await fixture(t);
 await fs.writeFile(path.join(a,'one.bin'),Buffer.from([0,1]));
 await fs.writeFile(path.join(b,'two.bin'),Buffer.from([0,2]));
 const staged=await stageFolderPair(service,'one.bin','two.bin');
 assert.equal(staged.mode,'binary-compare');
 const original=await validateStagedPair(staged);assert.equal(typeof original.b.ino,'bigint');
 await fs.writeFile(path.join(b,'two.bin'),Buffer.from([0,3,4]));
 await assert.rejects(validateStagedPair(staged),/changed|replaced/i);
 assert.equal(staged.b.data,'AAI=');
});
