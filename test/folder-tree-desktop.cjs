'use strict';
const {_electron:electron}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-tree-ipc-')));let app,page;
 try{
  const left=path.join(base,'left'),right=path.join(base,'right'),saved=path.join(base,'aligned.fcompare');await fs.mkdir(path.join(left,'old'),{recursive:true});await fs.mkdir(path.join(right,'new'),{recursive:true});
  await fs.writeFile(path.join(left,'old/source.txt'),'left bytes');await fs.writeFile(path.join(right,'new/target.txt'),'right bytes');await fs.writeFile(path.join(right,'keep.txt'),'untouched');
  const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});page=await app.firstWindow();
  await app.evaluate(({dialog},args)=>{globalThis.treeChoices=[args.left,args.right];globalThis.treeConfirm=0;dialog.showOpenDialog=async()=>{const file=globalThis.treeChoices.shift();return {canceled:!file,filePaths:file?[file]:[]};};dialog.showSaveDialog=async()=>({canceled:false,filePath:args.saved});dialog.showMessageBox=async()=>({response:globalThis.treeConfirm});},{left,right,saved});
  const call=(name,...args)=>page.evaluate(({name,args})=>window.desktop[name](...args),{name,args});
  const first=await call('createSession');await call('chooseFolder','a');await call('chooseFolder','b');
  let root=await call('listFolderTree');const l=root.rows.find(r=>r.pathA==='old'),r=root.rows.find(r=>r.pathB==='new');
  const lc=await call('listFolderTree',l.id,root.revision),rc=await call('listFolderTree',r.id,root.revision),lid=lc.rows[0].id,rid=rc.rows[0].id;
  const aligned=await call('alignFolderRows',lid,rid,root.revision);await assert.rejects(()=>call('listFolderTree',l.id,root.revision),/revision changed/);
  root=await call('listFolderTree');let node=await call('compareFolderTree',root.rows.find(r=>r.pathA==='old').id,root.revision,{mode:'content',timeToleranceMs:0});let file=node.rows.find(r=>r.pathA==='old/source.txt');assert.equal(file.pathB,'new/target.txt');assert.equal(file.status,'changed');assert.equal(root.pairs.length,1);
  await assert.rejects(()=>call('previewAlignedFolderAction','copy','a',['0'.repeat(64)],node.revision),/loaded folder row/);
  const merge=await call('previewAlignedFolders','merge','a-to-b',[file.id],node.revision);assert.deepEqual(merge.operations.map(op=>op.targetPath),['new/target.txt']);
  await assert.rejects(()=>call('previewFolderAction','copy','a',['old/source.txt']),/aligned row/);
  const plan=await call('previewAlignedFolderAction','copy','a',[file.id],node.revision);assert.equal(plan.operations.find(o=>o.action==='copy').targetPath,'new/target.txt');assert.equal((await call('executeFolders',plan.id)).cancelled,true);assert.equal(await fs.readFile(path.join(right,'new/target.txt'),'utf8'),'right bytes');
  await app.evaluate(()=>globalThis.treeConfirm=1);await call('executeFolders',plan.id);assert.equal(await fs.readFile(path.join(right,'new/target.txt'),'utf8'),'left bytes');assert.equal(await fs.readFile(path.join(right,'keep.txt'),'utf8'),'untouched');await assert.rejects(()=>call('compareFolderTree','root',node.revision),/revision changed/);
  const data={version:1,type:'folder-compare',name:'Aligned',text:{a:'',b:''},files:{a:{name:'',path:''},b:{name:'',path:''}},folders:{a:null,b:null},options:{ignoreWhitespace:false,filter:'all',direction:'a-to-b'}};
  await call('saveSession',data);assert.deepEqual(JSON.parse(await fs.readFile(saved,'utf8')).options.folderAlignment,aligned.pairs);
  const other=await call('createSession');await assert.rejects(()=>call('previewAlignedFolderAction','copy','a',[file.id],node.revision),/revision changed/);await call('activateSession',first.id);assert.equal((await call('listFolderTree')).pairs.length,1);
  await call('swapSides');root=await call('listFolderTree');assert.deepEqual(root.pairs,[{a:'new/target.txt',b:'old/source.txt',kind:'file'}]);await call('swapSides');
  await call('renameFolderEntry','a','old/source.txt','renamed.txt');root=await call('listFolderTree');assert.equal(root.pairs[0].a,'old/renamed.txt');
  await call('saveSession',data);const savedData=JSON.parse(await fs.readFile(saved,'utf8'));savedData.options.folderAlignment.push({a:'old/reserved.txt',b:'new/reserved.txt',kind:'file'});await fs.writeFile(saved,JSON.stringify(savedData));await call('activateSession',other.id);await app.evaluate((_,file)=>globalThis.treeChoices.push(file),saved);await call('openSession');root=await call('listFolderTree');assert.equal(root.pairs[0].a,'old/renamed.txt');
  await assert.rejects(()=>call('renameFolderEntry','a','old/renamed.txt','reserved.txt'),/unique/);assert.equal(await fs.readFile(path.join(left,'old/renamed.txt'),'utf8'),'left bytes');await assert.rejects(()=>fs.stat(path.join(left,'old/reserved.txt')),{code:'ENOENT'});
  node=await call('listFolderTree',root.rows.find(r=>r.pathA==='old').id,root.revision);file=node.rows.find(r=>r.pathA==='old/renamed.txt');const move=await call('previewAlignedFolderAction','move','a',[file.id],node.revision);await call('executeFolders',move.id);await assert.rejects(()=>fs.stat(path.join(left,'old/renamed.txt')),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(right,'new/target.txt'),'utf8'),'left bytes');
  root=await call('listFolderTree');await call('clearFolderAlignment',root.revision);assert.deepEqual((await call('listFolderTree')).pairs,[]);
  console.log('Folder tree bridge passed: native row IDs, pairing, independent paths, stale/cross-session rejection, copy confirmation, move, save/restore, swap and rename.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
