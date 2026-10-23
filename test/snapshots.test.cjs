'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const {spawnSync} = require('node:child_process');
const {createSnapshot,validateSnapshot,loadSnapshot,saveSnapshot,compareSnapshots} = require('../desktop/snapshots.cjs');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'fc-snapshot-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const a=path.join(root,'a'),b=path.join(root,'b'); await fs.mkdir(a);await fs.mkdir(b);
  return {root,a,b};
}
const cli = (...args) => spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/compare.cjs'),...args],{encoding:'utf8'});
test('snapshots round trip relative hashes and detect changes without live filesystem authority',async t=>{
  const {root,a,b}=await fixture(t);
  for (const folder of [a,b]) {await fs.mkdir(path.join(folder,'nested'));await fs.writeFile(path.join(folder,'nested','x'),Buffer.from([0,1,2]));}
  const left=await createSnapshot(a),right=await createSnapshot(b);
  assert.equal(compareSnapshots(left,right).equal,true);
  assert.ok(left.entries.every(e=>!path.isAbsolute(e.path)));
  await fs.writeFile(path.join(b,'nested','x'),Buffer.from([0,1,3]));
  assert.equal(compareSnapshots(left,await createSnapshot(b)).rows.find(r=>r.path==='nested/x').status,'changed');
  const output=path.join(root,'snapshot.json'); await saveSnapshot(output,left);
  assert.deepEqual(await loadSnapshot(output),left);
  await assert.rejects(saveSnapshot(output,right),{code:'EEXIST'});
  const bad=structuredClone(left);bad.entries[0].path='../outside';assert.throws(()=>validateSnapshot(bad),/relative/);
  const noParent=structuredClone(left);noParent.entries.shift();assert.throws(()=>validateSnapshot(noParent),/parent/);
  await fs.symlink(path.join(a,'nested','x'),path.join(a,'link'));
  await assert.rejects(createSnapshot(a),/Symbolic/);
});
test('CLI reports real exit codes, escaped HTML, read-only inputs and exclusive output',async t=>{
  const {root,a,b}=await fixture(t);
  const left=path.join(a,'x'),right=path.join(b,'x');await fs.writeFile(left,'<script>alert(1)</script>');await fs.writeFile(right,'different');
  const common=['--left',left,'--right',right];
  let result=cli(...common,'--format','html'); assert.equal(result.status,1);assert.ok(result.stdout.includes('&lt;script&gt;'));assert.ok(!result.stdout.includes('<script>'));
  assert.equal(cli(...common,'--type','binary','--format','json').status,1);
  assert.equal(cli(...common,'--output',left).status,2);assert.equal(await fs.readFile(left,'utf8'),'<script>alert(1)</script>');
  await fs.copyFile(left,right);assert.equal(cli(...common).status,0);
  assert.equal(cli('--left',a,'--right',b,'--type','folder').status,0);
  assert.equal(cli('--type','unsupported').status,2);
  await fs.writeFile(left,'a,b\n1,2');await fs.writeFile(right,'a,b\n1,3');assert.equal(cli(...common,'--type','table').status,1);
  await fs.symlink(left,path.join(root,'link'));assert.equal(cli('--left',path.join(root,'link'),'--right',right).status,2);
});
