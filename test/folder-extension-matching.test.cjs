'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {buildPathNameMatching,validateFolderNameRules}=require('../desktop/folder-name-matching.cjs');
const {FolderAlignment}=require('../desktop/folder-alignment.cjs');
const {FolderService}=require('../desktop/folders.cjs');
const {FolderTree}=require('../desktop/folder-tree.cjs');
const {MappedFolderOperations}=require('../desktop/folder-mapped-operations.cjs');
const {UpdateBothOperations}=require('../desktop/folder-update-both.cjs');
const {previewFilteredDelete}=require('../desktop/folder-filtered-delete.cjs');
const ns=items=>({entries:new Map(items.map(item=>Array.isArray(item)?[item[0],{kind:item[1]}]:[item,{kind:'file'}]))});
const model=(a,b,rules={ignoreExtension:true},manual=[])=>buildPathNameMatching({a:ns(a),b:ns(b)},new FolderAlignment(manual),rules);
test('extension matching is strict, opt-in, canonical and immutable',()=>{
 assert.deepEqual(validateFolderNameRules({ignoreExtension:false}),{});
 assert.deepEqual(validateFolderNameRules({ignoreExtension:true}),{ignoreExtension:true});
 for(const value of [1,'true',null,undefined])assert.throws(()=>validateFolderNameRules({ignoreExtension:value}));
 const m=model(['thing.txt'],['thing.log']);assert.equal(m.counterpart('a','thing.txt'),'thing.log');
 assert.equal(model(['thing.txt'],['thing.log'],{}).counterpart('a','thing.txt'),'thing.txt');
 assert.throws(()=>{m.nameRules.ignoreExtension=false;},TypeError);
 assert.equal(m.swap().counterpart('a','thing.log'),'thing.txt');
});
test('exact and folded full names win before file stems',()=>{
 const m=model(['thing.txt','thing.md','Other.TXT','Other.csv'],['thing.txt','thing.log','other.txt','other.json'],{ignoreCase:true,ignoreExtension:true});
 assert.equal(m.counterpart('a','thing.txt'),'thing.txt');assert.equal(m.counterpart('a','thing.md'),'thing.log');
 assert.equal(m.counterpart('a','Other.TXT'),'other.txt');assert.equal(m.counterpart('a','Other.csv'),'other.json');
 assert.equal(model(['Thing.txt'],['thing.log']).counterpart('a','Thing.txt'),'Thing.txt');
});
test('stems remove only the final extension and preserve leading-dot names',()=>{
 const m=model(['archive.tar.gz','.env','plain','tail.','a.txt'],['archive.tar.xz','.other','plain.json','tail.log','a.tar.gz']);
 assert.equal(m.counterpart('a','archive.tar.gz'),'archive.tar.xz');assert.equal(m.counterpart('a','.env'),'.env');
 assert.equal(m.counterpart('a','plain'),'plain.json');assert.equal(m.counterpart('a','tail.'),'tail.log');assert.equal(m.counterpart('a','a.txt'),'a.txt');
 assert.equal(model(['.env.local'],['.env.remote']).counterpart('a','.env.local'),'.env.remote');
 const unicode=model(['CAF\u00c9.txt'],['cafe\u0301.log'],{normalizeUnicode:true,ignoreCase:true,ignoreExtension:true});assert.equal(unicode.counterpart('a','CAF\u00c9.txt'),'cafe\u0301.log');
});
test('ambiguous stems and extension-only directories or type conflicts stay separate',()=>{
 for(const [a,b]of [[['f.txt','f.csv'],['f.json']],[['f.txt'],['f.csv','f.json']]])assert.equal(model(a,b).pairs.length,0);
 assert.equal(model([['dir.txt','directory']],[['dir.log','directory']]).pairs.length,0);
 assert.equal(model(['f.txt'],[['f.log','directory']]).pairs.length,0);
 const m=model(['f.txt','f.csv'],['f.json','chosen'],{ignoreExtension:true},[{a:'f.txt',b:'chosen',kind:'file'}]);
 assert.equal(m.counterpart('a','f.txt'),'chosen');assert.equal(m.counterpart('a','f.csv'),'f.json');
});
async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'fc-extension-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const roots={a:path.join(base,'a'),b:path.join(base,'b')};for(const root of Object.values(roots))await fs.mkdir(root);
 const write=async(side,name,content)=>{const full=path.join(roots[side],name);await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,content);};
 await write('a','Folder/Child/report.txt','left');await write('b','Folder/Child/report.log','right');
 const service=new FolderService(path.join(base,'backup'));for(const side of ['a','b'])await service.select(side,roots[side]);
 const matching=model([['Folder','directory']],[['Folder','directory']]);
 class Tree extends FolderTree{get alignment(){return matching;}}
 const tree=new Tree(service);await tree.list('root');return {base,roots,write,service,tree};
}
for(const side of ['a','b'])test('extension copy rebuilds unopened descendants and preserves actual backup name '+side,async t=>{
 const {roots,service,tree}=await fixture(t),ops=new MappedFolderOperations(service,tree),other=side==='a'?'b':'a',target=side==='a'?'Folder/Child/report.log':'Folder/Child/report.txt';
 const plan=await ops.previewCopy(side,['Folder']);assert.deepEqual(plan.operations.filter(o=>o.action==='copy').map(o=>o.targetPath),[target]);
 const result=await ops.execute(plan.id);assert.equal(await fs.readFile(path.join(roots[other],target),'utf8'),side==='a'?'left':'right');
 assert.equal(await fs.readFile(path.join(result.backupPath,'files',target),'utf8'),side==='a'?'right':'left');
 assert.deepEqual(await fs.readdir(path.join(roots[other],'Folder/Child')),[path.basename(target)]);
});
test('new competing stem invalidates a preview before writes',async t=>{
 const {roots,write,service,tree}=await fixture(t),ops=new MappedFolderOperations(service,tree),plan=await ops.previewCopy('a',['Folder']);
 await write('b','Folder/Child/report.csv','competitor');await assert.rejects(()=>ops.execute(plan.id),/changed after preview|namespace changed/);
 assert.equal(await fs.readFile(path.join(roots.b,'Folder/Child/report.log'),'utf8'),'right');
});
for(const side of ['a','b'])test('extension mirror reuses existing targets without orphan deletion '+side,async t=>{
 const {service,tree,roots}=await fixture(t),ops=new MappedFolderOperations(service,tree),plan=await ops.preview('sync',side==='a'?'a-to-b':'b-to-a');
 assert.equal(plan.operations.filter(o=>o.action==='copy').length,1);assert.equal(plan.operations.filter(o=>o.action.startsWith('delete')).length,0);
 await ops.execute(plan.id);assert.equal(await fs.readFile(path.join(roots[side==='a'?'b':'a'],side==='a'?'Folder/Child/report.log':'Folder/Child/report.txt'),'utf8'),side==='a'?'left':'right');
});
test('extension update both follows actual newer counterpart',async t=>{
 const {service,tree,roots}=await fixture(t);await fs.utimes(path.join(roots.a,'Folder/Child/report.txt'),2000000000,2000000000);await fs.utimes(path.join(roots.b,'Folder/Child/report.log'),1000000000,1000000000);
 const ops=new UpdateBothOperations(service,tree),plan=await ops.preview();assert.ok(plan.operations.some(o=>o.targetPath==='Folder/Child/report.log'));
 await ops.execute(plan.id);assert.equal(await fs.readFile(path.join(roots.b,'Folder/Child/report.log'),'utf8'),'left');
});
test('extension filtered deletion compares unopened paired content',async t=>{
 const {write,service,tree,roots}=await fixture(t);await write('b','Folder/Child/report.log','left');
 const result=await previewFilteredDelete(service,tree,'a',['Folder'],{status:'same'});assert.ok(result.preview.operations.some(o=>o.path==='Folder/Child/report.txt'));
 await result.service.execute(result.preview.id);await assert.rejects(()=>fs.stat(path.join(roots.a,'Folder/Child/report.txt')),{code:'ENOENT'});
});
