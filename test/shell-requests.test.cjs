'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {ShellRequests,parseShellArgs}=require('../desktop/shell-requests.cjs');
async function fixture(run){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-shell-')));try{await run(root);}finally{await fs.rm(root,{recursive:true,force:true});}}
test('shell parser accepts exact commands and absolute literal paths only',()=>{
  const file=path.resolve('a "quoted" & $x.txt'),other=path.resolve('second.txt');
  assert.deepEqual(parseShellArgs(['app','--fc-compare',file,other]),{command:'--fc-compare',files:[file,other]});
  assert.deepEqual(parseShellArgs(['app','--fc-clear-left']),{command:'--fc-clear-left',files:[]});
  assert.equal(parseShellArgs(['electron','app','--inspect=0']),null);
  for(const args of [['--fc-unknown'],['--fc-set-left'],['--fc-set-left','relative'],['--fc-compare',file],['--fc-clear-left',file],['--fc-set-left',file,'--fc-clear-left'],['--fc-set-left',file+'\0']]) assert.throws(()=>parseShellArgs(args));
});
test('shell selection persists, compares through cold instances, rejects missing inputs without changing selection',()=>fixture(async root=>{
  const left=path.join(root,'left & ü.txt'),right=path.join(root,'right.txt'),state=path.join(root,'state.json');
  await fs.writeFile(left,'left\r\n');await fs.writeFile(right,'right\n');
  const service=new ShellRequests(state);assert.deepEqual(await service.state(),{left:null,available:false});
  service.enqueue(['--fc-set-left',left]);const opened=await service.take();assert.equal(opened.action,'set-left');assert.equal(opened.mode,'text-compare');assert.equal(opened.a.content,'left\r\n');assert.equal(opened.b,null);
  const cold=new ShellRequests(state);cold.enqueue(['--fc-compare-left',right]);const compared=await cold.take();assert.equal(compared.a.path,left);assert.equal(compared.b.content,'right\n');
  assert.equal((await cold.state()).left.kind,'file');
  await fs.rm(left);assert.equal((await cold.state()).available,false);cold.enqueue(['--fc-compare-left',right]);await assert.rejects(cold.take(),/no longer available/);assert.equal(await cold.take(),null);
  cold.enqueue(['--fc-clear-left']);assert.deepEqual(await cold.take(),{action:'clear-left'});assert.equal((await cold.state()).left,null);
}));
test('shell requests preserve FIFO selection semantics and consume invalid commands once',()=>fixture(async root=>{
  const a=path.join(root,'a.txt'),b=path.join(root,'b.txt');await fs.writeFile(a,'A');await fs.writeFile(b,'B');const service=new ShellRequests(path.join(root,'state.json'));
  service.enqueue(['--fc-compare-left',b]);service.enqueue(['--fc-set-left',a]);service.enqueue(['--fc-compare-left',b]);
  await assert.rejects(service.take(),/Set a left file/);assert.equal((await service.take()).a.content,'A');assert.equal((await service.take()).b.content,'B');
  service.enqueue(['--fc-set-left','relative']);await assert.rejects(service.take(),/absolute/);assert.equal(await service.take(),null);
  service.enqueue(['--fc-set-left',path.join(root,'missing')]);await assert.rejects(service.take());assert.equal((await service.state()).left.path,a);
}));
test('shell dispatch detects text encoding and binary content, and chooses specialized pair types',()=>fixture(async root=>{
  const service=new ShellRequests(path.join(root,'state.json'));
  const left=path.join(root,'utf16.txt'),right=path.join(root,'binary.txt');await fs.writeFile(left,Buffer.concat([Buffer.from([255,254]),Buffer.from('Unicode Ω','utf16le')]));await fs.writeFile(right,Buffer.from([0,255,128]));
  service.enqueue(['--fc-set-left',left]);const text=await service.take();assert.equal(text.mode,'text-compare');assert.equal(text.a.format.encoding,'utf16le');assert.equal(text.a.content,'Unicode Ω');
  service.enqueue(['--fc-compare',left,right]);const binary=await service.take();assert.equal(binary.mode,'binary-compare');assert.equal(binary.a.content,undefined);assert.equal(binary.b.data,Buffer.from([0,255,128]).toString('base64'));
  for(const [ext,mode] of [['png','picture-compare'],['wav','audio-compare'],['aif','audio-compare'],['aiff','audio-compare'],['flac','audio-compare'],['mp3','audio-compare'],['MP3','audio-compare'],['xlsx','table-compare'],['zip','archive-compare'],['reg','registry-compare']]){const file=path.join(root,'input.'+ext);await fs.writeFile(file,'data');service.enqueue(['--fc-compare',file,file]);assert.equal((await service.take()).mode,mode);}
}));
test('corrupt selection reports recovery instructions and can be cleared',()=>fixture(async root=>{
  const state=path.join(root,'state.json'),service=new ShellRequests(state);await fs.writeFile(state,'{broken');await assert.rejects(service.state(),/Clear/);await service.clear();assert.equal((await service.state()).left,null);
}));

test('folder shell requests persist typed selections and return descriptors without reading children',()=>fixture(async root=>{
  const left=path.join(root,'left folder'),right=path.join(root,'right folder'),state=path.join(root,'state.json');
  await fs.mkdir(left);await fs.mkdir(right);await fs.writeFile(path.join(left,'secret.txt'),'must not be included');
  const service=new ShellRequests(state);
  service.enqueue(['--fc-set-left',left]);
  assert.deepEqual(await service.take(),{action:'set-left',mode:'folder-compare',name:'left folder',a:{name:'left folder',path:left},b:null});
  assert.deepEqual(JSON.parse(await fs.readFile(state,'utf8')),{version:2,path:left,kind:'folder'});
  const cold=new ShellRequests(state);assert.equal((await cold.state()).left.kind,'folder');
  cold.enqueue(['--fc-compare-left',right]);
  assert.deepEqual(await cold.take(),{action:'compare',mode:'folder-compare',name:'left folder',a:{name:'left folder',path:left},b:{name:'right folder',path:right}});
  cold.enqueue(['--fc-compare',right,left]);assert.equal((await cold.take()).a.path,right);
  assert.equal((await cold.state()).left.path,left);
}));
test('mixed shell selections are rejected without changing remembered selection',()=>fixture(async root=>{
  const file=path.join(root,'file.txt'),folder=path.join(root,'folder'),state=path.join(root,'state.json');
  await fs.writeFile(file,'content');await fs.mkdir(folder);const service=new ShellRequests(state);
  for(const [left,right] of [[file,folder],[folder,file]]){
    await service.setLeft(left);const before=await fs.readFile(state,'utf8');
    for(const argv of [['--fc-compare-left',right],['--fc-compare',left,right]]){
      service.enqueue(argv);await assert.rejects(service.take(),/two files or two folders/);assert.equal(await service.take(),null);assert.equal(await fs.readFile(state,'utf8'),before);
    }
  }
}));
test('legacy remembered files remain compatible and cannot silently turn into folders',()=>fixture(async root=>{
  const left=path.join(root,'left'),right=path.join(root,'right'),state=path.join(root,'state.json');
  await fs.writeFile(left,'old');await fs.writeFile(right,'right');await fs.writeFile(state,JSON.stringify({version:1,path:left}));
  const service=new ShellRequests(state);assert.equal((await service.state()).left.kind,'file');
  service.enqueue(['--fc-compare-left',right]);assert.equal((await service.take()).a.content,'old');
  await fs.rm(left);await fs.mkdir(left);assert.equal((await service.state()).available,false);
  service.enqueue(['--fc-compare-left',right]);await assert.rejects(service.take(),/no longer available/);
  assert.equal(JSON.parse(await fs.readFile(state,'utf8')).version,1);
}));
test('missing and replaced typed selections remain stale until explicitly selected again',()=>fixture(async root=>{
  const left=path.join(root,'left'),right=path.join(root,'right'),state=path.join(root,'state.json');await fs.mkdir(left);await fs.mkdir(right);
  const service=new ShellRequests(state);await service.setLeft(left);await fs.rm(left,{recursive:true});assert.equal((await service.state()).available,false);
  service.enqueue(['--fc-compare-left',right]);await assert.rejects(service.take(),/no longer available/);
  await fs.writeFile(left,'now a file');assert.equal((await service.state()).available,false);assert.equal((await service.state()).left.kind,'folder');
  service.enqueue(['--fc-compare-left',left]);await assert.rejects(service.take(),/no longer available/);
  await service.setLeft(left);assert.equal((await service.state()).left.kind,'file');assert.equal((await service.state()).available,true);
  await fs.rm(left);await fs.mkdir(left);assert.equal((await service.state()).available,false);
  await assert.rejects(service.setLeft(left,'file'),/changed type/);assert.equal((await service.state()).left.kind,'file');
}));
test('regularPath remains file-only and malformed typed state is rejected',()=>fixture(async root=>{
  const {regularPath}=require('../desktop/shell-requests.cjs');await assert.rejects(regularPath(root),/regular file/);
  const state=path.join(root,'state.json'),service=new ShellRequests(state);
  for(const saved of [{version:2,path:root},{version:2,path:root,kind:'device'},{version:3,path:root,kind:'folder'}]){
    await fs.writeFile(state,JSON.stringify(saved));await assert.rejects(service.state(),/Clear/);
  }
}));
test('selected-pair command requires exactly two paths and an explicit review',()=>fixture(async root=>{
  const left=path.join(root,'left.txt'),right=path.join(root,'right.txt');await fs.writeFile(left,'left');await fs.writeFile(right,'right');
  assert.deepEqual(parseShellArgs(['app','--fc-compare-selected',left,right]),{command:'--fc-compare-selected',files:[left,right]});
  for(const files of [[],[left],[left,right,left]]) assert.throws(()=>parseShellArgs(['--fc-compare-selected',...files]));
  const service=new ShellRequests(path.join(root,'state.json'));service.enqueue(['--fc-compare-selected',left,right]);await assert.rejects(service.take(),/Review/);assert.equal(await service.take(),null);
  service.enqueue(['--fc-compare-selected',left,right]);await assert.rejects(service.take({reviewSelection:()=>undefined}),/Invalid.*review/);
}));
test('selected file pair review compares, swaps and cancels without changing remembered selection',()=>fixture(async root=>{
  const left=path.join(root,'left.txt'),right=path.join(root,'right.txt'),state=path.join(root,'state.json');await fs.writeFile(left,'left');await fs.writeFile(right,'right');
  const service=new ShellRequests(state);await service.setLeft(left);const before=await fs.readFile(state,'utf8');
  for(const decision of ['compare','swap','cancel']){
    service.enqueue(['--fc-compare-selected',left,right]);
    const result=await service.take({reviewSelection:async review=>{
      assert.deepEqual(review,{left:{name:'left.txt',path:left},right:{name:'right.txt',path:right},kind:'file'});
      if(decision==='cancel'){await fs.rm(left);await fs.rm(right);} // Cancellation must not read either file.
      return decision;
    }});
    if(decision==='cancel') assert.deepEqual(result,{action:'cancelled'});
    else {assert.equal(result.mode,'text-compare');assert.equal(result.a.content,decision==='swap'?'right':'left');assert.equal(result.b.content,decision==='swap'?'left':'right');}
    assert.equal(await fs.readFile(state,'utf8'),before);
  }
}));
test('selected folder pair review swaps descriptors and rejects mixed types before review',()=>fixture(async root=>{
  const left=path.join(root,'left'),right=path.join(root,'right'),file=path.join(root,'file.txt');await fs.mkdir(left);await fs.mkdir(right);await fs.writeFile(file,'file');
  const service=new ShellRequests(path.join(root,'state.json'));let reviewed=0;
  const reviewSelection=review=>{reviewed++;assert.equal(review.kind,'folder');return 'swap';};
  service.enqueue(['--fc-compare-selected',left,right]);
  assert.deepEqual(await service.take({reviewSelection}),{action:'compare',mode:'folder-compare',name:'right',a:{name:'right',path:right},b:{name:'left',path:left}});
  service.enqueue(['--fc-compare-selected',left,file]);await assert.rejects(service.take({reviewSelection}),/two files or two folders/);assert.equal(reviewed,1);assert.deepEqual(await service.state(),{left:null,available:false});
}));
test('selected pairs reject missing, type-replaced and same-kind replaced items during review',()=>fixture(async root=>{
  for(const change of ['missing','kind','identity']){
    const base=path.join(root,change);await fs.mkdir(base);const left=path.join(base,'left'),right=path.join(base,'right');await fs.writeFile(left,'left');await fs.writeFile(right,'right');
    const service=new ShellRequests(path.join(base,'state.json'));await service.setLeft(left);const before=await fs.readFile(service.file,'utf8');service.enqueue(['--fc-compare-selected',left,right]);
    await assert.rejects(service.take({reviewSelection:async()=>{
      await fs.rename(right,right+'.original');
      if(change==='kind') await fs.mkdir(right);
      if(change==='identity') await fs.writeFile(right,'replacement');
      return 'compare';
    }}),change==='missing'?/ENOENT/:/changed during review/);
    assert.equal(await fs.readFile(service.file,'utf8'),before);assert.equal(await service.take(),null);
  }
}));

test('shell snapshots retain original revisions and reject edits or replacement before native adoption',async t=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-shell-snapshot-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const left=path.join(root,'left.txt'),right=path.join(root,'right.txt');
  await fs.writeFile(left,'original');await fs.writeFile(right,'peer');
  const service=new ShellRequests(path.join(root,'state.json'));
  service.enqueue(['--fc-compare',left,right]);const unchanged=await service.take();
  const adopted=await service.validateFiles(unchanged);
  assert.equal(adopted.a.path,left);assert.equal(typeof adopted.a.dev,'bigint');assert.equal(unchanged.a.content,'original');
  assert.doesNotThrow(()=>JSON.stringify(unchanged));assert.equal(unchanged.a.revision,undefined);
  await assert.rejects(service.validateFiles(unchanged),/unavailable/);
  for(const change of ['edit','replace','symlink']){
    await fs.rm(left,{force:true});await fs.writeFile(left,'original');
    service.enqueue(['--fc-compare',left,right]);const request=await service.take();
    if(change==='edit')await fs.writeFile(left,'external longer edit');
    else {await fs.unlink(left);if(change==='symlink')await fs.symlink(right,left);else await fs.writeFile(left,'replacement');}
    await assert.rejects(service.validateFiles(request),/changed/);
    assert.equal(request.a.content,'original');
  }
});

test('shell rejects a file edited after its stable read completes',async t=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-shell-read-race-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const left=path.join(root,'left.txt'),right=path.join(root,'right.txt');await fs.writeFile(left,'original');await fs.writeFile(right,'peer');
  const open=fs.open;let changed=false;
  fs.open=async function(file,...args){
    const handle=await open.call(this,file,...args);
    if(file===left){const close=handle.close.bind(handle);handle.close=async()=>{await close();if(!changed){changed=true;await fs.writeFile(left,'external change after read');}};}
    return handle;
  };
  try {const service=new ShellRequests(path.join(root,'state.json'));service.enqueue(['--fc-compare',left,right]);await assert.rejects(service.take(),/changed/);assert.equal(changed,true);}
  finally {fs.open=open;}
});
