'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {prepareSftpDelete,executeSftpDelete,revokeSftpDelete}=require('../desktop/sftp-file-delete.cjs');
function fixture(){
 const files=new Map([['a',Buffer.from('original')]]),calls=[],controls={};let stamp='root0',closed=0,opened=0;
 const meta=name=>files.has(name)?{path:name,identity:'id:'+name,stamp:'stamp:'+name,size:files.get(name).length,kind:'file',mode:0o100640,uid:1,gid:2,mtime:100000}:null;
 const provider={root:'/root',connection:{closed:false},async inspectRoot(){return {path:'/root',identity:'root',kind:'directory',stamp,mode:controls.rootMode||0o40755,uid:1,gid:2};},async inspectEntry(name){await controls.inspect?.(name);return meta(name);},async openFileReader(name){opened++;const metadata=meta(name),bytes=Buffer.from(files.get(name));let offset=0;return {metadata,async read(size){await controls.read?.(name);const result=bytes.subarray(offset,offset+size);offset+=result.length;return result.length?result:null;},async validate(){return meta(name);},async close(){closed++;}};},async request(method,args,{signal}){calls.push(method);assert.equal(method,'unlink');assert.deepEqual(args,['/root/a']);await controls.before?.();if(controls.reject!==undefined)throw Object.assign(Error('Rejected'),{code:controls.reject});files.delete('a');stamp='root1';await controls.after?.();if(controls.lost!==undefined)throw Object.assign(Error('Lost'),{code:controls.lost});if(signal.aborted)throw Object.assign(Error('Cancelled'),{code:'ABORT_ERR'});return [];}};
 return {provider,files,calls,controls,readersClosed(){assert.equal(opened,closed);}};
}
async function setup(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-delete-unit-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const f=fixture();return {...f,root,plan:await prepareSftpDelete(f.provider,'a')};}
const execute=f=>executeSftpDelete(f.plan,{backupRoot:f.root});
test('retained immutable review executes once with exact verified recovery before delete',async t=>{const f=await setup(t);assert.ok(Object.isFrozen(f.plan));f.controls.before=async()=>{const dirs=await fs.readdir(f.root);assert.equal(dirs.length,1);const manifest=JSON.parse(await fs.readFile(path.join(f.root,dirs[0],'manifest.json')));assert.equal((await fs.readFile(path.join(f.root,dirs[0],manifest.files[0].backupName))).toString(),'original');};const result=await execute(f);assert.equal(result.deleted,true);assert.equal(result.sha256,f.plan.sha256);assert.equal(f.files.has('a'),false);assert.deepEqual(f.calls,['unlink']);await assert.rejects(execute(f),{code:'INVALID_DELETE_PLAN'});f.readersClosed();});
test('invalid paths, directories and symbolic links cannot be deleted',async()=>{const f=fixture();for(const source of ['../a','/a','a\\b','a\0','a/../b','a//b',''])await assert.rejects(prepareSftpDelete(f.provider,source));for(const kind of ['directory','symlink']){const inspect=f.provider.inspectEntry;f.provider.inspectEntry=async name=>({...await inspect(name),kind});await assert.rejects(prepareSftpDelete(f.provider,'a'));}assert.equal(f.calls.length,0);});
test('same-size source replacement, root changes and disconnected provider prevent mutation',async t=>{for(const change of [f=>f.files.set('a',Buffer.from('tampered')),f=>f.controls.rootMode=0o40700,f=>f.provider.connection.closed=true,f=>f.provider.root='/elsewhere',f=>f.provider.connection={closed:false}]){const f=await setup(t);change(f);await assert.rejects(execute(f));assert.equal(f.calls.length,0);assert.ok(f.files.has('a'));f.readersClosed();}});
test('explicit server rejection retains source and verified recovery without retry',async t=>{const f=await setup(t);f.controls.reject=3;await assert.rejects(execute(f),e=>e.code===3&&e.submitted&&!e.acknowledged&&e.deleted===false&&!!e.backupPath);assert.equal(f.files.get('a').toString(),'original');assert.deepEqual(f.calls,['unlink']);});
test('revoke and pre-abort never submit; single use applies to failed attempts',async t=>{const f=await setup(t);revokeSftpDelete(f.plan);await assert.rejects(execute(f),{code:'INVALID_DELETE_PLAN'});const g=await setup(t),controller=new AbortController();controller.abort();await assert.rejects(executeSftpDelete(g.plan,{backupRoot:g.root,signal:controller.signal}));assert.equal(g.calls.length,0);await assert.rejects(execute(g),{code:'INVALID_DELETE_PLAN'});});
test('revoke while backing up prevents submission and closes readers',async t=>{const f=await setup(t);f.controls.read=()=>revokeSftpDelete(f.plan);await assert.rejects(execute(f));assert.equal(f.calls.length,0);f.readersClosed();});
test('lost acknowledgement and numeric connection statuses preserve unknown outcome and backup',async t=>{for(const code of ['CONNECTION_CLOSED',6,7]){const f=await setup(t);f.controls.lost=code;await assert.rejects(execute(f),e=>e.code==='DELETE_OUTCOME_UNKNOWN'&&e.deleted===null&&e.submitted&&!e.acknowledged&&!!e.backupPath);assert.equal(f.files.has('a'),false);assert.deepEqual(f.calls,['unlink']);f.readersClosed();}});
test('abort or revoke after submission is unknown, without retry or cleanup',async t=>{for(const revoke of [false,true]){const f=await setup(t),controller=new AbortController();f.controls.after=()=>revoke?revokeSftpDelete(f.plan):controller.abort();await assert.rejects(executeSftpDelete(f.plan,{backupRoot:f.root,signal:controller.signal}),{code:'DELETE_OUTCOME_UNKNOWN'});assert.equal(f.files.has('a'),false);assert.deepEqual(f.calls,['unlink']);}});
test('acknowledged reappeared source or changed root report verification failure',async t=>{for(const change of [f=>f.files.set('a',Buffer.from('external')),f=>f.controls.rootMode=0o40700]){const f=await setup(t);f.controls.after=()=>change(f);await assert.rejects(execute(f),e=>e.code==='DELETE_VERIFICATION_FAILED'&&e.acknowledged&&e.deleted===true&&!!e.backupPath);assert.deepEqual(f.calls,['unlink']);}});
test('backup storage failure never submits delete',async t=>{const f=await setup(t);await assert.rejects(executeSftpDelete(f.plan,{backupRoot:path.join(f.root,'missing')}));assert.equal(f.calls.length,0);assert.ok(f.files.has('a'));});

test('backup streaming failure preserves reported retained recovery location',async t=>{
 const f=await setup(t);let retained;
 f.controls.read=async()=>{const dirs=await fs.readdir(f.root);if(!dirs.length)return;retained=path.join(f.root,dirs[0]);await fs.writeFile(path.join(retained,'diagnostic.txt'),'retained external diagnostic');throw Object.assign(Error('Recovery stream failed'),{backupPath:retained});};
 await assert.rejects(execute(f),error=>error.message==='Recovery stream failed'&&error.backupPath===retained&&error.submitted===false);
 assert.equal(await fs.readFile(path.join(retained,'diagnostic.txt'),'utf8'),'retained external diagnostic');assert.equal(f.calls.length,0);assert.ok(f.files.has('a'));f.readersClosed();
});

test('forged or cloned plans cannot submit deletion',async t=>{const f=await setup(t);for(const plan of [{...f.plan},{},null])await assert.rejects(executeSftpDelete(plan,{backupRoot:f.root}),{code:'INVALID_DELETE_PLAN'});assert.deepEqual(f.calls,[]);});
test('nested parent authority changes prevent deletion',async t=>{
 const f=fixture(),inspect=f.provider.inspectEntry,open=f.provider.openFileReader;let parentStamp='parent0';
 f.provider.inspectEntry=async name=>name==='dir'?{path:'dir',identity:'directory-id',stamp:parentStamp,kind:'directory',mode:0o40755,uid:1,gid:2}:name==='dir/a'?{...await inspect('a'),path:name}:null;
 f.provider.openFileReader=async name=>{const reader=await open('a');reader.metadata={...reader.metadata,path:name};reader.validate=()=>f.provider.inspectEntry(name);return reader;};
 const plan=await prepareSftpDelete(f.provider,'dir/a');parentStamp='parent1';
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-delete-parent-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await assert.rejects(executeSftpDelete(plan,{backupRoot:root}),{code:'STALE_SOURCE'});assert.deepEqual(f.calls,[]);f.readersClosed();
});

test('source changed after recovery completes prevents unlink and retains recovery',async t=>{
 const f=await setup(t),inspect=f.provider.inspectRoot;let mutated=false;
 f.provider.inspectRoot=async()=>{for(const name of await fs.readdir(f.root)){try{await fs.access(path.join(f.root,name,'manifest.json'));f.files.set('a',Buffer.from('tampered'));mutated=true;}catch{}}return inspect();};
 await assert.rejects(execute(f),e=>e.code==='STALE_SOURCE'&&!e.submitted&&!!e.backupPath&&!!e.manifestPath);assert.equal(mutated,true);assert.deepEqual(f.calls,[]);assert.equal(f.files.get('a').toString(),'tampered');f.readersClosed();
});
test('acknowledged deletion followed by failed inspection is not reported as clean success',async t=>{
 const f=await setup(t);f.controls.after=()=>{f.controls.inspect=()=>{throw Error('Postcheck unavailable');};};
 await assert.rejects(execute(f),e=>e.code==='DELETE_VERIFICATION_FAILED'&&e.deleted===true&&e.acknowledged&&!!e.backupPath);assert.deepEqual(f.calls,['unlink']);assert.equal(f.files.has('a'),false);
});
