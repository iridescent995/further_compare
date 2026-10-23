'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {blankLineComparisonKey,validateIgnoreBlankLines}=require('../src/text-blank-lines.cjs');
const {compare,merge}=require('../src/diff.cjs');
const {FolderService}=require('../desktop/folders.cjs');
const {FolderTree}=require('../desktop/folder-tree.cjs');
const {validateFolderRules}=require('../desktop/folder-rules.cjs');
const {classifySnapshotEntries}=require('../desktop/folder-snapshot-comparison.cjs');
const {previewFilteredCopyToFolder}=require('../desktop/folder-filtered-copy-destination.cjs');
const diff=(a,b,anchors=[])=>compare(a,b,false,anchors,false,'horizontal',true);
test('blank line key is collision-free and preserves terminal newline on content',()=>{
 for(const text of ['', '\n', ' \t\n\t'])assert.equal(blankLineComparisonKey(text),'[[],false]');
 assert.equal(blankLineComparisonKey('a\n\n'),'[["a"],true]');assert.equal(blankLineComparisonKey('a\n'),'[["a"],true]');assert.equal(blankLineComparisonKey('a'),'[["a"],false]');
 assert.notEqual(blankLineComparisonKey('\u00a0',()=>''),blankLineComparisonKey(''));
 assert.equal(validateIgnoreBlankLines(),false);for(const v of [null,1,'true'])assert.throws(()=>validateIgnoreBlankLines(v));
});
test('ignored rows preserve every original index and hunk ranges omit blank gaps',()=>{
 const a='\nstart\nleft\n\nleft2\n \nend\n',b='start\n\nright\n\tright2\nend\n\n',r=diff(a,b);
 for(const [side,text]of [['a',a],['b',b]])assert.deepEqual(r.rows.filter(row=>row[side+'i']!==null).map(row=>row[side+'i']),text.split('\n').map((_,i)=>i));
 for(const h of r.hunks)for(const [side,text]of [['a',a],['b',b]])assert.ok(text.split('\n').slice(h[side+'Start'],h[side+'Start']+h[side+'Count']).every(line=>!/^[ \t]*$/.test(line)));
 assert.ok(r.rows.some(row=>row.minor&&row.ai===null));assert.ok(r.rows.some(row=>row.minor&&row.bi===null));
 const same=diff('a\n\nb','a\n\nb');assert.equal(same.ignoredLineCount,0);
});
test('substantive merges retain target blanks and exclude source gaps in both directions',()=>{
 const a='start\nleft\n\nend',b='start\n\nright\nend',r=diff(a,b);
 assert.equal(merge(a,b,r.hunks[0],'a'),'start\n\nleft\nend');assert.equal(merge(a,b,r.hunks[0],'b'),'start\nright\n\nend');
 assert.equal(diff('x\n\n','x\n').hunks.length,0);assert.equal(diff('x\n','x').hunks.length,1);assert.equal(diff('\n\t','').hunks.length,0);
});
test('manual anchors retain substantive authority and prevent hunk coalescing across boundaries',()=>{
 const r=diff('left\n\nend','right\nanchored\nend',[{a:1,b:1}]);assert.equal(r.hunks.length,2);assert.equal(r.rows.find(row=>row.anchor).type,'changed');
 const equal=diff('a\n\nb','a\n\nb',[{a:1,b:1}]);assert.equal(equal.hunks.length,0);assert.equal(equal.ignoredLineCount,0);
});
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-blank-lines-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const service=new FolderService(path.join(root,'backups'));for(const side of ['a','b']){const dir=path.join(root,side);await fs.mkdir(path.join(dir,'closed'),{recursive:true});await fs.writeFile(path.join(dir,'closed/x.txt'),side==='a'?'a\r\n \t\r\nb\r\n':'a\nb\n');await service.select(side,dir);}return {root,service};}
test('folder blank flag isolates cache/provenance and all text modes agree',async t=>{
 const {service}=await fixture(t),pairs=[{a:'closed/x.txt',b:'closed/x.txt'}];assert.equal(validateFolderRules({ignoreBlankLines:false}).ignoreBlankLines,undefined);assert.throws(()=>validateFolderRules({ignoreBlankLines:1}));
 for(const mode of ['text-content','text-whitespace','text-case','text-whitespace-case']){
 const rules={mode,ignoreBlankLines:true};assert.equal((await service.compareFilePairs(pairs,rules)).rows[0].status,'equal');assert.equal((await service.compareFilePairs(pairs,{mode})).rows[0].status,'changed');
 const a=(await service.snapshot('a',null,rules)).entries.get('closed/x.txt'),b=(await service.snapshot('b',null,rules)).entries.get('closed/x.txt');assert.equal(classifySnapshotEntries(a,b,rules).status,'equal');assert.throws(()=>classifySnapshotEntries(a,b,{mode}),/blank-line rules changed/);
 }
 assert.equal((await service.compareFilePairs(pairs,{mode:'content',ignoreBlankLines:true})).rows[0].status,'changed');
});
test('filtered unopened copy uses blank rule eligibility while preserving original bytes',async t=>{
 const {root,service}=await fixture(t),tree=new FolderTree(service);await tree.list('root');const out=path.join(root,'out');await fs.mkdir(out);
 const result=await previewFilteredCopyToFolder(service,tree,'a',['closed'],{status:'same',rules:{mode:'text-content',ignoreBlankLines:true}},async()=>out);await result.service.execute(result.preview.id);assert.equal(await fs.readFile(path.join(out,'closed/x.txt'),'utf8'),'a\r\n \t\r\nb\r\n');
});
test('normalized empty nonblank content never aliases the terminal-newline sentinel',()=>{
 const a='\u00a0\n\u00a0',b='\u00a0\n',normalize=line=>line.replace(/\s/g,'');
 assert.notEqual(blankLineComparisonKey(a,normalize),blankLineComparisonKey(b,normalize));
 const result=compare(a,b,true,[],false,'all',true);assert.ok(result.hunks.length);
 for(const from of ['a','b']){let left=a,right=b;for(const h of [...result.hunks].reverse()){if(from==='a')right=merge(left,right,h,from);else left=merge(left,right,h,from);}assert.equal(compare(left,right,true,[],false,'all',true).hunks.length,0);}
});
