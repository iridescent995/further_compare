'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {SftpFolderProvider}=require('../desktop/sftp-folder-provider.cjs');
const {connectSftp}=require('../desktop/sftp-connection.cjs');
const {snapshotProviderFile}=require('../desktop/provider-file-snapshot.cjs');
const {backupProviderFiles}=require('../desktop/provider-transfer-backup.cjs');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
async function until(check){const end=Date.now()+3000;while(!check()){if(Date.now()>end)throw Error('Remote handles not released');await new Promise(resolve=>setTimeout(resolve,10));}}
async function fixture(t){
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-backup-integration-'))),root=path.join(base,'remote'),backupRoot=path.join(base,'recovery'),controls={};await fs.mkdir(root);await fs.mkdir(backupRoot);
 const large=Buffer.alloc(11*1024*1024+17);for(let i=0;i<large.length;i++)large[i]=i%251;
 const files={'large.bin':large,'empty.bin':Buffer.alloc(0),'résumé:日本語.bin':Buffer.from([0,1,254,255,10,0])};
 for(const [name,bytes] of Object.entries(files))await fs.writeFile(path.join(root,name),bytes);
 const server=await createSftpServer({root,controls,writes:true,extensions:{'posix-rename@openssh.com':'1'}}),connection=await connectSftp({host:server.host,port:server.port,username:'fixture-user',password:'fixture-secret',expectedFingerprint:server.fingerprint});
 t.after(async()=>{await connection.close();await until(()=>server.events.handlesOpened===server.events.handlesClosed);await server.close();await fs.rm(base,{recursive:true,force:true});});
 const provider=await SftpFolderProvider.create(connection,'/');
 const entries=async names=>{const output=[];for(const name of names)output.push({path:name,observation:await snapshotProviderFile(provider,name)});return output;};
 const noWrites=()=>assert.ok(!server.events.requests.some(row=>['write','remove','rename','fsetstat','setstat','mkdir','rmdir','extended'].includes(row[0])||row[0]==='open'&&row[2]!==1),'Backup must not mutate SFTP source');
 return {base,root,backupRoot,controls,files,server,connection,provider,entries,noWrites};
}
async function manifests(root){const found=[];async function walk(dir){let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}for(const entry of entries){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else if(entry.name.endsWith('.json'))found.push({path:file,value:JSON.parse(await fs.readFile(file,'utf8'))});}}await walk(root);return found;}
test('real SFTP backup preserves large binary, empty and Unicode-colon names in verified local recovery files',{timeout:30000},async t=>{
 const f=await fixture(t),entries=await f.entries(Object.keys(f.files)),result=await backupProviderFiles(f.provider,entries,f.backupRoot);
 assert.equal(path.dirname(result.backupPath),f.backupRoot);assert.equal(result.manifestPath,path.join(result.backupPath,'manifest.json'));
 const manifest=JSON.parse(await fs.readFile(result.manifestPath,'utf8'));assert.equal(manifest.version,1);assert.equal(manifest.kind,'provider-transfer-backup');assert.deepEqual(manifest.files.map(({observation,...record})=>record),result.files);for(const record of manifest.files){assert.equal(record.observation.sha256,record.sha256);assert.equal(record.observation.metadata.path,record.path);assert.equal(record.observation.byteLength,record.byteLength);}assert.equal(result.files.length,3);
 for(const record of result.files){const expected=f.files[record.path];assert.ok(expected);assert.ok(/^[0-9a-f-]+\.bin$/i.test(record.backupName));assert.equal(path.basename(record.backupName),record.backupName);assert.equal(record.byteLength,expected.length);assert.equal(record.sha256,createHash('sha256').update(expected).digest('hex'));assert.deepEqual(await fs.readFile(path.join(result.backupPath,record.backupName)),expected);assert.deepEqual(await fs.readFile(path.join(f.root,record.path)),expected);}
 assert.equal((await fs.readdir(result.backupPath)).length,4);assert.equal(new Set(result.files.map(record=>record.backupName)).size,3);f.noWrites();await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
});
test('SFTP backup rejects same-sized source edits with restored mtime and never publishes a complete manifest',{timeout:15000},async t=>{
 const f=await fixture(t),name='résumé:日本語.bin',entries=await f.entries([name]),file=path.join(f.root,name),before=await fs.stat(file),modified=Buffer.from([9,1,254,255,10,0]);
 await fs.writeFile(file,modified);await fs.utimes(file,before.atime,before.mtime);assert.equal((await fs.stat(file)).size,before.size);assert.equal(Math.floor((await fs.stat(file)).mtimeMs/1000),Math.floor(before.mtimeMs/1000));
 await assert.rejects(backupProviderFiles(f.provider,entries,f.backupRoot));assert.deepEqual(await manifests(f.backupRoot),[]);assert.deepEqual(await fs.readFile(file),modified);f.noWrites();await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
});
test('cancelling a held SFTP backup read closes handles and leaves no complete manifest',{timeout:15000},async t=>{
 const f=await fixture(t),entries=await f.entries(['large.bin']),controller=new AbortController(),readCount=f.server.events.requests.filter(row=>row[0]==='read').length;
 f.controls.holdReads=true;const pending=backupProviderFiles(f.provider,entries,f.backupRoot,{signal:controller.signal}),rejection=assert.rejects(pending,error=>error.code==='ABORT_ERR'||/abort|cancel/i.test(error.message));
 await until(()=>f.server.events.requests.filter(row=>row[0]==='read').length>readCount);controller.abort();await rejection;await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);
 assert.deepEqual(await manifests(f.backupRoot),[]);assert.deepEqual(await fs.readFile(path.join(f.root,'large.bin')),f.files['large.bin']);f.noWrites();
});
