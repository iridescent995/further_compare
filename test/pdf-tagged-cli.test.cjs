'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {main}=require('../scripts/compare.cjs'),{planBatch,runBatch}=require('../scripts/batch.cjs'),{BatchService}=require('../desktop/batch-service.cjs'),{extractPdfTextInNode}=require('../src/pdf-text-node.cjs');
const fixtures=path.join(__dirname,'fixtures/pdf-tagged-independent'),fixture=name=>path.join(fixtures,name+'.pdf');
async function setup(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-pdf-tagged-cli-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('real CLI tagged order compares different drawing sequences with exact v4 provenance and unchanged sources',async t=>{
 const root=await setup(t),left=fixture('baseline'),right=fixture('drawing-row-major'),before=await Promise.all([fs.readFile(left),fs.readFile(right)]);
 for(const [order,code]of [['document',1],['tagged-structure',0]]){const output=path.join(root,order+'.json'),r=spawnSync(process.execPath,[path.join(__dirname,'../scripts/compare.cjs'),'--left',left,'--right',right,'--pdf-order',order,'--format','json','--output',output],{encoding:'utf8',timeout:30000});assert.equal(r.status,code,r.stderr||r.error?.message);const report=JSON.parse(await fs.readFile(output,'utf8'));assert.equal(report.comparisonMeaning,'extracted-text');assert.equal(report.documentProjections.left.version,order==='document'?1:4);assert.equal(report.documentProjections.left.order,order==='document'?undefined:order);if(order!=='document'){assert.equal(report.documentProjections.left.orderVersion,1);assert.match(report.documentProjections.left.exclusions.join(' '),/normaliz/i);}}
 assert.deepEqual(await Promise.all([fs.readFile(left),fs.readFile(right)]),before);
});
test('Node tagged engine retains table/list and artifact text, rejects incomplete coverage and cancellation',async()=>{
 const expected=JSON.parse(await fs.readFile(path.join(fixtures,'expected.json'),'utf8')),table=await extractPdfTextInNode(await fs.readFile(fixture('table-list')),{order:'tagged-structure'});
 for(const row of expected.tableList.rows)assert(table.content.includes(row.join('\t')));for(const value of expected.tableList.listItems)assert(table.content.includes(value));
 const artifact=await extractPdfTextInNode(await fs.readFile(fixture('artifact-footer-valid')),{order:'tagged-structure'});assert.match(artifact.content,/artifact/i);assert.equal(artifact.content.split('Final paragraph.').length-1,1);
 for(const name of ['untagged','duplicate-mcid','unmarked-text','artifact-text','reused-form-mcid'])await assert.rejects(extractPdfTextInNode(await fs.readFile(fixture(name)),{order:'tagged-structure'}),{code:'DOCUMENT_ORDER_UNSUPPORTED'});
 const controller=new AbortController(),pending=extractPdfTextInNode(await fs.readFile(fixture('baseline')),{order:'tagged-structure',signal:controller.signal});controller.abort();await assert.rejects(pending,{code:'DOCUMENT_CANCELLED'});
 assert.equal((await extractPdfTextInNode(await fs.readFile(fixture('baseline')),{order:'tagged-structure'})).projection.version,4);
});
test('unsupported tagged source and invalid nontext policy create no report',async t=>{
 const root=await setup(t),output=path.join(root,'bad.json'),args=['--left',fixture('untagged'),'--right',fixture('baseline'),'--output',output,'--pdf-order','tagged-structure'];await assert.rejects(main(args),{code:'DOCUMENT_ORDER_UNSUPPORTED'});await assert.rejects(fs.stat(output),{code:'ENOENT'});await assert.rejects(main([...args,'--type','binary']),/ordering/);await assert.rejects(fs.stat(output),{code:'ENOENT'});
});
test('batch preview discloses tagged limits, binds reviewed policy and executes real Node conversion',async t=>{
 const root=await setup(t),script=path.join(root,'batch.json'),output=path.join(root,'report.json');const jobs=[{left:fixture('baseline'),right:fixture('drawing-row-major'),output,pdfOrder:'tagged-structure'}];await fs.writeFile(script,JSON.stringify({version:1,jobs}));const [plan]=await planBatch(script);assert.equal(plan.documentConversions.left.order,'tagged-structure');assert.match(plan.documentConversions.left.limitations[0],/normalized.*artifact.*coverage/);await runBatch(script,{dryRun:true});await assert.rejects(fs.stat(output),{code:'ENOENT'});
 const service=new BatchService(),review=await service.preview(script);jobs[0].pdfOrder='document';await fs.writeFile(script,JSON.stringify({version:1,jobs}));await assert.rejects(service.execute(review.token,async()=>true),/plan changed/);jobs[0].pdfOrder='tagged-structure';await fs.writeFile(script,JSON.stringify({version:1,jobs}));const result=await runBatch(script);assert.equal(result.code,0);assert.equal(JSON.parse(await fs.readFile(output,'utf8')).documentProjections.left.version,4);
});
