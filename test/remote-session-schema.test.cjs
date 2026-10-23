'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {validateSession,stageSessionData,validateRemoteFolderDescriptor}=require('../desktop/sessions.cjs');
const {validateWorkspace,stageWorkspaceData,writeWorkspace,stageWorkspace}=require('../desktop/workspaces.cjs');
const descriptor=()=>({protocol:'sftp',host:'example.invalid',port:22,username:'user',root:'/remote-only/不存在'});
const session=()=>({version:1,type:'folder-compare',name:'Saved remote pair',text:{a:'',b:''},files:{a:{name:'',path:''},b:{name:'',path:''}},folders:{a:null,b:null},remoteFolders:{a:descriptor(),b:null},options:{ignoreWhitespace:false,filter:'all',direction:'a-to-b'}});
async function temp(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-remote-session-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('optional remote schema preserves existing version1 sessions unchanged',()=>{
 const local=session();delete local.remoteFolders;assert.deepEqual(validateSession(local),local);
 for(const type of ['folder-compare','folder-merge','folder-sync']){const value=session();value.type=type;const clean=validateSession(value);assert.deepEqual(clean,value);assert.notEqual(clean.remoteFolders,value.remoteFolders);assert.notEqual(clean.remoteFolders.a,value.remoteFolders.a);}
});
test('endpoint descriptions normalize host and POSIX root without credentials or authority',()=>{
 const value={...descriptor(),host:' EXAMPLE.COM. ',root:'/repo//nested/'};assert.deepEqual(validateRemoteFolderDescriptor(value),{...descriptor(),host:'example.com',root:'/repo/nested'});
 assert.equal(validateRemoteFolderDescriptor({...descriptor(),host:'[2001:DB8::1]'}).host,'2001:db8::1');assert.equal(validateRemoteFolderDescriptor({...descriptor(),host:'münich.example'}).host,'xn--mnich-kva.example');
});
test('secrets and runtime authority are rejected at every descriptor boundary',()=>{
 for(const key of ['password','passphrase','privateKey','keyPath','keyId','fingerprint','expectedFingerprint','approvalToken','connectionId','saveToken','credentials','profileId','name','remote','path']){const value=session();value.remoteFolders.a[key]='not permitted';assert.throws(()=>validateSession(value),undefined,key);}
 const extra=session();extra.remoteFolders.credentials='secret';assert.throws(()=>validateSession(extra));
 const inherited=Object.create({host:'example.invalid'});Object.assign(inherited,descriptor());assert.throws(()=>validateRemoteFolderDescriptor(inherited));
 const symbol={...descriptor(),[Symbol('secret')]:'secret'};assert.throws(()=>validateRemoteFolderDescriptor(symbol));
});
test('remote descriptor shape address username and roots are strictly validated',()=>{
 for(const value of [null,[],{},'sftp://host',Object.assign(Object.create({}),descriptor())])assert.throws(()=>validateRemoteFolderDescriptor(value));
 for(const field of Object.keys(descriptor())){const value=descriptor();delete value[field];assert.throws(()=>validateRemoteFolderDescriptor(value),undefined,field);}
 const changes={protocol:['ftp','file'],host:['','host/path','user@host','https://host','bad host','host?x','localhost:22'],port:[0,65536,22.5,'22',null],username:['','a\0b','a\nb','x'.repeat(257)],root:['relative','/a/../b','/./a','/a\\b','/a\0b','/'+ 'x'.repeat(4096)]};
 for(const [field,values]of Object.entries(changes))for(const value of values)assert.throws(()=>validateRemoteFolderDescriptor({...descriptor(),[field]:value}),undefined,field+':'+value);
 for(const remoteFolders of [{a:descriptor()},{b:null},{a:null,b:null,c:null},[],null]){const value=session();value.remoteFolders=remoteFolders;assert.throws(()=>validateSession(value));}
});
test('remote/local conflicts and unsupported comparison types reject',()=>{
 const value=session();value.folders.a={name:'local',path:'/local'};assert.throws(()=>validateSession(value),/both local and remote/);
 for(const type of ['text-compare','binary-compare','folder-merge3']){const value=session();value.type=type;assert.throws(()=>validateSession(value));}
});
test('alignment validates each endpoint policy and preserves only pairs',()=>{
 const value=session();value.remoteFolders.b=descriptor();value.options.folderAlignment=[{a:'C:remote/file',b:'D:remote/file',kind:'file'}];assert.deepEqual(validateSession(value).options.folderAlignment,value.options.folderAlignment);
 value.remoteFolders.b=null;value.folders.b={name:'local',path:'/local'};assert.throws(()=>validateSession(value));value.options.folderAlignment[0].b='local/file';assert.deepEqual(validateSession(value).options.folderAlignment,value.options.folderAlignment);
 for(const invalid of ['../escape','/absolute','a\\b','a\0b']){value.options.folderAlignment[0].a=invalid;assert.throws(()=>validateSession(value));}
});
test('remote-only staging performs no local path lookup and establishes no roots',async t=>{
 const backup=await temp(t),value=session();value.remoteFolders.b={...descriptor(),root:'/other-remote-only'};value.options.folderAlignment=[{a:'C:remote',b:'D:remote',kind:'directory'}];const original={},calls=[];
 for(const key of ['realpath','stat','lstat']){original[key]=fs[key];fs[key]=async(...args)=>{calls.push(String(args[0]));return original[key](...args);};}
 let staged;try{staged=await stageSessionData(value,backup);}finally{for(const [key,fn]of Object.entries(original))fs[key]=fn;}
 assert.deepEqual(calls,[]);assert.deepEqual(staged.folders.roots,{});assert.deepEqual(staged.textPaths,{});assert.deepEqual(staged.data.remoteFolders,value.remoteFolders);assert.deepEqual(staged.data.options.folderAlignment,value.options.folderAlignment);
});
test('mixed staging validates local roots and local alignment while deferring remote existence',async t=>{
 const root=await temp(t),local=path.join(root,'local');await fs.mkdir(local);await fs.writeFile(path.join(local,'file'),'data');const value=session();value.folders.b={name:'local',path:local};value.options.folderAlignment=[{a:'C:not-accessed',b:'file',kind:'file'}];
 const staged=await stageSessionData(value,path.join(root,'backups'));assert.equal(staged.folders.roots.a,undefined);assert.equal(staged.folders.roots.b,local);assert.deepEqual(staged.data.remoteFolders.a,descriptor());
 value.options.folderAlignment[0].kind='directory';await assert.rejects(stageSessionData(value,path.join(root,'backups')),/changed type/);
 value.folders.b.path=path.join(root,'missing');await assert.rejects(stageSessionData(value,path.join(root,'backups')));
});
test('alignment still requires a description or local root on both sides',async t=>{
 const value=session();value.options.folderAlignment=[{a:'remote',b:'missing',kind:'file'}];await assert.rejects(stageSessionData(value,await temp(t)),/both folder roots/);
});
test('workspace validation and disk roundtrip preserve disconnected endpoint descriptions',async t=>{
 const root=await temp(t),value={version:1,kind:'workspace',sessions:[session(),{...session(),name:'Second'}],activeIndex:1};const clean=validateWorkspace(value);assert.deepEqual(clean,value);const staged=await stageWorkspaceData(value,root);assert.equal(staged.sessions.length,2);assert.deepEqual(staged.sessions.map(item=>item.folders.roots),[{},{}]);
 const file=path.join(root,'saved.fworkspace');await writeWorkspace(file,value);const restored=await stageWorkspace(file,root);assert.deepEqual(restored.data,value);assert.ok(!(await fs.readFile(file,'utf8')).includes('connectionId'));
 value.sessions[1].remoteFolders.a.password='secret';await assert.rejects(stageWorkspaceData(value,root));
});
