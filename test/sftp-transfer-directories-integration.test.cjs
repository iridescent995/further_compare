'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {connectSftp}=require('../desktop/sftp-connection.cjs'),{SftpFolderProvider}=require('../desktop/sftp-folder-provider.cjs');
const {prepareSftpDirectory,createSftpDirectory,finalizeSftpDirectory}=require('../desktop/sftp-transfer-directories.cjs');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
async function until(check){const end=Date.now()+3000;while(!check()){if(Date.now()>end)throw Error('Fixture event deadline');await new Promise(resolve=>setTimeout(resolve,10));}}
async function fixture(t,requestTimeoutMs=10000){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-sftp-directories-'))),controls={};await fs.mkdir(path.join(root,'source'));await fs.chmod(path.join(root,'source'),0o751);await fs.utimes(path.join(root,'source'),1234567890,1234567890);await fs.mkdir(path.join(root,'target'));
 const server=await createSftpServer({root,controls,writes:true}),connection=await connectSftp({host:server.host,port:server.port,username:'fixture-user',password:'fixture-secret',expectedFingerprint:server.fingerprint,requestTimeoutMs});
 t.after(async()=>{await connection.close();await until(()=>server.events.handlesOpened===server.events.handlesClosed);await server.close();await fs.chmod(path.join(root,'target'),0o700).catch(()=>{});await fs.rm(root,{recursive:true,force:true});});
 const provider=await SftpFolderProvider.create(connection,'/target'),sourceProvider=await SftpFolderProvider.create(connection,'/'),sourceMetadata=await sourceProvider.inspectEntry('source');
 return {root,controls,server,connection,provider,sourceMetadata};
}
test('caller creates nested and empty SFTP directories in order then finalizes source metadata',{timeout:15000},async t=>{
 const f=await fixture(t);await assert.rejects(prepareSftpDirectory(f.provider,'parent/child'));
 const parent=await createSftpDirectory(await prepareSftpDirectory(f.provider,'parent'));assert.equal((await fs.stat(path.join(f.root,'target/parent'))).mode&0o777,0o700);
 const child=await createSftpDirectory(await prepareSftpDirectory(f.provider,'parent/child'));
 const childResult=await finalizeSftpDirectory(child,f.sourceMetadata,[]);await finalizeSftpDirectory(parent,f.sourceMetadata,[{name:'child',kind:'directory',identity:childResult.observation.metadata.identity,stamp:childResult.observation.metadata.stamp}]);
 for(const relative of ['parent','parent/child']){const stat=await fs.stat(path.join(f.root,'target',relative));assert.equal(stat.mode&0o777,0o751);assert.equal(Math.floor(stat.mtimeMs/1000),1234567890);}
 assert.deepEqual(await fs.readdir(path.join(f.root,'target/parent/child')),[]);assert.deepEqual(f.server.events.requests.filter(row=>row[0]==='mkdir').map(row=>row[1]),['/target/parent','/target/parent/child']);await assert.rejects(finalizeSftpDirectory(child,f.sourceMetadata,[]));
});
test('existing target collision never overwrites the directory or its children',{timeout:15000},async t=>{
 const f=await fixture(t),plan=await prepareSftpDirectory(f.provider,'occupied');await fs.mkdir(path.join(f.root,'target/occupied'));await fs.writeFile(path.join(f.root,'target/occupied/owner'),'keep');await assert.rejects(createSftpDirectory(plan));assert.equal(await fs.readFile(path.join(f.root,'target/occupied/owner'),'utf8'),'keep');assert.ok(!f.server.events.requests.some(row=>['remove','rmdir'].includes(row[0])));
});
test('changed parent and symlink parent reject before creating children',{timeout:15000},async t=>{
 const f=await fixture(t);await fs.mkdir(path.join(f.root,'target/parent'));const plan=await prepareSftpDirectory(f.provider,'parent/child');await fs.chmod(path.join(f.root,'target/parent'),0o711);await assert.rejects(createSftpDirectory(plan));await assert.rejects(fs.access(path.join(f.root,'target/parent/child')));
 await fs.symlink('../source',path.join(f.root,'target/alias'));await assert.rejects(prepareSftpDirectory(f.provider,'alias/child'));assert.deepEqual(await fs.readdir(path.join(f.root,'source')),[]);
});
test('unexpected namespace at finalize is retained and metadata is not applied',{timeout:15000},async t=>{
 const f=await fixture(t),created=await createSftpDirectory(await prepareSftpDirectory(f.provider,'new'));await fs.writeFile(path.join(f.root,'target/new/foreign'),'keep');await assert.rejects(finalizeSftpDirectory(created,f.sourceMetadata,[]));assert.equal(await fs.readFile(path.join(f.root,'target/new/foreign'),'utf8'),'keep');assert.equal((await fs.stat(path.join(f.root,'target/new'))).mode&0o777,0o700);
});
test('cancellation before create sends no MKDIR',{timeout:15000},async t=>{
 const f=await fixture(t),plan=await prepareSftpDirectory(f.provider,'cancelled'),controller=new AbortController();controller.abort();await assert.rejects(createSftpDirectory(plan,{signal:controller.signal}),error=>error.code==='ABORT_ERR'||/cancel|abort/i.test(error.message));assert.ok(!f.server.events.requests.some(row=>row[0]==='mkdir'));await assert.rejects(fs.access(path.join(f.root,'target/cancelled')));
});
test('cancellation of an in-flight MKDIR reports uncertain outcome without removing paths',{timeout:15000},async t=>{
 const f=await fixture(t),plan=await prepareSftpDirectory(f.provider,'held'),controller=new AbortController();f.controls.holdMethods=new Set(['MKDIR']);const pending=createSftpDirectory(plan,{signal:controller.signal}),rejection=assert.rejects(pending,{code:'DIRECTORY_OUTCOME_UNKNOWN'});await until(()=>f.server.events.requests.some(row=>row[0]==='mkdir'));controller.abort();await rejection;assert.ok(!f.server.events.requests.some(row=>['remove','rmdir'].includes(row[0])));
});
test('lost MKDIR acknowledgment reports unknown while preserving created empty directory',{timeout:15000},async t=>{
 const f=await fixture(t,150),plan=await prepareSftpDirectory(f.provider,'unknown');f.controls.holdMkdirAck=true;await assert.rejects(createSftpDirectory(plan),{code:'DIRECTORY_OUTCOME_UNKNOWN'});assert.deepEqual(await fs.readdir(path.join(f.root,'target/unknown')),[]);assert.equal(f.server.events.requests.filter(row=>row[0]==='mkdir').length,1);
});
test('metadata application failure preserves the created directory',{timeout:15000},async t=>{
 const f=await fixture(t),created=await createSftpDirectory(await prepareSftpDirectory(f.provider,'retained'));f.controls.failMethods=new Set(['SETSTAT']);await assert.rejects(finalizeSftpDirectory(created,f.sourceMetadata,[]));assert.ok((await fs.stat(path.join(f.root,'target/retained'))).isDirectory());assert.equal((await fs.stat(path.join(f.root,'target/retained'))).mode&0o777,0o700);assert.ok(!f.server.events.requests.some(row=>['remove','rmdir'].includes(row[0])));
});
test('lost metadata acknowledgment reports unknown and retains applied metadata',{timeout:15000},async t=>{
 const f=await fixture(t,150),created=await createSftpDirectory(await prepareSftpDirectory(f.provider,'metadata'));f.controls.holdSetstatAck=true;await assert.rejects(finalizeSftpDirectory(created,f.sourceMetadata,[]),{code:'DIRECTORY_OUTCOME_UNKNOWN'});const stat=await fs.stat(path.join(f.root,'target/metadata'));assert.equal(stat.mode&0o777,0o751);assert.equal(Math.floor(stat.mtimeMs/1000),1234567890);
});
