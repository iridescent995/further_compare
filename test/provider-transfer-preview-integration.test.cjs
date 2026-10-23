'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs');
const {localFolderEndpoint}=require('../desktop/provider-folder-service.cjs');
const {SftpFolderProvider}=require('../desktop/sftp-folder-provider.cjs');
const {connectSftp}=require('../desktop/sftp-connection.cjs');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
const {prepareProviderCopy,revalidateProviderCopy,revokeProviderCopy}=require('../desktop/provider-transfer-preview.cjs');
async function until(check){const end=Date.now()+3000;while(!check()){if(Date.now()>end)throw Error('Fixture handles not closed');await new Promise(resolve=>setTimeout(resolve,10));}}
async function fixture(t){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-preview-integration-'))),connections=[],controls={};
 const binary=Buffer.alloc(11*1024*1024+3);for(let i=0;i<binary.length;i++)binary[i]=i%251;
 for(const side of ['source','destination'])await fs.mkdir(path.join(root,side));
 await fs.writeFile(path.join(root,'source','large.bin'),binary);await fs.writeFile(path.join(root,'source','replace.bin'),Buffer.from([1,0,255,2]));await fs.writeFile(path.join(root,'source','same.bin'),Buffer.from([8,0,254,9]));
 await fs.writeFile(path.join(root,'destination','mapped.bin'),Buffer.from([2,0,255,1]));await fs.writeFile(path.join(root,'destination','equal.bin'),Buffer.from([8,0,254,9]));
 const server=await createSftpServer({root,controls,writes:true,extensions:{'posix-rename@openssh.com':'1','fsync@openssh.com':'1'}});
 t.after(async()=>{for(const connection of connections)await connection.close();await until(()=>server.events.handlesOpened===server.events.handlesClosed);await server.close();await fs.rm(root,{recursive:true,force:true});});
 const endpoint=async(kind,side)=>{if(kind==='local'){const service=new FolderService(path.join(root,'backups-'+side));await service.select('a',path.join(root,side));return localFolderEndpoint(service,'a');}const connection=await connectSftp({host:server.host,port:server.port,username:'fixture-user',password:'fixture-secret',expectedFingerprint:server.fingerprint});connections.push(connection);return SftpFolderProvider.create(connection,'/'+side);};
 const inventory=async()=>{const result={};for(const side of ['source','destination']){const names=(await fs.readdir(path.join(root,side))).sort();result[side]=[];for(const name of names)result[side].push([name,(await fs.readFile(path.join(root,side,name))).toString('base64')]);}return result;};
 const noWrites=()=>assert.ok(!server.events.requests.some(row=>['write','remove','rename','fsetstat','setstat','mkdir','rmdir','extended'].includes(row[0])||row[0]==='open'&&row[2]!==1),'Preview must make no write-capable SFTP requests');
 return {root,server,controls,connections,endpoint,inventory,noWrites};
}
const mappings=[{source:'large.bin',target:'new-large.bin'},{source:'replace.bin',target:'mapped.bin'},{source:'same.bin',target:'equal.bin'}];
for(const [from,to] of [['local','remote'],['remote','local'],['remote','remote']])test(from+' to '+to+' preview and revalidation are read-only for new, mapped and equal binary targets',{timeout:30000},async t=>{
 const f=await fixture(t),source=await f.endpoint(from,'source'),destination=await f.endpoint(to,'destination'),before=await f.inventory();
 assert.notEqual(source,destination);assert.notEqual(source.rootId,destination.rootId);
 const plan=await prepareProviderCopy(source,destination,mappings);assert.deepEqual(plan.operations.map(op=>op.action),['create','replace','skip']);assert.equal(plan.totalBytes,11*1024*1024+3+4);assert.deepEqual(plan.operations.map(op=>[op.source,op.target]),mappings.map(op=>[op.source,op.target]));
 await revalidateProviderCopy(plan);f.noWrites();assert.deepEqual(await f.inventory(),before);await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
 revokeProviderCopy(plan);await assert.rejects(revalidateProviderCopy(plan));f.noWrites();
});
for(const changed of ['source','destination'])test('remote '+changed+' same-size mutation with restored mtime invalidates preview',{timeout:15000},async t=>{
 const f=await fixture(t),source=await f.endpoint('remote','source'),destination=await f.endpoint('remote','destination');
 const plan=await prepareProviderCopy(source,destination,[mappings[1]]),file=path.join(f.root,changed,changed==='source'?'replace.bin':'mapped.bin'),before=await fs.stat(file);
 const changedBytes=Buffer.from([9,0,255,8]);await fs.writeFile(file,changedBytes);await fs.utimes(file,before.atime,before.mtime);const stat=await fs.stat(file);assert.equal(stat.size,before.size);assert.equal(Math.floor(stat.mtimeMs/1000),Math.floor(before.mtimeMs/1000));
 await assert.rejects(revalidateProviderCopy(plan));f.noWrites();assert.deepEqual(await fs.readFile(file),changedBytes);await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
});
test('a destination appearing after preview invalidates remote copy without changing it',{timeout:15000},async t=>{
 const f=await fixture(t),source=await f.endpoint('remote','source'),destination=await f.endpoint('remote','destination');
 const plan=await prepareProviderCopy(source,destination,[{source:'replace.bin',target:'appeared.bin'}]);assert.equal(plan.operations[0].action,'create');const file=path.join(f.root,'destination','appeared.bin');await fs.writeFile(file,'external owner');await assert.rejects(revalidateProviderCopy(plan));assert.equal(await fs.readFile(file,'utf8'),'external owner');f.noWrites();await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
});
test('cancelling a remote preview read closes all real reader handles and writes nothing',{timeout:15000},async t=>{
 const f=await fixture(t),source=await f.endpoint('remote','source'),destination=await f.endpoint('local','destination'),before=await f.inventory(),controller=new AbortController();
 f.controls.holdReads=true;const pending=prepareProviderCopy(source,destination,[mappings[1]],{signal:controller.signal}),rejection=assert.rejects(pending,error=>error.code==='ABORT_ERR'||/cancel|abort/i.test(error.message));
 await until(()=>f.server.events.requests.some(row=>row[0]==='read'));controller.abort();await rejection;await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);f.noWrites();assert.deepEqual(await f.inventory(),before);
});
