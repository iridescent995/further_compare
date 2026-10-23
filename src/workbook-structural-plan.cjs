'use strict';
const {normalizeWorkbookStructuralOperation:normalize}=require('./workbook-structural-formulas.cjs');
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const exact=(x,keys)=>plain(x)&&Reflect.ownKeys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const integer=(x,max)=>Number.isSafeInteger(x)&&x>=0&&x<=max;
const limits={row:50000,column:512};
function shape(value){
 if(!exact(value,['rows','columns'])||!integer(value.rows,limits.row)||!integer(value.columns,limits.column)||value.rows*value.columns>500000)throw Error('Invalid workbook structural grid size.');
 return {...value};
}
function applyStructuralShape(input,operation){
 const current=shape(input),op=normalize(operation),key=op.axis==='row'?'rows':'columns',extent=current[key];
 if(op.operation==='insert'){
  if(op.index>extent+1||extent+op.count>limits[op.axis])throw Error('Workbook structural insertion is outside the result bounds.');
  current[key]+=op.count;
 }else{
  if(op.index>extent||op.count>extent-op.index+1)throw Error('Workbook structural deletion is outside the result bounds.');
  current[key]-=op.count;
 }
 return shape(current);
}
/** Each operation uses coordinates in the state immediately preceding it. */
function validateWorkbookStructuralPlan(value,{template,sourceShape,resultShape}={}){
 if(!exact(value,['version','side','sheetName','sourceHash','sourceRows','sourceColumns','operations'])||value.version!==1||!['a','b'].includes(value.side)||typeof value.sheetName!=='string'||!value.sheetName||value.sheetName.length>255||/[\x00-\x1f\ufffe\uffff]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value.sheetName)||typeof value.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(value.sourceHash)||!Array.isArray(value.operations)||value.operations.length>1000)throw Error('Invalid workbook structural plan.');
 if(template!==undefined&&(!exact(template,['side','sheetName','sourceHash','structural'])||typeof template.structural!=='boolean'||['side','sheetName','sourceHash'].some(k=>template[k]!==value[k])))throw Error('Workbook structural plan does not match its source template.');
 if(template!==undefined&&template.structural!==Boolean(value.operations.length))throw Error('Workbook structural flag does not match its operation history.');
 let current=shape({rows:value.sourceRows,columns:value.sourceColumns});
 if(sourceShape!==undefined){const expected=shape(sourceShape);if(expected.rows!==current.rows||expected.columns!==current.columns)throw Error('Workbook structural source dimensions changed.');}
 const operations=[];
 for(let i=0;i<value.operations.length;i++){
  if(!Object.hasOwn(value.operations,i))throw Error('Sparse workbook structural operations.');
  const op=normalize(value.operations[i]);current=applyStructuralShape(current,op);operations.push(op);
 }
 if(resultShape!==undefined){const expected=shape(resultShape);if(expected.rows!==current.rows||expected.columns!==current.columns)throw Error('Workbook structural result dimensions do not match the operations.');}
 return {version:1,side:value.side,sheetName:value.sheetName,sourceHash:value.sourceHash,sourceRows:value.sourceRows,sourceColumns:value.sourceColumns,operations};
}
/** Maps a destination cell through an operation; null means the cell was deleted.
 * Immutable source coordinates in a formatting copy must never use this map. */
function mapStructuralCell(cell,operation){
 if(!exact(cell,['row','column'])||!integer(cell.row,1048576)||!cell.row||!integer(cell.column,16384)||!cell.column)throw Error('Invalid workbook cell coordinate.');
 const op=normalize(operation),result={...cell},key=op.axis==='row'?'row':'column',n=result[key];
 if(op.operation==='insert'){if(n>=op.index)result[key]+=op.count;}
 else if(n>=op.index&&n<op.index+op.count)return null;
 else if(n>=op.index+op.count)result[key]-=op.count;
 if(result.row>1048576||result.column>16384)throw Error('Workbook structural cell exceeds Excel bounds.');
 return result;
}
function unmapStructuralCell(cell,operation){
 const op=normalize(operation);
 // Validate the input without moving it.
 if(!exact(cell,['row','column'])||!integer(cell.row,1048576)||!cell.row||!integer(cell.column,16384)||!cell.column)throw Error('Invalid workbook cell coordinate.');
 const result={...cell},key=op.axis==='row'?'row':'column',n=result[key];
 if(op.operation==='insert'){
  if(n>=op.index&&n<op.index+op.count)return null;
  if(n>=op.index+op.count)result[key]-=op.count;
 }else if(n>=op.index)result[key]+=op.count;
 if(result.row>1048576||result.column>16384)throw Error('Workbook structural cell exceeds Excel bounds.');
 return result;
}
function validateWorkbookStructuralRows(value,{rows,template,sourceShape}={}){
 if(template==null)throw Error('Workbook structural edits require a source template.');
 const plan=validateWorkbookStructuralPlan(value,{template,sourceShape});
 const final=plan.operations.reduce(applyStructuralShape,{rows:plan.sourceRows,columns:plan.sourceColumns});
 if(!Array.isArray(rows)||rows.length!==final.rows)throw Error('Workbook structural result dimensions do not match its history.');
 for(let r=0;r<rows.length;r++){
  if(!Object.hasOwn(rows,r)||!Array.isArray(rows[r])||rows[r].length!==final.columns)throw Error('Workbook structural results must have the recorded rectangular dimensions.');
  for(let c=0;c<rows[r].length;c++)if(!Object.hasOwn(rows[r],c)||typeof rows[r][c]!=='string')throw Error('Workbook structural result cells must be dense strings.');
 }
 return plan;
}
module.exports={applyStructuralShape,validateWorkbookStructuralPlan,validateWorkbookStructuralRows,mapStructuralCell,unmapStructuralCell};
