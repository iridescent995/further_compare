'use strict';
// Structural relocation differs from copying: dollar-anchored references move too.
const LIMITS={row:1048576,column:16384};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const fail=message=>{throw Error('Workbook structural formula: '+message);};
function normalizeWorkbookStructuralOperation(value){
 if(!plain(value)||Reflect.ownKeys(value).length!==4||!['operation','axis','index','count'].every(key=>Object.hasOwn(value,key))||!['insert','delete'].includes(value.operation)||!Object.hasOwn(LIMITS,value.axis))fail('invalid operation');
 const max=LIMITS[value.axis];if(!Number.isSafeInteger(value.index)||value.index<1||value.index>max||!Number.isSafeInteger(value.count)||value.count<1||value.count>max||value.index+value.count-1>max)fail('operation exceeds worksheet bounds');
 return {operation:value.operation,axis:value.axis,index:value.index,count:value.count};
}
const ident=char=>!!char&&/[\p{L}\p{N}_.$\\]/u.test(char);
const columnNumber=text=>Array.from(text.toUpperCase()).reduce((number,char)=>number*26+char.charCodeAt(0)-64,0);
function columnName(number,lower){let name='';for(;number;number=Math.floor((number-1)/26))name=String.fromCharCode(65+(number-1)%26)+name;return lower?name.toLowerCase():name;}
function parsePoint(text,kind){
 const match=(kind==='cell'?/^(\$?)([a-z]{1,3})(\$?)([1-9]\d*)$/i:kind==='column'?/^(\$?)([a-z]{1,3})$/i:/^(\$?)([1-9]\d*)$/).exec(text);
 if(!match)return null;
 const point=kind==='cell'?{column:columnNumber(match[2]),row:Number(match[4]),colAbsolute:match[1],rowAbsolute:match[3],lower:match[2]===match[2].toLowerCase()}:kind==='column'?{column:columnNumber(match[2]),colAbsolute:match[1],lower:match[2]===match[2].toLowerCase()}:{row:Number(match[2]),rowAbsolute:match[1]};
 for(const axis of ['row','column'])if(point[axis]!==undefined&&(!Number.isSafeInteger(point[axis])||point[axis]<1||point[axis]>LIMITS[axis]))return null;
 return point;
}
function printPoint(point,kind){return (kind==='row'?'':point.colAbsolute+columnName(point.column,point.lower))+(kind==='column'?'':point.rowAbsolute+point.row);}
function shiftInterval(first,last,op){
 const reverse=first>last,low=Math.min(first,last),high=Math.max(first,last),end=op.index+op.count-1;let startResult=low,endResult=high;
 if(op.operation==='insert'){if(op.index<=low)startResult+=op.count;if(op.index<=high)endResult+=op.count;}
 else if(high<op.index){}else if(low>end){startResult-=op.count;endResult-=op.count;}else{
  if(low>=op.index&&high<=end)return null;
  startResult=low<op.index?low:op.index;
  endResult=high>end?high-op.count:op.index-1;
 }
 if(startResult<1||endResult>LIMITS[op.axis])fail('shifted reference exceeds worksheet bounds');
 return reverse?[endResult,startResult]:[startResult,endResult];
}
// A reference token may be a cell, rectangular range, or whole row/column range.
function referenceAt(text){
 const patterns=[['cell',/^(\$?[a-z]{1,3}\$?[1-9]\d*)(\s*:\s*)(\$?[a-z]{1,3}\$?[1-9]\d*)(?![\p{L}\p{N}_.$\\])/iu],['column',/^(\$?[a-z]{1,3})(\s*:\s*)(\$?[a-z]{1,3})(?![\p{L}\p{N}_.$\\])/iu],['row',/^(\$?[1-9]\d*)(\s*:\s*)(\$?[1-9]\d*)(?![\p{L}\p{N}_.$\\])/u],['cell',/^(\$?[a-z]{1,3}\$?[1-9]\d*)(?![\p{L}\p{N}_.$\\])/iu]];
 for(const [kind,pattern] of patterns){const match=pattern.exec(text);if(!match)continue;const first=parsePoint(match[1],kind),last=match[3]?parsePoint(match[3],kind):null;if(first&&(!match[3]||last))return {raw:match[0],kind,first,last,separator:match[2]};}
 return null;
}
function bracketEnd(text,start){let depth=1,i=start+1;for(;i<text.length&&depth;i++){if(text[i]==="'"&&i+1<text.length){i++;continue;}if(text[i]==='[')depth++;else if(text[i]===']')depth--;}if(depth)fail('unterminated structured or external reference');return i;}
const qualifierPattern=/^(?:(?:\[[^\]\r\n]+\])?[\p{L}\p{N}_$\\][\p{L}\p{N}_.$\\]*|'(?:[^']|'')*')(?::(?:[\p{L}\p{N}_$\\][\p{L}\p{N}_.$\\]*|'(?:[^']|'')*'))?!/u;
function sheetIdentity(qualifier){
 const raw=qualifier.slice(0,-1);if(raw.includes('['))return {external:true};
 const parts=[];let start=0,quoted=false;
 for(let i=0;i<raw.length;i++){if(raw[i]==="'"){if(quoted&&raw[i+1]==="'"){i++;continue;}quoted=!quoted;}else if(raw[i]===':'&&!quoted){parts.push(raw.slice(start,i));start=i+1;}}
 parts.push(raw.slice(start));const decode=part=>part.startsWith("'")&&part.endsWith("'")?part.slice(1,-1).replace(/''/g,"'"):part;
 let names=parts.map(decode);if(names.length===1&&names[0].includes(':'))names=names[0].split(':');
 if(quoted||names.length>2||names.some(name=>!name||name.length>31||/[\x00-\x1f\[\]:*?\/\\]/.test(name)))fail('invalid worksheet qualifier');
 if(names.length===2&&names[0].toLowerCase()!==names[1].toLowerCase())return {span:names};
 return {sheet:names[0]};
}
// A range may repeat its worksheet qualifier on the second endpoint.
function qualifiedRangeAt(text,formulaSheet){
 const leftPrefix=qualifierPattern.exec(text)?.[0]||'',body=text.slice(leftPrefix.length);
 if(!leftPrefix)return null;
 for(const [kind,pattern] of [['cell',/^(\$?[a-z]{1,3}\$?[1-9]\d*|#REF!)(\s*:\s*)/i]]){
  const left=pattern.exec(body);if(!left)continue;
  const rest=body.slice(left[0].length),rightPrefix=qualifierPattern.exec(rest)?.[0];if(!rightPrefix)continue;
  const rightPattern=kind==='cell'?/^(\$?[a-z]{1,3}\$?[1-9]\d*|#REF!)(?![\p{L}\p{N}_.$\\])/iu:kind==='column'?/^(\$?[a-z]{1,3})(?![\p{L}\p{N}_.$\\])/iu:/^(\$?[1-9]\d*)(?![\p{L}\p{N}_.$\\])/u;
  const right=rightPattern.exec(rest.slice(rightPrefix.length));if(!right)continue;
  const first=parsePoint(left[1],kind),last=parsePoint(right[1],kind);if((!first&&left[1].toUpperCase()!=='#REF!')||(!last&&right[1].toUpperCase()!=='#REF!'))continue;
  const a=leftPrefix?sheetIdentity(leftPrefix):{sheet:formulaSheet},b=sheetIdentity(rightPrefix);
  if(a.span||b.span)fail('independently qualified 3-D range endpoints are not supported');
  if(a.external||b.external){if(!a.external||!b.external||leftPrefix.toLowerCase()!==rightPrefix.toLowerCase())fail('range endpoints must refer to the same worksheet');}
  else if(a.sheet.toLowerCase()!==b.sheet.toLowerCase())fail('range endpoints must refer to the same worksheet');
  const length=leftPrefix.length+left[0].length+rightPrefix.length+right[0].length;
  return {raw:text.slice(0,length),length,kind,first,last,leftPrefix,rightPrefix,separator:left[2],identity:a};
 }
 return null;
}
/**
 * Rewrite statically addressed A1 references after one insert/delete operation.
 * Named formulas and table references are intentionally untouched: the package
 * caller must separately update their definitions and structural metadata.
 * Strings (including INDIRECT/HYPERLINK arguments) retain their literal semantics.
 * Genuine 3-D sheet spans retain shared coordinates for single-sheet row/column
 * operations, as observed in Excel. Cross-sheet range operands remain unsupported.
 */
function transformWorkbookStructuralFormula(formula,options){
 if(!plain(options)||Reflect.ownKeys(options).length!==6||!['operation','axis','index','count','formulaSheet','targetSheet'].every(key=>Object.hasOwn(options,key)))fail('invalid transformation context');
 const op=normalizeWorkbookStructuralOperation({operation:options.operation,axis:options.axis,index:options.index,count:options.count});
 for(const key of ['formulaSheet','targetSheet'])if(typeof options[key]!=='string'||!options[key]||options[key].length>31||/[\x00-\x1f\[\]:*?\/\\]/.test(options[key]))fail('invalid worksheet name');
 if(typeof formula!=='string'||!formula.trim()||formula.length>8192||/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(formula))fail('invalid formula text');
 const matches=sheet=>sheet.toLowerCase()===options.targetSheet.toLowerCase();let output='',i=0;
 while(i<formula.length){
  const start=i,char=String.fromCodePoint(formula.codePointAt(i));
  if(char==='"'){i++;let closed=false;while(i<formula.length){if(formula[i]==='"'){if(formula[i+1]==='"'){i+=2;continue;}i++;closed=true;break;}i++;}if(!closed)fail('unterminated formula string');output+=formula.slice(start,i);continue;}
  const qualified=qualifierPattern.exec(formula.slice(i));
  if(qualified||!ident(String.fromCodePoint(formula.codePointAt(Math.max(0,i-1))))||i===0){
   const repeated=qualifiedRangeAt(formula.slice(i),options.formulaSheet);
   if(repeated){
    const after=formula.slice(i+repeated.length).trimStart();if(formula.slice(0,i).trimEnd().endsWith(':')||after.startsWith(':')||after.startsWith('!'))fail('ambiguous range endpoints');
    let rewritten=repeated.raw;
    if(!repeated.identity.external&&matches(repeated.identity.sheet)){
     // Repeated qualifiers form independent range-operator operands. Excel
     // retains a deleted endpoint as #REF! rather than shrinking the interval.
     const endpoint=(point,prefix)=>{if(!point)return prefix+'#REF!';const moved=shiftInterval(point[op.axis],point[op.axis],op);return prefix+(moved===null?'#REF!':printPoint({...point,[op.axis]:moved[0]},repeated.kind));};
     rewritten=endpoint(repeated.first,repeated.leftPrefix)+repeated.separator+endpoint(repeated.last,repeated.rightPrefix);
    }
    output+=rewritten;i+=repeated.length;continue;
   }
   const prefix=qualified?.[0]||'',identity=prefix?sheetIdentity(prefix):{sheet:options.formulaSheet},offset=i+prefix.length,ref=referenceAt(formula.slice(offset));
   if(ref&&!['(','['].includes(formula.slice(offset+ref.raw.length).trimStart()[0])){
    const before=formula.slice(0,i).trimEnd(),after=formula.slice(offset+ref.raw.length).trimStart();
    if(before.endsWith(':')||after.startsWith(':')||after.startsWith('!'))fail('independently qualified or ambiguous range endpoints are not supported');
    let rewritten=ref.raw;
    if(!identity.external&&!identity.span&&matches(identity.sheet)&&ref.first[op.axis]!==undefined){const interval=shiftInterval(ref.first[op.axis],(ref.last||ref.first)[op.axis],op);if(interval===null)rewritten='#REF!';else{const first={...ref.first,[op.axis]:interval[0]},last=ref.last&&{...ref.last,[op.axis]:interval[1]};rewritten=printPoint(first,ref.kind)+(last?ref.separator+printPoint(last,ref.kind):'');}}
    output+=prefix+rewritten;i=offset+ref.raw.length;continue;
   }
   if(prefix){output+=prefix;i=offset;continue;}
  }
  if(char==="'")fail('unrecognized quoted sheet reference');
  if(char==='['){i=bracketEnd(formula,i);output+=formula.slice(start,i);continue;}
  if(char===']'||char==='!')fail('unrecognized worksheet reference');
  if(char==='#'){i++;while(i<formula.length&&/[A-Za-z0-9_/.?!]/.test(formula[i]))i++;output+=formula.slice(start,i);continue;}
  if(ident(char)){i+=char.length;while(i<formula.length){const next=String.fromCodePoint(formula.codePointAt(i));if(!ident(next))break;i+=next.length;}output+=formula.slice(start,i);continue;}
  output+=char;i+=char.length;
 }
 if(output.length>8192)fail('rewritten formula exceeds 8,192 characters');
 return output;
}
module.exports={normalizeWorkbookStructuralOperation,transformWorkbookStructuralFormula};
