import {isValidatedDynamicCell} from './workbook-dynamic-arrays.js';
import formulaCore from './workbook-structural-formulas.cjs';
const MAIN=new Set(['http://schemas.openxmlformats.org/spreadsheetml/2006/main','http://purl.oclc.org/ooxml/spreadsheetml/main']);
const children=(node,name,ns)=>Array.from(node.childNodes).filter(n=>n.nodeType===1&&(!name||n.localName===name)&&(!ns||n.namespaceURI===ns));
const fail=message=>{throw Error('Workbook array formulas: '+message);};
function point(ref){const m=/^([A-Z]{1,3})([1-9]\d*)$/.exec(ref||'');if(!m)fail('invalid cell reference');let column=0;for(const c of m[1])column=column*26+c.charCodeAt(0)-64;const row=Number(m[2]);if(!Number.isSafeInteger(row)||row>1048576||column>16384)fail('cell reference exceeds worksheet bounds');return {row,column};}
function range(ref){const parts=(ref||'').split(':');if(parts.length>2)fail('invalid array range');const first=point(parts[0]),last=point(parts[1]||parts[0]);if(first.row>last.row||first.column>last.column)fail('reversed array range');return {first,last};}
function address({row,column}){let name='';for(;column;column=Math.floor((column-1)/26))name=String.fromCharCode(65+(column-1)%26)+name;return name+row;}
const ref=b=>address(b.first)+(address(b.first)===address(b.last)?'':':'+address(b.last));
const key=p=>p.row+':'+p.column;
const overlaps=(a,b)=>a.first.row<=b.last.row&&b.first.row<=a.last.row&&a.first.column<=b.last.column&&b.first.column<=a.last.column;
function move(bounds,op){if(!bounds)return null;const low=bounds.first[op.axis],high=bounds.last[op.axis],end=op.index+op.count-1;let shift=0;
 if(op.operation==='insert'){if(op.index>low&&op.index<=high)fail('cannot insert inside an array formula group');if(op.index<=low)shift=op.count;}
 else if(end<low)shift=-op.count;else if(op.index<=high){if(op.index<=low&&end>=high)return null;fail('cannot delete part of an array formula group');}
 const result={first:{...bounds.first},last:{...bounds.last}};result.first[op.axis]+=shift;result.last[op.axis]+=shift;if(result.last[op.axis]>(op.axis==='row'?1048576:16384))fail('shifted array exceeds worksheet bounds');return result;
}
/** Legacy array groups remain groups; no scalar expansion or formula evaluation. */
export function prepareWorkbookArrayFormulas(document,operations=[],dynamicCapability=null){
 const root=document?.documentElement,ns=root?.namespaceURI;if(root?.localName!=='worksheet'||!MAIN.has(ns))fail('invalid worksheet');if(!Array.isArray(operations)||operations.length>1000)fail('invalid operation journal');const ops=operations.map(formulaCore.normalizeWorkbookStructuralOperation);
 const data=children(root,'sheetData',ns);if(data.length!==1)fail('requires one sheetData');const cells=new Map(),groups=[],rows=new Set(),known=new WeakSet();
 for(const row of children(data[0],'row',ns)){const rowNumber=Number(row.getAttribute('r'));if(!/^[1-9]\d*$/.test(row.getAttribute('r')||'')||rowNumber>1048576||rows.has(rowNumber))fail('invalid or duplicate row');rows.add(rowNumber);
  for(const cell of children(row,'c',ns)){if(cells.size>=500000)fail('worksheet exceeds 500,000 cells');const p=point(cell.getAttribute('r'));if(p.row!==rowNumber||cells.has(key(p)))fail('invalid or duplicate cell');const formulas=children(cell,'f',ns);if(formulas.length>1)fail('duplicate formula');const f=formulas[0];cells.set(key(p),{cell,formula:f});if(f?.getAttribute('t')!=='array')continue;
   if(children(f).length||!f.textContent.trim()||f.textContent.length>8192)fail('invalid array expression');for(const a of Array.from(f.attributes))if(a.namespaceURI!=='http://www.w3.org/2000/xmlns/'&&(a.namespaceURI||!['t','ref','aca','ca','bx'].includes(a.localName)))fail('unsupported array formula attribute');for(const flag of ['aca','ca','bx'])if(f.hasAttribute(flag)&&!['0','1','true','false'].includes(f.getAttribute(flag)))fail('invalid array flag');
   const bounds=range(f.getAttribute('ref'));if(key(p)!==key(bounds.first))fail('array formula must occupy the top-left cell');groups.push({formula:f,bounds,members:[]});known.add(f);
  }
 }
 const occupied=new Set();let area=0;const merges=Array.from(root.getElementsByTagNameNS(ns,'mergeCell'),n=>range(n.getAttribute('ref')));
 if(groups.length*merges.length>1000000)fail('array/merge checks exceed work limit');
 for(const group of groups){const b=group.bounds;area+=(b.last.row-b.first.row+1)*(b.last.column-b.first.column+1);if(area>500000)fail('array ranges exceed 500,000 cells');if(merges.some(m=>overlaps(m,b)))fail('array overlaps merged cells');
  for(let row=b.first.row;row<=b.last.row;row++)for(let column=b.first.column;column<=b.last.column;column++){const id=row+':'+column;if(occupied.has(id))fail('overlapping array groups');occupied.add(id);const entry=cells.get(id);if(!entry)continue;if(entry.cell.hasAttribute('vm')||(entry.cell.hasAttribute('cm')&&!isValidatedDynamicCell(dynamicCapability,entry.cell)))fail('metadata-backed spill arrays require a separate handler');if(entry.formula&&entry.formula!==group.formula)fail('array contains another formula');if(children(entry.cell,'is',ns).length||entry.cell.getAttribute('t')==='inlineStr')fail('array contains inline text');if(entry.cell.hasAttribute('t')&&!['n','s','str','b','e'].includes(entry.cell.getAttribute('t')))fail('unsupported array cached result type');if(children(entry.cell,'v',ns).length>1)fail('duplicate array cache');group.members.push(entry.cell);}
 }
 // Validate every future group boundary before touching the caller's DOM.
 if(groups.length*ops.length>1000000)fail('array journal exceeds work limit');let bounds=groups.map(g=>g.bounds);for(const op of ops)bounds=bounds.map(b=>move(b,op));let cursor=0,current=groups.map(g=>g.bounds);
 return {groups:groups.length,assertDisjointRanges(refs){if(groups.length*refs.length>1000000)fail('array/table checks exceed work limit');for(const value of refs){const other=range(value);if(groups.some(group=>overlaps(group.bounds,other)))fail('array overlaps a table');}},has:formula=>known.has(formula),invalidateCaches(){for(const group of groups)for(const cell of group.members){for(const value of children(cell,'v',ns))value.remove();cell.removeAttribute('t');}},applyNext(){if(cursor>=ops.length)fail('operation journal exhausted');const stage=current.map(b=>move(b,ops[cursor]));cursor++;current=stage;for(let i=0;i<groups.length;i++)if(stage[i])groups[i].formula.setAttribute('ref',ref(stage[i]));}};
}
