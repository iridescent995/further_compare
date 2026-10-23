'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {applyStructuralShape:shape,validateWorkbookStructuralPlan:validate,mapStructuralCell:map,unmapStructuralCell:unmap}=require('../src/workbook-structural-plan.cjs');
const op=(axis,operation,index,count=1)=>({axis,operation,index,count});
const template={side:'b',sheetName:'Data',sourceHash:'a'.repeat(64),structural:true};
const journal=operations=>({version:1,side:'b',sheetName:'Data',sourceHash:template.sourceHash,sourceRows:4,sourceColumns:3,operations});
test('journal follows preceding-state coordinates and binds source and resulting shapes',()=>{
 const value=journal([op('row','insert',2,2),op('column','delete',2),op('row','delete',5,2)]);
 const output=validate(value,{template,sourceShape:{rows:4,columns:3},resultShape:{rows:4,columns:2}});assert.deepEqual(output,value);output.operations[0].count=9;assert.equal(value.operations[0].count,2);
 assert.throws(()=>validate(value,{template:{...template,sourceHash:'b'.repeat(64)}}));
 assert.throws(()=>validate(value,{sourceShape:{rows:3,columns:3}}));assert.throws(()=>validate(value,{resultShape:{rows:4,columns:3}}));
});
test('deleting a row then using its old append index is rejected',()=>{
 assert.throws(()=>validate(journal([op('row','delete',4),op('row','insert',5)])));
 assert.doesNotThrow(()=>validate(journal([op('row','delete',4),op('row','insert',4)])));
});
test('shape edits preserve explicit empty dimensions without inventing cells',()=>{
 assert.deepEqual(shape({rows:0,columns:0},op('column','insert',1)),{rows:0,columns:1});
 assert.deepEqual(shape({rows:0,columns:1},op('row','insert',1)),{rows:1,columns:1});
 assert.deepEqual(shape({rows:1,columns:1},op('row','delete',1)),{rows:0,columns:1});
 assert.throws(()=>shape({rows:0,columns:0},op('row','delete',1)));
});
test('journals reject malformed, sparse, oversized and forged dimensions',()=>{
 for(const mutate of [v=>v.version=2,v=>v.extra=true,v=>v.side='base',v=>v.sourceHash='x',v=>v.sheetName='bad\0',v=>v.operations=new Array(1),v=>v.operations=Array(1001).fill(op('row','insert',1)),v=>v.sourceRows=50001,v=>v.sourceColumns=513,v=>{v.sourceRows=1000;v.sourceColumns=501;},v=>v.operations=[op('row','delete',3,3)],v=>v.operations=[{...op('row','insert',1),extra:1}]]){const value=journal([]);mutate(value);assert.throws(()=>validate(value));}
 assert.throws(()=>shape({rows:1000,columns:500},op('column','insert',1)));
});
test('cell mapping preserves originals, removes deleted targets and detects Excel overflow',()=>{
 const point={row:5,column:4};assert.deepEqual(map(point,op('row','insert',3,2)),{row:7,column:4});assert.deepEqual(point,{row:5,column:4});
 assert.equal(map(point,op('row','delete',4,2)),null);assert.deepEqual(map(point,op('column','delete',2)),{row:5,column:3});
 assert.throws(()=>map({row:1048576,column:1},op('row','insert',1)));
 assert.throws(()=>map({row:1,column:16384},op('column','insert',1)));
});
test('inverse mapping distinguishes inserted cells and reverses surviving coordinates',()=>{
 for(const axis of ['row','column'])for(const operation of ['insert','delete'])for(let n=1;n<=20;n++){
  const change=op(axis,operation,4,3),point=axis==='row'?{row:n,column:2}:{row:2,column:n},mapped=map(point,change);
  if(mapped)assert.deepEqual(unmap(mapped,change),point);
 }
 assert.equal(unmap({row:4,column:2},op('row','insert',4,3)),null);
 const changes=[op('row','insert',2),op('column','delete',2),op('row','delete',5)];let point={row:3,column:4};for(const change of changes)point=map(point,change);for(const change of changes.toReversed())point=unmap(point,change);assert.deepEqual(point,{row:3,column:4});
});

test('structural flag agrees with operation history rather than resulting dimensions',()=>{
 assert.throws(()=>validate(journal([]),{template}));
 assert.doesNotThrow(()=>validate(journal([]),{template:{...template,structural:false}}));
 const value=journal([op('row','insert',2),op('row','delete',2)]);
 assert.throws(()=>validate(value,{template:{...template,structural:false}}));
 assert.doesNotThrow(()=>validate(value,{template,resultShape:{rows:4,columns:3}}));
});
test('ordered mappings agree with independently spliced row/column identities',()=>{
 let seed=481516;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let trial=0;trial<100;trial++){
  const original={rows:8,columns:6},identities={row:Array.from({length:8},(_,i)=>i+1),column:Array.from({length:6},(_,i)=>i+1)},operations=[];
  for(let step=0;step<20;step++){
   const axis=random(2)?'row':'column',list=identities[axis],operation=!list.length||random(2)?'insert':'delete';
   const index=1+random(list.length+(operation==='insert'?1:0));
   const change=op(axis,operation,index);operations.push(change);
   if(operation==='insert')list.splice(index-1,0,null);else list.splice(index-1,1);
  }
  validate({...journal(operations),sourceRows:original.rows,sourceColumns:original.columns},{resultShape:{rows:identities.row.length,columns:identities.column.length}});
  for(let row=1;row<=original.rows;row++)for(let column=1;column<=original.columns;column++){
   let point={row,column};for(const change of operations){if(!point)break;point=map(point,change);}
   const r=identities.row.indexOf(row),c=identities.column.indexOf(column);
   assert.deepEqual(point,r<0||c<0?null:{row:r+1,column:c+1});
  }
  for(let r=0;r<identities.row.length;r++)for(let c=0;c<identities.column.length;c++){
   let point={row:r+1,column:c+1};for(const change of operations.toReversed()){if(!point)break;point=unmap(point,change);}
   assert.deepEqual(point,identities.row[r]===null||identities.column[c]===null?null:{row:identities.row[r],column:identities.column[c]});
  }
 }
});
