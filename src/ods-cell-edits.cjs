'use strict';
const {normalizeWorkbookCellEdit,validateWorkbookCellEdits}=require('./workbook-cell-edits.cjs');
function normalizeOdsCellEdit(value){
 const cell=normalizeWorkbookCellEdit(value);
 if(!['text','blank','number','boolean'].includes(cell.type))throw Error('ODS cell edits support text, blank, number and boolean values only.');
 return cell;
}
function validateOdsCellEdits(value,{rows,template,structure}={}){
 if(!template||typeof template!=='object'||Array.isArray(template)||![Object.prototype,null].includes(Object.getPrototypeOf(template))||Reflect.ownKeys(template).length!==5||Object.keys(template).sort().join(',')!=='format,sheetName,side,sourceHash,structural'||template.format!=='ods'||template.structural!==false||structure!=null)throw Error('ODS cell edits require an unchanged ODS source template.');
 const {format,...base}=template;
 const normalized=validateWorkbookCellEdits(value,{rows,template:base});
 normalized.cells=normalized.cells.map(normalizeOdsCellEdit);
 for(const cell of normalized.cells){const display=cell.type==='blank'?'':String(cell.value);if(rows[cell.row-1][cell.column-1]!==display)throw Error('ODS cell edit does not match the displayed result.');}
 return normalized;
}
module.exports={normalizeOdsCellEdit,validateOdsCellEdits};
