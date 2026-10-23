'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {prepareSftpDirectory,createSftpDirectory,finalizeSftpDirectory}=require('../desktop/sftp-transfer-directories.cjs');
function fixture(){
 const nodes=new Map(),requests=[];let hook=()=>{},rootIdentity='root';
 const make=(name,kind='directory',mode=0o40700)=>({path:name,kind,identity:name||'root',stamp:'1',mode,uid:1,gid:2,mtime:1000,mtimeNs:'1000000000',strongRevision:false});
 const p={root:'/remote',connection:{closed:false},async inspectRoot(){await hook('root','');return {...make('/remote'),identity:rootIdentity};},async inspectEntry(name){await hook('stat',name);return nodes.has(name)?{...nodes.get(name)}:null;},async *enumerateDirectory(name){await hook('list',name);for(const [child,info] of nodes)if(child.startsWith(name+'/')&&!child.slice(name.length+1).includes('/'))yield {name:child.slice(name.length+1),kind:info.kind};},async request(method,args){requests.push([method,args]);await hook('before-'+method,args);const relative=args[0].slice('/remote/'.length);if(method==='mkdir'){if(nodes.has(relative))throw Object.assign(Error('exists'),{code:4});nodes.set(relative,make(relative));}else if(method==='setstat'){const info=nodes.get(relative),attrs=args[1];if(attrs.mode!==undefined)info.mode=0o40000|attrs.mode;if(attrs.mtime!==undefined)info.mtime=attrs.mtime*1000;info.stamp+='s';}else throw Error('Unexpected mutation');await hook('after-'+method,args);return [];}};
 return {p,nodes,requests,make,setHook(value){hook=value;},replaceRoot(){rootIdentity='replaced';}};
}
const create=async(f,name='dir')=>createSftpDirectory(await prepareSftpDirectory(f.p,name));
test('exclusive private mkdir, sanitized opaque tokens and ordinary metadata preservation',async()=>{
 const f=fixture(),prepared=await prepareSftpDirectory(f.p,'dir');assert.equal(f.requests.length,0);assert.throws(()=>{prepared.relative='x';},TypeError);const owned=await createSftpDirectory(prepared);assert.equal(f.nodes.get('dir').mode&0o777,0o700);
 const result=await finalizeSftpDirectory(owned,{kind:'directory',mode:0o42751,mtime:1234567890123},[]);assert.equal(result.observation.metadata.mode&0o7777,0o751);assert.equal(result.observation.metadata.mtime,1234567890000);assert.deepEqual(f.requests.map(x=>x[0]),['mkdir','setstat']);assert.equal(f.requests[1][1][1].atime,1234567890);await assert.rejects(createSftpDirectory(prepared),/used/);await assert.rejects(finalizeSftpDirectory(owned,{kind:'directory'},[]),/used/);
});
test('existing target and target appeared after review are never adopted',async()=>{
 const f=fixture();f.nodes.set('dir',f.make('dir'));await assert.rejects(prepareSftpDirectory(f.p,'dir'),{code:'DESTINATION_EXISTS'});assert.equal(f.requests.length,0);f.nodes.delete('dir');const prepared=await prepareSftpDirectory(f.p,'dir');f.nodes.set('dir',f.make('dir'));await assert.rejects(createSftpDirectory(prepared),{code:'DESTINATION_EXISTS'});assert.equal(f.requests.length,0);
});
test('parent replacement and root replacement prevent creation',async()=>{
 const f=fixture();f.nodes.set('parent',f.make('parent'));const prepared=await prepareSftpDirectory(f.p,'parent/dir');f.nodes.get('parent').identity='other';await assert.rejects(createSftpDirectory(prepared),{code:'STALE_SOURCE'});assert.equal(f.requests.length,0);
 const g=fixture(),review=await prepareSftpDirectory(g.p,'dir');g.replaceRoot();await assert.rejects(createSftpDirectory(review),{code:'STALE_SOURCE'});
});
test('new directory remains on acknowledged verification failure',async()=>{
 const f=fixture();f.setHook(event=>{if(event==='after-mkdir')f.nodes.get('dir').mode=0o40777;});await assert.rejects(create(f),e=>e.code==='DIRECTORY_VERIFICATION_FAILED'&&e.created===true&&e.acknowledged===true);assert.ok(f.nodes.has('dir'));assert.deepEqual(f.requests.map(x=>x[0]),['mkdir']);
});
test('missing, unexpected, special or modified child evidence blocks finalization',async()=>{
 for(const variant of ['missing','extra','special','changed']){const f=fixture(),owned=await create(f);let expected=[];if(variant==='missing')expected=[{name:'a',kind:'file',identity:'a',stamp:'1'}];else{const child=f.make('dir/a',variant==='special'?'symlink':'file',0o100600);f.nodes.set('dir/a',child);if(variant==='changed')expected=[{name:'a',kind:'file',identity:child.identity,stamp:'old'}];}await assert.rejects(finalizeSftpDirectory(owned,{kind:'directory',mode:0o755},expected),{code:'STALE_SOURCE'});assert.equal(f.requests.length,1);assert.ok(f.nodes.has('dir'));}
});
test('child final observations allow legitimate namespace writes then restrictive mode',async()=>{
 const f=fixture(),owned=await create(f),child=f.make('dir/a','file',0o100600);f.nodes.set('dir/a',child);f.nodes.get('dir').stamp='own-child-write';let submitted=false;f.setHook(event=>{if(event==='after-setstat')submitted=true;if(event==='list'&&submitted)throw Error('No read permission after restrictive chmod');});const result=await finalizeSftpDirectory(owned,{kind:'directory',mode:0,mtime:2000},[{name:'a',kind:'file',identity:child.identity,stamp:child.stamp}]);assert.equal(result.observation.metadata.mode&0o777,0);
});
test('creation lost acknowledgement reports unknown creation, no automatic retry',async()=>{
 for(const code of [undefined,6,7]){const f=fixture();f.setHook(event=>{if(event==='after-mkdir')throw Object.assign(Error('connection lost'),{code});});const prepared=await prepareSftpDirectory(f.p,'dir');await assert.rejects(createSftpDirectory(prepared),e=>e.code==='DIRECTORY_OUTCOME_UNKNOWN'&&e.created===null&&e.acknowledged===false);assert.ok(f.nodes.has('dir'));await assert.rejects(createSftpDirectory(prepared),/used/);}
});
test('metadata lost acknowledgement preserves directory and reports uncertain finalization',async()=>{
 const f=fixture(),owned=await create(f);f.setHook(event=>{if(event==='after-setstat')throw Error('lost acknowledgement');});await assert.rejects(finalizeSftpDirectory(owned,{kind:'directory',mode:0o750},[]),e=>e.code==='DIRECTORY_OUTCOME_UNKNOWN'&&e.created===true&&e.metadataSubmitted===true&&!e.acknowledged);assert.equal(f.nodes.get('dir').mode&0o777,0o750);
});
test('definite metadata rejection remains definite and retains created directory',async()=>{
 const f=fixture(),owned=await create(f);f.setHook(event=>{if(event==='before-setstat')throw Object.assign(Error('denied'),{code:3});});await assert.rejects(finalizeSftpDirectory(owned,{kind:'directory',mode:0o755},[]),e=>e.code===3&&e.created===true&&e.metadataSubmitted&&!e.acknowledged);assert.equal(f.nodes.get('dir').mode&0o777,0o700);
});
test('abort before creation consumes review without mutation; abort after submission is unknown',async()=>{
 const f=fixture(),prepared=await prepareSftpDirectory(f.p,'dir'),controller=new AbortController();controller.abort();await assert.rejects(createSftpDirectory(prepared,{signal:controller.signal}),/abort|cancel/i);assert.equal(f.requests.length,0);
 const g=fixture(),c=new AbortController();g.setHook(event=>{if(event==='after-mkdir'){c.abort();throw Error('aborted while awaiting ack');}});await assert.rejects(createSftpDirectory(await prepareSftpDirectory(g.p,'dir'),{signal:c.signal}),{code:'DIRECTORY_OUTCOME_UNKNOWN'});
});
test('invalid child/source metadata and forged tokens cannot mutate',async()=>{
 const f=fixture();await assert.rejects(createSftpDirectory({relative:'dir'}),/unknown/);const owned=await create(f);await assert.rejects(finalizeSftpDirectory(owned,{kind:'directory'},[{name:'a',kind:'file'}]),/observation/);assert.equal(f.requests.length,1);const other=await create(f,'other');await assert.rejects(finalizeSftpDirectory(other,{kind:'directory',mode:-1},[]),/permissions/);assert.equal(f.requests.length,2);
});
test('parent permission drift is rejected while owned child timestamp changes are allowed',async()=>{
 const f=fixture();f.nodes.set('parent',f.make('parent'));const prepared=await prepareSftpDirectory(f.p,'parent/dir');f.nodes.get('parent').mode=0o40711;await assert.rejects(createSftpDirectory(prepared),{code:'STALE_SOURCE'});assert.equal(f.requests.length,0);
 const g=fixture();g.nodes.set('parent',g.make('parent'));const reviewed=await prepareSftpDirectory(g.p,'parent/dir');g.nodes.get('parent').stamp='another-owned-child';g.nodes.get('parent').mtime=3000;await createSftpDirectory(reviewed);assert.equal(g.requests.length,1);
});
test('numeric partial metadata failure explicitly reports possible changes',async()=>{
 const f=fixture(),owned=await create(f);f.setHook(event=>{if(event==='before-setstat'){f.nodes.get('dir').mode=0o40750;throw Object.assign(Error('mtime denied after chmod'),{code:3});}});await assert.rejects(finalizeSftpDirectory(owned,{kind:'directory',mode:0o750,mtime:2000},[]),e=>e.code===3&&e.metadataMayHaveChanged===true&&e.metadataSubmitted===true&&e.created===true&&!e.acknowledged);assert.equal(f.nodes.get('dir').mode&0o777,0o750);
});
