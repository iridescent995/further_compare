'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FolderService}=require('../desktop/folders.cjs');
const {classifySnapshotEntries}=require('../desktop/folder-snapshot-comparison.cjs');
const {validateFolderRules}=require('../desktop/folder-rules.cjs');
const {validateSession}=require('../desktop/sessions.cjs');
const {captureSessionDefaults,validateDefaultProfile}=require('../desktop/session-defaults.cjs');
const {prepareTextComparison,createIgnoredTextPool}=require('../desktop/ignored-text-client.cjs');
const {validateTextGrammar}=require('../src/text-grammar.cjs');
const grammar=()=>({version:1,importance:{},elements:[{name:'Metadata',kind:'line',importance:'unimportant',start:'#'}]});
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-grammar-backend-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const service=new FolderService(path.join(root,'backups'));
 for(const side of ['a','b']){const dir=path.join(root,side);await fs.mkdir(dir);await fs.writeFile(path.join(dir,'A.txt'),side==='a'?'# left\nvalue\n':'# right\nvalue\n');await service.select(side,dir);}
 return {service,root};
}
test('plain custom grammar normalizes live and snapshot folders, retains exact original bytes',async t=>{
 const {service,root}=await fixture(t),rules={mode:'text-content',textGrammar:grammar()},pairs=[{a:'A.txt',b:'A.txt'}];
 assert.equal((await service.compareFilePairs(pairs,rules)).rows[0].status,'equal');
 assert.equal((await service.compareFilePairs(pairs,{mode:'text-content'})).rows[0].status,'changed');
 const a=(await service.snapshot('a',null,rules)).entries.get('A.txt'),b=(await service.snapshot('b',null,rules)).entries.get('A.txt');
 assert.equal(classifySnapshotEntries(a,b,rules).status,'equal');
 assert.equal((await service.compareFilePairs(pairs,{...rules,mode:'content'})).rows[0].status,'changed');
 assert.equal(await fs.readFile(path.join(root,'a/A.txt'),'utf8'),'# left\nvalue\n');
});
test('grammar snapshots reject config and engine changes, even semantically equivalent names',async t=>{
 const {service}=await fixture(t),rules={mode:'text-content',textGrammar:grammar()},a=(await service.snapshot('a',null,rules)).entries.get('A.txt'),b=(await service.snapshot('b',null,rules)).entries.get('A.txt');
 for(const patch of [{normalizationGrammarVersion:0},{normalizationTextGrammar:undefined}])assert.throws(()=>classifySnapshotEntries({...a,...patch},b,rules),/grammar rules/);
 const other=grammar();other.elements[0].name='Same effect';assert.throws(()=>classifySnapshotEntries(a,b,{...rules,textGrammar:other}),/grammar rules/);
 assert.throws(()=>classifySnapshotEntries(a,b,{mode:'text-content'}),/grammar rules/);
 const empty={mode:'text-content',textGrammar:validateTextGrammar()},oldA=(await service.snapshot('a',null,empty)).entries.get('A.txt'),oldB=(await service.snapshot('b',null,empty)).entries.get('A.txt');
 assert.equal(oldA.normalizationGrammarVersion,undefined);assert.equal(classifySnapshotEntries(oldA,oldB,{mode:'text-content'}).status,'changed');
});
test('cache binds canonical grammar identity and preserves empty config compatibility',async t=>{
 const {service}=await fixture(t),pairs=[{a:'A.txt',b:'A.txt'}],rules={mode:'text-content',textGrammar:grammar()},client=require('../desktop/ignored-text-client.cjs'),original=client.prepareTextComparison;let calls=0;
 client.prepareTextComparison=async(...args)=>{calls++;return original(...args);};t.after(()=>client.prepareTextComparison=original);
 await service.compareFilePairs(pairs,rules);const first=calls;assert.equal(first,2);await service.compareFilePairs(pairs,rules);assert.equal(calls,first);
 const renamed=grammar();renamed.elements[0].name='Another name';await service.compareFilePairs(pairs,{...rules,textGrammar:renamed});assert.equal(calls,first+2);
 const important=grammar();important.elements[0].importance='important';assert.equal((await service.compareFilePairs(pairs,{...rules,textGrammar:important})).rows[0].status,'changed');
 await service.compareFilePairs(pairs,{mode:'text-content'});const size=service.hashCache.size;await service.compareFilePairs(pairs,{mode:'text-content',textGrammar:validateTextGrammar()});assert.equal(service.hashCache.size,size);
});
test('auto mismatched profile fallback still applies custom grammar in provider and snapshot',async t=>{
 const {service,root}=await fixture(t);await fs.rename(path.join(root,'a/A.txt'),path.join(root,'a/A.java'));const rules={mode:'text-content',textProfile:'auto',textGrammar:grammar()};
 assert.equal((await service.compareFilePairs([{a:'A.java',b:'A.txt'}],rules)).rows[0].status,'equal');
 const a=(await service.snapshot('a',null,rules)).entries.get('A.java'),b=(await service.snapshot('b',null,rules)).entries.get('A.txt');
 assert.equal(classifySnapshotEntries(a,b,rules,{a:'A.java',b:'A.txt'}).status,'equal');
});
test('binary inputs fall back to bytes under custom grammar',async t=>{
 const {service,root}=await fixture(t);await fs.writeFile(path.join(root,'a/A.txt'),Buffer.from('# left\0'));await fs.writeFile(path.join(root,'b/A.txt'),Buffer.from('# right\0'));const rules={mode:'text-content',textGrammar:grammar()};
 assert.equal((await service.compareFilePairs([{a:'A.txt',b:'A.txt'}],rules)).rows[0].status,'changed');assert.equal((await service.snapshot('a',null,rules)).entries.get('A.txt').normalizedHash,null);
});
test('grammar configuration is cloned and retained in sessions, defaults, and dormant folder rules',()=>{
 const g=grammar(),session={version:1,type:'text-compare',name:'Grammar',text:{a:'a',b:'b'},files:{a:{name:'a.txt',path:''},b:{name:'b.txt',path:''}},folders:{a:null,b:null},options:{ignoreWhitespace:false,filter:'all',direction:'a-to-b',textGrammar:g}};
 const saved=validateSession(session),defaults=captureSessionDefaults(saved),rules=validateFolderRules({mode:'content',textGrammar:g});g.elements[0].start='!';
 for(const value of [saved.options,defaults.options,validateDefaultProfile(defaults).options,rules])assert.deepEqual(value.textGrammar,validateTextGrammar(grammar()));
 for(const invalid of [null,{version:2,importance:{},elements:[]}]){assert.throws(()=>validateSession({...session,options:{...session.options,textGrammar:invalid}}));assert.throws(()=>validateDefaultProfile({type:'text-compare',options:{textGrammar:invalid}}));assert.throws(()=>validateFolderRules({textGrammar:invalid}));}
});
test('worker validates grammar before enqueue and clones queued config',async()=>{
 await assert.rejects(prepareTextComparison(['x'],[],'plain',{version:2}),/grammar/);
 const pool=createIgnoredTextPool();try{const g=grammar(),promise=pool.prepare(['# remove\nkeep'],[],'plain',true,g);g.elements[0].importance='important';const [prepared]=await promise;assert.equal(prepared.omit[0],true);assert.equal(prepared.keys[1],'keep');}finally{await pool.close();}
});
test('grammar-normalized same filter copies unopened files as their exact original bytes',async t=>{
 const {service,root}=await fixture(t),{FolderTree}=require('../desktop/folder-tree.cjs'),{previewFilteredCopyToFolder}=require('../desktop/folder-filtered-copy-destination.cjs'),tree=new FolderTree(service);await tree.list('root');const out=path.join(root,'out');await fs.mkdir(out);
 const result=await previewFilteredCopyToFolder(service,tree,'a',['A.txt'],{status:'same',rules:{mode:'text-content',textGrammar:grammar()}},async()=>out);await result.service.execute(result.preview.id);
 assert.equal(await fs.readFile(path.join(out,'A.txt'),'utf8'),'# left\nvalue\n');
});
test('mutation during custom grammar rejects reads and publishes no cache',async t=>{
 const {service,root}=await fixture(t),client=require('../desktop/ignored-text-client.cjs'),original=client.prepareTextComparison;let target;
 client.prepareTextComparison=async(...args)=>{const result=await original(...args);if(target){const file=target;target=null;await fs.writeFile(file,'changed\n');}return result;};t.after(()=>client.prepareTextComparison=original);
 const rules={mode:'text-content',textGrammar:grammar()};target=path.join(root,'a/A.txt');await assert.rejects(service.compareFilePairs([{a:'A.txt',b:'A.txt'}],rules),/changed/);assert.equal(service.hashCache.size,0);
 await fs.writeFile(path.join(root,'a/A.txt'),'# left\nvalue\n');target=path.join(root,'a/A.txt');await assert.rejects(service.snapshot('a',null,rules),/changed/);
});
