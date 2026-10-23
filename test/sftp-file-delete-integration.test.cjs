'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {connectSftp}=require('../desktop/sftp-connection.cjs'),{SftpFolderProvider}=require('../desktop/sftp-folder-provider.cjs');
const {prepareSftpDelete,executeSftpDelete,revokeSftpDelete}=require('../desktop/sftp-file-delete.cjs');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
async function fixture(t,timeout=10000){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-sftp-delete-'))),controls={},bytes=Buffer.from([0,255,1,128,13,10]);await fs.mkdir(path.join(root,'folder'));await fs.mkdir(path.join(root,'backup'));await fs.writeFile(path.join(root,'folder','file'),bytes);
 const server=await createSftpServer({root,controls,writes:true}),connection=await connectSftp({host:server.host,port:server.port,username:'fixture-user',password:'fixture-secret',expectedFingerprint:server.fingerprint,requestTimeoutMs:timeout});
 t.after(async()=>{await connection.close();await server.close();await fs.rm(root,{recursive:true,force:true});});
 const provider=await SftpFolderProvider.create(connection,'/folder');return {root,controls,bytes,server,connection,provider,backupRoot:path.join(root,'backup'),file:path.join(root,'folder/file')};
}
const removes=f=>f.server.events.requests.filter(row=>row[0]==='remove');
const execute=(f,plan,signal)=>executeSftpDelete(plan,{backupRoot:f.backupRoot,signal});
async function recovery(f,outcome){const manifest=JSON.parse(await fs.readFile(outcome.manifestPath,'utf8'));assert.equal(manifest.files.length,1);assert.equal(manifest.files[0].path,'file');assert.deepEqual(await fs.readFile(path.join(outcome.backupPath,manifest.files[0].backupName)),f.bytes);}
test('real delete verifies binary recovery before a single REMOVE and observes absence',{timeout:20000},async t=>{
 const f=await fixture(t),plan=await prepareSftpDelete(f.provider,'file');let checked=false;f.controls.beforeRemove=async()=>{const names=await fs.readdir(f.backupRoot);assert.equal(names.length,1);await recovery(f,{backupPath:path.join(f.backupRoot,names[0]),manifestPath:path.join(f.backupRoot,names[0],'manifest.json')});checked=true;};const result=await execute(f,plan);assert.equal(checked,true);assert.equal(result.deleted,true);assert.equal(result.acknowledged,true);await assert.rejects(fs.access(f.file),{code:'ENOENT'});await recovery(f,result);assert.equal(removes(f).length,1);await assert.rejects(execute(f,plan));assert.equal(removes(f).length,1);
});
for(const change of ['source','parent'])test('changed '+change+' rejects before REMOVE',{timeout:20000},async t=>{
 const f=await fixture(t),plan=await prepareSftpDelete(f.provider,'file');if(change==='source'){const stat=await fs.stat(f.file);await fs.writeFile(f.file,Buffer.from([6,5,4,3,2,1]));await fs.utimes(f.file,stat.atime,stat.mtime);}else await fs.chmod(path.dirname(f.file),0o711);await assert.rejects(execute(f,plan));assert.equal(removes(f).length,0);assert.ok((await fs.stat(f.file)).isFile());
});
test('revoked and pre-cancelled review never deletes',{timeout:20000},async t=>{
 const f=await fixture(t),plan=await prepareSftpDelete(f.provider,'file');revokeSftpDelete(plan);await assert.rejects(execute(f,plan));const next=await prepareSftpDelete(f.provider,'file'),controller=new AbortController();controller.abort();await assert.rejects(execute(f,next,controller.signal));assert.equal(removes(f).length,0);assert.deepEqual(await fs.readFile(f.file),f.bytes);
});
test('server rejection leaves source and recovery available',{timeout:20000},async t=>{
 const f=await fixture(t),plan=await prepareSftpDelete(f.provider,'file');f.controls.failMethods=new Set(['REMOVE']);let failure;await assert.rejects(execute(f,plan),e=>{failure=e;return e.submitted===true&&e.acknowledged===false&&e.deleted===false;});await recovery(f,failure);assert.deepEqual(await fs.readFile(f.file),f.bytes);assert.equal(removes(f).length,1);
});
for(const status of [6,7,'timeout'])test('lost delete acknowledgement '+status+' is unknown and never retried',{timeout:20000},async t=>{
 const f=await fixture(t,status==='timeout'?250:10000),plan=await prepareSftpDelete(f.provider,'file');if(status==='timeout')f.controls.holdRemoveAck=true;else f.controls.removeStatus=status;let failure;await assert.rejects(execute(f,plan),e=>{failure=e;return e.code==='DELETE_OUTCOME_UNKNOWN'&&e.deleted===null&&e.submitted===true;});await recovery(f,failure);await assert.rejects(fs.access(f.file),{code:'ENOENT'});assert.equal(removes(f).length,1);await assert.rejects(execute(f,plan));assert.equal(removes(f).length,1);
});
test('replacement after acknowledged deletion is retained and reported as verification failure',{timeout:20000},async t=>{
 const f=await fixture(t),plan=await prepareSftpDelete(f.provider,'file');f.controls.afterRemove=()=>fs.writeFile(f.file,'foreign replacement');let failure;await assert.rejects(execute(f,plan),e=>{failure=e;return e.code==='DELETE_VERIFICATION_FAILED'&&e.acknowledged===true;});await recovery(f,failure);assert.equal(await fs.readFile(f.file,'utf8'),'foreign replacement');assert.equal(removes(f).length,1);
});
test('directories and symbolic links cannot be reviewed for file deletion',{timeout:20000},async t=>{
 const f=await fixture(t);await fs.mkdir(path.join(path.dirname(f.file),'directory'));await fs.symlink('file',path.join(path.dirname(f.file),'link'));for(const name of ['directory','link'])await assert.rejects(prepareSftpDelete(f.provider,name));assert.equal(removes(f).length,0);assert.deepEqual(await fs.readFile(f.file),f.bytes);
});
