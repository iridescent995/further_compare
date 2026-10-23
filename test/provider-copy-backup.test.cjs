'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs');
const {localFolderEndpoint}=require('../desktop/provider-folder-service.cjs');
const {prepareProviderCopy,backupProviderCopy,revokeProviderCopy}=require('../desktop/provider-transfer-preview.cjs');
async function fixture(t){
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-copy-backup-')));
 t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const left=path.join(base,'left'),right=path.join(base,'right'),backups=path.join(base,'recovery');
 await Promise.all([fs.mkdir(left),fs.mkdir(right),fs.mkdir(backups)]);
 const service=new FolderService(backups);await service.select('a',left);await service.select('b',right);
 return {left,right,backups,source:localFolderEndpoint(service,'a'),destination:localFolderEndpoint(service,'b')};
}
test('copy recovery uses approved replacement targets only and leaves all originals intact',async t=>{
 const f=await fixture(t);
 await Promise.all([fs.writeFile(path.join(f.left,'new.bin'),Buffer.from([0,255,3])),fs.writeFile(path.join(f.left,'changed.txt'),'replacement'),fs.writeFile(path.join(f.left,'same.txt'),'same'),fs.writeFile(path.join(f.right,'mapped.txt'),'original'),fs.writeFile(path.join(f.right,'same.txt'),'same')]);
 const plan=await prepareProviderCopy(f.source,f.destination,[{source:'new.bin',target:'new.bin'},{source:'changed.txt',target:'mapped.txt'},{source:'same.txt',target:'same.txt'}]);
 const result=await backupProviderCopy(plan,f.backups);
 assert.equal(result.files.length,1);assert.equal(result.files[0].path,'mapped.txt');
 assert.equal(await fs.readFile(path.join(result.backupPath,result.files[0].backupName),'utf8'),'original');
 assert.equal(await fs.readFile(path.join(f.right,'mapped.txt'),'utf8'),'original');
 assert.deepEqual((await fs.readdir(f.right)).sort(),['mapped.txt','same.txt']);
 assert.equal(await fs.readFile(path.join(f.left,'changed.txt'),'utf8'),'replacement');
});
test('new-file-only copy needs no recovery directory and revoked previews cannot write backups',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.left,'new.txt'),'new');
 const plan=await prepareProviderCopy(f.source,f.destination,[{source:'new.txt',target:'new.txt'}]);
 assert.equal(await backupProviderCopy(plan,f.backups),null);assert.deepEqual(await fs.readdir(f.backups),[]);
 revokeProviderCopy(plan);await assert.rejects(backupProviderCopy(plan,f.backups));assert.deepEqual(await fs.readdir(f.backups),[]);
});
test('destination changes since review reject before recovery files are created',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.left,'a.txt'),'new');await fs.writeFile(path.join(f.right,'a.txt'),'old');
 const plan=await prepareProviderCopy(f.source,f.destination,[{source:'a.txt',target:'a.txt'}]);
 await fs.writeFile(path.join(f.right,'a.txt'),'external');
 await assert.rejects(backupProviderCopy(plan,f.backups));assert.deepEqual(await fs.readdir(f.backups),[]);
 assert.equal(await fs.readFile(path.join(f.right,'a.txt'),'utf8'),'external');
});
test('source changes during backup reject execution while retaining the verified recovery copy',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.left,'a.txt'),'new');await fs.writeFile(path.join(f.right,'a.txt'),'old');
 const plan=await prepareProviderCopy(f.source,f.destination,[{source:'a.txt',target:'a.txt'}]);
 const open=f.destination.openFileReader;let opens=0;
 f.destination.openFileReader=async(...args)=>{
  const reader=await open(...args);opens++;
  if(opens===2){const read=reader.read;let changed=false;reader.read=async size=>{if(!changed){changed=true;await fs.writeFile(path.join(f.left,'a.txt'),'external edit');}return read(size);};}
  return reader;
 };
 let failure;try{await backupProviderCopy(plan,f.backups);}catch(error){failure=error;}
 assert.ok(failure);assert.equal(typeof failure.backupPath,'string');
 const manifest=JSON.parse(await fs.readFile(path.join(failure.backupPath,'manifest.json'),'utf8'));
 assert.equal(await fs.readFile(path.join(failure.backupPath,manifest.files[0].backupName),'utf8'),'old');
 assert.equal(await fs.readFile(path.join(f.right,'a.txt'),'utf8'),'old');
 assert.equal(await fs.readFile(path.join(f.left,'a.txt'),'utf8'),'external edit');
});
