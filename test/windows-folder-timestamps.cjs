'use strict';
// Run with: node --test test/windows-folder-timestamps.cjs
// This deliberately exercises the real Windows helper, not a mocked platform.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {FolderService} = require('../desktop/folders.cjs');
const {setFolderModified} = require('../desktop/folder-timestamps.cjs');
const initial = 1600000000000, accessed = 1500000000000, target = 1700000000123;
const literal = "quote' Unicode-文件 $(not-a-command) & [name].txt";
async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-win-times-'));
  try {
    const left = path.join(root, 'left'), right = path.join(root, 'right');
    await fs.mkdir(path.join(left, 'parent', 'nested'), {recursive:true});
    await fs.mkdir(right);
    const files = ['plain.txt', literal, 'parent/child.txt', 'parent/nested/untouched.txt'];
    for (const relative of files) await fs.writeFile(path.join(left, relative), `content:${relative}`);
    await fs.writeFile(path.join(right, 'plain.txt'), 'right unchanged');
    const entries = [...files, 'parent/nested', 'parent'];
    for (const relative of entries) await fs.utimes(path.join(left, relative), accessed / 1000, initial / 1000);
    await fs.utimes(path.join(right, 'plain.txt'), accessed / 1000, initial / 1000);
    const service = new FolderService(path.join(root, 'backups'));
    await service.select('a', left); await service.select('b', right);
    const change = (paths, date = target) => setFolderModified(service.safe.bind(service), 'a', paths, date);
    const stat = relative => fs.stat(path.join(left, relative), {bigint:true});
    await run({root,left,right,change,stat,service});
  } finally { await fs.rm(root, {recursive:true,force:true}); }
}
const mtime = value => Number(value.mtimeNs) / 1e6;
function atDate(value, expected) { assert.ok(Math.abs(mtime(value) - expected) < 1, `${mtime(value)} should equal ${expected}`); }
async function holdExclusive(file) {
  const script = '$f=[System.IO.File]::Open($env:FC_TIMESTAMP_LOCK,[System.IO.FileMode]::Open,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None);try{[Console]::Out.WriteLine("READY");[Console]::Out.Flush();[Console]::ReadLine()|Out-Null}finally{$f.Dispose()}';
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const child = spawn(executable, ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')], {
    env:{...process.env,FC_TIMESTAMP_LOCK:file}, stdio:['pipe','pipe','pipe'], windowsHide:true
  });
  const exited = once(child, 'exit');
  let output = '', errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  try {
    await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(new Error(`Lock helper timeout: ${errors}`)), 20000);
      const finish = fn => value => { clearTimeout(timer); fn(value); };
      child.once('error', finish(reject));
      child.once('exit', finish(() => reject(new Error(`Lock helper exited before ready: ${errors}`))));
      child.stdout.on('data', chunk => { output += chunk; if(output.includes('READY')) finish(resolve)(); });
    });
  } catch(error) { child.kill(); await exited.catch(()=>{}); throw error; }
  return async () => { child.stdin.end('\n'); await exited; };
}
test('Windows native folder timestamp integration', {skip:process.platform !== 'win32' ? 'Requires a real Windows filesystem and PowerShell host' : false, timeout:180000}, async t => {
  await t.test('files, folders, selected parent and child preserve access time, contents and unselected scope', () => fixture(async ({left,right,change,stat}) => {
    const selected = ['plain.txt', literal, 'parent', 'parent/child.txt'];
    const before = new Map(await Promise.all(selected.map(async p => [p, await stat(p)])));
    assert.deepEqual(await change(selected), {changed:selected.length});
    // Check atime before content reads, which may themselves update access time.
    for (const p of selected) {
      const after = await stat(p); atDate(after,target);
      assert.equal(after.atimeNs,before.get(p).atimeNs,`Access time changed: ${p}`);
    }
    atDate(await stat('parent/nested'), initial);
    atDate(await stat('parent/nested/untouched.txt'), initial);
    atDate(await fs.stat(path.join(right,'plain.txt'),{bigint:true}),initial);
    for (const p of selected.filter(p=>p !== 'parent')) assert.equal(await fs.readFile(path.join(left,p),'utf8'),`content:${p}`);
    // Ancestor handles are acquired in the opposite order in this selection.
    assert.deepEqual(await change(['parent/child.txt','parent'],target+1000),{changed:2});
    atDate(await stat('parent/child.txt'),target+1000);
    atDate(await stat('parent'),target+1000);
    atDate(await stat('parent/nested/untouched.txt'),initial);
  }));
  await t.test('invalid paths, duplicate selections and missing entries fail without changing earlier files', () => fixture(async ({change,stat}) => {
    for(const paths of [['plain.txt','../outside'],['plain.txt','plain.txt'],['plain.txt','missing.txt'],['parent/../plain.txt'],['C:\\Windows']]) {
      await assert.rejects(change(paths)); atDate(await stat('plain.txt'),initial);
    }
  }));
  await t.test('locked final file fails during preflight before any timestamps change', () => fixture(async ({left,change,stat}) => {
    const release = await holdExclusive(path.join(left,literal));
    try { await assert.rejects(change(['plain.txt','parent',literal])); atDate(await stat('plain.txt'),initial); atDate(await stat('parent'),initial); }
    finally { await release(); }
    atDate(await stat(literal),initial);
  }));
  await t.test('junctions and file symlinks cannot redirect timestamp writes', async t => {
    for(const [kind,targetRelative] of [['junction','parent'],['file','plain.txt']]) {
      await t.test(kind, async subtest => fixture(async ({left,change,stat}) => {
        try { await fs.symlink(path.join(left,targetRelative),path.join(left,'linked'),kind); }
        catch(error) { if(['EPERM','EACCES'].includes(error.code)) { subtest.skip(`${kind} creation needs privileges: ${error.code}`); return; } throw error; }
        await assert.rejects(change(['plain.txt','linked']));
        atDate(await stat('plain.txt'),initial); atDate(await stat('parent'),initial);
      }));
    }
  });
  await t.test('1601 plus 1 ms and pre-epoch dates work; zero FILETIME and earlier dates are rejected', () => fixture(async ({change,stat}) => {
    for(const date of [Date.parse('1601-01-01T00:00:00.001Z'),Date.parse('1900-01-01T00:00:00.123Z')]) {
      await change(['plain.txt','parent'],date);
      atDate(await stat('plain.txt'),date); atDate(await stat('parent'),date);
    }
    const before = await stat('plain.txt');
    for(const date of ['1601-01-01T00:00:00.000Z','1600-12-31T23:59:59.999Z']) await assert.rejects(change(['plain.txt'],Date.parse(date)));
    assert.equal((await stat('plain.txt')).mtimeNs,before.mtimeNs);
  }));
});
