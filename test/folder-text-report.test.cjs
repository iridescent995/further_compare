'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const {FolderService} = require('../desktop/folders.cjs');
const {FolderTree} = require('../desktop/folder-tree.cjs');
const {readFolderTextReport, MAX_REPORT_BYTES} = require('../desktop/folder-text-report.cjs');
async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-text-report-'));
  t.after(() => fs.rm(base, {recursive:true, force:true}));
  const service = new FolderService(path.join(base, 'backup'));
  const roots = {a:path.join(base,'a'), b:path.join(base,'b')};
  for (const side of ['a','b']) { await fs.mkdir(roots[side]); await service.select(side, roots[side]); }
  const write = async (side, name, content) => {const file=path.join(roots[side],name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,content);};
  const tree = new FolderTree(service);
  return {service,tree,roots,write,read:(ids,token=tree.revision,guard)=>readFolderTextReport(service,tree,ids,token,guard)};
}
test('selected report reads only aligned and one-sided loaded file paths without listing', async t => {
  const f=await fixture(t);
  await f.write('a','old.txt','left\r\n'); await f.write('b','new.txt','right\n'); await f.write('a','only.txt','only'); await f.write('b','unselected.txt','ignored');
  await f.tree.setAlignment([{a:'old.txt',b:'new.txt',kind:'file'}]);
  const listed=await f.tree.list(), pair=listed.rows.find(r=>r.pathA==='old.txt'), only=listed.rows.find(r=>r.pathA==='only.txt');
  const reads=[], original=f.service.read.bind(f.service);
  f.service.read=async(...args)=>{reads.push(args);return original(...args);};
  f.service.listDirectoryPair=async()=>{throw Error('Unexpected listing');};
  const result=await f.read([pair.id,only.id]);
  assert.equal(result.leftRoot,f.service.roots.a);assert.equal(result.rightRoot,f.service.roots.b);
  assert.deepEqual(reads,[['a','old.txt'],['b','new.txt'],['a','only.txt']]);
  assert.deepEqual(result.files.map(r=>[r.pathA,r.pathB,r.left?.content,r.right?.content]),[['old.txt','new.txt','left\r\n','right\n'],['only.txt',null,'only',undefined]]);
  assert.equal(result.files[0].left.format.lineEnding,'crlf');assert.equal(result.files[1].right,null);
});
test('selection authority rejects invalid, duplicate, unloaded, stale, directory and conflict rows before reads',async t=>{
  const f=await fixture(t);await f.write('a','file.txt','file');await f.write('a','dir/leaf','leaf');await f.write('a','conflict','file');await f.write('b','conflict/leaf','leaf');
  const result=await f.tree.list(),file=result.rows.find(r=>r.pathA==='file.txt');let reads=0;f.service.read=async()=>{reads++;throw Error('Unexpected read');};
  for(const ids of [[],[file.id,file.id],Array(21).fill(file.id),['bad'],['f'.repeat(64)],null])await assert.rejects(()=>f.read(ids));
  for(const row of result.rows.filter(r=>r.kind!=='file'))await assert.rejects(()=>f.read([row.id]),/regular files/);
  await f.tree.refresh();await assert.rejects(()=>f.read([file.id],result.revision),/revision/);assert.equal(reads,0);
});
test('report byte budget counts both sides and rejects before content reads',async t=>{
  const f=await fixture(t);for(const side of ['a','b'])await f.write(side,'large.txt',Buffer.alloc(MAX_REPORT_BYTES/2+1,97));
  const {rows}=await f.tree.list();let reads=0;f.service.read=async()=>{reads++;};await assert.rejects(()=>f.read([rows[0].id]),/10 MiB total/);assert.equal(reads,0);
});
test('line budget normalizes CRLF and CR, includes both sides and never truncates',async t=>{
  const f=await fixture(t);await f.write('a','lines.txt','x\r\n'.repeat(24999)+'x');await f.write('b','lines.txt','y\r'.repeat(24999)+'y');
  let listed=await f.tree.list();const result=await f.read([listed.rows[0].id]);assert.equal(result.files[0].left.content.split('\r\n').length,25000);
  await f.write('b','lines.txt','y\r'.repeat(25000)+'y');listed=await f.tree.list();await assert.rejects(()=>f.read([listed.rows[0].id]),/50,000/);
});
test('binary content and malformed UTF-8 reject instead of replacing data',async t=>{
  const f=await fixture(t);await f.write('a','binary',Buffer.from([65,0,66]));await f.write('a','invalid',Buffer.from([0xff,0x80]));
  const {rows}=await f.tree.list();for(const row of rows)await assert.rejects(()=>f.read([row.id]),/Binary|Invalid UTF/);
});
test('all selected rows are revalidated after reads, including a later change to an earlier file',async t=>{
  const f=await fixture(t);await f.write('a','first','first');await f.write('a','second','second');const {rows}=await f.tree.list();
  const original=f.service.read.bind(f.service);let count=0;f.service.read=async(...args)=>{const value=await original(...args);if(++count===2)await f.write('a','first','changed after read');return value;};
  await assert.rejects(()=>f.read(rows.map(r=>r.id)),/changed/);
});
test('counterpart appearing while reading and session guard changes reject results',async t=>{
  const f=await fixture(t);await f.write('a','only','only');let {rows}=await f.tree.list();const original=f.service.read.bind(f.service);
  f.service.read=async(...args)=>{const value=await original(...args);await f.write('b','only','new counterpart');return value;};await assert.rejects(()=>f.read([rows[0].id]),/counterpart appeared/);
  ({rows}=await f.tree.list());let active=true;f.service.read=async(...args)=>{const value=await original(...args);active=false;return value;};
  await assert.rejects(()=>f.read([rows[0].id],f.tree.revision,()=>{if(!active)throw Error('Session changed');}),/Session changed/);
});
test('a refreshed registry with the same row ID cannot authorize a stale read snapshot',async t=>{
  const f=await fixture(t);await f.write('a','file','before');const {rows}=await f.tree.list(),token=f.tree.revision;
  const original=f.service.read.bind(f.service);f.service.read=async(...args)=>{const value=await original(...args);await f.write('a','file','after');const refreshed=await f.tree.list();assert.equal(refreshed.revision,token);assert.equal(refreshed.rows[0].id,rows[0].id);return value;};
  await assert.rejects(()=>f.read([rows[0].id]),/changed while generating/);
});
test('selected text report decodes explicit legacy encoding and rejects unsupported encoding',async t=>{
 const f=await fixture(t),{encodeText}=require('../src/text-codec.cjs');const format={encoding:'windows1251',bom:false,lineEnding:'lf'};
 await f.write('a','legacy.txt',encodeText('ЁЖ\n',format));await f.write('b','legacy.txt',encodeText('ёж\n',format));const listed=await f.tree.list(),id=listed.rows[0].id;
 await assert.rejects(f.read([id]),/UTF-8/);const result=await readFolderTextReport(f.service,f.tree,[id],f.tree.revision,undefined,'windows1251');assert.equal(result.files[0].left.content,'ЁЖ\n');assert.equal(result.files[0].right.content,'ёж\n');assert.equal(result.files[0].left.format.encoding,'windows1251');await assert.rejects(readFolderTextReport(f.service,f.tree,[id],f.tree.revision,undefined,'unknown'),/encoding|rules/i);
});
