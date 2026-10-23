'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {SftpProfiles}=require('../desktop/sftp-profiles.cjs');
const input={name:' Work ',host:'Example.COM.',username:'alice',root:'/projects//team/'};
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-profiles-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'settings','profiles.json');return {file,store:new SftpProfiles(file)};}
test('persists normalized credential-free profiles across instances and supports update/remove',async t=>{
 const {file,store}=await fixture(t);assert.deepEqual(await store.list(),[]);
 const saved=await store.save(input);assert.deepEqual(saved,{id:saved.id,name:'Work',host:'example.com',port:22,username:'alice',root:'/projects/team'});
 const reopened=new SftpProfiles(file);assert.deepEqual(await reopened.list(),[saved]);
 const updated=await reopened.save({...saved,name:'Production',host:'[::1]',port:2222});assert.equal(updated.host,'::1');assert.equal((await store.list()).length,1);
 saved.name='mutated';const listed=await store.list();listed[0].root='/mutated';assert.equal((await store.list())[0].root,'/projects/team');
 if(process.platform!=='win32')assert.equal((await fs.stat(file)).mode&0o777,0o600);
 assert.equal(await store.remove(updated.id),true);assert.equal(await store.remove(updated.id),false);assert.deepEqual(await reopened.list(),[]);
 assert.deepEqual(await fs.readdir(path.dirname(file)),['profiles.json']);
});
test('rejects credentials, trust fields, invalid names/hosts/roots and unknown updates without writing',async t=>{
 const {file,store}=await fixture(t);
 for(const patch of [{password:'SECRET'},{privateKey:'SECRET'},{fingerprint:'SHA256:secret'},{approvalToken:'secret'},{name:''},{name:'a\nb'},{host:'user@host'},{host:'https://host'},{host:'bad host'},{host:'-bad.local'},{port:0},{port:65536},{port:'22'},{username:''},{username:'a\0b'},{root:'relative'},{root:'/a\\b'},{root:'/a/../b'},{root:'/a/./b'},{root:'/a\0b'},{root:'/'+ 'a'.repeat(4096)},{id:'wrong'}])await assert.rejects(store.save({...input,...patch}),{code:'INVALID_PROFILE'});
 await assert.rejects(store.save({...input,id:randomUUID()}),{code:'PROFILE_NOT_FOUND'});
 await assert.rejects(fs.stat(file),{code:'ENOENT'});
});
test('corrupt or unsupported storage is never replaced by save/remove',async t=>{
 const {file,store}=await fixture(t);await fs.mkdir(path.dirname(file),{recursive:true});const good=await store.save(input);
 for(const data of ['{bad',JSON.stringify({version:2,profiles:[]}),JSON.stringify({version:1,profiles:[{...good,password:'secret'}]}),JSON.stringify({version:1,profiles:[good,good]}),JSON.stringify({version:1,profiles:[{...good,host:'EXAMPLE.COM'}]}),JSON.stringify({version:1,profiles:[],unknown:true})]){
  await fs.writeFile(file,data);await assert.rejects(store.list(),{code:'PROFILE_STORE_INVALID'});await assert.rejects(store.save(input),{code:'PROFILE_STORE_INVALID'});await assert.rejects(store.remove(good.id),{code:'PROFILE_STORE_INVALID'});assert.equal(await fs.readFile(file,'utf8'),data);
 }
});
test('concurrent instances serialize mutations without losing profiles and enforce cap',async t=>{
 const {file,store}=await fixture(t),other=new SftpProfiles(file);
 const profiles=await Promise.all(Array.from({length:100},(_,index)=>(index%2?store:other).save({...input,name:'Server '+index})));
 assert.equal((await store.list()).length,100);assert.equal(new Set(profiles.map(item=>item.id)).size,100);
 await assert.rejects(store.save(input),{code:'PROFILE_LIMIT'});
 await other.save({...profiles[0],name:'Updated at limit'});await store.remove(profiles[1].id);await other.save(input);assert.equal((await store.list()).length,100);
});
test('failed write keeps original store and queue usable',async t=>{
 const {file,store}=await fixture(t);const good=await store.save(input);await fs.rename(path.dirname(file),path.dirname(file)+'-old');await fs.writeFile(path.dirname(file),'not a directory');
 await assert.rejects(store.save(input),{code:'PROFILE_STORE_IO'});await fs.rm(path.dirname(file));await fs.rename(path.dirname(file)+'-old',path.dirname(file));assert.deepEqual(await store.list(),[good]);await store.save({...good,name:'Recovered'});assert.equal((await store.list())[0].name,'Recovered');
});
test('IDN hosts normalize and symbolic-link stores are rejected',async t=>{
 const {file,store}=await fixture(t);const good=await store.save({...input,host:'bücher.example'});assert.equal(good.host,'xn--bcher-kva.example');
 await fs.rename(file,file+'.original');await fs.symlink(file+'.original',file);await assert.rejects(store.list(),{code:'PROFILE_STORE_INVALID'});await assert.rejects(store.save(input),{code:'PROFILE_STORE_INVALID'});assert.equal(JSON.parse(await fs.readFile(file+'.original','utf8')).profiles[0].id,good.id);
});
