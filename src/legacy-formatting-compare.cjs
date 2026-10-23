'use strict';
const {workbookStyleSignature}=require('./workbook-compare.cjs');
const LABELS=Object.freeze({numFmt:'Number format',font:'Font',fill:'Fill',border:'Border',alignment:'Alignment',protection:'Protection',richText:'Rich text'});
const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const MAX_WORK=2000000,MAX_DIFFERENCES=200;
// Compare the full native sheet domain with sparse bands. Neither worksheet
// dimensions nor the cached-value grid delimit stored default formatting.
function compareLegacyFormatting(a,b,{formatA,formatB,region}={}){
 const differences=[];let available=true,truncated=false,work=0;const reasons=new Set();
 const unknown=reason=>{available=false;if(reasons.size<8)reasons.add(String(reason).slice(0,8192));};
 const finish=()=>({available,equal:available&&differences.length===0,differences,reason:reasons.size?[...reasons].join(' '):null,truncated});
 if(!['xls','xlsb'].includes(formatA)||formatA!==formatB){unknown('Stored formatting comparison is unavailable across unqualified formats.');return finish();}
 const maxRows=formatA==='xls'?65536:1048576,maxColumns=formatA==='xls'?256:16384;
 const bounds=region||{firstRow:0,lastRow:maxRows-1,firstColumn:0,lastColumn:maxColumns-1};
 if(!plain(bounds)||![bounds.firstRow,bounds.lastRow,bounds.firstColumn,bounds.lastColumn].every(Number.isInteger)||bounds.firstRow<0||bounds.lastRow>=maxRows||bounds.firstColumn<0||bounds.lastColumn>=maxColumns||bounds.firstRow>bounds.lastRow||bounds.firstColumn>bounds.lastColumn){unknown("Invalid stored formatting comparison region.");return finish();}
 const charge=(n=1)=>{work+=n;if(work>MAX_WORK)throw Error('Stored formatting comparison work limit exceeded.');};
 const signatures=new Map(),descriptors=new Map(),statusCache=new Map();let text=0;
 const coord=(n,max)=>Number.isInteger(n)&&n>=0&&n<max;
 function descriptor(value){
  charge();if(!plain(value)||typeof value.signature!=='string'||value.signature.length>65536||!plain(value.unavailableGroups))throw Error('Invalid stored formatting descriptor.');
  const known=statusCache.get(value.signature)?.get(value.unavailableGroups);if(known)return known;let parsed=signatures.get(value.signature);if(!parsed){let style;try{style=JSON.parse(value.signature);}catch{throw Error('Invalid stored formatting signature.');}if(workbookStyleSignature(style)!==value.signature)throw Error('Noncanonical stored formatting signature.');text+=value.signature.length;if(text>16*1024*1024)throw Error('Stored formatting text limit exceeded.');parsed=Object.fromEntries(Object.keys(LABELS).map(g=>[g,JSON.stringify(style[g])]));signatures.set(value.signature,parsed);}
  const entries=Object.entries(value.unavailableGroups).sort();for(const [g,reason]of entries)if(!Object.hasOwn(LABELS,g)||typeof reason!=='string'||!reason||reason.length>4096)throw Error('Invalid stored formatting availability.');
  const status=JSON.stringify(entries);charge(Math.ceil(status.length/32));const key=value.signature+'\n'+status;let item=descriptors.get(key);if(!item){if(descriptors.size>=65536)throw Error('Stored formatting descriptor limit exceeded.');text+=status.length;if(text>16*1024*1024)throw Error('Stored formatting text limit exceeded.');item={id:descriptors.size,parsed,unknown:Object.fromEntries(entries)};descriptors.set(key,item);}if(!statusCache.has(value.signature))statusCache.set(value.signature,new WeakMap());statusCache.get(value.signature).set(value.unavailableGroups,item);return item;
 }
 function prepare(input){
  if(!plain(input)||typeof input.available!=='boolean'||!Array.isArray(input.cells)||input.cells.length>500000||!Array.isArray(input.rowStyles)||input.rowStyles.length>50000||!Array.isArray(input.columnStyles)||input.columnStyles.length>16384)throw Error('Stored formatting metadata is missing or excessive.');
  const base=descriptor(input.defaultStyle),rows=new Map(),cells=new Map(),columns=[];let hasUnknown=Object.keys(base.unknown).length>0;
  for(const raw of input.rowStyles){if(!plain(raw)||!coord(raw.row,maxRows)||rows.has(raw.row))throw Error('Invalid or duplicate stored row formatting.');const d=descriptor(raw);rows.set(raw.row,d);hasUnknown||=Object.keys(d.unknown).length>0;}
  for(const raw of input.cells){if(!plain(raw)||!coord(raw.row,maxRows)||!coord(raw.column,maxColumns))throw Error('Invalid stored cell formatting address.');if(!cells.has(raw.row))cells.set(raw.row,new Map());const row=cells.get(raw.row);if(row.has(raw.column))throw Error('Duplicate stored cell formatting.');const d=descriptor(raw);row.set(raw.column,d);hasUnknown||=Object.keys(d.unknown).length>0;}
  for(const raw of input.columnStyles){if(!plain(raw)||!coord(raw.firstColumn,maxColumns)||!coord(raw.lastColumn,maxColumns)||raw.firstColumn>raw.lastColumn)throw Error('Invalid stored column range.');const d=descriptor(raw);columns.push({first:raw.firstColumn,last:raw.lastColumn,d});hasUnknown||=Object.keys(d.unknown).length>0;}
  columns.sort((x,y)=>x.first-y.first);for(let i=1;i<columns.length;i++)if(columns[i].first<=columns[i-1].last)throw Error('Overlapping stored column formatting.');
  if(!input.available&&!hasUnknown)unknown(typeof input.reason==='string'&&input.reason?input.reason:'Stored formatting metadata is unavailable.');
  return {base,rows,cells,columns};
 }
 const comparisonCache=new Map();
 function compare(x,y){const key=x.id+':'+y.id;if(comparisonCache.has(key))return comparisonCache.get(key);charge();if(comparisonCache.size>=100000)throw Error('Stored formatting comparison cache limit exceeded.');const groups=[],missing=[];for(const [g,label]of Object.entries(LABELS)){if(x.unknown[g]||y.unknown[g])missing.push(label+': '+[x.unknown[g],y.unknown[g]].filter(Boolean).join(' / '));else if(x.parsed[g]!==y.parsed[g])groups.push(label);}const result={groups,missing,key:groups.join('|')+'\n'+missing.join('|')};comparisonCache.set(key,result);return result;}
 function report(firstRow,lastRow,firstColumn,lastColumn,result){charge();firstRow=Math.max(firstRow,bounds.firstRow);lastRow=Math.min(lastRow,bounds.lastRow);firstColumn=Math.max(firstColumn,bounds.firstColumn);lastColumn=Math.min(lastColumn,bounds.lastColumn);if(firstRow>lastRow||firstColumn>lastColumn)return;for(const reason of result.missing)unknown(reason);if(!result.groups.length)return;const previous=differences[differences.length-1];if(previous&&previous.firstRow===firstRow&&previous.lastRow===lastRow&&previous.lastColumn+1===firstColumn&&previous.groups.join('|')===result.groups.join('|'))previous.lastColumn=lastColumn;else if(differences.length<MAX_DIFFERENCES)differences.push({firstRow,lastRow,firstColumn,lastColumn,groups:[...result.groups]});else truncated=true;}
 try{
  const left=prepare(a),right=prepare(b),columnCuts=new Set([0,maxColumns]);for(const s of [left,right])for(const c of s.columns){columnCuts.add(c.first);columnCuts.add(c.last+1);}const cuts=[...columnCuts].sort((x,y)=>x-y),columnRuns=[];let ai=0,bi=0;
  for(let i=0;i<cuts.length-1;i++){charge();const first=cuts[i],last=cuts[i+1]-1;while(left.columns[ai]?.last<first)ai++;while(right.columns[bi]?.last<first)bi++;const x=left.columns[ai]?.first<=first?left.columns[ai].d:left.base,y=right.columns[bi]?.first<=first?right.columns[bi].d:right.base;const prev=columnRuns[columnRuns.length-1];if(prev&&prev.a===x&&prev.b===y)prev.last=last;else columnRuns.push({first,last,a:x,b:y});}
  const rowCuts=new Set([0,maxRows]);for(const s of [left,right])for(const row of new Set([...s.rows.keys(),...s.cells.keys()])){rowCuts.add(row);rowCuts.add(row+1);}const rowBounds=[...rowCuts].sort((x,y)=>x-y),runCache=new Map();let cachedRuns=0;
  function background(x,y){const key=(x?.id??'-')+':'+(y?.id??'-');if(runCache.has(key))return runCache.get(key);const result=[];for(const r of x&&y?[{first:0,last:maxColumns-1,a:x,b:y}]:columnRuns){charge();const value=compare(x||r.a,y||r.b),prev=result[result.length-1];if(prev&&prev.result.key===value.key)prev.last=r.last;else result.push({first:r.first,last:r.last,result:value});}cachedRuns+=result.length;if(cachedRuns>100000)throw Error('Stored formatting region budget exceeded.');runCache.set(key,result);return result;}
  function effective(s,row,col,rowOverride){return s.cells.get(row)?.get(col)||rowOverride||columnAt(s,col);}
  function columnAt(s,col){let low=0,high=s.columns.length-1;while(low<=high){charge();const mid=(low+high)>>>1,r=s.columns[mid];if(col<r.first)high=mid-1;else if(col>r.last)low=mid+1;else return r.d;}return s.base;}
  for(let i=0;i<rowBounds.length-1;i++){charge();const firstRow=rowBounds[i],lastRow=rowBounds[i+1]-1,x=left.rows.get(firstRow),y=right.rows.get(firstRow),runs=background(x,y),explicit=[...new Set([...(left.cells.get(firstRow)?.keys()||[]),...(right.cells.get(firstRow)?.keys()||[])])].sort((u,v)=>u-v);let index=0;
   for(const run of runs){let start=run.first;while(index<explicit.length&&explicit[index]<=run.last){const col=explicit[index++];if(start<col)report(firstRow,lastRow,start,col-1,run.result);report(firstRow,lastRow,col,col,compare(effective(left,firstRow,col,x),effective(right,firstRow,col,y)));start=col+1;}if(start<=run.last)report(firstRow,lastRow,start,run.last,run.result);}
  }
 }catch(error){unknown(error.message);truncated=true;}
 return finish();
}
module.exports={compareLegacyFormatting};
