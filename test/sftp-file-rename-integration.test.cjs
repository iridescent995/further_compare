'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {connectSftp}=require('../desktop/sftp-connection.cjs'),{SftpFolderProvider}=require('../desktop/sftp-folder-provider.cjs');
const {prepareSftpRename,executeSftpRename,revokeSftpRename}=require('../desktop/sftp-file-rename.cjs');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
async function until(check){const end=Date.now()+4000;while(!check()){if(Date.now()>end)throw Error('Fixture event deadline');await new Promise(resolve=>setTimeout(resolve,10));}}
async function fixture(t,timeout=10000){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-sftp-rename-'))),controls={},bytes=Buffer.from([0,255,1,128,13,10]);await fs.mkdir(path.join(root,'folder'));await fs.mkdir(path.join(root,'backup'));await fs.writeFile(path.join(root,'folder','old'),bytes);
 const server=await createSftpServer({root,controls,writes:true}),connection=await connectSftp({host:server.host,port:server.port,username:'fixture-user',password:'fixture-secret',expectedFingerprint:server.fingerprint,requestTimeoutMs:timeout});
 t.after(async()=>{await connection.close();await server.close();await fs.rm(root,{recursive:true,force:true});});
 const provider=await SftpFolderProvider.create(connection,'/folder');return {root,controls,bytes,server,connection,provider,backupRoot:path.join(root,'backup'),file:name=>path.join(root,'folder',name)};
}
const renames=f=>f.server.events.requests.filter(row=>row[0]==='rename');
function noCleanup(f){assert.ok(!f.server.events.requests.some(row=>['remove','rmdir','extended'].includes(row[0])));}
async function backupBytes(f,result){const manifest=JSON.parse(await fs.readFile(result.manifestPath,'utf8'));assert.equal(manifest.files.length,1);assert.equal(manifest.files[0].path,'old');assert.deepEqual(await fs.readFile(path.join(result.backupPath,manifest.files[0].backupName)),f.bytes);}
test('real SFTP rename backs up exact binary bytes before submission and preserves content under new name',{timeout:20000},async t=>{
 const f=await fixture(t),plan=await prepareSftpRename(f.provider,'old','C:new');let checked=false;f.controls.beforeStandardRename=async()=>{const dirs=await fs.readdir(f.backupRoot);assert.equal(dirs.length,1);await backupBytes(f,{backupPath:path.join(f.backupRoot,dirs[0]),manifestPath:path.join(f.backupRoot,dirs[0],'manifest.json')});checked=true;};
 const result=await executeSftpRename(plan,{backupRoot:f.backupRoot});assert.equal(checked,true);assert.equal(result.renamed,true);assert.equal(result.acknowledged,true);assert.deepEqual(await fs.readFile(f.file('C:new')),f.bytes);await assert.rejects(fs.access(f.file('old')),{code:'ENOENT'});await backupBytes(f,result);assert.equal(renames(f).length,1);noCleanup(f);await assert.rejects(executeSftpRename(plan,{backupRoot:f.backupRoot}));assert.equal(renames(f).length,1);
});
for(const mutation of ['source','parent','target'])test('stale '+mutation+' rejects before rename',{timeout:20000},async t=>{
 const f=await fixture(t),plan=await prepareSftpRename(f.provider,'old','new');if(mutation==='source'){const stat=await fs.stat(f.file('old'));await fs.writeFile(f.file('old'),Buffer.from([6,5,4,3,2,1]));await fs.utimes(f.file('old'),stat.atime,stat.mtime);}else if(mutation==='parent')await fs.chmod(path.join(f.root,'folder'),0o711);else await fs.writeFile(f.file('new'),'foreign');
 await assert.rejects(executeSftpRename(plan,{backupRoot:f.backupRoot}));assert.equal(renames(f).length,0);if(mutation==='target')assert.equal(await fs.readFile(f.file('new'),'utf8'),'foreign');assert.ok((await fs.stat(f.file('old'))).isFile());noCleanup(f);
});
test('target appearing during submitted no-overwrite rename is retained with source',{timeout:20000},async t=>{
 const f=await fixture(t),plan=await prepareSftpRename(f.provider,'old','new');f.controls.beforeStandardRename=()=>fs.writeFile(f.file('new'),'foreign');await assert.rejects(executeSftpRename(plan,{backupRoot:f.backupRoot}),error=>error.submitted===true&&error.acknowledged===false&&error.code!=='RENAME_OUTCOME_UNKNOWN');assert.equal(await fs.readFile(f.file('new'),'utf8'),'foreign');assert.deepEqual(await fs.readFile(f.file('old')),f.bytes);assert.equal(renames(f).length,1);noCleanup(f);
});
test('cancel before submission and revoke send no mutation',{timeout:20000},async t=>{
 const f=await fixture(t),plan=await prepareSftpRename(f.provider,'old','new'),controller=new AbortController();controller.abort();await assert.rejects(executeSftpRename(plan,{backupRoot:f.backupRoot,signal:controller.signal}));const revoked=await prepareSftpRename(f.provider,'old','other');revokeSftpRename(revoked);await assert.rejects(executeSftpRename(revoked,{backupRoot:f.backupRoot}));assert.equal(renames(f).length,0);assert.deepEqual(await fs.readFile(f.file('old')),f.bytes);noCleanup(f);
});
test('Stop after rename submission reports unknown and never cleans up or retries',{timeout:20000},async t=>{
 const f=await fixture(t),plan=await prepareSftpRename(f.provider,'old','new'),controller=new AbortController();f.controls.holdMethods=new Set(['RENAME']);const pending=executeSftpRename(plan,{backupRoot:f.backupRoot,signal:controller.signal}),rejection=assert.rejects(pending,error=>error.code==='RENAME_OUTCOME_UNKNOWN'&&error.submitted===true&&error.renamed===null);await until(()=>renames(f).length===1);controller.abort();await rejection;assert.deepEqual(await fs.readFile(f.file('old')),f.bytes);noCleanup(f);assert.equal(renames(f).length,1);
});
test('lost acknowledgment preserves renamed bytes and verified recovery without retry',{timeout:20000},async t=>{
 const f=await fixture(t,250),plan=await prepareSftpRename(f.provider,'old','new');f.controls.holdStandardRenameAck=true;let failure;await assert.rejects(executeSftpRename(plan,{backupRoot:f.backupRoot}),error=>{failure=error;return error.code==='RENAME_OUTCOME_UNKNOWN'&&error.renamed===null;});await backupBytes(f,failure);assert.deepEqual(await fs.readFile(f.file('new')),f.bytes);await assert.rejects(fs.access(f.file('old')),{code:'ENOENT'});assert.equal(renames(f).length,1);noCleanup(f);
});
for(const status of [6,7])test('wire status '+status+' after rename remains uncertain with no automatic cleanup',{timeout:20000},async t=>{
 const f=await fixture(t),plan=await prepareSftpRename(f.provider,'old','new');f.controls.standardRenameStatus=status;let failure;await assert.rejects(executeSftpRename(plan,{backupRoot:f.backupRoot}),error=>{failure=error;return error.code==='RENAME_OUTCOME_UNKNOWN'&&error.submitted===true&&error.renamed===null;});await backupBytes(f,failure);assert.deepEqual(await fs.readFile(f.file('new')),f.bytes);assert.equal(renames(f).length,1);noCleanup(f);
});
test('acknowledged rename with wrong destination bytes reports verification failure and retains evidence',{timeout:20000},async t=>{
 const f=await fixture(t),plan=await prepareSftpRename(f.provider,'old','new');f.controls.afterStandardRename=()=>fs.writeFile(f.file('new'),'external content');let failure;await assert.rejects(executeSftpRename(plan,{backupRoot:f.backupRoot}),error=>{failure=error;return error.code==='RENAME_VERIFICATION_FAILED'&&error.acknowledged===true&&error.renamed===true;});await backupBytes(f,failure);assert.equal(await fs.readFile(f.file('new'),'utf8'),'external content');assert.equal(renames(f).length,1);noCleanup(f);
});
test('nested ancestor drift invalidates the reviewed source without remote mutation',{timeout:20000},async t=>{
 const f=await fixture(t);await fs.mkdir(f.file('nested'));await fs.rename(f.file('old'),f.file('nested/old'));const plan=await prepareSftpRename(f.provider,'nested/old','nested/new');await fs.chmod(f.file('nested'),0o711);await assert.rejects(executeSftpRename(plan,{backupRoot:f.backupRoot}));assert.deepEqual(await fs.readFile(f.file('nested/old')),f.bytes);await assert.rejects(fs.access(f.file('nested/new')),{code:'ENOENT'});assert.equal(renames(f).length,0);noCleanup(f);
});
