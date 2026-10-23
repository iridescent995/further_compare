'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {connectSftp}=require('../desktop/sftp-connection.cjs');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
async function fixture(t,options={}){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-sftp-write-')));
 const server=await createSftpServer({root,...options,controls:{onError:(name,error)=>{if(process.env.FC_FIXTURE_DEBUG)console.error(name,error);},...options.controls}});let connection;
 t.after(async()=>{if(connection)await connection.close();await server.close();await fs.rm(root,{recursive:true,force:true});});
 connection=await connectSftp({host:server.host,port:server.port,username:'fixture-user',password:'fixture-secret',expectedFingerprint:server.fingerprint});
 return {root,server,connection};
}
for(const [name,extensions,expected] of [
 ['absent',{}, {atomicRename:false,fsync:false}],
 ['unknown versions',{'posix-rename@openssh.com':'2','fsync@openssh.com':'0'}, {atomicRename:false,fsync:false}],
 ['rename only',{'posix-rename@openssh.com':'1'}, {atomicRename:true,fsync:false}],
 ['fsync only',{'fsync@openssh.com':'1'}, {atomicRename:false,fsync:true}],
])test('negotiated capabilities: '+name,async t=>{
 const {connection,server}=await fixture(t,{extensions});assert.deepEqual(connection.capabilities,expected);assert.ok(Object.isFrozen(connection.capabilities));assert.throws(()=>{connection.capabilities.atomicRename=true;});
 if(!expected.atomicRename)await assert.rejects(connection.request('ext_openssh_rename',['/source','/target']),{code:'UNSUPPORTED_CAPABILITY'});
 if(!expected.fsync)await assert.rejects(connection.request('ext_openssh_fsync',[Buffer.from('1')]),{code:'UNSUPPORTED_CAPABILITY'});
 assert.equal(server.events.requests.length,0,'Unsupported extensions must not reach wire');assert.equal(connection.closed,false);
});
test('advertised atomic rename replaces exact bytes after exclusive stage, permission and fsync',async t=>{
 const {root,connection,server}=await fixture(t,{writes:true,extensions:{'posix-rename@openssh.com':'1','fsync@openssh.com':'1'}});
 await fs.writeFile(path.join(root,'original.txt'),'original');const bytes=Buffer.from([0xff,0xfe,0x61,0,0x0d,0,0x0a,0]);
 const [handle]=await connection.request('open',['/.stage','wx',0o600]);
 await assert.rejects(connection.request('open',['/.stage','wx',0o600]));
 await connection.request('write',[handle,bytes,0,3,0]);await connection.request('write',[handle,bytes,3,bytes.length-3,3]);
 await connection.request('fsetstat',[handle,{mode:0o640}]);await connection.request('ext_openssh_fsync',[handle]);await connection.request('close',[handle]);
 assert.equal(await fs.readFile(path.join(root,'original.txt'),'utf8'),'original');
 await connection.request('ext_openssh_rename',['/.stage','/original.txt']);assert.deepEqual(await fs.readFile(path.join(root,'original.txt')),bytes);assert.equal((await fs.stat(path.join(root,'original.txt'))).mode&0o777,0o640);assert.deepEqual(await fs.readdir(root),['original.txt']);
 assert.equal(server.events.handlesOpened,server.events.handlesClosed);
});
test('read-only default refuses stage creation and preserves original',async t=>{
 const {root,connection}=await fixture(t);await fs.writeFile(path.join(root,'original'),'keep');await assert.rejects(connection.request('open',['/original','wx',0o600]));await assert.rejects(connection.request('open',['/new','wx',0o600]));assert.deepEqual(await fs.readdir(root),['original']);assert.equal(await fs.readFile(path.join(root,'original'),'utf8'),'keep');
});
test('write failure cleans only owned stage with explicit unlink',async t=>{
 const controls={failMethods:new Set(['WRITE'])},{root,connection}=await fixture(t,{writes:true,controls});await fs.writeFile(path.join(root,'original'),'keep');const [handle]=await connection.request('open',['/.stage','wx',0o600]);await assert.rejects(connection.request('write',[handle,Buffer.from('new'),0,3,0]));await connection.request('close',[handle]);await connection.request('unlink',['/.stage']);assert.deepEqual(await fs.readdir(root),['original']);assert.equal(await fs.readFile(path.join(root,'original'),'utf8'),'keep');
});
test('timeout after rename acknowledgment loss preserves unknown outcome',async t=>{
 const controls={holdExtendedAck:new Set(['posix-rename@openssh.com'])},{root,connection}=await fixture(t,{writes:true,controls,extensions:{'posix-rename@openssh.com':'1'}});await fs.writeFile(path.join(root,'original'),'old');await fs.writeFile(path.join(root,'.stage'),'new');await assert.rejects(connection.request('ext_openssh_rename',['/.stage','/original'],{timeoutMs:100}),{code:'ETIMEDOUT'});assert.equal(await fs.readFile(path.join(root,'original'),'utf8'),'new');assert.equal(connection.closed,true);
});
