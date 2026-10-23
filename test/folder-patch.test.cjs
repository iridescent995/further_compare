'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createTwoFilesPatch}=require('diff');const {FolderPatch}=require('../desktop/folder-patch.cjs');const {encodeText,decodeText}=require('../src/text-codec.cjs');
async function setup(t){const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-folder-patch-test-'))),root=path.join(dir,'target'),backupRoot=path.join(dir,'backups'),stagingRoot=path.join(dir,'stage');await fs.mkdir(root);await fs.mkdir(stagingRoot);const service=new FolderPatch({backupRoot,stagingRoot});t.after(async()=>{await service.dispose();await fs.rm(dir,{recursive:true,force:true});});return {dir,root,backupRoot,stagingRoot,service};}
const patch=(oldName,newName,a,b)=>createTwoFilesPatch(oldName,newName,a,b);
test('multi-file modify/create/delete/rename preview is non-mutating and execution backs up originals',async t=>{
 const f=await setup(t);for(const [name,content]of [['edit','old\n'],['remove','gone\n'],['from','move\n'],['unrelated','keep\n']])await fs.writeFile(path.join(f.root,name),content);
 const source=patch('a/edit','b/edit','old\n','new\n')+patch('/dev/null','b/nested/new','','created\n')+patch('a/remove','/dev/null','gone\n','')+patch('a/from','b/to','move\n','moved\n');
 const review=await f.service.preview(f.root,source);assert.deepEqual(review.entries.map(e=>e.action),['modify','create','delete','rename']);assert.equal(await fs.readFile(path.join(f.root,'edit'),'utf8'),'old\n');assert.ok(review.operations.every(op=>!('content' in op)));
 const result=await f.service.execute(review.id);assert.equal(await fs.readFile(path.join(f.root,'edit'),'utf8'),'new\n');assert.equal(await fs.readFile(path.join(f.root,'nested/new'),'utf8'),'created\n');assert.equal(await fs.readFile(path.join(f.root,'to'),'utf8'),'moved\n');assert.equal(await fs.readFile(path.join(f.root,'unrelated'),'utf8'),'keep\n');await assert.rejects(fs.stat(path.join(f.root,'remove')));await assert.rejects(fs.stat(path.join(f.root,'from')));assert.equal(await fs.readFile(path.join(result.backupPath,'files/edit'),'utf8'),'old\n');assert.deepEqual(await fs.readdir(f.stagingRoot),[]);await assert.rejects(f.service.execute(review.id));
});
test('reverse modification preserves UTF16 BOM, mode, CRLF and absent final newline',async t=>{
 const f=await setup(t),file=path.join(f.root,'x');await fs.writeFile(file,encodeText('new\r\nend',{encoding:'utf16le',bom:true,lineEnding:'mixed'}));await fs.chmod(file,0o640);
 const review=await f.service.preview(f.root,patch('a/x','b/x','old\r\nend','new\r\nend'),{reverse:true});await f.service.execute(review.id);const decoded=decodeText(await fs.readFile(file));assert.equal(decoded.content,'old\r\nend');assert.equal(decoded.format.encoding,'utf16le');assert.equal(decoded.format.bom,true);assert.equal((await fs.stat(file)).mode&0o777,0o640);
});
test('stale content or replaced ancestor rejects before writing and cleans staging',async t=>{
 const f=await setup(t);await fs.mkdir(path.join(f.root,'dir'));const file=path.join(f.root,'dir/x');await fs.writeFile(file,'old\n');const p=patch('a/dir/x','b/dir/x','old\n','new\n');let review=await f.service.preview(f.root,p);await fs.writeFile(file,'changed\n');await assert.rejects(f.service.execute(review.id),/changed/);assert.equal(await fs.readFile(file,'utf8'),'changed\n');assert.deepEqual(await fs.readdir(f.stagingRoot),[]);
 await fs.writeFile(file,'old\n');review=await f.service.preview(f.root,p);await fs.rename(path.join(f.root,'dir'),path.join(f.root,'saved'));await fs.mkdir(path.join(f.root,'dir'));await fs.writeFile(file,'old\n');await assert.rejects(f.service.execute(review.id),/changed/);assert.equal(await fs.readFile(file,'utf8'),'old\n');
});
test('unsafe stripped paths, ignored entries, collisions and overlapping records reject',async t=>{
 const f=await setup(t);for(const name of ['../escape','/absolute','a/../escape','a/C:bad','a/x\\y','a/.git/config','a/node_modules/x','a/CON.txt','a/trailing.','a//x','a/e\u0301'])await assert.rejects(f.service.preview(f.root,patch('/dev/null',name,'','x')));
 for(const names of [['a/x','b/x'],['a/x','b/X'],['a/x','b/x/y']])await assert.rejects(f.service.preview(f.root,patch('/dev/null',names[0],'','x')+patch('/dev/null',names[1],'','y')),/duplicate|ambiguous|overlap/);
 await fs.writeFile(path.join(f.root,'Name'),'exists');await assert.rejects(f.service.preview(f.root,patch('/dev/null','a/name','','x')),/alias collision/);assert.deepEqual(await fs.readdir(f.stagingRoot),[]);
});
test('existing creation/rename destinations, wrong source, symlink and hardlink reject',async t=>{
 const f=await setup(t);await fs.writeFile(path.join(f.root,'x'),'old\n');await fs.writeFile(path.join(f.root,'y'),'existing');await assert.rejects(f.service.preview(f.root,patch('/dev/null','a/y','','new')),/already exists/);await assert.rejects(f.service.preview(f.root,patch('a/x','b/y','old\n','new\n')),/already exists/);await assert.rejects(f.service.preview(f.root,patch('a/x','b/x','wrong\n','new\n')),/does not match/);
 await fs.symlink(path.join(f.root,'x'),path.join(f.root,'link'));await assert.rejects(f.service.preview(f.root,patch('a/link','b/link','old\n','new\n')),/links/);await fs.link(path.join(f.root,'x'),path.join(f.root,'hard'));await assert.rejects(f.service.preview(f.root,patch('a/hard','b/hard','old\n','new\n')),/links/);assert.deepEqual(await fs.readdir(f.stagingRoot),[]);
});
test('explicit strip zero and replacing preview/dispose clean staged state',async t=>{
 const f=await setup(t);await fs.writeFile(path.join(f.root,'x'),'old');const source=patch('x','x','old','new');await assert.rejects(f.service.preview(f.root,source),/Strip/);const first=await f.service.preview(f.root,source,{strip:0});const second=await f.service.preview(f.root,source,{strip:0});await assert.rejects(f.service.execute(first.id),/Preview/);assert.equal((await fs.readdir(f.stagingRoot)).length,1);await f.service.dispose();assert.deepEqual(await fs.readdir(f.stagingRoot),[]);await assert.rejects(f.service.execute(second.id));
});
test('preimage mutation during staging is rejected before a preview can be issued',async t=>{
 const f=await setup(t),file=path.join(f.root,'x');await fs.writeFile(file,'old');const write=fs.writeFile;let changed=false;fs.writeFile=async(name,...args)=>{const result=await write(name,...args);if(String(name).startsWith(f.stagingRoot)&&!changed){changed=true;await write(file,'changed');}return result;};
 try{await assert.rejects(f.service.preview(f.root,patch('a/x','b/x','old','new')),/changed/);}finally{fs.writeFile=write;}assert.equal(await fs.readFile(file,'utf8'),'changed');assert.deepEqual(await fs.readdir(f.stagingRoot),[]);
});
test('selected-file patch never reads unrelated contents',async t=>{
 const f=await setup(t),unrelated=path.join(f.root,'unrelated');await fs.writeFile(path.join(f.root,'x'),'old');await fs.writeFile(unrelated,'private');const open=fs.open;fs.open=async(name,...args)=>{if(name===unrelated)throw Error('Unrelated file must not be opened');return open(name,...args);};try{const review=await f.service.preview(f.root,patch('a/x','b/x','old','new'));await f.service.execute(review.id);}finally{fs.open=open;}assert.equal(await fs.readFile(unrelated,'utf8'),'private');
});
test('partial execution reports complete original backups and cleans staging',async t=>{
 const f=await setup(t);for(const name of ['a','b'])await fs.writeFile(path.join(f.root,name),'old');const review=await f.service.preview(f.root,patch('a/a','b/a','old','new')+patch('a/b','b/b','old','new'));const rename=fs.rename;fs.rename=async(from,to)=>{if(to===path.join(f.root,'b'))throw Error('Injected second copy failure');return rename(from,to);};let failure;try{await f.service.execute(review.id);}catch(error){failure=error;}finally{fs.rename=rename;}assert.match(failure.message,/Stopped after 1 operations.*Backups:/);const backupPath=failure.message.split('Backups: ')[1];for(const name of ['a','b'])assert.equal(await fs.readFile(path.join(backupPath,'files',name),'utf8'),'old');assert.equal(await fs.readFile(path.join(f.root,'a'),'utf8'),'new');assert.equal(await fs.readFile(path.join(f.root,'b'),'utf8'),'old');assert.deepEqual(await fs.readdir(f.stagingRoot),[]);
});
test('ancestor replacement during staged copy cannot install into replacement directory',async t=>{
 const f=await setup(t),dir=path.join(f.root,'dir');await fs.mkdir(dir);const review=await f.service.preview(f.root,patch('/dev/null','b/dir/new','','new'));const copy=fs.copyFile;let replaced=false;fs.copyFile=async(from,to,...args)=>{const result=await copy(from,to,...args);if(String(to).startsWith(dir+path.sep)&&!replaced){replaced=true;await fs.rename(dir,path.join(f.root,'saved'));await fs.mkdir(dir);await copy(path.join(f.root,'saved',path.basename(to)),to);}return result;};try{await assert.rejects(f.service.execute(review.id),/directory changed/);}finally{fs.copyFile=copy;}assert.equal(replaced,true);assert.deepEqual(await fs.readdir(dir),[]);
});
test('target root replacement during backup rejects before applying files',async t=>{
 const f=await setup(t);await fs.writeFile(path.join(f.root,'x'),'old');const review=await f.service.preview(f.root,patch('a/x','b/x','old','new'));const copy=fs.copyFile;let replaced=false;fs.copyFile=async(from,to,...args)=>{const result=await copy(from,to,...args);if(String(to).startsWith(f.backupRoot+path.sep)&&!replaced){replaced=true;await fs.rename(f.root,path.join(f.dir,'old-root'));await fs.mkdir(f.root);}return result;};try{await assert.rejects(f.service.execute(review.id),/directory changed/);}finally{fs.copyFile=copy;}assert.equal(replaced,true);assert.deepEqual(await fs.readdir(f.root),[]);assert.equal(await fs.readFile(path.join(f.dir,'old-root/x'),'utf8'),'old');
});
test('newly created ancestor identities remain guarded during subsequent copy',async t=>{
 const f=await setup(t),dir=path.join(f.root,'newdir'),review=await f.service.preview(f.root,patch('/dev/null','b/newdir/file','','new'));const copy=fs.copyFile;let replaced=false;fs.copyFile=async(from,to,...args)=>{const result=await copy(from,to,...args);if(String(to).startsWith(dir+path.sep)&&!replaced){replaced=true;await fs.rename(dir,path.join(f.root,'saved'));await fs.mkdir(dir);await copy(path.join(f.root,'saved',path.basename(to)),to);}return result;};try{await assert.rejects(f.service.execute(review.id),/directory changed/);}finally{fs.copyFile=copy;}assert.equal(replaced,true);assert.deepEqual(await fs.readdir(dir),[]);
});
test('staged output tampering invalidates the opaque execution token',async t=>{
 const f=await setup(t);await fs.writeFile(path.join(f.root,'x'),'old');const review=await f.service.preview(f.root,patch('a/x','b/x','old','new')),stage=(await fs.readdir(f.stagingRoot))[0];await fs.writeFile(path.join(f.stagingRoot,stage,'x'),'tampered');await assert.rejects(f.service.execute(review.id),/changed/);assert.equal(await fs.readFile(path.join(f.root,'x'),'utf8'),'old');assert.deepEqual(await fs.readdir(f.stagingRoot),[]);
});
test('successful writes with staging cleanup failure return a warning and retain original backup',async t=>{
 const f=await setup(t),file=path.join(f.root,'x');await fs.writeFile(file,'old');
 const review=await f.service.preview(f.root,patch('a/x','b/x','old','new'));
 const stagedNames=await fs.readdir(f.stagingRoot);assert.equal(stagedNames.length,1);const stage=path.join(f.stagingRoot,stagedNames[0]);
 const remove=fs.rm;let cleanupAttempts=0,result;
 fs.rm=async(name,...args)=>{if(name===stage){cleanupAttempts++;throw Error('Injected staging cleanup failure');}return remove(name,...args);};
 try{result=await f.service.execute(review.id);}finally{fs.rm=remove;}
 assert.equal(cleanupAttempts,1);assert.equal(result.completed,1);assert.equal(result.cleanupWarning,'Injected staging cleanup failure');
 assert.equal(await fs.readFile(file,'utf8'),'new');assert.equal(await fs.readFile(path.join(result.backupPath,'files/x'),'utf8'),'old');
 assert.equal((await fs.stat(stage)).isDirectory(),true);await assert.rejects(f.service.execute(review.id),/Preview/);
});
test('legacy alias edits require explicit normalization and preserve originals and backups',async t=>{
 const f=await setup(t),file=path.join(f.root,'x'),original=Buffer.from('a2cc0a','hex');await fs.writeFile(file,original);
 const source=patch('a/x','b/x','十\n','十!\n');
 await assert.rejects(f.service.preview(f.root,source,{encoding:'big5'}),/Normalize legacy byte aliases/);
 assert.deepEqual(await fs.readFile(file),original);assert.deepEqual(await fs.readdir(f.stagingRoot),[]);
 for(const normalizeLegacy of ['true',1,null,{},[]])await assert.rejects(f.service.preview(f.root,source,{encoding:'big5',normalizeLegacy}),/Invalid folder patch options/);
 await assert.rejects(f.service.preview(f.root,source,{encoding:'big5',unexpected:true}),/Invalid folder patch options/);
 const review=await f.service.preview(f.root,source,{encoding:'big5',normalizeLegacy:true});assert.equal(review.normalizeLegacy,true);assert.equal(review.entries[0].legacyByteHandling,'normalized');assert.deepEqual(await fs.readFile(file),original);
 const result=await f.service.execute(review.id);assert.equal((await fs.readFile(file)).toString('hex'),'a451210a');assert.deepEqual(await fs.readFile(path.join(result.backupPath,'files/x')),original);
});
test('same-content alias rename keeps exact bytes even with normalization consent',async t=>{
 const f=await setup(t),original=Buffer.from('a2cc0a','hex');await fs.writeFile(path.join(f.root,'x'),original);
 const source='--- a/x\n+++ b/y\n@@ -1 +1 @@\n-十\n+十\n';
 const review=await f.service.preview(f.root,source,{encoding:'big5',normalizeLegacy:true});assert.equal(review.entries[0].legacyByteHandling,'preserved');
 await f.service.execute(review.id);assert.deepEqual(await fs.readFile(path.join(f.root,'y')),original);
});
test('normalization option leaves canonical source handling unchanged',async t=>{
 const f=await setup(t),file=path.join(f.root,'x');await fs.writeFile(file,Buffer.from('a4510a','hex'));
 const review=await f.service.preview(f.root,patch('a/x','b/x','十\n','十!\n'),{encoding:'big5',normalizeLegacy:true});assert.equal(review.entries[0].legacyByteHandling,undefined);
 await f.service.execute(review.id);assert.equal((await fs.readFile(file)).toString('hex'),'a451210a');
});
