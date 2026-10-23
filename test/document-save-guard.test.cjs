'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {assertTextExportTarget,assertDocumentTargetSnapshot}=require('../desktop/document-save-guard.cjs');
const {saveLocalText}=require('../desktop/local-text-save.cjs');
const snapshots=require('../desktop/local-file-snapshot.cjs');
test('document projection export rejects DOCX destinations before filesystem access',async()=>{
  await assert.rejects(assertTextExportTarget('/example/NEW.DOCX',[],{stat(){throw Error('Unexpected read');}}),/Word documents/);
});
test('extracted text cannot replace a legacy DOC at either save-validation stage',async()=>{
  await assert.rejects(assertTextExportTarget('/example/NEW.DoC',[],{stat(){throw Error('Unexpected read');}}),/Word documents/);
  assert.throws(()=>assertDocumentTargetSnapshot('/example/NEW.DoC',null),/Word documents/);
});
test('native text save leaves a genuine DOC destination intact when export validation refuses',async()=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-doc-export-')));
  try{
    const destination=path.join(root,'existing.doc'),bytes=await fs.readFile(path.join(__dirname,'fixtures/doc-independent/baseline.doc'));
    await fs.writeFile(destination,bytes);
    await assert.rejects(saveLocalText(destination,Buffer.from('extracted text'),{validateTarget:(target,existing)=>assertDocumentTargetSnapshot(target,existing)}),/Word documents/);
    assert.deepEqual(await fs.readFile(destination),bytes);
    assert.deepEqual(await fs.readdir(root),['existing.doc']);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('document export preserves renamed original, hard-link aliases and unrelated outputs',async()=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-document-export-')));
  try{
    const original=path.join(root,'source.docx'),renamed=path.join(root,'renamed.txt'),alias=path.join(root,'alias.txt'),output=path.join(root,'output.txt');
    const bytes=Buffer.from('original document package');await fs.writeFile(original,bytes);
    const snapshot=await snapshots.capture(original),sources=[{path:original,revision:snapshot.revision}];
    await fs.link(original,alias);
    await assert.rejects(assertTextExportTarget(alias,sources),/source document/);
    // Simulate a source rename after an initial destination check. The saver
    // validates its captured target identity before staging any replacement.
    await assertTextExportTarget(renamed,sources);await fs.rename(original,renamed);
    await assert.rejects(saveLocalText(renamed,Buffer.from('extracted text'),{validateTarget:(target,existing)=>assertDocumentTargetSnapshot(target,existing,sources)}),/source document/);
    assert.deepEqual(await fs.readFile(renamed),bytes);assert.deepEqual(await fs.readFile(alias),bytes);
    await fs.writeFile(output,'old text');
    await saveLocalText(output,Buffer.from('new text'),{validateTarget:(target,existing)=>assertDocumentTargetSnapshot(target,existing,sources)});
    assert.equal(await fs.readFile(output,'utf8'),'new text');
    assert.deepEqual((await fs.readdir(root)).sort(),['alias.txt','output.txt','renamed.txt']);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
