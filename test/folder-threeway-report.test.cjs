'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createThreeWayReport,formatThreeWayReport} = require('../src/folder-threeway-report.cjs');
const row = (path,status='unchanged',extra={}) => ({path,status,kindBase:'file',sizeBase:3,kindLeft:'file',sizeLeft:4,kindRight:'file',sizeRight:5,...extra});
const input = rows => ({name:'Review',generatedAt:'2026-10-21T00:00:00Z',analysis:{revision:'SECRET',roots:{base:{path:'/base',token:'SECRET'},left:{path:'/left'},right:{path:'/right'}},skipped:{base:0,left:0,right:0},rows}});
test('snapshot retains all analysis rows and excludes runtime authorities and hashes',()=>{
 const source=input([row('a','left',{hashBase:'SECRET',token:'SECRET',id:'SECRET'})]);
 const report=createThreeWayReport(source);
 assert.deepEqual(report.roots,{base:'/base',left:'/left',right:'/right'});
 assert.equal(report.entries[0].sizeLeft,4);
 assert.equal(report.coverage.state,'complete');
 source.analysis.rows[0].path='mutated';source.analysis.roots.base.path='mutated';
 assert.equal(report.entries[0].path,'a');assert.equal(report.roots.base,'/base');
 assert.doesNotMatch(formatThreeWayReport(report),/SECRET|hashBase|revision|token/);
});
test('choices represent only selected conflict anchors and retain blocked descendants',()=>{
 const source=input([row('parent','conflict',{reason:'type-change'}),row('parent/child','conflict',{blockedBy:'parent'}),row('other','conflict'),row('same')]);
 source.choices={'parent':'left','parent/child':'right','same':'base','other':'unknown','missing':'left'};
 const report=createThreeWayReport(source);
 assert.deepEqual(report.entries.map(entry=>entry.choice),['left',null,null,null]);
 assert.equal(report.entries[1].blockedBy,'parent');
 assert.equal(report.statistics.conflictAnchors,2);assert.equal(report.statistics.selectedConflicts,1);assert.equal(report.statistics.unselectedConflicts,1);assert.equal(report.statistics.blockedEntries,1);
 assert.equal(report.resolution,null);assert.equal(report.applied,null);
});
test('skipped coverage does not claim a complete scan even when rows match',()=>{
 const source=input([row('same')]);source.analysis.skipped={base:2,left:3,right:1};
 const report=createThreeWayReport(source);
 assert.equal(report.coverage.state,'incomplete');assert.equal(report.statistics.skippedEntries,6);
 for(const format of ['json','html','csv','text']) {const result=formatThreeWayReport(report,format);assert.match(result,/incomplete/);assert.match(result,/Skipped entries/);}
});
test('resolution, output preview and completed result remain separate and strip authorities',()=>{
 const source=input([row('file')]);
 source.resolution={revision:'SECRET',entries:[{path:'file',kind:'file',size:4,sourceSide:'left',sourcePath:'file',hash:'SECRET'}],conflicts:['other']};
 source.output={path:'/output',token:'SECRET'};
 source.plan={id:'SECRET',revision:'SECRET',output:source.output,counts:{fake:999},operations:[{type:'copy-file',path:'file',size:4,oldSize:3,sourceSide:'left',sourcePath:'file',hash:'SECRET'}]};
 let report=createThreeWayReport(source);
 assert.equal(report.resolution.state,'reviewed-not-applied');assert.equal(report.plan.state,'preview-not-applied');assert.equal(report.applied,null);
 assert.deepEqual(report.plan.counts,{'copy-file':1});
 for(const format of ['json','html','csv','text']) assert.doesNotMatch(formatThreeWayReport(report,format),/SECRET/);
 assert.match(formatThreeWayReport(report,'text'),/No applied result recorded/);
 source.appliedResult={id:'SECRET',completed:1,backupPath:'/backup'};
 report=createThreeWayReport(source);assert.equal(report.applied.state,'reported-completed');assert.equal(report.applied.completed,1);
 source.appliedResult.cancelled=true;assert.equal(createThreeWayReport(source).applied,null);
});
test('HTML escapes hostile names and paths and CSV neutralizes spreadsheet formulas',()=>{
 const source=input([row('=SUM(1,2)'),row('<img src=x onerror="alert(1)">'),row('\t=1'),row('@evil')]);source.name='<script>alert(1)</script>';source.analysis.roots.base.path='-cmd';
 const report=createThreeWayReport(source),html=formatThreeWayReport(report,'html'),csv=formatThreeWayReport(report,'csv');
 assert.doesNotMatch(html,/<script>|<img /);assert.match(html,/&lt;script&gt;/);assert.match(html,/&quot;alert/);
 assert.ok(csv.includes('"\'=SUM(1,2)"'));assert.ok(csv.includes('"\'\t=1"'));assert.ok(csv.includes('"\'@evil"'));assert.ok(csv.includes('"\'-cmd"'));
 assert.equal(JSON.parse(formatThreeWayReport(report)).entries[0].path,'=SUM(1,2)');
});
test('all formats include rows beyond UI pagination and reviewed/output pagination',()=>{
 const source=input(Array.from({length:751},(_,i)=>row(`entry-${i}`)));
 source.resolution={entries:source.analysis.rows.map(entry=>({path:entry.path,kind:'file',size:1,sourceSide:'left',sourcePath:entry.path})),conflicts:[]};
 source.plan={output:{path:'/out'},operations:source.analysis.rows.map(entry=>({type:'copy-file',path:entry.path,size:1,sourceSide:'left',sourcePath:entry.path}))};
 const report=createThreeWayReport(source);
 assert.equal(report.entries.length,751);assert.equal(report.resolution.entries.length,751);assert.equal(report.plan.operations.length,751);
 for(const format of ['json','html','csv','text']) assert.match(formatThreeWayReport(report,format),/entry-750/);
});
test('rejects oversized or invalid snapshots instead of silently dropping rows',()=>{
 assert.throws(()=>createThreeWayReport(),/Analyze/);
 assert.throws(()=>createThreeWayReport(input(new Array(200001))),/limit/);
 assert.throws(()=>createThreeWayReport(input([row('same'),row('same')])),/Duplicate/);
 assert.throws(()=>createThreeWayReport(input([row('x','madeup')])),/status/);
 assert.throws(()=>createThreeWayReport(input([row('x','left',{sizeLeft:-1})])),/integer/);
 assert.throws(()=>createThreeWayReport({...input([]),generatedAt:'bad'}),/generation/);
 assert.throws(()=>formatThreeWayReport(createThreeWayReport(input([])),'pdf'),/Unsupported/);
});
test('real three-way deletion choice exports null side kind and reviewed absence',()=>{
 const {classifyThreeWay,resolveThreeWay}=require('../desktop/folder-threeway-core.cjs');
 const snapshot=(entries)=>({identity:'snapshot',skipped:0,entries:new Map(entries)});
 const file=(char)=>({kind:'file',hash:char.repeat(64),size:1});
 const snapshots={base:snapshot([['deleted',file('a')]]),left:snapshot([]),right:snapshot([['deleted',file('b')]])};
 const source=input(classifyThreeWay(snapshots));source.choices={deleted:'left'};
 const resolved=resolveThreeWay(snapshots,source.choices);
 source.resolution={entries:[...resolved.entries].map(([path,entry])=>({path,...entry})),conflicts:resolved.conflicts};
 const report=createThreeWayReport(source);
 assert.equal(report.entries[0].status,'conflict');assert.equal(report.entries[0].reason,'delete-versus-change');assert.equal(report.entries[0].choice,'left');assert.equal(report.entries[0].kindLeft,null);assert.equal(report.entries[0].sizeLeft,null);
 assert.deepEqual(report.resolution.entries,[]);assert.deepEqual(report.resolution.conflicts,[]);assert.equal(report.applied,null);
});
