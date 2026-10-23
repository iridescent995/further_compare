'use strict';
const {validateWorkbookCellEdits}=require('./workbook-cell-edits.cjs');
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const sheet=value=>typeof value==='string'&&value.length>0&&value.length<=255&&!/[\x00-\x1f\ufffe\uffff]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const coordinate=(value,max)=>Number.isSafeInteger(value)&&value>=1&&value<=max;
/** Persist source coordinates, never opaque workbook style IDs. */
function validateWorkbookStyleEdits(value,{rows,template,structure}={}){
 if(!exact(value,['version','side','sheetName','sourceHash','cells'])||value.version!==1||!Array.isArray(value.cells)||value.cells.length>100000)throw Error('Invalid workbook formatting overlay.');
 // Reuse the result-grid and exact destination-template validation.
 validateWorkbookCellEdits({...value,cells:[]},{rows,template,structure});
 if(template.structural&&structure==null&&value.cells.length)throw Error('Formatting copies require unchanged row and column positions.');
 const seen=new Set(),cells=[];
 for(let i=0;i<value.cells.length;i++){
  const cell=value.cells[i];
  if(!Object.hasOwn(value.cells,i)||!exact(cell,['row','column','sourceSide','sourceHash','sourceSheet','sourceRow','sourceColumn'])||!coordinate(cell.row,50000)||!coordinate(cell.column,512)||!['a','b'].includes(cell.sourceSide)||!hash(cell.sourceHash)||!sheet(cell.sourceSheet)||!coordinate(cell.sourceRow,50000)||!coordinate(cell.sourceColumn,512))throw Error('Invalid workbook formatting source or cell coordinate.');
  const key=cell.row+':'+cell.column;
  if(cell.row>rows.length||cell.column>rows[cell.row-1].length||seen.has(key))throw Error('Workbook formatting coordinate is duplicated or outside the result.');
  seen.add(key);cells.push({...cell});
 }
 return {version:1,side:value.side,sheetName:value.sheetName,sourceHash:value.sourceHash,cells};
}
module.exports={validateWorkbookStyleEdits};
