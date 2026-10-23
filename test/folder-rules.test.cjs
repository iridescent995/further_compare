'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {FolderService} = require('../desktop/folders.cjs');
const {validateFolderRules} = require('../desktop/folder-rules.cjs');
const {validateSession} = require('../desktop/sessions.cjs');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-rules-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  const a = path.join(root, 'a'), b = path.join(root, 'b');
  await fs.mkdir(a); await fs.mkdir(b);
  const service = new FolderService(path.join(root, 'backups'));
  await service.select('a', a); await service.select('b', b);
  await fs.writeFile(path.join(a, 'x'), 'aaa'); await fs.writeFile(path.join(b, 'x'), 'bbb');
  await fs.utimes(path.join(a, 'x'), 1700000000, 1700000000);
  await fs.utimes(path.join(b, 'x'), 1700000000, 1700000000);
  return {service, a, b};
}
test('metadata matches are labelled and avoid content reads; default contents detects different bytes', async t => {
  const {service} = await fixture(t);
  const open = fs.open;
  fs.open = async () => { throw new Error('Metadata comparison must not open file contents'); };
  try {
    for (const mode of ['size', 'modified', 'size-modified']) {
      const result = await service.compareNode('', {mode});
      assert.equal(result.rows[0].status, 'equal');
      assert.equal(result.rows[0].comparison, 'metadata');
      assert.deepEqual(result.rules, {mode, timeToleranceMs:0});
      assert.equal(service.hashCache.size, 0);
    }
  } finally { fs.open = open; }
  const result = await service.compareNode();
  assert.deepEqual(result.rules, {mode:'content', timeToleranceMs:0});
  assert.equal(result.rows[0].status, 'changed');
  assert.equal(result.rows[0].comparison, 'content');
  const plan = await service.preview('merge', 'a-to-b');
  assert.ok(plan.operations.length > 0, 'operation preview must still identify content differences');
});
test('modified tolerance is inclusive, symmetric and independent of size unless requested', async t => {
  const {service, a, b} = await fixture(t);
  await fs.utimes(path.join(b, 'x'), 1700000001, 1700000001);
  for (const mode of ['modified', 'size-modified']) {
    assert.equal((await service.compareNode('', {mode, timeToleranceMs:999})).rows[0].status, 'changed');
    assert.equal((await service.compareNode('', {mode, timeToleranceMs:1000})).rows[0].status, 'equal');
    [service.roots.a, service.roots.b] = [service.roots.b, service.roots.a];
    assert.equal((await service.compareNode('', {mode, timeToleranceMs:1000})).rows[0].status, 'equal');
    [service.roots.a, service.roots.b] = [service.roots.b, service.roots.a];
  }
  await fs.writeFile(path.join(a, 'x'), 'larger');
  await fs.utimes(path.join(a, 'x'), 1700000001, 1700000001);
  assert.equal((await service.compareNode('', {mode:'modified'})).rows[0].status, 'equal');
  assert.equal((await service.compareNode('', {mode:'size-modified'})).rows[0].status, 'changed');
  assert.equal((await service.compareNode('', {mode:'size'})).rows[0].status, 'changed');
});
test('rules reject invalid types, keys, modes and timestamp tolerances before scanning', async () => {
  const invalid = [null, [], 'content', true, {extra:true}, {mode:'hash'}, {mode:null}, {timeToleranceMs:-1}, {timeToleranceMs:86400001}, {timeToleranceMs:1.5}, {timeToleranceMs:'0'}, {timeToleranceMs:NaN}, {timeToleranceMs:Infinity}, new Date()];
  const service = new FolderService('/unused');
  service.list = async () => { throw new Error('must validate before listing'); };
  for (const value of invalid) {
    assert.throws(() => validateFolderRules(value), /folder comparison rules/);
    await assert.rejects(service.compareNode('', value), /folder comparison rules/);
  }
  assert.deepEqual(validateFolderRules({timeToleranceMs:86400000}), {mode:'content',timeToleranceMs:86400000});
});
test('session folder rules are optional and normalized when supplied', () => {
  const session = {version:1,type:'folder-compare',name:'Rules',text:{a:'',b:''},files:{a:{name:'',path:''},b:{name:'',path:''}},folders:{a:null,b:null},options:{ignoreWhitespace:false,filter:'all',direction:'a-to-b'}};
  assert.equal(validateSession(session).options.folderRules, undefined);
  session.options.folderRules = {mode:'modified'};
  assert.deepEqual(validateSession(session).options.folderRules, {mode:'modified',timeToleranceMs:0});
  session.options.folderRules = {mode:'modified', unknown:1};
  assert.throws(() => validateSession(session), /folder comparison rules/);
});
const {encodeText,MAX_BYTES}=require('../src/text-codec.cjs');
test('folder text case and whitespace modes are independent and cache keys include the full rule',async t=>{
  const {service,a,b}=await fixture(t);
  const row=async mode=>(await service.compareNode('',{mode})).rows[0];
  await fs.writeFile(path.join(a,'x'),'Name Here\r\n');await fs.writeFile(path.join(b,'x'),'name here\n');
  for(const mode of ['text-case','text-whitespace-case','text-whitespace','content','text-case']){
    const result=await row(mode);assert.equal(result.status,['text-case','text-whitespace-case'].includes(mode)?'equal':'changed',mode);
    assert.equal(result.comparison,mode==='content'?'content':'text-normalized');
  }
  for(const mode of ['text-case','text-whitespace-case','text-whitespace'])assert.ok([...service.hashCache.keys()].some(key=>key.startsWith(mode+'\0')));
  await fs.writeFile(path.join(b,'x'),'namehere\n');
  assert.equal((await row('text-case')).status,'changed');assert.equal((await row('text-whitespace-case')).status,'equal');
  await fs.writeFile(path.join(b,'x'),'NameHere\n');
  assert.equal((await row('text-whitespace')).status,'equal');assert.equal((await row('text-case')).status,'changed');
  const file=path.join(b,'x'),before=await fs.stat(file);await fs.writeFile(file,'LameHere\n');await fs.utimes(file,before.atime,before.mtime);
  assert.equal((await row('text-whitespace-case')).status,'changed');
});
test('folder case comparison preserves spacing, blank/final lines, NBSP and limited lowercase semantics',async t=>{
  const {service,a,b}=await fixture(t);
  for(const mode of ['text-case','text-whitespace-case']){
    for(const [left,right,equal]of [['É\r\nΩ\r','é\nω\n',true],['İ','i\u0307',true],['Straße','STRASSE',false],['é','e\u0301',false],['Σ','ς',false],['A\n','a',false],['A\n\nB','a\nb',false],['A\u00a0B','ab',false],[' A\tB ','ab',mode==='text-whitespace-case']]){
      await fs.writeFile(path.join(a,'x'),left);await fs.writeFile(path.join(b,'x'),right);
      const result=(await service.compareNode('',{mode})).rows[0];assert.equal(result.status,equal?'equal':'changed',mode+JSON.stringify([left,right]));
      assert.equal(result.comparison,'text-normalized');
    }
  }
});
test('folder case modes support BOM UTF-8 and UTF-16 while exact bytes retain content provenance',async t=>{
  const {service,a,b}=await fixture(t);await fs.writeFile(path.join(b,'x'),'hello 世界\n');
  for(const encoding of ['utf8','utf16le','utf16be']){
    await fs.writeFile(path.join(a,'x'),encodeText('HELLO 世界\r\n',{encoding,bom:true,lineEnding:'crlf'}));
    for(const mode of ['text-case','text-whitespace-case']){
      const result=(await service.compareNode('',{mode})).rows[0];assert.equal(result.status,'equal');assert.equal(result.comparison,'text-normalized');
    }
  }
  await fs.copyFile(path.join(a,'x'),path.join(b,'x'));
  for(const mode of ['text-case','text-whitespace-case'])assert.equal((await service.compareNode('',{mode})).rows[0].comparison,'content');
});
test('folder case modes use exact bytes for binary, malformed Unicode and oversized inputs',async t=>{
  const {service,a,b}=await fixture(t);
  for(const bytes of [Buffer.from('A\0B'),Buffer.from([0xff,0x41]),Buffer.from('A\x01B'),Buffer.from([0xff,0xfe,0,0,0,0xd8,0,0]),Buffer.alloc(MAX_BYTES+1,65)]){
    await fs.writeFile(path.join(a,'x'),bytes);await fs.writeFile(path.join(b,'x'),'ab');
    for(const mode of ['text-case','text-whitespace-case']){
      const result=(await service.compareNode('',{mode})).rows[0];assert.equal(result.status,'changed');assert.equal(result.comparison,'content');
    }
    await fs.copyFile(path.join(a,'x'),path.join(b,'x'));
    for(const mode of ['text-case','text-whitespace-case']){
      const result=(await service.compareNode('',{mode})).rows[0];assert.equal(result.status,'equal');assert.equal(result.comparison,'content');
    }
  }
});
test('folder case equality never suppresses byte-exact copy and sync operations',async t=>{
  const {service,a,b}=await fixture(t);const original=Buffer.from('HELLO\r\n');
  await fs.writeFile(path.join(a,'x'),original);await fs.writeFile(path.join(b,'x'),'hello\n');
  for(const mode of ['text-case','text-whitespace-case'])assert.equal((await service.compareNode('',{mode})).rows[0].status,'equal');
  const sync=await service.preview('sync','a-to-b');assert.ok(sync.operations.some(op=>op.path==='x'&&op.action==='copy'));
  const copy=await service.previewAction('copy','a',['x']);assert.ok(copy.operations.some(op=>op.path==='x'&&op.action==='copy'&&op.overwrite));
  await service.execute(copy.id);assert.deepEqual(await fs.readFile(path.join(b,'x')),original);
});
test('session schema accepts new folder case rules without weakening validation',()=>{
  const session={version:1,type:'folder-compare',name:'Rules',text:{a:'',b:''},files:{a:{name:'',path:''},b:{name:'',path:''}},folders:{a:null,b:null},options:{ignoreWhitespace:false,filter:'all',direction:'a-to-b'}};
  for(const mode of ['text-content','text-case','text-whitespace-case']){
    session.options.folderRules={mode};assert.deepEqual(validateSession(session).options.folderRules,{mode,timeToleranceMs:0});
    assert.throws(()=>validateFolderRules({mode,ignoreCase:true}),/folder comparison rules/);
  }
});

test('folder text rules recognize UTF-32 while exact comparison retains byte differences',async t=>{
 const {service,a,b}=await fixture(t);
 for(const bytes of [Buffer.from([255,254,0,0,65,0,0,0]),Buffer.from([0,0,254,255,0,0,0,65])]){
  await fs.writeFile(path.join(a,'x'),bytes);await fs.writeFile(path.join(b,'x'),'a');
  for(const mode of ['text-case','text-whitespace-case']){const row=(await service.compareNode('',{mode})).rows[0];assert.equal(row.status,'equal');assert.equal(row.comparison,'text-normalized');}
  const row=(await service.compareNode('',{mode:'content'})).rows[0];assert.equal(row.status,'changed');assert.equal(row.comparison,'content');
 }
});
