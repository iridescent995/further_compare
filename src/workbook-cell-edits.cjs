'use strict';
const {validateWorkbookStructuralRows}=require('./workbook-structural-plan.cjs');
const TYPES=new Set(['text','number','boolean','blank','formula']);
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const xmlText=value=>typeof value==='string'&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
function normalizeWorkbookCellEdit(edit){
 if(!exact(edit,['row','column','type','value'])||!Number.isSafeInteger(edit.row)||edit.row<1||edit.row>1048576||!Number.isSafeInteger(edit.column)||edit.column<1||edit.column>16384||!TYPES.has(edit.type))throw Error('Invalid workbook cell edit.');
 let value=edit.value;
 if(edit.type==='text'&&(!xmlText(value)||value.length>32767))throw Error('Workbook text edits require a valid literal value up to 32,767 characters.');
 if(edit.type==='number'&&(typeof value!=='number'||!Number.isFinite(value)))throw Error('Workbook number edits require a finite number.');
 if(edit.type==='boolean'&&typeof value!=='boolean')throw Error('Workbook boolean edits require true or false.');
 if(edit.type==='blank'&&value!==null)throw Error('Workbook blank edits require null.');
 if(edit.type==='formula'){
  if(!xmlText(value))throw Error('Invalid workbook formula text.');
  if(value.startsWith('='))value=value.slice(1);
  if(!value.trim()||value.length>8192||value.startsWith('='))throw Error('Workbook formulas require 1–8,192 characters without a leading equals sign.');
 }
 return {row:edit.row,column:edit.column,type:edit.type,value};
}
function validateRows(rows){
 if(!Array.isArray(rows)||rows.length>50000)throw Error('Invalid workbook result rows.');
 let count=0;
 for(let r=0;r<rows.length;r++){
  const row=rows[r];if(!Object.hasOwn(rows,r)||!Array.isArray(row)||row.length>512)throw Error('Workbook result rows must be dense arrays.');
  count+=row.length;if(count>500000)throw Error('Workbook result exceeds 500,000 cells.');
  for(let c=0;c<row.length;c++)if(!Object.hasOwn(row,c)||typeof row[c]!=='string')throw Error('Workbook result cells must be dense strings.');
 }
}
function validateWorkbookCellEdits(value,{rows,template,structure}={}){
 validateRows(rows);
 if(!exact(value,['version','side','sheetName','sourceHash','cells'])||value.version!==1||!['a','b'].includes(value.side)||!xmlText(value.sheetName)||!value.sheetName||value.sheetName.length>255||typeof value.sourceHash!=='string'||! /^[a-f0-9]{64}$/.test(value.sourceHash)||!Array.isArray(value.cells)||value.cells.length>100000)throw Error('Invalid workbook cell edit overlay.');
 if(!exact(template,['side','sheetName','sourceHash','structural'])||!['a','b'].includes(template.side)||typeof template.structural!=='boolean'||['side','sheetName','sourceHash'].some(key=>value[key]!==template[key]))throw Error('Workbook cell edits do not match the source template.');
 if(structure!=null)validateWorkbookStructuralRows(structure,{rows,template});
 if(template.structural&&structure==null&&value.cells.length)throw Error('Typed workbook edits require unchanged row and column positions.');
 const cells=[],seen=new Set();
 for(let index=0;index<value.cells.length;index++){
  if(!Object.hasOwn(value.cells,index))throw Error('Workbook cell edits must be a dense array.');
  const cell=normalizeWorkbookCellEdit(value.cells[index]),key=cell.row+':'+cell.column;
  if(cell.row>rows.length||cell.column>rows[cell.row-1].length||seen.has(key))throw Error('Workbook cell edit is duplicated or outside the result.');
  seen.add(key);cells.push(cell);
 }
 return {version:1,side:value.side,sheetName:value.sheetName,sourceHash:value.sourceHash,cells};
}
const colNumber=name=>Array.from(name.toUpperCase()).reduce((n,char)=>n*26+char.charCodeAt(0)-64,0);
function colName(number,lower){let result='';for(;number;number=Math.floor((number-1)/26))result=String.fromCharCode(65+(number-1)%26)+result;return lower?result.toLowerCase():result;}
const identifierChar=char=>!!char&&/[\p{L}\p{N}_.$\\]/u.test(char);
/** Translate A1 references only. Formula text is not evaluated or rewritten semantically. */
function translateWorkbookFormula(formula,rowDelta,columnDelta){
 if(!xmlText(formula)||!formula.trim()||formula.length>8192||!Number.isSafeInteger(rowDelta)||!Number.isSafeInteger(columnDelta))throw Error('Invalid workbook formula translation.');
 const shifted=(n,delta,max)=>{const result=n+delta;if(!Number.isSafeInteger(result)||result<1||result>max)throw Error('Translated workbook reference is out of bounds.');return result;};
 const moveColumn=(name,absolute)=>{const n=colNumber(name);if(n<1||n>16384)throw Error('Workbook column reference is out of bounds.');return colName(shifted(n,absolute?0:columnDelta,16384),name===name.toLowerCase());};
 const moveRow=(name,absolute)=>{const n=Number(name);if(!Number.isSafeInteger(n)||n<1||n>1048576)throw Error('Workbook row reference is out of bounds.');return String(shifted(n,absolute?0:rowDelta,1048576));};
 let result='',i=0;
 while(i<formula.length){
  const ch=String.fromCodePoint(formula.codePointAt(i)),start=i;
  // Preserve sheet qualifiers (including cell-like and mixed quoted 3-D names).
  const qualified=/^(?:[\p{L}\p{N}_$\\][\p{L}\p{N}_.$\\]*|'(?:[^']|'')*')(?::(?:[\p{L}\p{N}_$\\][\p{L}\p{N}_.$\\]*|'(?:[^']|'')*'))?!/u.exec(formula.slice(i));
  if(qualified){result+=qualified[0];i+=qualified[0].length;continue;}
  // Excel doubles a delimiter inside both string literals and quoted sheet names.
  if(ch==='"'||ch==="'"){
   i++;let closed=false;while(i<formula.length){if(formula[i]===ch){if(formula[i+1]===ch){i+=2;continue;}i++;closed=true;break;}i++;}
   if(!closed)throw Error('Unterminated quoted workbook formula token.');result+=formula.slice(start,i);continue;
  }
  // Structured references and external-workbook qualifiers remain literal.
  if(ch==='['){let depth=1;i++;while(i<formula.length&&depth){if(formula[i]==="'"&&i+1<formula.length){i+=2;continue;}if(formula[i]==='[')depth++;else if(formula[i]===']')depth--;i++;}if(depth)throw Error('Unterminated bracketed workbook formula token.');result+=formula.slice(start,i);continue;}
  if(ch===']')throw Error('Unexpected closing workbook formula bracket.');
  if(ch==='#'){i++;while(i<formula.length&&/[A-Za-z0-9_/.?!]/.test(formula[i]))i++;result+=formula.slice(start,i);continue;}
  const tail=formula.slice(i);
  if(!identifierChar(formula[i-1])){
   const cols=/^(\$?)([A-Za-z]{1,3})(\s*:\s*)(\$?)([A-Za-z]{1,3})(?![\p{L}\p{N}_.$\\])/u.exec(tail);
   if(cols){result+=cols[1]+moveColumn(cols[2],!!cols[1])+cols[3]+cols[4]+moveColumn(cols[5],!!cols[4]);i+=cols[0].length;continue;}
   const rows=/^(\$?)([1-9]\d*)(\s*:\s*)(\$?)([1-9]\d*)(?![\p{L}\p{N}_.$\\])/u.exec(tail);
   if(rows){result+=rows[1]+moveRow(rows[2],!!rows[1])+rows[3]+rows[4]+moveRow(rows[5],!!rows[4]);i+=rows[0].length;continue;}
  }
  if(identifierChar(ch)){
   i+=ch.length;while(i<formula.length){const next=String.fromCodePoint(formula.codePointAt(i));if(!identifierChar(next))break;i+=next.length;}
   const token=formula.slice(start,i),match=/^(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d*)$/.exec(token);
   const following=formula.slice(i).trimStart()[0];
   // Functions, table identifiers and named ranges are not cell references.
   if(match&&following!=='('&&following!=='['&&colNumber(match[2])<=16384&&Number(match[4])<=1048576){result+=match[1]+moveColumn(match[2],!!match[1])+match[3]+moveRow(match[4],!!match[3]);}else result+=token;
   continue;
  }
  result+=ch;i+=ch.length;
 }
 return result;
}
module.exports={normalizeWorkbookCellEdit,validateWorkbookCellEdits,translateWorkbookFormula};
