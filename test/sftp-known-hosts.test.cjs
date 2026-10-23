'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const sync=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {SftpKnownHosts}=require('../desktop/sftp-known-hosts.cjs');
const a='SHA256:'+'A'.repeat(43),b='SHA256:'+'B'.repeat(43),host={host:'example.com',port:22};
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fc-known-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'hosts.json');return {dir,file,store:new SftpKnownHosts(file)};}
test('persistent credential-free normalized endpoints, ports, guarded updates and deletion',async t=>{
 const {file,store}=await fixture(t);assert.equal(await store.lookup(host),null);
 await store.remember({host:' EXAMPLE.COM. '},a,null);
 assert.equal(await new SftpKnownHosts(file).lookup(host),a);
 await store.remember({host:'bücher.example',port:2222},b,null);
 assert.equal(await store.lookup({host:'xn--bcher-kva.example',port:2222}),b);
 await store.remember({host:'[::1]'},a,null);assert.equal(await store.lookup({host:'::1'}),a);
 await assert.rejects(store.remember(host,b,null),{code:'KNOWN_HOST_CHANGED'});
 await store.remember(host,b,a);assert.equal(await store.lookup(host),b);
 await assert.rejects(store.forget(host,a),{code:'KNOWN_HOST_CHANGED'});
 assert.equal(await store.forget(host,b),true);assert.equal(await store.forget(host,null),false);
 const data=JSON.parse(await fs.readFile(file));assert.deepEqual(Object.keys(data),['version','hosts']);
 if(process.platform!=='win32')assert.equal((await fs.stat(file)).mode&0o777,0o600);
});
test('parallel instances serialize CAS and preserve unrelated endpoints',async t=>{
 const {file,store}=await fixture(t),other=new SftpKnownHosts(file);
 const results=await Promise.allSettled([store.remember(host,a,null),other.remember(host,b,null)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'KNOWN_HOST_CHANGED');
 await Promise.all([store.remember({host:'one.example'},a,null),other.remember({host:'two.example'},b,null)]);
 assert.equal(await store.lookup({host:'one.example'}),a);assert.equal(await store.lookup({host:'two.example'}),b);
});
test('canonical parent aliases share the write queue', {skip:process.platform==='win32'},async t=>{
 const {dir,file,store}=await fixture(t);const alias=dir+'-alias';await fs.symlink(dir,alias);t.after(()=>fs.unlink(alias));
 const other=new SftpKnownHosts(path.join(alias,path.basename(file)));
 await Promise.all([store.remember(host,a,null),other.remember({host:'two.example'},b,null)]);
 assert.equal(await store.lookup(host),a);assert.equal(await store.lookup({host:'two.example'}),b);
});
test('invalid arguments never create a trust file',async t=>{
 const {file,store}=await fixture(t);
 for(const endpoint of [{host:'https://example.com'},{host:'x',port:'22'},{host:'x',password:'secret'},{host:'x',port:0}])await assert.rejects(store.lookup(endpoint),{code:'KNOWN_HOST_INVALID'});
 for(const pin of [null,'invalid','SHA256:'+'A'.repeat(44)])await assert.rejects(store.remember(host,pin,null),{code:'KNOWN_HOST_INVALID'});
 await assert.rejects(store.remember(host,a,undefined),{code:'KNOWN_HOST_INVALID'});
 await assert.rejects(fs.stat(file),{code:'ENOENT'});
});
test('reject corrupt, duplicate, noncanonical, oversized and credential-bearing schemas without replacing',async t=>{
 const {file,store}=await fixture(t);
 const entry={...host,fingerprint:a};
 const values=['{','\ufffd',JSON.stringify({version:2,hosts:[]}),JSON.stringify({version:1,hosts:[entry,entry]}),JSON.stringify({version:1,hosts:[{...entry,host:'EXAMPLE.COM'}]}),JSON.stringify({version:1,hosts:[{...entry,password:'secret'}]}),' '.repeat(512*1024+1)];
 for(const content of values){await fs.writeFile(file,content,{mode:0o600});await assert.rejects(store.lookup(host),{code:'KNOWN_HOST_STORE_INVALID'});await assert.rejects(store.remember(host,a,null),{code:'KNOWN_HOST_STORE_INVALID'});assert.equal(await fs.readFile(file,'utf8'),content);}
});
test('reject symbolic link store and insecure POSIX permissions',async t=>{
 const {dir,file,store}=await fixture(t),target=path.join(dir,'target');await fs.writeFile(target,'{"version":1,"hosts":[]}',{mode:0o600});
 await fs.symlink(target,file);await assert.rejects(store.remember(host,a,null),{code:'KNOWN_HOST_STORE_INVALID'});await fs.unlink(file);
 if(process.platform!=='win32'){await fs.writeFile(file,'{"version":1,"hosts":[]}',{mode:0o644});await assert.rejects(store.lookup(host),{code:'KNOWN_HOST_STORE_INVALID'});}
});
test('late cancellation cleans staging and preserves original trust',async t=>{
 const {dir,file,store}=await fixture(t);await store.remember(host,a,null);const before=await fs.readFile(file),cancel=Object.assign(Error('cancelled'),{code:'ABORT_ERR'});let calls=0;
 await assert.rejects(store.remember(host,b,a,{current(){if(++calls===4)throw cancel;}}),error=>error===cancel);
 assert.deepEqual(await fs.readFile(file),before);assert.deepEqual(await fs.readdir(dir),['hosts.json']);assert.equal(await store.lookup(host),a);
});
test('external store modification during staging wins and rejects stale trust update',async t=>{
 const {dir,file,store}=await fixture(t);await store.remember(host,a,null);const external=JSON.stringify({version:1,hosts:[{host:'external.example',port:22,fingerprint:b}]});let calls=0;
 await assert.rejects(store.remember(host,b,a,{current(){if(++calls===4)sync.writeFileSync(file,external);}}),{code:'KNOWN_HOST_CHANGED'});
 assert.equal(await fs.readFile(file,'utf8'),external);assert.deepEqual(await fs.readdir(dir),['hosts.json']);
});
test('external creation before publication is never overwritten',async t=>{
 const {file,store}=await fixture(t);const external=JSON.stringify({version:1,hosts:[{...host,fingerprint:b}]});let calls=0;
 await assert.rejects(store.remember(host,a,null,{current(){if(++calls===4)sync.writeFileSync(file,external,{mode:0o600});}}),{code:'KNOWN_HOST_CHANGED'});
 assert.equal(await fs.readFile(file,'utf8'),external);
});
test('1000-host bound permits updates but refuses growth',async t=>{
 const {file,store}=await fixture(t);const hosts=Array.from({length:1000},(_,i)=>({host:`host${i}.example`,port:22,fingerprint:a}));await fs.writeFile(file,JSON.stringify({version:1,hosts}),{mode:0o600});
 await assert.rejects(store.remember(host,a,null),{code:'KNOWN_HOST_LIMIT'});await store.remember({host:'host0.example'},b,a);assert.equal(await store.lookup({host:'host0.example'}),b);
});
