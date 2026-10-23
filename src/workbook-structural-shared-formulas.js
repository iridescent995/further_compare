import cellEdits from './workbook-cell-edits.cjs';
const {translateWorkbookFormula}=cellEdits;
const MAIN=new Set(['http://schemas.openxmlformats.org/spreadsheetml/2006/main','http://purl.oclc.org/ooxml/spreadsheetml/main']);
const children=(node,name,ns)=>Array.from(node.childNodes).filter(child=>child.nodeType===1&&(!name||child.localName===name)&&(!ns||child.namespaceURI===ns));
const fail=message=>{throw Error('Workbook shared formulas: '+message);};
function point(ref){const match=/^([A-Z]{1,3})([1-9]\d*)$/.exec(ref||'');if(!match)fail('invalid cell reference');let column=0;for(const char of match[1])column=column*26+char.charCodeAt(0)-64;const row=Number(match[2]);if(!Number.isSafeInteger(row)||row>1048576||column>16384)fail('cell reference out of bounds');return {row,column};}
const key=point=>point.row+':'+point.column;
function sharedId(formula){const value=formula.getAttribute('si');if(!/^\d+$/.test(value||'')||!Number.isSafeInteger(Number(value))||Number(value)>4294967295)fail('missing or invalid shared index');return Number(value);}
function range(ref){const parts=(ref||'').split(':');if(parts.length>2)fail('invalid master range');const first=point(parts[0]),last=point(parts[1]||parts[0]);if(first.row>last.row||first.column>last.column)fail('reversed master range');return {first,last,area:(last.row-first.row+1)*(last.column-first.column+1)};}
function hasStructuredReferences(formula){
 for(let i=0;i<formula.length;i++){
  if(formula[i]==='"'||formula[i]==="'"){const quote=formula[i];for(i++;i<formula.length;i++){if(formula[i]===quote){if(formula[i+1]===quote){i++;continue;}break;}}continue;}
  if(formula[i]==='['){const external=/^\[[^\]\r\n]+\][\p{L}\p{N}_.$\\]*!/u.exec(formula.slice(i));if(external){i+=external[0].length-1;continue;}return true;}
 }
 return false;
}
/** Expand coherent shared groups atomically; cell values/styles remain owned by each cell. */
export function expandWorkbookSharedFormulas(document){
 const root=document?.documentElement,ns=root?.namespaceURI;if(root?.localName!=='worksheet'||!MAIN.has(ns))fail('invalid worksheet');const data=children(root,'sheetData',ns);if(data.length!==1)fail('requires one sheetData');
 const cells=new Map(),groups=new Map(),rowIds=new Set();let scanned=0;
 for(const row of children(data[0],'row',ns)){const number=Number(row.getAttribute('r'));if(!/^[1-9]\d*$/.test(row.getAttribute('r')||'')||!Number.isSafeInteger(number)||number>1048576||rowIds.has(number))fail('invalid or duplicate row');rowIds.add(number);
  for(const cell of children(row,'c',ns)){if(++scanned>500000)fail('worksheet exceeds 500,000 cells');const coordinate=point(cell.getAttribute('r')),id=key(coordinate);if(coordinate.row!==number||cells.has(id))fail('invalid or duplicate cell');const formulas=children(cell,'f',ns);if(formulas.length>1)fail('duplicate formula in a cell');const formula=formulas[0],entry={cell,formula,coordinate};cells.set(id,entry);if(formula?.getAttribute('t')!=='shared')continue;
   if(cell.hasAttribute('cm')||cell.hasAttribute('vm'))fail('metadata-backed shared formulas require a separate handler');
   if(children(formula).length||Array.from(formula.attributes).some(attribute=>attribute.namespaceURI!=='http://www.w3.org/2000/xmlns/'&&(attribute.namespaceURI||!['t','si','ref','ca','bx'].includes(attribute.localName))))fail('unsupported shared formula attributes');
   for(const flag of ['ca','bx'])if(formula.hasAttribute(flag)&&!['0','1','true','false'].includes(formula.getAttribute(flag)))fail('invalid shared formula flag');
   const si=sharedId(formula);entry.si=si;if(!groups.has(si))groups.set(si,{members:[],master:null});const group=groups.get(si);group.members.push(entry);
   if(formula.textContent.trim()){if(group.master)fail('ambiguous shared formula master');if(!formula.hasAttribute('ref'))fail('master is missing its range');if(formula.textContent.length>8192)fail('master exceeds formula length limit');group.master=entry;}else if(formula.hasAttribute('ref'))fail('empty master or ambiguous follower range');
  }
 }
 const occupied=new Set(),updates=[];let area=0,work=0,output=0;
 for(const group of groups.values()){
  if(!group.master)fail('shared formula master is missing');if(hasStructuredReferences(group.master.formula.textContent))fail('structured references require table-aware formula expansion');const bounds=range(group.master.formula.getAttribute('ref'));area+=bounds.area;if(area>500000)fail('shared ranges exceed 500,000 cells');
  work+=group.members.length*group.master.formula.textContent.length;if(work>32*1024*1024)fail('shared expansion exceeds 32 MiB work budget');
  // A shared range may contain holes or independently defined ordinary formulas.
  // Its actual shared members must belong to this master; ranges cannot overlap.
  for(let row=bounds.first.row;row<=bounds.last.row;row++)for(let column=bounds.first.column;column<=bounds.last.column;column++){const id=row+':'+column;if(occupied.has(id))fail('overlapping shared ranges');occupied.add(id);}
  for(const entry of group.members){const {row,column}=entry.coordinate;if(row<bounds.first.row||row>bounds.last.row||column<bounds.first.column||column>bounds.last.column)fail('shared follower is outside its master range');
   const text=translateWorkbookFormula(group.master.formula.textContent,row-group.master.coordinate.row,column-group.master.coordinate.column);if(text.length>8192)fail('expanded formula exceeds length limit');output+=new TextEncoder().encode(text).length;if(output>32*1024*1024)fail('expanded formulas exceed 32 MiB');updates.push({formula:entry.formula,text});
  }
 }
 for(const {formula,text} of updates){formula.removeAttribute('t');formula.removeAttribute('si');formula.removeAttribute('ref');formula.textContent=text;}
 return {expandedCells:updates.length,groups:groups.size};
}
