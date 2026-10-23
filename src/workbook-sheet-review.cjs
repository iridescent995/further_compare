'use strict';
const {compareWorkbookTables}=require('./workbook-compare.cjs');
const {compareLegacyFormatting}=require('./legacy-formatting-compare.cjs');
const {projectSemanticFormatting,compareSemanticFormatting}=require('./workbook-semantic-formatting.cjs');
const semanticProjections=new WeakMap();
function semanticProjection(sheet){
 const source=sheet.baseFormatting||sheet.storedFormatting;if(!source)return null;
 const height=(sheet.rows||[]).length,width=(sheet.rows||[]).reduce((n,row)=>Math.max(n,row.length),0),key=sheet.format+':'+height+':'+width;
 let cache=semanticProjections.get(source);if(!cache){cache=new Map();semanticProjections.set(source,cache);}if(!cache.has(key))cache.set(key,projectSemanticFormatting(source,{format:sheet.format,height,width}));return cache.get(key);
}
const {compareWorkbookLayouts}=require('./workbook-layout.cjs');
const {compareConditionalFormatting}=require('./workbook-conditional.cjs');
const {compareNumberFormats}=require('./workbook-number-formats.cjs');
const REVIEW_LIMITS=Object.freeze({sheets:1000,cells:1000000,text:64*1024*1024,nodes:8000000});
function names(sheets){
 if(!Array.isArray(sheets)||sheets.length>REVIEW_LIMITS.sheets)throw Error('Workbook sheet inventory exceeds limits.');
 const seen=new Set();for(const sheet of sheets){if(!sheet||typeof sheet.name!=='string'||!sheet.name||seen.has(sheet.name))throw Error('Workbook sheet names are missing or ambiguous.');seen.add(sheet.name);}return seen;
}
function visibility(sheet){const v=sheet?.metadata?.visibility;return v?.available===true&&['visible','hidden','veryHidden'].includes(v.value)?v.value:null;}
function createSheetInventory(a,b){
 names(a);names(b);if(a.length+b.length>REVIEW_LIMITS.sheets)throw Error('Workbook sheet inventory exceeds 1,000 entries.');
 const right=new Map(b.map((s,i)=>[s.name,i])),left=new Set(a.map(s=>s.name));
 const matchedA=a.filter(s=>right.has(s.name)).map(s=>s.name),matchedB=b.filter(s=>left.has(s.name)).map(s=>s.name),rankB=new Map(matchedB.map((name,i)=>[name,i])),rankA=new Map(matchedA.map((name,i)=>[name,i]));
 const row=(name,ai,bi)=>{const x=ai===null?null:a[ai],y=bi===null?null:b[bi],va=visibility(x),vb=visibility(y),unsupported=[x,y].some(s=>s&&s.metadata?.kind&&s.metadata.kind!=='worksheet');return {id:'sheet-'+(ai===null?'r'+bi:'l'+ai),name,aIndex:ai,bIndex:bi,orderChanged:ai!==null&&bi!==null&&rankA.get(name)!==rankB.get(name),visibility:ai===null||bi===null?'unavailable':va===null||vb===null?'unavailable':va===vb?'same':'different',leftVisibility:va,rightVisibility:vb,status:ai===null?'right-only':bi===null?'left-only':unsupported?'unavailable':'not-compared',reason:unsupported?'This sheet type cannot be compared.':null};};
 return [...a.map((s,i)=>row(s.name,i,right.has(s.name)?right.get(s.name):null)),...b.flatMap((s,i)=>left.has(s.name)?[]:[row(s.name,null,i)])];
}
function compareSheetCells(a,b,options={}){
 const left=(a?.rows||[]).slice(),right=(b?.rows||[]).slice(),headers=options.headers?[left.shift()||[],right.shift()||[]]:null;
 const keys=String(options.keys||'').trim()?String(options.keys).split(',').map(v=>{if(!/^\s*[1-9]\d*\s*$/.test(v))throw Error('Key columns must be positive numbers separated by commas.');return Number(v)-1;}):[];
 const offset=headers?1:0,mode=options.workbookMode||'values';
 const mixedFormatting=options.compareFormatting===true&&a?.format!==b?.format&&['xls','xlsb','xlsx'].includes(a?.format)&&['xls','xlsb','xlsx'].includes(b?.format);
 const semanticA=mixedFormatting?semanticProjection(a):null,semanticB=mixedFormatting?semanticProjection(b):null;
 const legacyFormatting=Boolean(a?.storedFormatting||b?.storedFormatting),sameFormattingDialect=!legacyFormatting||Boolean(a?.storedFormatting&&b?.storedFormatting&&a.format===b.format);
 const formattingReview=mixedFormatting?compareSemanticFormatting(semanticA?.storedFormatting,semanticB?.storedFormatting,{formatA:a.format,formatB:b.format}):options.compareFormatting&&legacyFormatting?compareLegacyFormatting(a?.storedFormatting,b?.storedFormatting,{formatA:a?.format,formatB:b?.format}):null;
 const comparisonOptions={mode,formulasA:a?.formulaRows||[],formulasB:b?.formulaRows||[],formulaIdentitiesA:a?.formulaIdentityRows??null,formulaIdentitiesB:b?.formulaIdentityRows??null,compareFormatting:options.compareFormatting===true,stylesA:a?.styleRows||[],stylesB:b?.styleRows||[],styleStatusA:a?.styleStatusRows||[],styleStatusB:b?.styleStatusRows||[],formattingAvailableA:sameFormattingDialect&&a?.styleMatrixAvailable!==false&&a?.capabilities?.formattingComparison!==false&&Array.isArray(a?.styleRows),formattingAvailableB:sameFormattingDialect&&b?.styleMatrixAvailable!==false&&b?.capabilities?.formattingComparison!==false&&Array.isArray(b?.styleRows)};
 if(mixedFormatting)Object.assign(comparisonOptions,{stylesA:semanticA?.styleRows||[],stylesB:semanticB?.styleRows||[],styleStatusA:semanticA?.styleStatusRows||[],styleStatusB:semanticB?.styleStatusRows||[],formattingAvailableA:!!semanticA&&semanticA.styleMatrixAvailable!==false,formattingAvailableB:!!semanticB&&semanticB.styleMatrixAvailable!==false});
 const result=compareWorkbookTables(left,right,{...comparisonOptions,keyColumns:keys,headerOffset:offset});
 const headerOptions={...comparisonOptions};for(const key of ['formulasA','formulasB','formulaIdentitiesA','formulaIdentitiesB','stylesA','stylesB','styleStatusA','styleStatusB'])if(Array.isArray(headerOptions[key]))headerOptions[key]=headerOptions[key].slice(0,1);
 const headerResult=headers?compareWorkbookTables([headers[0]],[headers[1]],headerOptions):null;
 let unavailableCells=0,unavailableFormulas=0;const formulaReasons=new Set();
 for(const [compared,rowOffset]of [[result,offset],...(headerResult?[[headerResult,0]]:[])])for(const row of compared.rows)for(const cell of row.cells){
  if(cell.formulaUnavailable){unavailableFormulas++;if(cell.formulaUnavailableReason)formulaReasons.add(cell.formulaUnavailableReason);for(const [sheet,key]of [[a,'leftIndex'],[b,'rightIndex']]){const status=row[key]===null?null:sheet?.formulaStatusRows?.[row[key]+rowOffset]?.[cell.column];if(status?.available===false&&status.reason)formulaReasons.add(status.reason);}}
  if(mode!=='formulas'&&[[a,'leftIndex'],[b,'rightIndex']].some(([sheet,key])=>row[key]!==null&&sheet?.typedRows?.[row[key]+rowOffset]?.[cell.column]?.cacheUnavailable)){cell.equal=false;compared.equal=false;cell.cacheUnavailable=true;if(row.status==='equal')row.status='unknown';unavailableCells++;}
 }
 const headerCells=headerResult?.rows.flatMap(row=>row.cells)||[],headerUnavailable=headerCells.some(cell=>cell.formulaUnavailable||cell.cacheUnavailable||cell.formattingUnavailable),headerDifferent=headerCells.some(cell=>!cell.equal&&!cell.formulaUnavailable&&!cell.cacheUnavailable&&(!cell.formattingUnavailable||cell.knownDifference));
 return {result,headers,headerResult,headerDifferent,formattingReview,unavailableCells,unavailableFormulas,formulaReasons:[...formulaReasons].slice(0,8),headerUnavailable,headerEqual:headerResult?.equal??true};
}
function compareSheetPair(a,b,options={}){
 const {result,headers,headerResult,formattingReview,unavailableCells,unavailableFormulas,headerEqual,headerUnavailable,headerDifferent}=compareSheetCells(a,b,options),reasons=[];
 if(result.duplicates.length)reasons.push('Duplicate keys prevent unambiguous row comparison.');
 if(headerUnavailable)reasons.push('Header comparison is unavailable for the selected criteria.');
 if(unavailableCells)reasons.push('Stored formula results are unavailable.');
 if(unavailableFormulas)reasons.push('Formula expressions cannot be compared reliably.');
 if(options.workbookMode==='formulas'&&[a,b].some(s=>s.capabilities?.formulaComparison===false))reasons.push('Formula comparison is unavailable for a selected sheet.');
 let different=headerDifferent||result.rows.some(row=>row.status!=='equal'&&(row.leftIndex===null||row.rightIndex===null||row.cells.some(cell=>!cell.equal&&!cell.cacheUnavailable&&!cell.formulaUnavailable&&(!cell.formattingUnavailable||cell.knownDifference))));
 if(formattingReview?.differences.length||formattingReview?.beyondDomain?.some(region=>region.nonrepresentable))different=true;
 if(formattingReview&&!formattingReview.available)reasons.push(formattingReview.reason||'Stored formatting comparison is unavailable.');
 const details={...(formattingReview?{formattingChanges:formattingReview.differences.length+(formattingReview.beyondDomain?.filter(region=>region.nonrepresentable).length||0),formattingTruncated:formattingReview.truncated,...(formattingReview.domain?{formattingDomain:formattingReview.domain}:{})}:{}),headersChanged:!headerEqual,changedRows:result.rows.filter(row=>row.status!=='equal').length,unavailableCells,unavailableFormulas};
 if(options.compareFormatting&&([a,b].some(s=>s.capabilities?.formattingComparison===false||!Array.isArray(s.styleRows))||result.rows.some(row=>row.cells.some(cell=>cell.formattingUnavailable))||headerResult?.rows.some(row=>row.cells.some(cell=>cell.formattingUnavailable))))reasons.push('Formatting metadata is unavailable for one or more properties.');
 if(options.compareLayout){if(!a.layout||!b.layout)reasons.push('Layout metadata is unavailable.');else{const compared=compareWorkbookLayouts(a.layout,b.layout);details.layoutChanges=compared.changes.length;different||=!compared.equal;}}
 for(const [enabled,key,compare,label]of [[options.compareConditionalRules,'conditionalRules',compareConditionalFormatting,'Conditional rules'],[options.compareNumberFormats,'numberFormats',compareNumberFormats,'Number formats']])if(enabled){if(!a[key]||!b[key]){reasons.push(label+' metadata is unavailable.');continue;}const compared=compare(a[key],b[key]);if(!compared.available)reasons.push(label+': '+compared.reason);else{details[key+'Changes']=compared.differences.length;different||=!compared.equal;}}
 return {status:reasons.length?'unavailable':different?'different':'same',different,reasons,counts:details};
}
// Account once per original workbook, not per selected pair. Worker termination
// is the cancellation boundary while an individual existing comparator runs.
function validateReviewBudget(a,b){
 names(a);names(b);let cells=0,text=0,nodes=0;const seen=new Set();
 function visit(v){if(++nodes>REVIEW_LIMITS.nodes)throw Error('Workbook review node budget exceeded.');if(typeof v==='string'){text+=v.length;if(text>REVIEW_LIMITS.text)throw Error('Workbook review text budget exceeded.');return;}if(v===null||typeof v!=='object')return;if(seen.has(v))return;seen.add(v);for(const value of Object.values(v))visit(value);}
 for(const sheet of [...a,...b]){for(const row of sheet.rows||[]){if(!Array.isArray(row))throw Error('Invalid worksheet rows.');cells+=row.length;if(cells>REVIEW_LIMITS.cells)throw Error('Workbook review cell budget exceeded.');}visit(sheet);}return {cells,text,nodes};
}
module.exports={createSheetInventory,compareSheetCells,compareSheetPair,validateReviewBudget,REVIEW_LIMITS};
