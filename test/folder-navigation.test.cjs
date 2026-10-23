'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs');
const {FolderNavigation}=require('../desktop/folder-navigation.cjs');
test('folder navigation validates destinations, preserves failed history, branches, swaps and persists recent paths',async()=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-nav-')));
  try {
    for(const dir of ['left/child','right','third']) await fs.mkdir(path.join(root,dir),{recursive:true});
    const service=new FolderService(path.join(root,'backups'));
    const file=path.join(root,'history.json'), nav=new FolderNavigation(file);
    const left=path.join(root,'left'),child=path.join(left,'child'),right=path.join(root,'right'),third=path.join(root,'third');
    await nav.navigate(service,'a','path',child); await nav.navigate(service,'b','path',right);
    await nav.navigate(service,'a','parent');
    assert.equal(service.roots.a,left); assert.equal((await nav.snapshot(service)).a.canBack,true);
    const before=await nav.snapshot(service);
    await assert.rejects(nav.navigate(service,'a','path',path.join(root,'missing')));
    await assert.rejects(nav.navigate(service,'a','path','relative'));
    await assert.rejects(nav.navigate(service,'a','path',right),/separate/);
    assert.deepEqual(await nav.snapshot(service),before);
    await nav.navigate(service,'a','back'); assert.equal(service.roots.a,child);
    await nav.navigate(service,'a','forward'); assert.equal(service.roots.a,left);
    await nav.navigate(service,'a','back'); await nav.navigate(service,'a','path',third);
    assert.equal((await nav.snapshot(service)).a.canForward,false);
    nav.swap(service); [service.roots.a,service.roots.b]=[service.roots.b,service.roots.a];
    await nav.navigate(service,'b','back'); assert.equal(service.roots.b,child);
    const second=new FolderService(path.join(root,'backups'));
    assert.equal((await nav.snapshot(second)).a.canBack,false);
    assert.equal((await new FolderNavigation(file).snapshot(second)).a.history[0],child);
    await fs.rm(child,{recursive:true});
    await nav.navigate(service,'b','forward');
    await assert.rejects(nav.navigate(service,'b','back'));
    assert.equal(service.roots.b,third); assert.equal((await nav.snapshot(service)).b.canBack,true);
    nav.reset(service); assert.equal((await nav.snapshot(service)).b.canBack,false);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('folder navigation remaps history when a containing directory is renamed',async()=>{
  const service={roots:{a:'/old/child'},hashCache:new Map(),select:async function(side,value){this.roots[side]=value;return {path:value};}};
  const nav=new FolderNavigation(); await nav.navigate(service,'a','path','/other');
  nav.remap(service,value=>value.replace('/old','/new'));
  await nav.navigate(service,'a','back'); assert.equal(service.roots.a,'/new/child');
});
test('paired parent navigation commits both roots and preserves each side history',async()=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-nav-pair-')));
  try {
    for(const dir of ['left/child/deep','right/child/deep']) await fs.mkdir(path.join(root,dir),{recursive:true});
    const service=new FolderService(path.join(root,'backups')),nav=new FolderNavigation();
    const left=path.join(root,'left/child'),right=path.join(root,'right/child');
    await nav.navigate(service,'a','path',left); await nav.navigate(service,'b','path',right);
    await nav.navigate(service,'a','path',path.join(left,'deep'));
    await nav.navigate(service,'a','back');
    service.plans.set('pending',{}); service.hashCache.set('cached',{});
    const result=await nav.navigateParents(service);
    assert.equal(result.a.path,path.join(root,'left')); assert.equal(result.b.path,path.join(root,'right'));
    assert.equal(service.plans.size,0); assert.equal(service.hashCache.size,0);
    const state=await nav.snapshot(service);
    assert.equal(state.a.canForward,false); assert.equal(state.a.canBack,true); assert.equal(state.b.canBack,true);
    await nav.navigate(service,'a','back'); await nav.navigate(service,'b','back');
    assert.deepEqual(service.roots,{a:left,b:right});
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('paired parent rejection leaves roots, histories and pending plans unchanged',async()=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-nav-reject-')));
  try {
    for(const dir of ['common/left','common/right','other/child']) await fs.mkdir(path.join(root,dir),{recursive:true});
    const service=new FolderService(path.join(root,'backups')),nav=new FolderNavigation();
    await nav.navigate(service,'a','path',path.join(root,'common/left'));
    await nav.navigate(service,'b','path',path.join(root,'common/right'));
    service.plans.set('pending',{id:1}); service.hashCache.set('cached',1);
    const before=await nav.snapshot(service),roots={...service.roots};
    await assert.rejects(nav.navigateParents(service),/separate/);
    assert.deepEqual(await nav.snapshot(service),before); assert.deepEqual(service.roots,roots);
    assert.equal(service.plans.size,1); assert.equal(service.hashCache.size,1);
    await nav.navigate(service,'b','path',path.join(root,'other/child'));
    const beforeMissing=await nav.snapshot(service),rootsMissing={...service.roots};
    await fs.rm(path.join(root,'other'),{recursive:true});
    service.plans.set('pending',{id:2});
    await assert.rejects(nav.navigateParents(service));
    assert.deepEqual(await nav.snapshot(service),beforeMissing); assert.deepEqual(service.roots,rootsMissing);
    assert.equal(service.plans.size,1);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('paired parent navigation supports an absent side and rejects an empty pair',async()=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-nav-one-')));
  try {
    await fs.mkdir(path.join(root,'left/child'),{recursive:true});
    const service=new FolderService(path.join(root,'backups')),nav=new FolderNavigation();
    await assert.rejects(nav.navigateParents(service),/no parent/);
    await nav.navigate(service,'a','path',path.join(root,'left/child'));
    const result=await nav.navigateParents(service);
    assert.equal(result.a.path,path.join(root,'left')); assert.equal(result.b,null);
    assert.equal(service.roots.b,undefined);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('paired parent navigation rejects nested final roots before committing',async()=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-nav-nested-')));
  const backups=await fs.mkdtemp(path.join(os.tmpdir(),'fc-nav-backups-'));
  try {
    for(const dir of ['left','right/child']) await fs.mkdir(path.join(root,dir),{recursive:true});
    // Keep backups outside the proposed parent so this tests pair overlap.
    const service=new FolderService(backups),nav=new FolderNavigation();
    await nav.navigate(service,'a','path',path.join(root,'left'));
    await nav.navigate(service,'b','path',path.join(root,'right/child'));
    const before=await nav.snapshot(service),roots={...service.roots};
    await assert.rejects(nav.navigateParents(service),/separate/);
    assert.deepEqual(service.roots,roots); assert.deepEqual(await nav.snapshot(service),before);
  } finally {await fs.rm(root,{recursive:true,force:true}); await fs.rm(backups,{recursive:true,force:true});}
});
test('a filesystem-root side stays in place while the other side moves',async()=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-nav-root-')));
  try {
    const diskRoot=path.parse(root).root;
    // A non-overlapping pair on separate volumes can include a filesystem root.
    // Use a service double because this fixture has only one mounted volume.
    const service={roots:{a:diskRoot,b:root},plans:new Map(),hashCache:new Map(),select:async function(side,value){this.roots[side]=value; return {name:path.basename(value),path:value};}};
    const nav=new FolderNavigation();
    await nav.snapshot(service);
    const result=await nav.navigateParents(service);
    assert.equal(result.a.path,diskRoot); assert.equal(result.b.path,path.dirname(root));
    const snapshot=await nav.snapshot(service);
    assert.equal(snapshot.a.canBack,false); assert.equal(snapshot.b.canBack,true);
    service.roots={a:diskRoot,b:diskRoot};
    await assert.rejects(nav.navigateParents(service),/no parent/);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
