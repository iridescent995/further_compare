'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {TYPES,MAX_TEXT_BYTES} = require('../desktop/sessions.cjs');
const {validateWorkspace,stageWorkspaceData,stageWorkspace,writeWorkspace,MAX_WORKSPACE_BYTES} = require('../desktop/workspaces.cjs');
const session = (type='text-compare') => ({version:1,type,name:type,text:{a:'unsaved buffer',b:'right'},files:{a:{name:'',path:''},b:{name:'',path:''}},folders:{a:null,b:null},options:{ignoreWhitespace:false,filter:'all',direction:'a-to-b'},...(type==='folder-merge3'?{threeWay:{roots:{base:null,left:null,right:null},choices:{}}}:{})});
const workspace = (sessions=[session()]) => ({version:1,kind:'workspace',sessions,activeIndex:sessions.length-1});
async function fixture(t) {const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-workspace-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}

test('workspace preserves every supported session type, order, active selection and embedded content',async t=>{
  const root=await fixture(t), value=workspace(TYPES.map(session));
  const staged=await stageWorkspaceData(value,path.join(root,'backups'));
  assert.deepEqual(staged.data,validateWorkspace(value));
  assert.deepEqual(staged.sessions.map(item=>item.data.type),TYPES);
  assert.equal(new Set(staged.sessions.map(item=>item.folders)).size,TYPES.length);
  assert.ok(staged.sessions.find(item=>item.data.type==='folder-merge3').threeWay);
});
test('workspace rejects invalid envelope, active index, sparse arrays and session payloads',()=>{
  for(const value of [null,[],{}, {...workspace(),version:2},{...workspace(),kind:'session'},{...workspace(),sessions:[]},{...workspace(),sessions:Array.from({length:21},()=>session())},{...workspace(),sessions:Array(1)},{...workspace(),activeIndex:-1},{...workspace(),activeIndex:1},{...workspace(),activeIndex:0.5},{...workspace(),sessions:[{...session(),type:'unknown'}]}]) assert.throws(()=>validateWorkspace(value));
});
test('workspace strips runtime authority at envelope and session boundaries',()=>{
  const value=workspace();Object.assign(value,{activeId:'forged',pendingPreview:{id:'x'}});
  Object.assign(value.sessions[0],{id:'forged',savedPath:'/tmp/overwrite',folderRows:[{}],dataAuthorities:{token:'forged'},revisions:{a:'forged'}});
  value.sessions[0].options.folderIgnoredMarks=[{pathA:'x'}];
  assert.deepEqual(validateWorkspace(value),workspace());
});
test('workspace enforces both individual session and aggregate byte limits',()=>{
  const large=session();large.text.a='a'.repeat(MAX_TEXT_BYTES+1);
  assert.throws(()=>validateWorkspace(workspace([large])),/10 MB/);
  const entry=session();entry.text.a='a'.repeat(MAX_TEXT_BYTES);entry.text.b='b'.repeat(MAX_TEXT_BYTES);
  assert.throws(()=>validateWorkspace(workspace(Array(6).fill(entry))),/100 MB/);
});
test('workspace staging canonicalizes paths without overwriting unsaved embedded text',async t=>{
  const root=await fixture(t), left=path.join(root,'left'), right=path.join(root,'right');await fs.mkdir(left);await fs.mkdir(right);
  const input=path.join(left,'input.txt');await fs.writeFile(input,'disk content');
  const value=workspace([session(),session('folder-compare')]);value.sessions[0].files.a={name:'input.txt',path:input};value.sessions[1].folders={a:{name:'left',path:left},b:{name:'right',path:right}};
  const staged=await stageWorkspaceData(value,path.join(root,'backups'));
  assert.equal(staged.sessions[0].textPaths.a,await fs.realpath(input));
  assert.equal(staged.sessions[0].data.text.a,'unsaved buffer');
  assert.equal(staged.sessions[1].folders.roots.b,await fs.realpath(right));
  assert.deepEqual(value.sessions[0].files.a,{name:'input.txt',path:input});
});
test('bad later entry rejects the whole stage and leaves input and filesystem untouched',async t=>{
  const root=await fixture(t), value=workspace([session(),session('folder-compare')]);
  value.sessions[1].folders.a={name:'missing',path:path.join(root,'missing')};const before=JSON.stringify(value);
  await assert.rejects(stageWorkspaceData(value,path.join(root,'backups')),/ENOENT/);
  assert.equal(JSON.stringify(value),before);assert.deepEqual(await fs.readdir(root),[]);
});
test('workspace file round trip is atomic, bounded and excludes runtime metadata',async t=>{
  const root=await fixture(t), file=path.join(root,'review.fworkspace'), value=workspace([session(),session('table-compare')]);
  value.sessions[1].advanced={inputs:{a:{name:'a.csv',data:Buffer.from('a,b').toString('base64')},b:null,base:null},options:{delimiter:','}};
  await writeWorkspace(file,value);assert.deepEqual((await stageWorkspace(file,path.join(root,'backups'))).data,value);
  if(process.platform!=='win32')assert.equal((await fs.stat(file)).mode&0o777,0o600);
  const before=await fs.readFile(file,'utf8');await assert.rejects(writeWorkspace(file,{...value,activeIndex:99}));assert.equal(await fs.readFile(file,'utf8'),before);
  assert.deepEqual(await fs.readdir(root),['review.fworkspace']);
  await fs.writeFile(file,'not JSON');await assert.rejects(stageWorkspace(file,root),SyntaxError);
  const handle=await fs.open(file,'w');await handle.truncate(MAX_WORKSPACE_BYTES+1);await handle.close();await assert.rejects(stageWorkspace(file,root),/too large/);
});
test('failed atomic destination replacement removes its temporary file',async t=>{
  const root=await fixture(t), file=path.join(root,'directory');await fs.mkdir(file);
  await assert.rejects(writeWorkspace(file,workspace()));assert.deepEqual(await fs.readdir(root),['directory']);
});
