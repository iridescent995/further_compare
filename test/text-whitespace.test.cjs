'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {normalizeWhitespace,validateWhitespaceScope,WHITESPACE_SCOPES}=require('../src/text-whitespace.cjs');
const {compare}=require('../src/diff.cjs');
const {FolderService}=require('../desktop/folders.cjs');
const {FolderTree}=require('../desktop/folder-tree.cjs');
const {validateFolderRules}=require('../desktop/folder-rules.cjs');
const {classifySnapshotEntries}=require('../desktop/folder-snapshot-comparison.cjs');
const {previewFilteredCopyToFolder}=require('../desktop/folder-filtered-copy-destination.cjs');
test('whitespace locations are precise on every physical line and keep orphan lines',()=>{
 const input=' \ta \t b \t\r\n\t c d \r \t\n';
 assert.equal(normalizeWhitespace(input,'leading'),'a \t b \t\r\nc d \r\n');
 assert.equal(normalizeWhitespace(input,'trailing'),' \ta \t b\r\n\t c d\r\n');
 assert.equal(normalizeWhitespace(input,'edges'),'a \t b\r\nc d\r\n');
 assert.equal(normalizeWhitespace(input,'embedded'),' \tab \t\r\n\t cd \r \t\n');
 assert.equal(normalizeWhitespace(input,'leading-embedded'),'ab \t\r\ncd \r\n');
 assert.equal(normalizeWhitespace(input,'trailing-embedded'),' \tab\r\n\t cd\r\n');
 assert.equal(normalizeWhitespace(input,'horizontal'),'ab\r\ncd\r\n');
 assert.equal(normalizeWhitespace('a\u00a0b\nc','all'),'abc');assert.equal(normalizeWhitespace('a\u00a0b','horizontal'),'a\u00a0b');
});
test('shared scope validation and minor-difference rendering preserve original lines',()=>{
 for(const invalid of [null,'unknown',false,1])assert.throws(()=>validateWhitespaceScope(invalid));
 assert.equal(validateWhitespaceScope(undefined,'horizontal'),'horizontal');
 for(const scope of WHITESPACE_SCOPES)assert.equal(validateWhitespaceScope(scope),scope);
 const result=compare('  Alpha Beta\n','Alpha Beta\n',true,[],false,'leading');assert.equal(result.hunks.length,0);assert.equal(result.rows[0].a,'  Alpha Beta');assert.equal(result.rows[0].minor,true);
 assert.ok(compare('  Alpha Beta','Alpha Beta',true,[],false,'embedded').hunks.length);
 assert.ok(compare('a\n\nb','a\nb',true,[],false,'edges').hunks.length);
 assert.equal(compare('  ALPHA Beta','alpha beta',true,[],true,'leading').hunks.length,0);
});
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-whitespace-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const service=new FolderService(path.join(root,'backups'));for(const side of ['a','b']){const dir=path.join(root,side);await fs.mkdir(path.join(dir,'closed'),{recursive:true});await fs.writeFile(path.join(dir,'closed','x.txt'),side==='a'?'  a b\r\n  c d\r\n':'a b\nc d\n');await service.select(side,dir);}return {root,service};}
test('folder scopes validate, separate cache identities and require matching snapshot provenance',async t=>{
 const {service}=await fixture(t),pairs=[{a:'closed/x.txt',b:'closed/x.txt'}];assert.equal(validateFolderRules({textWhitespaceScope:'horizontal'}).textWhitespaceScope,undefined);assert.throws(()=>validateFolderRules({textWhitespaceScope:null}));
 const leading={mode:'text-whitespace',textWhitespaceScope:'leading'},embedded={...leading,textWhitespaceScope:'embedded'};
 assert.equal((await service.compareFilePairs(pairs,leading)).rows[0].status,'equal');assert.equal((await service.compareFilePairs(pairs,embedded)).rows[0].status,'changed');assert.equal((await service.compareFilePairs(pairs,leading)).rows[0].status,'equal');
 const a=(await service.snapshot('a',null,leading)).entries.get('closed/x.txt'),b=(await service.snapshot('b',null,leading)).entries.get('closed/x.txt');assert.equal(a.normalizationWhitespaceScope,'leading');assert.notEqual(a.hash,b.hash);assert.equal(classifySnapshotEntries(a,b,leading).status,'equal');assert.throws(()=>classifySnapshotEntries(a,b,embedded),/whitespace rules changed/);
});
test('filtered unopened subtree applies scoped rules but copies original bytes',async t=>{
 const {root,service}=await fixture(t),tree=new FolderTree(service);await tree.list('root');const out=path.join(root,'out');await fs.mkdir(out);
 const result=await previewFilteredCopyToFolder(service,tree,'a',['closed'],{status:'same',rules:{mode:'text-whitespace',textWhitespaceScope:'leading'}},async()=>out);
 assert.ok(result.preview.operations.some(op=>op.sourcePath==='closed/x.txt'||op.path==='closed/x.txt'));await result.service.execute(result.preview.id);
 assert.equal(await fs.readFile(path.join(out,'closed/x.txt'),'utf8'),'  a b\r\n  c d\r\n');
});
test('folder all whitespace mode keeps physical blank lines significant',async t=>{
 const {root,service}=await fixture(t);await fs.writeFile(path.join(root,'a','closed/x.txt'),'a\n\nb');await fs.writeFile(path.join(root,'b','closed/x.txt'),'a\nb');
 const result=await service.compareFilePairs([{a:'closed/x.txt',b:'closed/x.txt'}],{mode:'text-whitespace',textWhitespaceScope:'all'});assert.equal(result.rows[0].status,'changed');
});

test('every folder whitespace scope preserves physical line boundaries',async t=>{
 const {root,service}=await fixture(t);await fs.writeFile(path.join(root,'a','closed/x.txt'),'a\nb');await fs.writeFile(path.join(root,'b','closed/x.txt'),'ab');
 for(const textWhitespaceScope of WHITESPACE_SCOPES){const result=await service.compareFilePairs([{a:'closed/x.txt',b:'closed/x.txt'}],{mode:'text-whitespace',textWhitespaceScope});assert.equal(result.rows[0].status,'changed',textWhitespaceScope);}
});
