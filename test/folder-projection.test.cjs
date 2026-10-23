'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {FolderAlignment} = require('../desktop/folder-alignment.cjs');
const {projectSnapshot,projectSelectedSnapshot} = require('../desktop/folder-projection.cjs');
const file = () => ({kind:'file',size:4,hash:'a'.repeat(64),normalizedHash:null,revision:'1:2:4:5:6',mode:0o100644});
const dir = () => ({kind:'directory',identity:'1:2',mode:0o40755});
const snapshot = pairs => ({entries:new Map(pairs),skipped:3,identity:'root:1'});
const mapping = (a,b,kind='file') => ({a,b,kind});

test('cross-parent projection creates destination scaffolding and retains actual source provenance',()=>{
  const input = snapshot([['old',dir()],['old/a',file()]]), model = new FolderAlignment([mapping('old/a','new/deep/b')]);
  const output = projectSnapshot(input,model,'a');
  assert.deepEqual([...output.entries.keys()],['new','new/deep','new/deep/b','old']);
  assert.equal(output.entries.get('new/deep/b').sourcePath,'old/a');
  assert.deepEqual(output.entries.get('new/deep/b'),{...file(),sourcePath:'old/a',synthetic:false});
  for (const path of ['new','new/deep']) { assert.equal(output.entries.get(path).synthetic,true); assert.equal(output.entries.get(path).sourcePath,null); assert.equal(output.entries.get(path).kind,'directory'); }
  assert.equal(output.entries.get('old').sourcePath,'old'); assert.equal(output.skipped,3); assert.equal(output.identity,'root:1');
  assert.deepEqual(output.reserved,[]); assert.equal(input.entries.size,2); assert.equal(input.entries.get('old/a').sourcePath,undefined);
  output.entries.get('new/deep/b').hash='changed'; assert.equal(input.entries.get('old/a').hash,'a'.repeat(64));
  assert.equal(output.entries.get('new').identity,projectSnapshot(input,model,'a').entries.get('new').identity);
});
test('directory descendants and nested explicit remaps use longest matching anchor',()=>{
  const model = new FolderAlignment([mapping('src','code','directory'),mapping('src/old','code/new','directory'),mapping('src/old/a','code/new/b')]);
  const output = projectSnapshot(snapshot([['src',dir()],['src/old',dir()],['src/old/a',file()],['src/old/z',file()],['src/plain',file()],['src/new',dir()],['src/new/decoy',file()],['src/old/b',file()]]),model,'a');
  assert.equal(output.entries.get('code/new/b').sourcePath,'src/old/a');
  assert.equal(output.entries.get('code/new/z').sourcePath,'src/old/z');
  assert.equal(output.entries.get('code/plain').sourcePath,'src/plain');
  assert.deepEqual(output.reserved,['src/new','src/new/decoy','src/old/b']);
  assert.ok(!output.entries.has('code/new/decoy'));
});
test('reserved source parents do not hide explicitly mapped descendants',()=>{
  const model = new FolderAlignment([mapping('source','target','directory'),mapping('target/special','elsewhere/renamed')]);
  const output=projectSnapshot(snapshot([['source',dir()],['target',dir()],['target/special',file()],['target/other',file()]]),model,'a');
  assert.deepEqual(output.reserved,['target','target/other']);
  assert.equal(output.entries.get('elsewhere/renamed').sourcePath,'target/special');
  assert.equal(output.entries.get('elsewhere').synthetic,true);
});
test('reverse direction and sibling swaps preserve the correct source paths',()=>{
  const model=new FolderAlignment([mapping('first/a','second/b')]);
  const output=projectSnapshot(snapshot([['second',dir()],['second/b',file()]]),model,'b');
  assert.equal(output.entries.get('first/a').sourcePath,'second/b');
  const swaps=projectSnapshot(snapshot([['a',file()],['b',file()]]),new FolderAlignment([mapping('a','b'),mapping('b','a')]),'a');
  assert.equal(swaps.entries.get('a').sourcePath,'b'); assert.equal(swaps.entries.get('b').sourcePath,'a'); assert.deepEqual(swaps.reserved,[]);
});
test('actual source aliases reject even when mappings would separate them',()=>{
  for (const [left,right] of [['A','a'],['caf\u00e9','cafe\u0301']]) {
    const model=new FolderAlignment([mapping(left,'left'),mapping(right,'right')]);
    assert.throws(()=>projectSnapshot(snapshot([[left,file()],[right,file()]]),model,'a'),/spelling/);
  }
  assert.throws(()=>projectSnapshot(snapshot([['A/x',file()],['a/y',file()]]),new FolderAlignment(),'a'),/spelling/);
});
test('projected aliases and file ancestors reject instead of creating ambiguous operations',()=>{
  for (const target of ['DEST/renamed','de\u0301st/renamed']) {
    const other=target.startsWith('DEST')?'dest':'d\u00e9st';
    assert.throws(()=>projectSnapshot(snapshot([['source',file()],[other,dir()]]),new FolderAlignment([mapping('source',target)]),'a'),/spelling/);
  }
  assert.throws(()=>projectSnapshot(snapshot([['source',file()],['target',file()]]),new FolderAlignment([mapping('source','target/child')]),'a'),/cannot contain/);
  assert.throws(()=>projectSnapshot(snapshot([['file',file()],['file/child',file()]]),new FolderAlignment(),'a'),/cannot contain/);
});
test('real projected directories retain identity and mode without synthetic replacement',()=>{
  const input=snapshot([['old',dir()],['old/a',file()],['new',{...dir(),identity:'2:3',mode:0o40700}]]);
  const output=projectSnapshot(input,new FolderAlignment([mapping('old/a','new/b')]),'a');
  assert.deepEqual(output.entries.get('new'),{...input.entries.get('new'),sourcePath:'new',synthetic:false});
});
test('invalid snapshots, paths, metadata, and sides reject synchronously',()=>{
  const model=new FolderAlignment();
  for (const value of [null,{}, {...snapshot([]),entries:[]},{...snapshot([]),skipped:-1},{...snapshot([]),identity:42}]) assert.throws(()=>projectSnapshot(value,model,'a'));
  for (const path of ['', '../x','a//b','a\\b','/abs','C:/x','a\0b']) assert.throws(()=>projectSnapshot(snapshot([[path,file()]]),model,'a'));
  for (const entry of [null,{}, {...file(),kind:'symlink'},{...file(),size:NaN},{...file(),hash:'bad'},{...file(),revision:null},{...dir(),identity:null},{...dir(),mode:'755'}]) assert.throws(()=>projectSnapshot(snapshot([['x',entry]]),model,'a'));
  assert.throws(()=>projectSnapshot(snapshot([]),model,'x')); assert.throws(()=>projectSnapshot(snapshot([]),{},'a'));
  assert.deepEqual(projectSnapshot(snapshot([]),model,'a'),{entries:new Map(),skipped:3,identity:'root:1',reserved:[]});
});

test('selected projection strips source scaffolding and unrelated content before mapping',()=>{
  const input=snapshot([['old',dir()],['old/selected',file()],['old/unrelated',file()],['elsewhere',file()]]);
  const model=new FolderAlignment([mapping('old/selected','new/deep/renamed')]);
  const output=projectSelectedSnapshot(input,model,'a',['old/selected']);
  assert.deepEqual([...output.entries.keys()],['new','new/deep','new/deep/renamed']);
  assert.equal(output.entries.get('new/deep/renamed').sourcePath,'old/selected');
  assert.deepEqual(output.coverage.map(([path])=>path),['elsewhere','old','old/selected','old/unrelated']);
  assert.equal(output.skipped,3);assert.equal(output.identity,'root:1');assert.deepEqual(output.reserved,[]);
  output.coverage[1][1].identity='changed';assert.equal(input.entries.get('old').identity,'1:2');
});
test('selected directory copies descendants remapped outside its projected subtree',()=>{
  const model=new FolderAlignment([mapping('src','code','directory'),mapping('src/sub/file','code/elsewhere/renamed')]);
  const input=snapshot([['src',dir()],['src/sub',dir()],['src/sub/file',file()],['src/sub/nested',dir()],['src/sub/nested/plain',file()],['src/elsewhere',dir()]]);
  const output=projectSelectedSnapshot(input,model,'a',['src/sub']);
  assert.deepEqual([...output.entries.keys()],['code','code/elsewhere','code/elsewhere/renamed','code/sub','code/sub/nested','code/sub/nested/plain']);
  assert.equal(output.entries.get('code').sourcePath,null);assert.equal(output.entries.get('code').synthetic,true);
  assert.equal(output.entries.get('code/elsewhere').sourcePath,null,'unselected actual scaffold must not claim destination');
  assert.equal(output.entries.get('code/elsewhere/renamed').sourcePath,'src/sub/file');
  assert.equal(output.entries.get('code/sub/nested/plain').sourcePath,'src/sub/nested/plain');
});
test('selected projection permits displaced scaffolding but rejects displaced selected content',()=>{
  const model=new FolderAlignment([mapping('source','target','directory'),mapping('target/special','elsewhere/renamed')]);
  const input=snapshot([['target',dir()],['target/special',file()],['target/other',file()]]);
  const output=projectSelectedSnapshot(input,model,'a',['target/special']);
  assert.deepEqual([...output.entries.keys()],['elsewhere','elsewhere/renamed']);
  assert.throws(()=>projectSelectedSnapshot(input,model,'a',['target']),/displaced source/);
  assert.throws(()=>projectSelectedSnapshot(input,model,'a',['target/other']),/displaced source/);
});
test('selected projection reverse direction handles overlapping selections without duplicates',()=>{
  const model=new FolderAlignment([mapping('left/renamed','right/file')]);
  const input=snapshot([['right',dir()],['right/file',file()],['right/sub',dir()],['right/sub/other',file()]]);
  const output=projectSelectedSnapshot(input,model,'b',['right','right/file','right']);
  assert.equal(output.entries.get('left/renamed').sourcePath,'right/file');
  assert.equal(output.entries.get('right/sub/other').sourcePath,'right/sub/other');
  assert.equal(output.entries.size,5);
});
test('selected projection validates raw scaffold aliases and missing or malformed selection',()=>{
  const model=new FolderAlignment(),input=snapshot([['parent',dir()],['parent/file',file()]]);
  for(const selected of [null,[],['missing'],['.'],['parent/../file'],[null]]) assert.throws(()=>projectSelectedSnapshot(input,model,'a',selected));
  assert.throws(()=>projectSelectedSnapshot(snapshot([['A',dir()],['a',dir()],['A/file',file()]]),model,'a',['A/file']),/spelling/);
  assert.throws(()=>projectSelectedSnapshot(input,model,'other',['parent/file']),/alignment/);
  const changed=snapshot([...input.entries]);changed.entries.set('parent',{...dir(),identity:'new:inode'});
  assert.notDeepEqual(projectSelectedSnapshot(input,model,'a',['parent/file']).coverage,projectSelectedSnapshot(changed,model,'a',['parent/file']).coverage);
});
