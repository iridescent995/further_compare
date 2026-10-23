'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readProviderFolderProperties:read}=require('../desktop/provider-folder-properties.cjs');
function fixture(){
 const root={path:'/remote',identity:'root',stamp:'root-v1'};
 const entries=new Map(['résumé:1.txt','directory'].map((path,i)=>[path,{path,identity:path,stamp:'v1',kind:i?'directory':'file',size:i?null:23,mtime:1234.5,mode:i?0o040755:0o100644,uid:1000,gid:20}]));
 const calls=[];
 const service={roots:{a:'root'},async inspectRoot(){calls.push('root');return root;},async inspectEntry(side,path){calls.push(path);return entries.get(path)||null;},enumerateDirectory(){throw Error('Must not enumerate');},openFileReader(){throw Error('Must not read contents');}};
 return {root,entries,calls,service,options:{displayPath:relative=>'sftp://host/'+encodeURIComponent(relative)}};
}
test('selected metadata only, Unicode/colon names, compatible totals and unavailable fields',async()=>{
 const f=fixture(),result=await read(f.service,'a',[...f.entries.keys()],f.options);
 assert.equal(result.files,1);assert.equal(result.folders,1);assert.equal(result.totalFileBytes,'23');
 assert.deepEqual(result.entries[0],{path:'résumé:1.txt',absolutePath:'sftp://host/r%C3%A9sum%C3%A9%3A1.txt',name:'résumé:1.txt',kind:'file',sizeBytes:'23',modifiedMs:1234.5,accessedMs:null,createdMs:null,permissions:'rw-r--r--',mode:'0644',ownerId:'1000',groupId:'20'});
 assert.equal(result.entries[1].sizeBytes,null);
 assert.deepEqual(f.calls,['root','résumé:1.txt','directory','résumé:1.txt','directory','root']);
});
test('special POSIX permission bits preserve executable and non-executable variants',async()=>{
 for(const [mode,expected] of [[0o7755,'rwsr-sr-t'],[0o7644,'rwSr-Sr-T']]){
  const f=fixture();f.entries.get('résumé:1.txt').mode=0o100000|mode;
  assert.equal((await read(f.service,'a',['résumé:1.txt'],f.options)).entries[0].permissions,expected);
 }
});
test('later read changing an earlier metadata object prevents publishing stale properties',async()=>{
 const f=fixture(),original=f.service.inspectEntry;
 f.service.inspectEntry=async(side,path)=>{if(path==='directory')f.entries.get('résumé:1.txt').stamp='changed';return original(side,path);};
 await assert.rejects(read(f.service,'a',[...f.entries.keys()],f.options),/changed/);
});
test('root replacement or revision change prevents publication',async()=>{
 for(const field of ['identity','stamp','selected']){
  const f=fixture(),original=f.service.inspectEntry;
  f.service.inspectEntry=async(...args)=>{if(field==='selected')f.service.roots.a='replacement';else f.root[field]='changed';return original(...args);};
  await assert.rejects(read(f.service,'a',['résumé:1.txt'],f.options),/root changed/);
 }
});
test('failure on second selection returns no partial output or display callbacks',async()=>{
 const f=fixture();let displayed=0;f.options.displayPath=()=>{displayed++;return 'path';};
 await assert.rejects(read(f.service,'a',['résumé:1.txt','missing'],f.options));assert.equal(displayed,0);
});
test('invalid selection rejected before provider calls',async()=>{
 for(const paths of [[],['x','x'],['../x'],['/x'],['x//y'],['x/./y'],['x\\y'],['x\0y'],[null],Array.from({length:1001},(_,i)=>String(i))]){
  const f=fixture();await assert.rejects(read(f.service,'a',paths,f.options));assert.equal(f.calls.length,0);
 }
});
test('invalid metadata and nonregular entries rejected',async()=>{
 for(const [key,value] of [['kind','symlink'],['path','other'],['identity',null],['stamp',''],['size',-1],['size',Number.MAX_SAFE_INTEGER+1],['mode',-1],['uid',1.2],['gid',0x100000000],['mtime',NaN],['mtime',8640000000000001]]){
  const f=fixture();f.entries.get('résumé:1.txt')[key]=value;await assert.rejects(read(f.service,'a',['résumé:1.txt'],f.options));
 }
});
test('abort before and during metadata reads stops further calls',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort();
 await assert.rejects(read(f.service,'a',['résumé:1.txt'],{...f.options,signal:controller.signal}),{code:'ABORT_ERR'});assert.equal(f.calls.length,0);
 const g=fixture(),next=new AbortController(),original=g.service.inspectEntry;
 g.service.inspectEntry=async(...args)=>{const value=await original(...args);next.abort();return value;};
 await assert.rejects(read(g.service,'a',[...g.entries.keys()],{...g.options,signal:next.signal}),{code:'ABORT_ERR'});
 assert.deepEqual(g.calls,['root','résumé:1.txt']);
});
