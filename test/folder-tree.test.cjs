'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs');
const {FolderTree}=require('../desktop/folder-tree.cjs');
async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'fc-tree-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const roots={a:path.join(base,'a'),b:path.join(base,'b')};for(const root of Object.values(roots))await fs.mkdir(root);
 const write=async(side,relative,contents)=>{const full=path.join(roots[side],relative);await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,contents);};
 await write('a','left/old.txt','identical');await write('b','right/new.txt','identical');await write('b','left/old.txt','decoy');await write('b','right/extra.txt','extra');
 await write('a','old-dir/shared.txt','same');await write('b','new-dir/shared.txt','same');await write('a','old-dir/nested/deep.txt','not yet compared');await write('b','new-dir/nested/deep.txt','not yet compared');
 const service=new FolderService(path.join(base,'backups'));await service.select('a',roots.a);await service.select('b',roots.b);
 const tree=new FolderTree(service);return {base,roots,write,service,tree};
}
const mappings=[{a:'left/old.txt',b:'right/new.txt',kind:'file'},{a:'old-dir',b:'new-dir',kind:'directory'}];
const rowAt=(result,side,relative)=>{const row=result.rows.find(row=>row[side==='a'?'pathA':'pathB']===relative);assert.ok(row,`Missing ${side}:${relative}`);return row;};
test('native tree places cross-parent pairs on the left, suppresses duplicates and compares actual files',async t=>{
 const {tree}=await fixture(t);await tree.setAlignment(mappings);const root=await tree.list();
 const left=rowAt(root,'a','left'),right=rowAt(root,'b','right');
 const node=await tree.compare(left.id),paired=rowAt(node,'a','left/old.txt');
 assert.equal(paired.pathB,'right/new.txt');assert.equal(paired.nameA,'old.txt');assert.equal(paired.nameB,'new.txt');assert.equal(paired.status,'equal');assert.equal(paired.comparison,'content');assert.equal(paired.parentId,left.id);assert.equal(paired.path,undefined);
 const rightNode=await tree.list(right.id);assert.ok(!rightNode.rows.some(row=>row.pathB==='right/new.txt'));assert.equal(rowAt(rightNode,'b','right/extra.txt').pathA,null);
 assert.equal((await tree.resolve(paired.id,'a',node.revision)).path,'left/old.txt');assert.equal((await tree.resolve(paired.id,'b',node.revision)).path,'right/new.txt');
 assert.ok(node.rows.some(row=>row.pathB==='left/old.txt'&&row.pathA===null),'Reserved same-name decoy remains one-sided');
});
test('paired directory expansion is immediate and comparison does not read unopened descendants',async t=>{
 const {tree,service}=await fixture(t);await tree.setAlignment(mappings);const root=await tree.list(),directory=rowAt(root,'a','old-dir');
 assert.equal(directory.pathB,'new-dir');assert.equal(service.hashCache.size,0);
 const node=await tree.compare(directory.id);assert.equal(rowAt(node,'a','old-dir/shared.txt').status,'equal');const nested=rowAt(node,'a','old-dir/nested');assert.equal(nested.pathB,'new-dir/nested');
 assert.ok(![...service.hashCache.keys()].some(key=>key.includes('deep.txt')));
 const deep=await tree.compare(nested.id);assert.equal(rowAt(deep,'a','old-dir/nested/deep.txt').status,'equal');
});
test('refresh invalidates authority while preserving stable logical row identity',async t=>{
 const {tree}=await fixture(t);await tree.setAlignment(mappings);const first=await tree.list(),row=rowAt(first,'a','old-dir');
 await tree.refresh();await assert.rejects(()=>tree.resolve(row.id,'a',first.revision));const second=await tree.list();assert.notEqual(second.revision,first.revision);assert.equal(rowAt(second,'a','old-dir').id,row.id);
 await assert.rejects(()=>tree.resolve(row.id,'a',first.revision));await assert.rejects(()=>tree.resolve('invented','a',second.revision));await assert.rejects(()=>tree.resolve(row.id,'invalid',second.revision));
});
test('stale asynchronous listings cannot publish after refresh',async t=>{
 const {tree,service}=await fixture(t);await tree.list();const original=service.listDirectoryPair.bind(service);let entered,release;const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
 service.listDirectoryPair=async(...args)=>{entered();await gate;return original(...args);};const pending=tree.list();await started;await tree.refresh();release();await assert.rejects(()=>pending);
 service.listDirectoryPair=original;assert.ok((await tree.list()).rows.length);
});
test('deleted aligned counterpart never falls back to a same-name decoy',async t=>{
 const {tree,roots}=await fixture(t);await tree.setAlignment(mappings);const root=await tree.list(),left=rowAt(root,'a','left'),before=await tree.compare(left.id),paired=rowAt(before,'a','left/old.txt');
 await fs.unlink(path.join(roots.b,'right/new.txt'));const after=await tree.list(left.id),missing=rowAt(after,'a','left/old.txt');assert.equal(missing.pathB,null);assert.equal(missing.status,'left');assert.equal(missing.id,paired.id);
 await assert.rejects(()=>tree.resolve(missing.id,'b',after.revision));assert.ok(after.rows.some(row=>row.pathB==='left/old.txt'&&row.pathA===null));
});
test('invalid native alignment is atomic and rejects type mismatch, traversal and symlinks',async t=>{
 const {tree,roots}=await fixture(t);await tree.setAlignment(mappings);const before=await tree.list();
 await fs.symlink(path.join(roots.b,'right/new.txt'),path.join(roots.b,'alias.txt'));
 for(const pairs of [[{a:'left/old.txt',b:'new-dir',kind:'file'}],[{a:'../outside',b:'right/new.txt',kind:'file'}],[{a:'left/old.txt',b:'alias.txt',kind:'file'}],[{a:'absent.txt',b:'right/new.txt',kind:'file'}]])await assert.rejects(()=>tree.setAlignment(pairs));
 const after=await tree.list();assert.equal(after.revision,before.revision);assert.equal(rowAt(after,'a','old-dir').pathB,'new-dir');
});
test('loaded row authority rejects replaced files and selected roots',async t=>{
 const {tree,roots}=await fixture(t);await tree.setAlignment(mappings);const root=await tree.list(),left=rowAt(root,'a','left'),node=await tree.list(left.id),row=rowAt(node,'a','left/old.txt');
 await fs.rename(path.join(roots.a,'left/old.txt'),path.join(roots.a,'left/previous.txt'));await fs.writeFile(path.join(roots.a,'left/old.txt'),'replacement');await assert.rejects(()=>tree.resolve(row.id,'a',node.revision));
 await fs.rename(roots.b,roots.b+'-previous');await fs.mkdir(roots.b);await assert.rejects(()=>tree.list());
});
test('returned row metadata cannot change native authority and sibling swaps remain distinct',async t=>{
 const {tree,write}=await fixture(t);for(const side of ['a','b']){await write(side,'x.txt',side==='a'?'x':'y');await write(side,'y.txt',side==='a'?'y':'x');}
 await tree.setAlignment([{a:'x.txt',b:'y.txt',kind:'file'},{a:'y.txt',b:'x.txt',kind:'file'}]);const root=await tree.compare(),x=rowAt(root,'a','x.txt'),y=rowAt(root,'a','y.txt');assert.notEqual(x.id,y.id);assert.equal(x.status,'equal');assert.equal(y.status,'equal');
 x.pathA='../outside';x.pathB='other.txt';assert.equal((await tree.resolve(x.id,'a',root.revision)).path,'x.txt');assert.equal((await tree.resolve(x.id,'b',root.revision)).path,'y.txt');
});
test('native alignment rejects physically duplicate endpoints even with distinct names',async t=>{
 const {tree,roots,write}=await fixture(t);await tree.list();await fs.link(path.join(roots.a,'left/old.txt'),path.join(roots.a,'left/alias.txt'));await write('b','right/second.txt','another');
 await assert.rejects(()=>tree.setAlignment([{a:'left/old.txt',b:'right/new.txt',kind:'file'},{a:'left/alias.txt',b:'right/second.txt',kind:'file'}]));
});
test('removing a loaded directory evicts its descendants and rejects old row authority',async t=>{
 const {tree,roots}=await fixture(t);await tree.setAlignment(mappings);const root=await tree.list(),dir=rowAt(root,'a','old-dir'),children=await tree.list(dir.id),child=rowAt(children,'a','old-dir/shared.txt');
 await fs.rm(path.join(roots.a,'old-dir'),{recursive:true});await fs.rm(path.join(roots.b,'new-dir'),{recursive:true});const refreshed=await tree.list();assert.ok(!refreshed.rows.some(row=>row.id===dir.id));assert.ok(refreshed.removedIds.includes(child.id));await assert.rejects(()=>tree.resolve(child.id,'a',refreshed.revision));
});
test('resolve rejects replacement during its endpoint containment recheck',async t=>{
 const {tree,service,roots}=await fixture(t);await tree.setAlignment(mappings);const root=await tree.list(),left=rowAt(root,'a','left'),children=await tree.list(left.id),row=rowAt(children,'a','left/old.txt');
 const safe=service.safe.bind(service);let checks=0;service.safe=async(side,relative,...rest)=>{const full=await safe(side,relative,...rest);if(side==='a'&&relative==='left/old.txt'&&++checks===2){await fs.rename(full,path.join(roots.a,'left','moved.txt'));await fs.writeFile(full,'replacement');}return full;};
 await assert.rejects(()=>tree.resolve(row.id,'a',children.revision),/changed/);assert.equal(checks,2);
});
test('manual mappings cannot make excluded subtrees into hidden owners of visible entries',async t=>{
 const {tree,write}=await fixture(t);await write('a','.git/hidden.txt','identical');
 await assert.rejects(()=>tree.setAlignment([{a:'.git/hidden.txt',b:'right/new.txt',kind:'file'}]));
 const root=await tree.list();assert.ok(!root.rows.some(row=>row.pathA==='.git'));const right=rowAt(root,'b','right');assert.equal(rowAt(await tree.list(right.id),'b','right/new.txt').status,'right');
});
test('external endpoint type changes stay explicit conflicts rather than redefining mappings',async t=>{
 const {tree,roots}=await fixture(t);await tree.setAlignment(mappings);const root=await tree.list(),left=rowAt(root,'a','left');
 for(const [side,relative]of [['a','left/old.txt'],['b','right/new.txt']]){await fs.unlink(path.join(roots[side],relative));await fs.mkdir(path.join(roots[side],relative));}
 const changed=await tree.list(left.id),row=rowAt(changed,'a','left/old.txt');assert.equal(row.kindA,'directory');assert.equal(row.kindB,'directory');assert.equal(row.status,'conflict');assert.equal(row.alignmentConflict,true);await assert.rejects(()=>tree.list(row.id),/changed type/);
});

test('directory mappings replaced by files retain conflict status even when contents match',async t=>{
 const {tree,roots,service}=await fixture(t);await tree.setAlignment(mappings);
 for(const [side,relative]of [['a','old-dir'],['b','new-dir']]){await fs.rm(path.join(roots[side],relative),{recursive:true});await fs.writeFile(path.join(roots[side],relative),'matching replacement');}
 const compared=await tree.compare(),row=rowAt(compared,'a','old-dir');assert.equal(row.kindA,'file');assert.equal(row.kindB,'file');assert.equal(row.alignmentConflict,true);assert.equal(row.status,'conflict');assert.equal(row.comparison,undefined);assert.equal(service.hashCache.size,0);
});
test('older comparison cannot overwrite a newer listing of the same node',async t=>{
 const {tree,service}=await fixture(t);await tree.setAlignment(mappings);const dir=rowAt(await tree.list(),'a','old-dir');
 const compare=service.compareFilePairs.bind(service);let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 service.compareFilePairs=async(...args)=>{const result=await compare(...args);entered();await gate;return result;};
 const pending=tree.compare(dir.id);await started;const latest=await tree.list(dir.id);const row=rowAt(latest,'a','old-dir/shared.txt');assert.equal(row.status,'unchecked');release();await assert.rejects(()=>pending,/newer folder node request/);
 assert.equal((await tree.resolve(row.id,'a',latest.revision)).path,'old-dir/shared.txt');
});
test('independent nodes may compare concurrently without invalidating each other',async t=>{
 const {tree}=await fixture(t);await tree.setAlignment(mappings);const root=await tree.list(),dir=rowAt(root,'a','old-dir'),left=rowAt(root,'a','left');
 const [first,second]=await Promise.all([tree.compare(dir.id),tree.compare(left.id)]);assert.equal(rowAt(first,'a','old-dir/shared.txt').status,'equal');assert.equal(rowAt(second,'a','left/old.txt').status,'equal');
});

test('node comparison refreshes parent metadata and authority without changing its identity',async t=>{
 const {tree,roots,write}=await fixture(t);await tree.setAlignment(mappings);const root=await tree.list(),parent=rowAt(root,'a','old-dir');
 await write('a','old-dir/added.txt','new');await fs.utimes(path.join(roots.a,'old-dir'),1700000400,1700000400);
 const result=await tree.compare(parent.id);assert.equal(result.parentRow.id,parent.id);assert.equal(result.parentRow.mtimeA,1700000400000);assert.notEqual(result.parentRow.versionA,parent.versionA);
 const resolved=await tree.resolveRow(parent.id,result.revision);assert.equal(resolved.mtimeA,1700000400000);assert.equal(resolved.versionA,result.parentRow.versionA);
 result.parentRow.versionA='forged';assert.notEqual((await tree.resolveRow(parent.id,result.revision)).versionA,'forged');
});

test('selected refresh accepts replaced and newly paired files without listing siblings',async t=>{
 const {tree,service,roots,write}=await fixture(t);await write('a','one.txt','before');await write('a','two.txt','same');await write('b','one.txt','after');
 const root=await tree.list(),one=rowAt(root,'a','one.txt'),two=rowAt(root,'a','two.txt'),sibling=rowAt(root,'a','old-dir');
 await fs.rename(path.join(roots.a,'one.txt'),path.join(roots.a,'previous.txt'));await write('a','one.txt','after');await write('b','two.txt','same');
 await assert.rejects(()=>tree.compareSelected([one.id],root.revision),/changed/);
 await assert.rejects(()=>tree.compareSelected([two.id],root.revision),/changed/);
 service.listDirectoryPair=async()=>{throw new Error('Unexpected listing');};const compare=service.compareFilePairs.bind(service),calls=[];service.compareFilePairs=async(pairs,rules)=>{calls.push(pairs);return compare(pairs,rules);};
 const result=await tree.refreshSelectedFiles([one.id,two.id],root.revision);assert.deepEqual(result.removedIds,[]);assert.equal(result.revision,root.revision);assert.ok(result.rows.every(row=>row.status==='equal'));assert.deepEqual(calls,[[{a:'one.txt',b:'one.txt'},{a:'two.txt',b:'two.txt'}]]);
 assert.equal((await tree.resolve(one.id,'a',root.revision)).path,'one.txt');assert.equal((await tree.resolve(two.id,'b',root.revision)).path,'two.txt');assert.equal((await tree.resolve(sibling.id,'a',root.revision)).path,'old-dir');
});
test('selected refresh handles one-sided and both-sided deletion and evicts authority',async t=>{
 const {tree,roots,write}=await fixture(t);for(const side of ['a','b']){await write(side,'one.txt','same');await write(side,'two.txt','same');}
 const root=await tree.list(),one=rowAt(root,'a','one.txt'),two=rowAt(root,'a','two.txt');await fs.unlink(path.join(roots.a,'one.txt'));for(const side of ['a','b'])await fs.unlink(path.join(roots[side],'two.txt'));
 const result=await tree.refreshSelectedFiles([one.id,two.id],root.revision);assert.equal(result.rows.length,1);assert.equal(result.rows[0].id,one.id);assert.equal(result.rows[0].status,'right');assert.deepEqual(result.removedIds,[two.id]);
 await assert.rejects(()=>tree.resolve(two.id,'a',root.revision),/loaded/);await assert.rejects(()=>tree.resolve(one.id,'a',root.revision),/no entry/);assert.equal((await tree.resolve(one.id,'b',root.revision)).path,'one.txt');
 await write('a','two.txt','returned');const relisted=await tree.list();assert.equal(rowAt(relisted,'a','two.txt').id,two.id);
});
test('selected refresh keeps aligned endpoints and type changes explicit without hashing directories',async t=>{
 const {tree,roots,service}=await fixture(t);await tree.setAlignment(mappings);const parent=rowAt(await tree.list(),'a','left'),loaded=await tree.list(parent.id),row=rowAt(loaded,'a','left/old.txt');
 await fs.unlink(path.join(roots.b,'right/new.txt'));const deleted=await tree.refreshSelectedFiles([row.id],loaded.revision);assert.equal(deleted.rows[0].pathB,null);assert.equal(deleted.rows[0].status,'left');
 await fs.mkdir(path.join(roots.b,'right/new.txt'));service.compareFilePairs=async()=>{throw new Error('Unexpected hash');};const result=await tree.refreshSelectedFiles([row.id],loaded.revision);assert.equal(result.rows[0].pathB,'right/new.txt');assert.equal(result.rows[0].status,'conflict');assert.equal(result.rows[0].alignmentConflict,true);await assert.rejects(()=>tree.list(row.id),/changed type/);
});
test('selected refresh supports ordinary file-to-directory changes without listing their contents',async t=>{
 const {tree,roots,write,service}=await fixture(t);for(const side of ['a','b'])await write(side,'convert','same');const root=await tree.list(),row=rowAt(root,'a','convert');for(const side of ['a','b']){await fs.unlink(path.join(roots[side],'convert'));await fs.mkdir(path.join(roots[side],'convert'));await write(side,'convert/child.txt','same');}
 const list=service.listDirectoryPair.bind(service);service.listDirectoryPair=async()=>{throw new Error('Unexpected listing');};const result=await tree.refreshSelectedFiles([row.id],root.revision);assert.equal(result.rows[0].kind,'directory');assert.equal(result.rows[0].status,'directory');service.listDirectoryPair=list;assert.equal(rowAt(await tree.list(row.id),'a','convert/child.txt').kind,'file');
});
test('selected refresh rejects forged, duplicate, stale and directory IDs before file reads',async t=>{
 const {tree,write,service}=await fixture(t);await write('a','one.txt','same');const root=await tree.list(),one=rowAt(root,'a','one.txt'),dir=rowAt(root,'a','old-dir');service.safe=async()=>{throw new Error('Unexpected endpoint read');};
 for(const ids of [['invented'],['f'.repeat(64)],[one.id,one.id],[],[dir.id]])await assert.rejects(()=>tree.refreshSelectedFiles(ids,root.revision),/Choose/);
 await assert.rejects(()=>tree.refreshSelectedFiles([one.id],'stale'),/revision/);
});
test('selected refresh rejects root, ancestor and symbolic-link replacements',async t=>{
 for(const change of ['ancestor','symlink','root']){const {tree,roots}=await fixture(t);const parent=rowAt(await tree.list(),'a','left'),node=await tree.list(parent.id),row=rowAt(node,'a','left/old.txt');
 if(change==='ancestor'){await fs.rename(path.join(roots.a,'left'),path.join(roots.a,'previous'));await fs.mkdir(path.join(roots.a,'left'));await fs.writeFile(path.join(roots.a,'left/old.txt'),'new');}
 if(change==='symlink'){await fs.unlink(path.join(roots.a,'left/old.txt'));await fs.symlink(path.join(roots.b,'right/new.txt'),path.join(roots.a,'left/old.txt'));}
 if(change==='root'){await fs.rename(roots.a,roots.a+'-previous');await fs.mkdir(roots.a);}
 await assert.rejects(()=>tree.refreshSelectedFiles([row.id],node.revision));}
});
test('selected refresh cannot overwrite a newer listing or publish after full refresh',async t=>{
 for(const action of ['list','refresh']){const {tree,service,write}=await fixture(t);for(const side of ['a','b'])await write(side,'one.txt','same');const root=await tree.list(),row=rowAt(root,'a','one.txt');
 const compare=service.compareFilePairs.bind(service);let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);service.compareFilePairs=async(...args)=>{const result=await compare(...args);entered();await gate;return result;};
 const pending=tree.refreshSelectedFiles([row.id],root.revision);await started;await tree[action]();release();await assert.rejects(()=>pending,/changed|newer/);}
});
test('selected refresh rechecks missing endpoints before committing deletion',async t=>{
 const {tree,service,roots,write}=await fixture(t);await write('a','gone.txt','old');for(const side of ['a','b'])await write(side,'paired.txt','same');const root=await tree.list(),gone=rowAt(root,'a','gone.txt'),paired=rowAt(root,'a','paired.txt');await fs.unlink(path.join(roots.a,'gone.txt'));
 const compare=service.compareFilePairs.bind(service);service.compareFilePairs=async(...args)=>{const result=await compare(...args);await write('a','gone.txt','returned');return result;};
 await assert.rejects(()=>tree.refreshSelectedFiles([gone.id,paired.id],root.revision),/changed while refreshing/);
 const result=await tree.refreshSelectedFiles([gone.id],root.revision);assert.equal(result.rows[0].status,'left');assert.deepEqual(result.removedIds,[]);
});

test('selected directory refresh preserves loaded children when identities are unchanged',async t=>{
 const {tree,service}=await fixture(t);await tree.setAlignment(mappings);const root=await tree.list(),dir=rowAt(root,'a','old-dir'),children=await tree.list(dir.id),file=rowAt(children,'a','old-dir/shared.txt');
 service.listDirectoryPair=async()=>{throw new Error('Unexpected listing');};
 const result=await tree.refreshSelectedEntries([dir.id],root.revision);assert.deepEqual(result.removedIds,[]);assert.equal(result.rows[0].kind,'directory');assert.equal((await tree.resolve(file.id,'a',root.revision)).path,'old-dir/shared.txt');
 const both=await tree.refreshSelectedEntries([file.id,dir.id],root.revision);assert.equal(both.rows.find(row=>row.id===file.id).status,'equal');assert.deepEqual(both.removedIds,[]);
});
test('selected directory replacement and deletion revoke loaded descendants without reading replacement children',async t=>{
 for(const change of ['replace','delete','conflict']) {
  const {tree,service,roots,write}=await fixture(t);await write('a','dir/child.txt','same');await write('b','dir/child.txt','same');const root=await tree.list(),dir=rowAt(root,'a','dir'),children=await tree.list(dir.id),child=rowAt(children,'a','dir/child.txt');
  await fs.rename(path.join(roots.a,'dir'),path.join(roots.a,'previous'));
  if(change==='replace')await write('a','dir/child.txt','replacement');
  if(change==='conflict')await write('a','dir','replacement');
  if(change==='delete')await fs.rm(path.join(roots.b,'dir'),{recursive:true});
  const safe=service.safe.bind(service);service.safe=async(side,relative)=>{assert.ok(!relative.endsWith('child.txt'),'Must not read revoked child path');return safe(side,relative);};service.listDirectoryPair=async()=>{throw new Error('Unexpected listing');};service.compareFilePairs=async()=>{throw new Error('Unexpected comparison');};
  const result=await tree.refreshSelectedEntries([child.id,dir.id],root.revision);assert.ok(result.removedIds.includes(child.id));assert.ok(!result.rows.some(row=>row.id===child.id));await assert.rejects(()=>tree.resolve(child.id,'a',root.revision),/loaded/);
  if(change==='delete'){assert.ok(result.removedIds.includes(dir.id));assert.deepEqual(result.rows,[]);}else assert.equal(result.rows[0].kind,change==='conflict'?'conflict':'directory');
 }
});
test('selected conflict refresh recovers regular files and aligned directories',async t=>{
 const {tree,roots,write}=await fixture(t);await tree.setAlignment(mappings);let root=await tree.list(),dir=rowAt(root,'a','old-dir');await fs.rename(path.join(roots.a,'old-dir'),path.join(roots.a,'previous'));await write('a','old-dir','conflict');
 let result=await tree.refreshSelectedEntries([dir.id],root.revision);assert.equal(result.rows[0].alignmentConflict,true);await fs.unlink(path.join(roots.a,'old-dir'));await fs.rename(path.join(roots.a,'previous'),path.join(roots.a,'old-dir'));result=await tree.refreshSelectedEntries([dir.id],root.revision);assert.equal(result.rows[0].kind,'directory');assert.equal(result.rows[0].alignmentConflict,false);assert.ok((await tree.list(dir.id)).rows.length);
 await write('a','mixed','same');await write('b','mixed/child','same');root=await tree.list();const mixed=rowAt(root,'a','mixed');assert.equal(mixed.kind,'conflict');await fs.rm(path.join(roots.b,'mixed'),{recursive:true});await write('b','mixed','same');result=await tree.refreshSelectedEntries([mixed.id],root.revision);assert.equal(result.rows[0].kind,'file');assert.equal(result.rows[0].status,'equal');
});
test('general selected refresh rejects unselected replaced ancestors, symlinks and replaced roots',async t=>{
 for(const change of ['ancestor','symlink','root']) {
  const {tree,roots}=await fixture(t);const root=await tree.list(),dir=rowAt(root,'a','old-dir'),children=await tree.list(dir.id),nested=rowAt(children,'a','old-dir/nested');
  if(change==='ancestor'){await fs.rename(path.join(roots.a,'old-dir'),path.join(roots.a,'previous'));await fs.mkdir(path.join(roots.a,'old-dir/nested'),{recursive:true});}
  if(change==='symlink'){await fs.rename(path.join(roots.a,'old-dir/nested'),path.join(roots.a,'previous'));await fs.symlink(path.join(roots.a,'previous'),path.join(roots.a,'old-dir/nested'));}
  if(change==='root'){await fs.rename(roots.a,roots.a+'-previous');await fs.mkdir(roots.a);}
  await assert.rejects(()=>tree.refreshSelectedEntries([nested.id],root.revision));
 }
});

test('opt-in node spelling pairs immediate children, preserves IDs and builds complete operation mappings',async t=>{
 const {service,write}=await fixture(t);
 await write('a','Source/closed/deep.txt','same');await write('b','SOURCE/CLOSED/DEEP.TXT','same');
 await write('a','alpha.txt','same');await write('b','ALPHA.TXT','same');
 const tree=new FolderTree(service,undefined,{ignoreCase:true});
 const calls=[],list=service.listDirectoryPair.bind(service);service.listDirectoryPair=async nodes=>{calls.push(nodes);return list(nodes);};
 const root=await tree.compare(),source=rowAt(root,'a','Source'),alpha=rowAt(root,'a','alpha.txt');assert.equal(source.pathB,'SOURCE');assert.equal(alpha.pathB,'ALPHA.TXT');assert.equal(alpha.status,'equal');
 assert.deepEqual(calls,[{a:'',b:''}]);assert.ok(!tree.alignment.pairs.some(pair=>pair.a.includes('closed')));
 const alignment=tree.alignment;await tree.list();assert.equal(tree.alignment,alignment,'unchanged namespace retains model identity');
 const children=await tree.list(source.id),closed=rowAt(children,'a','Source/closed');assert.equal(closed.pathB,'SOURCE/CLOSED');
 assert.equal((await tree.resolveRow(alpha.id,children.revision)).id,alpha.id);
 const again=await tree.list();assert.equal(rowAt(again,'a','Source').id,source.id);assert.equal(rowAt(again,'a','alpha.txt').id,alpha.id);
 const deep=await tree.compare(closed.id);assert.equal(rowAt(deep,'a','Source/closed/deep.txt').pathB,'SOURCE/CLOSED/DEEP.TXT');
 await tree.refresh();const refreshed=await tree.list();assert.equal(rowAt(refreshed,'a','Source').id,source.id);assert.equal(rowAt(refreshed,'a','alpha.txt').id,alpha.id);
 assert.equal(tree.manualAlignment.pairs.length,0);
 await tree.setNameRules({});const exact=await tree.list();assert.equal(rowAt(exact,'a','Source').pathB,null);assert.equal(rowAt(exact,'b','SOURCE').pathA,null);
});
test('opt-in spelling namespace refresh removes stale pairs and preserves manual alignment kinds',async t=>{
 const {service,write,roots}=await fixture(t);await write('a','Only','a');await write('b','ONLY','b');
 const tree=new FolderTree(service,undefined,{ignoreCase:true}),first=await tree.list();assert.equal(rowAt(first,'a','Only').pathB,'ONLY');
 await fs.unlink(path.join(roots.b,'ONLY'));const second=await tree.list();assert.equal(rowAt(second,'a','Only').pathB,null);assert.notEqual(first.revision,second.revision);
 await write('b','ONLY','b');const third=await tree.list();assert.equal(rowAt(third,'a','Only').pathB,'ONLY');
 await tree.setAlignment([{a:'left/old.txt',b:'right/new.txt',kind:'file'}]);const root=await tree.list();const left=rowAt(root,'a','left');assert.equal(rowAt(await tree.list(left.id),'a','left/old.txt').pathB,'right/new.txt');
});
test('failed and stale automatic matching scans never publish candidate namespace authority',async t=>{
 const {service,write}=await fixture(t);await write('a','Auto','x');await write('b','AUTO','x');
 const tree=new FolderTree(service,undefined,{ignoreCase:true}),before=tree.alignment,revision=tree.revision;
 const compare=service.compareFilePairs.bind(service);service.compareFilePairs=async()=>{throw Error('injected comparison failure');};
 await assert.rejects(()=>tree.compare(),/injected/);assert.equal(tree.alignment,before);assert.equal(tree.revision,revision);
 service.compareFilePairs=compare;
 let release,entered;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 service.compareFilePairs=async(...args)=>{entered();await gate;return compare(...args);};
 const stale=tree.compare();await started;
 assert.equal(tree.alignment,before);assert.equal(tree.revision,revision,'candidate is not operation authority while comparison is pending');
 const published=await tree.list(),publishedModel=tree.alignment;assert.equal(rowAt(published,'a','Auto').pathB,'AUTO');
 release();await assert.rejects(()=>stale,error=>error.code==='ABORT_ERR'||/replaced|changed/.test(error.message));assert.equal(tree.alignment,publishedModel);assert.equal(tree.revision,published.revision);
});

test('transport-preserving operation drains an existing comparison and refuses new reads',async t=>{
 const {tree,service}=await fixture(t);await tree.list();const revision=tree.revision;
 let enter,release,signal;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve),original=service.compareFilePairs.bind(service);
 service.compareFilePairs=async(...args)=>{signal=args[2].signal;enter();await gate;return original(...args);};
 const comparison=tree.compare();await entered;let mutated=false;
 const operation=tree.withOperation(revision,async()=>{mutated=true;assert.equal(signal.aborted,false);return 'verified';},{drainReads:true});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(mutated,false);assert.equal(signal.aborted,false);await assert.rejects(tree.list(),/current folder operation/);
 release();await comparison;assert.equal(await operation,'verified');assert.equal(mutated,true);assert.equal(signal.aborted,false);
});
test('draining operation keeps root validation and cannot mutate a replaced root',async t=>{
 const {tree,service,roots}=await fixture(t);await tree.list();const revision=tree.revision;
 let enter,release;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve),original=service.compareFilePairs.bind(service);
 service.compareFilePairs=async(...args)=>{enter();await gate;return original(...args);};
 const comparison=tree.compare().catch(error=>error);await entered;let mutated=false;const operation=tree.withOperation(revision,()=>{mutated=true;},{drainReads:true});
 await fs.rename(roots.a,roots.a+'-old');await fs.mkdir(roots.a);release();await comparison;await assert.rejects(operation);assert.equal(mutated,false);
});
test('Stop interrupts a draining operation without submitting its mutation',async t=>{
 const {tree,service}=await fixture(t);await tree.list();const revision=tree.revision;
 let enter,release;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve),original=service.compareFilePairs.bind(service);
 service.compareFilePairs=async(...args)=>{enter();await gate;return original(...args);};
 const comparison=tree.compare().catch(error=>error);await entered;const controller=new AbortController();let mutated=false;
 const operation=tree.withOperation(revision,()=>{mutated=true;},{drainReads:true,signal:controller.signal});controller.abort();await assert.rejects(operation,{code:'ABORT_ERR'});assert.equal(mutated,false);release();await comparison;
});
