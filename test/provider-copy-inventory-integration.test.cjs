'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs'),{localFolderEndpoint,ProviderFolderService}=require('../desktop/provider-folder-service.cjs');
const {SftpFolderProvider}=require('../desktop/sftp-folder-provider.cjs'),{connectSftp}=require('../desktop/sftp-connection.cjs');
const {FolderAlignment}=require('../desktop/folder-alignment.cjs'),{FilenameMatching}=require('../desktop/folder-filename-matching.cjs');
const {prepareProviderCopyInventory,revalidateProviderCopyInventory,revokeProviderCopyInventory}=require('../desktop/provider-copy-inventory.cjs');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
async function until(check){const end=Date.now()+3000;while(!check()){if(Date.now()>end)throw Error('Remote handles not released');await new Promise(resolve=>setTimeout(resolve,10));}}
async function fixture(t,kinds={a:'remote',b:'remote'}){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-copy-inventory-'))),controls={},connections=[];
 const content={a:{'chain/java/oracle/changed.txt':'left','chain/java/oracle/same.txt':'same','chain/java/oracle/case.txt':'HELLO','chain/java/oracle/hidden.tmp':'left tmp','selected/duplicate.txt':'chosen','outside/duplicate.txt':'outside','selected/unique.txt':'unique','r:日本語.bin':'remote name'},b:{'chain/java/oracle/changed.txt':'rght','chain/java/oracle/same.txt':'same','chain/java/oracle/case.txt':'hello','chain/java/oracle/hidden.tmp':'rght tmp','moved/duplicate.txt':'other','moved/unique.txt':'unique','mapped/old.txt':'old!'}};
 if(kinds.a==='local')delete content.a['r:日本語.bin'];
 for(const side of ['a','b']){await fs.mkdir(path.join(root,side));for(const [name,text]of Object.entries(content[side])){await fs.mkdir(path.dirname(path.join(root,side,name)),{recursive:true});await fs.writeFile(path.join(root,side,name),text);}}await fs.mkdir(path.join(root,'a','empty'));
 const server=await createSftpServer({root,controls});t.after(async()=>{for(const connection of connections)await connection.close();await until(()=>server.events.handlesOpened===server.events.handlesClosed);await server.close();await fs.rm(root,{recursive:true,force:true});});
 const endpoints={};for(const side of ['a','b'])if(kinds[side]==='local'){const service=new FolderService(path.join(root,'backups'+side));await service.select(side,path.join(root,side));endpoints[side]=localFolderEndpoint(service,side);}else{const connection=await connectSftp({host:server.host,port:server.port,username:'fixture-user',password:'fixture-secret',expectedFingerprint:server.fingerprint});connections.push(connection);endpoints[side]=await SftpFolderProvider.create(connection,'/'+side);}
 return {root,content,controls,server,kinds,service:new ProviderFolderService(endpoints),noWrites(){assert.ok(!server.events.requests.some(row=>['write','remove','rename','fsetstat','setstat','mkdir','rmdir','extended'].includes(row[0])||row[0]==='open'&&row[2]!==1));}};
}
for(const kinds of [{a:'local',b:'remote'},{a:'remote',b:'local'},{a:'remote',b:'remote'}])test(kinds.a+' to '+kinds.b+' collapsed subtree scope inventories descendants and empty directories',{timeout:15000},async t=>{
 const f=await fixture(t,kinds),inventory=await prepareProviderCopyInventory(f.service,'a',['chain','empty'],{endpointKinds:kinds,scope:{include:'*.txt',exclude:'*same.txt',status:'diff'}}),files=inventory.selectedMappings.filter(item=>item.kind==='file');
 assert.deepEqual(files.map(item=>item.source).sort(),['chain/java/oracle/case.txt','chain/java/oracle/changed.txt']);assert.ok(files.every(item=>item.source===item.target));assert.ok(inventory.requiredDirectories.some(item=>item.target==='chain/java/oracle'));await revalidateProviderCopyInventory(inventory);f.noWrites();revokeProviderCopyInventory(inventory);await assert.rejects(revalidateProviderCopyInventory(inventory));
});
test('manual file and directory mappings preserve actual target paths across collapsed selection',{timeout:15000},async t=>{
 const f=await fixture(t),alignment=new FolderAlignment([{a:'chain',b:'new-chain',kind:'directory'},{a:'selected/unique.txt',b:'mapped/old.txt',kind:'file'}],f.kinds);
 const inventory=await prepareProviderCopyInventory(f.service,'a',['chain','selected/unique.txt','empty'],{alignment,endpointKinds:f.kinds});
 assert.ok(inventory.selectedMappings.some(item=>item.source==='selected/unique.txt'&&item.target==='mapped/old.txt'));assert.ok(inventory.selectedMappings.some(item=>item.source==='chain/java/oracle/changed.txt'&&item.target==='new-chain/java/oracle/changed.txt'));assert.ok(inventory.requiredDirectories.some(item=>item.target==='new-chain/java/oracle'&&item.exists===false));assert.ok(inventory.requiredDirectories.some(item=>item.target==='empty'));f.noWrites();
});
test('remote colon and Unicode root names remain valid source paths',{timeout:15000},async t=>{
 const f=await fixture(t),inventory=await prepareProviderCopyInventory(f.service,'a',['r:日本語.bin'],{endpointKinds:f.kinds});assert.deepEqual(inventory.selectedMappings.map(({source,target,kind})=>({source,target,kind})),[{source:'r:日本語.bin',target:'r:日本語.bin',kind:'file'}]);await revalidateProviderCopyInventory(inventory);f.noWrites();
});
test('text-case status filtering excludes normalized-equal files from copy mappings',{timeout:15000},async t=>{
 const f=await fixture(t),inventory=await prepareProviderCopyInventory(f.service,'a',['chain'],{endpointKinds:f.kinds,scope:{include:'*.txt',status:'diff',rules:{mode:'text-case'}}});assert.deepEqual(inventory.selectedMappings.filter(item=>item.kind==='file').map(item=>item.source),['chain/java/oracle/changed.txt']);assert.ok(f.server.events.requests.some(row=>row[0]==='read'),'Text status must compare real contents');f.noWrites();
});
test('selected source content mutation with restored timestamps invalidates inventory',{timeout:15000},async t=>{
 const f=await fixture(t),inventory=await prepareProviderCopyInventory(f.service,'a',['chain/java/oracle/changed.txt'],{endpointKinds:f.kinds}),file=path.join(f.root,'a','chain/java/oracle/changed.txt'),before=await fs.stat(file);await fs.writeFile(file,'EDIT');await fs.utimes(file,before.atime,before.mtime);await assert.rejects(revalidateProviderCopyInventory(inventory));assert.equal(await fs.readFile(file,'utf8'),'EDIT');f.noWrites();
});
test('inventory cancellation closes a held remote directory enumeration',{timeout:15000},async t=>{
 const f=await fixture(t),controller=new AbortController();f.controls.holdMethods=new Set(['READDIR']);const pending=prepareProviderCopyInventory(f.service,'a',['chain'],{endpointKinds:f.kinds,signal:controller.signal}),rejection=assert.rejects(pending,error=>error.code==='ABORT_ERR'||/abort|cancel/i.test(error.message));await until(()=>f.server.events.requests.some(row=>row[0]==='readdir'));controller.abort();await rejection;await until(()=>f.server.events.handlesOpened===f.server.events.handlesClosed);f.noWrites();
});
test('filename mapping uses duplicate names outside the selected subtree',{timeout:15000},async t=>{
 const f=await fixture(t),manual=new FolderAlignment([],f.kinds);
 const partial={a:{identity:'partial-a',skipped:0,entries:new Map([['selected',{kind:'directory'}],['selected/duplicate.txt',{kind:'file'}],['selected/unique.txt',{kind:'file'}]])},b:{identity:'partial-b',skipped:0,entries:new Map([['moved',{kind:'directory'}],['moved/duplicate.txt',{kind:'file'}],['moved/unique.txt',{kind:'file'}]])}};
 const staleAlignment=new FilenameMatching(partial,manual,{},f.kinds),full={};
 for(const side of ['a','b']){const entries=new Map();async function walk(relative=''){for(const entry of await fs.readdir(path.join(f.root,side,relative),{withFileTypes:true})){const name=relative?relative+'/'+entry.name:entry.name;entries.set(name,{kind:entry.isDirectory()?'directory':'file'});if(entry.isDirectory())await walk(name);}}await walk();full[side]={identity:side,skipped:0,entries};}
 const actualAlignment=new FilenameMatching(full,manual,{},f.kinds),expected=actualAlignment.counterpart('a','selected/duplicate.txt');assert.notEqual(expected,staleAlignment.counterpart('a','selected/duplicate.txt'));
 const inventory=await prepareProviderCopyInventory(f.service,'a',['selected'],{endpointKinds:f.kinds,alignment:staleAlignment});assert.equal(inventory.selectedMappings.find(item=>item.source==='selected/duplicate.txt').target,expected);assert.equal(inventory.selectedMappings.find(item=>item.source==='selected/unique.txt').target,actualAlignment.counterpart('a','selected/unique.txt'));assert.ok(!inventory.selectedMappings.some(item=>item.source.startsWith('outside/')));f.noWrites();
});
test('one-sided remote file is excluded by newer-left status despite destination scaffolding',{timeout:15000},async t=>{
 const f=await fixture(t),inventory=await prepareProviderCopyInventory(f.service,'a',['r:日本語.bin'],{endpointKinds:f.kinds,scope:{status:'newer-left'}});assert.deepEqual(inventory.selectedMappings,[]);assert.deepEqual(inventory.requiredDirectories,[]);await revalidateProviderCopyInventory(inventory);f.noWrites();
});
test('remote symlink targets and symlink ancestors reject before producing a copy review',{timeout:15000},async t=>{
 const f=await fixture(t);await fs.symlink('mapped/old.txt',path.join(f.root,'b','linked.txt'));await fs.symlink('mapped',path.join(f.root,'b','linked-dir'));
 for(const target of ['linked.txt','linked-dir/new.txt']){
  const alignment=new FolderAlignment([{a:'selected/unique.txt',b:target,kind:'file'}],f.kinds);
  await assert.rejects(prepareProviderCopyInventory(f.service,'a',['selected/unique.txt'],{endpointKinds:f.kinds,alignment}));
 }
 assert.equal(await fs.readFile(path.join(f.root,'b','mapped/old.txt'),'utf8'),'old!');assert.deepEqual(await fs.readdir(path.join(f.root,'b','mapped')),['old.txt']);assert.ok(!f.server.events.requests.some(row=>['open','opendir','realpath','lstat'].includes(row[0])&&/^\/b\/linked(?:\.txt|-dir)(?:\/|$)/.test(String(row[1]))),'Rejected symlink destinations must not be followed or opened');f.noWrites();
});
