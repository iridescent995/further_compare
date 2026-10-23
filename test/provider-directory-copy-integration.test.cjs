'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs'),{localFolderEndpoint}=require('../desktop/provider-folder-service.cjs');
const {SftpFolderProvider}=require('../desktop/sftp-folder-provider.cjs'),{connectSftp}=require('../desktop/sftp-connection.cjs');
const {snapshotProviderFile}=require('../desktop/provider-file-snapshot.cjs');
const {prepareSftpDirectory,createSftpDirectory,finalizeSftpDirectory}=require('../desktop/sftp-transfer-directories.cjs');
const {prepareLocalDirectory,createLocalDirectory,finalizeLocalDirectory}=require('../desktop/local-transfer-directories.cjs');
const {transferFileToSftp}=require('../desktop/sftp-transfer-writer.cjs'),{transferFileToLocal}=require('../desktop/local-transfer-writer.cjs');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
async function until(check){const end=Date.now()+3000;while(!check()){if(Date.now()>end)throw Error('Fixture handles not closed');await new Promise(resolve=>setTimeout(resolve,10));}}
for(const [from,to]of [['local','remote'],['remote','local'],['remote','remote']])test(from+' to '+to+' directory and file primitives compose parent-first and finalize deepest-first',{timeout:30000},async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-directory-composed-'))),connections=[],sourceRoot=path.join(root,'source'),targetRoot=path.join(root,'target');await fs.mkdir(path.join(sourceRoot,'tree/nested/empty'),{recursive:true});await fs.mkdir(targetRoot);
 const bytes=Buffer.alloc(1024*1024+7);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;await fs.writeFile(path.join(sourceRoot,'tree/nested/payload.bin'),bytes);await fs.writeFile(path.join(sourceRoot,'tree/empty.bin'),Buffer.alloc(0));await fs.chmod(path.join(sourceRoot,'tree/nested/payload.bin'),0o640);
 const dirs=[{path:'tree',mode:0o750,time:1234567000},{path:'tree/nested',mode:0o751,time:1234567001},{path:'tree/nested/empty',mode:0o700,time:1234567002}];for(const dir of dirs){await fs.chmod(path.join(sourceRoot,dir.path),dir.mode);await fs.utimes(path.join(sourceRoot,dir.path),dir.time,dir.time);}
 const server=await createSftpServer({root,writes:true,extensions:{'posix-rename@openssh.com':'1','fsync@openssh.com':'1'}});
 t.after(async()=>{for(const connection of connections)await connection.close();await until(()=>server.events.handlesOpened===server.events.handlesClosed);await server.close();await fs.rm(root,{recursive:true,force:true});});
 const services={};async function endpoint(kind,side){if(kind==='local'){const service=new FolderService(path.join(root,'backup-'+side));await service.select('a',side==='source'?sourceRoot:targetRoot);services[side]=service;return localFolderEndpoint(service,'a');}const connection=await connectSftp({host:server.host,port:server.port,username:'fixture-user',password:'fixture-secret',expectedFingerprint:server.fingerprint});connections.push(connection);return SftpFolderProvider.create(connection,'/'+side);}
 const source=await endpoint(from,'source'),destination=await endpoint(to,'target'),sourceDirs=new Map(),created=new Map(),resultMetadata=new Map();
 for(const dir of dirs)sourceDirs.set(dir.path,await source.inspectEntry(dir.path));
 for(const dir of dirs){const prepared=to==='remote'?await prepareSftpDirectory(destination,dir.path):await prepareLocalDirectory(services.target,'a',dir.path);created.set(dir.path,to==='remote'?await createSftpDirectory(prepared):await createLocalDirectory(prepared));assert.equal((await fs.stat(path.join(targetRoot,dir.path))).mode&0o777,0o700);}
 for(const relative of ['tree/nested/payload.bin','tree/empty.bin']){const observation=await snapshotProviderFile(source,relative),result=to==='remote'?await transferFileToSftp(source,relative,observation,destination,relative,null):await transferFileToLocal(source,relative,observation,services.target,'a',relative,null);resultMetadata.set(relative,result.observation.metadata);}
 for(const dir of [...dirs].reverse()){
  const children=[...resultMetadata].filter(([relative])=>path.posix.dirname(relative)===dir.path).map(([relative,metadata])=>({name:path.posix.basename(relative),kind:metadata.kind,identity:metadata.identity,stamp:metadata.stamp}));
  const result=to==='remote'?await finalizeSftpDirectory(created.get(dir.path),sourceDirs.get(dir.path),children):await finalizeLocalDirectory(created.get(dir.path),sourceDirs.get(dir.path),children);resultMetadata.set(dir.path,result.observation.metadata);
 }
 assert.deepEqual(await fs.readFile(path.join(targetRoot,'tree/nested/payload.bin')),bytes);assert.deepEqual(await fs.readFile(path.join(targetRoot,'tree/empty.bin')),Buffer.alloc(0));assert.deepEqual(await fs.readdir(path.join(targetRoot,'tree/nested/empty')),[]);assert.equal((await fs.stat(path.join(targetRoot,'tree/nested/payload.bin'))).mode&0o777,0o640);
 for(const dir of dirs){for(const folder of [sourceRoot,targetRoot]){const stat=await fs.stat(path.join(folder,dir.path));assert.equal(stat.mode&0o777,dir.mode);assert.equal(Math.floor(stat.mtimeMs/1000),dir.time);}}
 assert.deepEqual(await fs.readFile(path.join(sourceRoot,'tree/nested/payload.bin')),bytes);assert.deepEqual(await fs.readFile(path.join(sourceRoot,'tree/empty.bin')),Buffer.alloc(0));assert.deepEqual((await fs.readdir(path.join(sourceRoot,'tree'))).sort(),['empty.bin','nested']);assert.deepEqual((await fs.readdir(path.join(targetRoot,'tree'))).sort(),['empty.bin','nested']);await until(()=>server.events.handlesOpened===server.events.handlesClosed);
});
