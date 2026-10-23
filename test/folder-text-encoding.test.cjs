'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {FolderService}=require('../desktop/folders.cjs'),{FolderTree}=require('../desktop/folder-tree.cjs');
const {validateFolderRules}=require('../desktop/folder-rules.cjs'),{classifySnapshotEntries}=require('../desktop/folder-snapshot-comparison.cjs');
const {validateOperationScope,selectOperationEntries}=require('../desktop/folder-operation-scope.cjs');
const {ENCODINGS,encodeText}=require('../src/text-codec.cjs');
const encode=(text,encoding)=>encodeText(text,{encoding,bom:false,lineEnding:'mixed'});
async function fixture(t){const base=await fs.mkdtemp(path.join(os.tmpdir(),'fc-folder-encoding-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));const roots={a:path.join(base,'a'),b:path.join(base,'b')};for(const root of Object.values(roots))await fs.mkdir(root);const service=new FolderService(path.join(base,'backups'));for(const side of ['a','b'])await service.select(side,roots[side]);const write=async(left,right)=>{await fs.writeFile(path.join(roots.a,'x'),left);await fs.writeFile(path.join(roots.b,'x'),right);};return {service,roots,write};}
test('folder rules accept supported encodings and canonicalize auto without altering legacy objects',()=>{
 assert.deepEqual(validateFolderRules({textEncoding:'auto'}),{mode:'content',timeToleranceMs:0});for(const textEncoding of ENCODINGS)assert.equal(validateFolderRules({mode:'text-case',textEncoding}).textEncoding,textEncoding);
 for(const textEncoding of [null,123,[],{},'UTF-8','windows-1251','',true])assert.throws(()=>validateFolderRules({textEncoding}),/encoding/);
 assert.equal(validateOperationScope({rules:{mode:'text-case',textEncoding:'windows1251'}}).rules.textEncoding,'windows1251');
});
test('all explicit text encodings normalize case/whitespace and survive aligned comparison',async t=>{
 const {service,write}=await fixture(t);
 for(const textEncoding of ENCODINGS){await write(encode('One Two\r\n',textEncoding),encode('one\ttwo\n',textEncoding));const rules={mode:'text-whitespace-case',textEncoding},result=await service.compareNode('',rules);assert.equal(result.rows[0].status,'equal',textEncoding);assert.equal(result.rows[0].comparison,'text-normalized',textEncoding);assert.equal(result.rules.textEncoding,textEncoding);assert.equal((await service.compareFilePairs([{a:'x',b:'x'}],rules)).rows[0].status,'equal');}
});
test('encoding changes invalidate normalized hash caches without discarding raw provenance',async t=>{
 const {service,write}=await fixture(t);await write(encode('Ё\r\n','windows1251'),encode('ё\n','windows1251'));
 for(const [textEncoding,status,comparison]of [['auto','changed','content'],['windows1251','equal','text-normalized'],['windows1252','changed','text-normalized'],['windows1251','equal','text-normalized'],['auto','changed','content']]){const result=await service.compareNode('',{mode:'text-case',textEncoding});assert.equal(result.rows[0].status,status,textEncoding);assert.equal(result.rows[0].comparison,comparison,textEncoding);}
 assert.equal((await service.compareNode('',{mode:'content',textEncoding:'windows1251'})).rows[0].status,'changed');
});
test('snapshot normalization is bound to encoding and filtered operations agree with live rows',async t=>{
 const {service,write}=await fixture(t);await write(encode('Ё\r\n','windows1251'),encode('ё\n','windows1251'));const rules={mode:'text-case',textEncoding:'windows1251'},a=(await service.snapshot('a',null,rules)).entries.get('x'),b=(await service.snapshot('b',null,rules)).entries.get('x');assert.equal(a.normalizationEncoding,'windows1251');assert.notEqual(a.hash,b.hash);assert.deepEqual(classifySnapshotEntries(a,b,rules),{status:'equal',comparison:'text-normalized'});
 for(const textEncoding of ['auto','windows1252'])assert.throws(()=>classifySnapshotEntries(a,b,{mode:'text-case',textEncoding}),/rules changed/);assert.throws(()=>classifySnapshotEntries({...a,normalizationEncoding:undefined},b,rules),/rules changed/);
 const rows=[{id:'x',parentId:'root',pathA:'x',pathB:'x',kindA:'file',kindB:'file',sizeA:a.size,sizeB:b.size,...classifySnapshotEntries(a,b,rules)}];assert.equal(selectOperationEntries(rows,{status:'diff',rules},'a').fileIds.size,0);assert.deepEqual([...selectOperationEntries(rows,{status:'same',rules},'a').fileIds],['x']);
 const automatic=(await service.snapshot('a',null,{mode:'text-case'})).entries.get('x');assert.equal(automatic.normalizationEncoding,undefined);assert.equal(automatic.normalizedHash,null);
});
test('invalid chosen text, BOM mismatch and binary controls fall back to byte comparison',async t=>{
 const {service,write}=await fixture(t);
 for(const [left,right,textEncoding]of [[Buffer.from([0x98,32]),Buffer.from([0x98]),'windows1251'],[Buffer.from([0x85,32]),Buffer.from([0x85]),'latin1'],[Buffer.from([0,32]),Buffer.from([0]),'windows1252'],[Buffer.from([0xff,0xfe,65,0]),Buffer.from([0xff,0xfe,97,0]),'utf8']]){await write(left,right);const result=(await service.compareNode('',{mode:'text-whitespace-case',textEncoding})).rows[0];assert.equal(result.status,'changed');assert.equal(result.comparison,'content');}
});
test('lazy tree root/selected comparisons use encoding without scanning descendants',async t=>{
 const {service,roots,write}=await fixture(t);await write(encode('Ё','windows1251'),encode('ё','windows1251'));for(const root of Object.values(roots)){await fs.mkdir(path.join(root,'nested'));await fs.writeFile(path.join(root,'nested','hidden'),'not opened');}
 const tree=new FolderTree(service),rules={mode:'text-case',textEncoding:'windows1251'},root=await tree.compare('root',rules);assert.equal(root.rows.find(row=>row.pathA==='x').status,'equal');assert.ok(!root.rows.some(row=>row.pathA==='nested/hidden'));const selected=root.rows.find(row=>row.pathA==='x');assert.equal((await tree.compareSelected([selected.id],root.revision,{mode:'text-case',textEncoding:'auto'})).rows[0].status,'changed');
});
test('filtered copy previews and execution retain encoding-specific eligibility',async t=>{
 const {service,roots,write}=await fixture(t);const left=encode('Ё\r\n','windows1251'),right=encode('ё\n','windows1251');await write(left,right);
 const normalized=await service.previewAction('copy','a',['x'],{status:'diff',rules:{mode:'text-case',textEncoding:'windows1251'}});assert.equal(normalized.operations.length,0);
 const bytes=await service.previewAction('copy','a',['x'],{status:'diff',rules:{mode:'text-case',textEncoding:'auto'}});assert.equal(bytes.operations.filter(item=>item.action==='copy').length,1);await service.execute(bytes.id);assert.deepEqual(await fs.readFile(path.join(roots.b,'x')),Buffer.from(left));
});
test('side overrides inherit shared encoding and preserve explicit automatic decoding',()=>{
 const {effectiveFolderEncoding,validateFolderTextEncodings}=require('../desktop/folder-rules.cjs');
 const rules=validateFolderRules({textEncoding:'windows1251',textEncodingB:'auto'});
 assert.equal(effectiveFolderEncoding(rules,'a'),'windows1251');assert.equal(effectiveFolderEncoding(rules,'b'),'auto');assert.equal(rules.textEncodingB,'auto');
 for(const key of ['textEncodingA','textEncodingB'])for(const invalid of [null,3,{},'UTF-8',''])assert.throws(()=>validateFolderRules({[key]:invalid}),/encoding/);
 assert.deepEqual(validateFolderTextEncodings('utf8'),{a:'utf8',b:'utf8'});assert.deepEqual(validateFolderTextEncodings({a:'windows1251',b:'auto'}),{a:'windows1251',b:'auto'});
 for(const invalid of [null,{},[],{a:'utf8'},{a:'auto',b:'auto',extra:1},{a:undefined,b:'auto'},{a:'bogus',b:'auto'}])assert.throws(()=>validateFolderTextEncodings(invalid),/encoding/);
});
test('mixed encodings compare lazily, invalidate each side cache and retain raw copy bytes',async t=>{
 const {service,roots,write}=await fixture(t);const left=encode('Привет\r\n','windows1251'),right=encode('привет\n','utf8');await write(left,right);
 for(const root of Object.values(roots)){await fs.mkdir(path.join(root,'nested'));await fs.writeFile(path.join(root,'nested','hidden'),'untouched');}
 const rules={mode:'text-case',textEncoding:'windows1251',textEncodingB:'auto'},tree=new FolderTree(service),root=await tree.compare('root',rules),row=root.rows.find(row=>row.pathA==='x');
 assert.equal(row.status,'equal');assert.equal(root.rows.length,2);assert.equal((await service.compareFilePairs([{a:'x',b:'x'}],rules)).rows[0].status,'equal');
 for(const [encoding,status] of [['windows1252','changed'],['auto','equal'],['windows1252','changed'],['auto','equal']])assert.equal((await service.compareNode('',{...rules,textEncodingB:encoding})).rows.find(row=>row.kindA==='file').status,status);
 const same=await service.previewAction('copy','a',['x'],{status:'diff',rules});assert.equal(same.operations.length,0);
 const changed=await service.previewAction('copy','a',['x'],{status:'diff',rules:{...rules,textEncodingB:'windows1252'}});assert.equal(changed.operations.filter(op=>op.action==='copy').length,1);await service.execute(changed.id);assert.deepEqual(await fs.readFile(path.join(roots.b,'x')),Buffer.from(left));
});
test('same bytes decoded differently use normalized meaning and snapshot encoding authority',async t=>{
 const {service,write}=await fixture(t);await write(Buffer.from([0xc0]),Buffer.from([0xc0]));const rules={mode:'text-content',textEncodingA:'windows1251',textEncodingB:'windows1252'};
 assert.equal((await service.compareNode('',rules)).rows[0].status,'changed');assert.equal((await service.compareNode('',{...rules,mode:'content'})).rows[0].status,'equal');
 const a=(await service.snapshot('a',null,rules)).entries.get('x'),b=(await service.snapshot('b',null,rules)).entries.get('x');assert.equal(a.hash,b.hash);assert.equal(a.normalizationEncoding,'windows1251');assert.equal(b.normalizationEncoding,'windows1252');assert.deepEqual(classifySnapshotEntries(a,b,rules),{status:'changed',comparison:'text-normalized'});
 assert.throws(()=>classifySnapshotEntries(a,b,{...rules,textEncodingB:'windows1251'}),/rules changed/);assert.throws(()=>classifySnapshotEntries(b,a,rules),/rules changed/);
 const preview=await service.previewAction('copy','a',['x'],{status:'same',rules});assert.equal(preview.operations.length,0);
});
test('pair and selected text report readers decode each side and preserve formats',async t=>{
 const {stageFolderPair}=require('../desktop/folder-pair.cjs'),{readFolderTextReport}=require('../desktop/folder-text-report.cjs');
 const {service,write}=await fixture(t);await write(encode('Привет','windows1251'),encode('Привет','utf8'));const encodings={a:'windows1251',b:'utf8'},pair=await stageFolderPair(service,'x','x',undefined,encodings);
 assert.equal(pair.mode,'text-compare');assert.equal(pair.a.content,'Привет');assert.equal(pair.b.content,pair.a.content);assert.equal(pair.a.format.encoding,'windows1251');assert.equal(pair.b.format.encoding,'utf8');
 const tree=new FolderTree(service),root=await tree.compare('root',{mode:'text-content',textEncodingA:encodings.a,textEncodingB:encodings.b}),report=await readFolderTextReport(service,tree,[root.rows[0].id],root.revision,()=>{},encodings);
 assert.equal(report.files[0].left.content,report.files[0].right.content);assert.equal(report.files[0].left.format.encoding,'windows1251');assert.equal(report.files[0].right.format.encoding,'utf8');
});
test('desktop session schema retains shared legacy and explicit side overrides',()=>{
 const {validateSession}=require('../desktop/sessions.cjs');
 const value={version:1,type:'folder-compare',name:'Mixed encodings',text:{a:'',b:''},files:{a:{name:'',path:''},b:{name:'',path:''}},folders:{a:null,b:null},options:{ignoreWhitespace:false,filter:'all',direction:'a-to-b',folderRules:{mode:'text-case',timeToleranceMs:0,textEncoding:'windows1251',textEncodingB:'auto'}}};
 assert.deepEqual(validateSession(value).options.folderRules,value.options.folderRules);value.options.folderRules.textEncodingA='utf8';assert.deepEqual(validateSession(value).options.folderRules,value.options.folderRules);value.options.folderRules.textEncodingB=null;assert.throws(()=>validateSession(value),/encoding/);
});
