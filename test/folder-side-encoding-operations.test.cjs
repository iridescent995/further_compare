'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs'),{FolderTree}=require('../desktop/folder-tree.cjs');
const {MappedFolderOperations}=require('../desktop/folder-mapped-operations.cjs');
const {previewFilteredMove}=require('../desktop/folder-filtered-move.cjs');
const {previewFilteredDelete}=require('../desktop/folder-filtered-delete.cjs');
const {previewFilteredCopyToFolder}=require('../desktop/folder-filtered-copy-destination.cjs');
const {encodeText}=require('../src/text-codec.cjs');
const rules={mode:'text-case',textEncodingA:'windows1251',textEncodingB:'utf8'};
const names={a:'left/original.txt',b:'right/renamed.txt'},dirs={a:'left',b:'right'};
const bytes={a:Buffer.from(encodeText('Привет\r\n',{encoding:'windows1251',bom:false,lineEnding:'mixed'})),b:Buffer.from('привет\n','utf8')};
async function fixture(t){
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-side-encoding-ops-')));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const roots={a:path.join(base,'a'),b:path.join(base,'b'),external:path.join(base,'out')};for(const root of Object.values(roots))await fs.mkdir(root);
 const write=async(s,p,data)=>{const file=path.join(roots[s],p);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,data);};
 const read=(s,p)=>fs.readFile(path.join(roots[s],p));
 for(const s of ['a','b']){await write(s,names[s],bytes[s]);await write(s,dirs[s]+'/keep.bin',s+' keep');await write('external',names[s],'external differs');}
 const service=new FolderService(path.join(base,'backup'));for(const s of ['a','b'])await service.select(s,roots[s]);const tree=new FolderTree(service);
 await tree.setAlignment([{a:dirs.a,b:dirs.b,kind:'directory'},{a:names.a,b:names.b,kind:'file'}]);
 return {service,tree,roots,write,read};
}
async function preview(f,kind,side,status){
 const scope={include:'*.txt',status,rules},paths=[dirs[side]];
 if(kind==='copy'){const op=new MappedFolderOperations(f.service,f.tree),plan=await op.previewCopy(side,paths,scope);return {plan,execute:()=>op.execute(plan.id)};}
 const result=kind==='delete'?await previewFilteredDelete(f.service,f.tree,side,paths,scope):kind==='copy-external'?await previewFilteredCopyToFolder(f.service,f.tree,side,paths,scope,async()=>f.roots.external):await previewFilteredMove(f.service,f.tree,side,paths,scope,kind==='move-external'?async()=>f.roots.external:null);
 return {plan:result.preview,execute:()=>result.service.execute(result.preview.id)};
}
for(const kind of ['copy','move','delete','copy-external','move-external'])for(const side of ['a','b']){
 test(`${kind} from ${side} uses original side encodings for filtered eligibility and preserves raw bytes`,async t=>{
  const f=await fixture(t),other=side==='a'?'b':'a';
  const hidden=await preview(f,kind,side,'diff');assert.equal(hidden.plan.operations.length,0);await hidden.execute();
  assert.deepEqual(await f.read(side,names[side]),bytes[side]);assert.deepEqual(await f.read(other,names[other]),bytes[other]);
  const p=await preview(f,kind,side,'same');assert.equal(p.plan.operations.filter(o=>['copy','move','delete'].includes(o.action)).length,1);await p.execute();
  if(kind==='move'||kind==='delete'||kind==='move-external')await assert.rejects(()=>f.read(side,names[side]),{code:'ENOENT'});else assert.deepEqual(await f.read(side,names[side]),bytes[side]);
  if(kind==='copy'||kind==='move')assert.deepEqual(await f.read(other,names[other]),bytes[side]);else assert.deepEqual(await f.read(other,names[other]),bytes[other]);
  if(kind.endsWith('external'))assert.deepEqual(await f.read('external',names[side]),bytes[side]);else assert.deepEqual(await f.read('external',names[side]),Buffer.from('external differs'));
  for(const s of ['a','b'])assert.deepEqual(await f.read(s,dirs[s]+'/keep.bin'),Buffer.from(s+' keep'));
  await assert.rejects(()=>f.read('external',dirs[side]+'/keep.bin'),{code:'ENOENT'});
 });
 test(`${kind} from ${side} rejects an excluded original counterpart change before writes`,async t=>{
  const f=await fixture(t),other=side==='a'?'b':'a',p=await preview(f,kind,side,'same');
  await f.write(other,dirs[other]+'/keep.bin','counterpart edited after preview');
  await assert.rejects(p.execute,/changed|counterpart/i);
  for(const s of ['a','b'])assert.deepEqual(await f.read(s,names[s]),bytes[s]);
  assert.deepEqual(await f.read('external',names[side]),Buffer.from('external differs'));
  assert.deepEqual(await f.read(side,dirs[side]+'/keep.bin'),Buffer.from(side+' keep'));
 });
}
