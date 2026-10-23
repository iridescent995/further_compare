'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {prepareWindowsAttributesRequest,runAttributesHelper,normalizeChanges}=require('../desktop/windows-folder-attributes.cjs');
function stub(reply){return {spawnProcess(executable,args,options){assert.equal(options.shell,false);const child=new EventEmitter();for(const key of ['stdin','stdout','stderr'])child[key]=new PassThrough();child.kill=()=>queueMicrotask(()=>child.emit('close',null));let data='';child.stdin.on('data',c=>data+=c);child.stdin.on('finish',()=>reply(child,JSON.parse(data)));return child;}};}
const expected={inode:'1',device:'2',size:'3',mtimeNs:'4',ctimeNs:'5',creation:'6',access:'7',write:'8',change:'9',attributes:'32'};
test('Windows attributes masks only edit the four supported flags',()=>{
 assert.deepEqual(normalizeChanges({setMask:3,clearMask:36}),{setMask:3,clearMask:36});
 for(const value of [{setMask:16,clearMask:0},{setMask:4294967296,clearMask:0},{setMask:1,clearMask:1},{setMask:-1,clearMask:0},{setMask:0.5,clearMask:0},{setMask:0,clearMask:0,x:1},null])assert.throws(()=>normalizeChanges(value));
});
test('Windows attributes helper validates results and carries literal paths through stdin',async()=>{
 const request={action:'write',entries:[{relative:'café & $(name).txt'}]};
 const result={platform:'win32',changed:1,entries:[{path:request.entries[0].relative,attributes:33,expected}]};
 assert.deepEqual(await runAttributesHelper('powershell.exe',['-File','fixed.ps1'],request,stub((c,r)=>{assert.deepEqual(r,request);c.stdout.end(JSON.stringify(result));c.emit('close',0);})),result);
 for(const output of ['null','{}',JSON.stringify({...result,changed:2}),JSON.stringify({...result,entries:[]})])await assert.rejects(runAttributesHelper('x',[],request,stub(c=>{c.stdout.end(output);c.emit('close',0);})),/Invalid attribute helper result/);
 await assert.rejects(runAttributesHelper('x',[],request,stub(c=>{c.stderr.end('Rollback: 1 restored, 1 not restored');c.emit('close',1);})),/1 not restored/);
 await assert.rejects(runAttributesHelper('x',[],request,{...stub(()=>{}),timeoutMs:10}),/may have changed/);
});
test('Windows attributes requests preserve snapshots and reject stale review and aliases',async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-attributes-')));
 try{
  await fs.writeFile(path.join(root,'a.txt'),'content');const safe=async(side,p)=>path.join(root,p);
  const preview=await prepareWindowsAttributesRequest(safe,'a',['a.txt']);assert.equal(preview.action,'read');assert.equal(preview.modifiedMs,undefined);
  const reviewed=[{path:'a.txt',attributes:32,expected:{...expected,...preview.entries[0]}}];
  const write=await prepareWindowsAttributesRequest(safe,'a',['a.txt'],{setMask:1,clearMask:0},reviewed);assert.equal(write.entries[0].expected.inode,preview.entries[0].inode);
  await fs.appendFile(path.join(root,'a.txt'),'changed');await assert.rejects(prepareWindowsAttributesRequest(safe,'a',['a.txt'],{setMask:1,clearMask:0},reviewed),/changed/);
  for(const paths of [[],['../a.txt'],['a.txt','A.txt'],Array(1001).fill('a.txt')])await assert.rejects(prepareWindowsAttributesRequest(safe,'a',paths));
  await fs.symlink(path.join(root,'a.txt'),path.join(root,'link'));await assert.rejects(prepareWindowsAttributesRequest(safe,'a',['link']),/regular/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('Windows native attributes preserve timestamps and unrelated flags, and reject stale previews',{skip:process.platform!=='win32'},async()=>{
 const {previewWindowsFolderAttributes,setWindowsFolderAttributes}=require('../desktop/windows-folder-attributes.cjs');
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-win-native-attrs-'))),safe=async(side,p)=>path.join(root,p);
 let original;
 try{
  await fs.writeFile(path.join(root,'file.txt'),'content');await fs.mkdir(path.join(root,'folder'));
  const paths=['file.txt','folder'];original=await previewWindowsFolderAttributes(safe,'a',paths);
  const result=await setWindowsFolderAttributes(safe,'a',paths,{setMask:3,clearMask:0},original.entries);assert.equal(result.changed,2);
  for(let i=0;i<2;i++){
   assert.equal(result.entries[i].attributes&3,3);
   assert.equal(result.entries[i].attributes&~(3|128),original.entries[i].attributes&~(3|128));
   for(const key of ['creation','access','write'])assert.equal(result.entries[i].expected[key],original.entries[i].expected[key]);
  }
  await assert.rejects(setWindowsFolderAttributes(safe,'a',paths,{setMask:0,clearMask:3},original.entries),/changed|preview/i);
  await setWindowsFolderAttributes(safe,'a',paths,{setMask:0,clearMask:3},result.entries);
  await fs.link(path.join(root,'file.txt'),path.join(root,'alias.txt'));
  await assert.rejects(previewWindowsFolderAttributes(safe,'a',['file.txt']),/Hard-linked/i);
  await fs.unlink(path.join(root,'alias.txt'));
 }finally{
  try{const current=await previewWindowsFolderAttributes(safe,'a',['file.txt','folder']);await setWindowsFolderAttributes(safe,'a',['file.txt','folder'],{setMask:0,clearMask:3},current.entries);}catch{}
  await fs.rm(root,{recursive:true,force:true});
 }
});
