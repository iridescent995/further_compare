'use strict';
const {workbookStyleSignature}=require('./workbook-compare.cjs');
const GROUPS=Object.freeze(['numFmt','font','fill','border','alignment','protection','richText']);
const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const fail=message=>{throw Error('Legacy formatting: '+message);};
// Preserve sparse default/range metadata separately from the bounded cell grid.
// A missing property group is a default only when the producer qualified it.
function projectLegacyFormatting(input,height,width){
 if(!Number.isInteger(height)||height<0||height>50000||!Number.isInteger(width)||width<0||width>512||height*width>500000)fail('Invalid projected extent.');
 if(input===undefined)return {styleRows:[],styleStatusRows:[],storedFormatting:null};
 if(!plain(input)||typeof input.available!=='boolean'||!Array.isArray(input.cells)||!Array.isArray(input.rowStyles)||!Array.isArray(input.columnStyles)||input.cells.length>500000||input.rowStyles.length>50000||input.columnStyles.length>16384)fail('Invalid or excessive census.');
 const intern=new Map(),seen=new WeakMap(),shared=new WeakMap(),empty={};let text=0;
 function descriptor(raw){
  if(!plain(raw)||!plain(raw.style))fail('Missing semantic style.');
  if(Object.keys(raw.style).some(group=>!GROUPS.includes(group)))fail('Unknown semantic style group.');
  if(seen.has(raw))return seen.get(raw);
  const statusKey=raw.unavailableGroups??empty;if(!plain(statusKey))fail('Invalid group availability.');
  const reused=shared.get(raw.style)?.get(statusKey);if(reused)return reused;
  const signature=workbookStyleSignature(raw.style),unavailableGroups={};
  if(raw.unavailableGroups!==undefined){if(!plain(raw.unavailableGroups))fail('Invalid group availability.');for(const [group,reason]of Object.entries(raw.unavailableGroups)){if(!GROUPS.includes(group)||typeof reason!=='string'||!reason||reason.length>4096)fail('Invalid unavailable group.');unavailableGroups[group]=reason;}}
  const key=signature+'\n'+JSON.stringify(Object.entries(unavailableGroups).sort());let result=intern.get(key);
  if(!result){text+=key.length;if(text>16*1024*1024)fail('Style text budget exceeded.');result={signature,unavailableGroups};intern.set(key,result);}
  seen.set(raw,result);if(!shared.has(raw.style))shared.set(raw.style,new WeakMap());shared.get(raw.style).set(statusKey,result);return result;
 }
 const defaultStyle=descriptor(input.defaultStyle),cells=new Map(),rowStyles=new Map(),columnStyles=[];
 const coord=(n,max)=>Number.isInteger(n)&&n>=0&&n<max;
 for(const raw of input.cells){if(!coord(raw.row,50000)||!coord(raw.column,16384))fail('Invalid cell address.');const key=raw.row+':'+raw.column;if(cells.has(key))fail('Duplicate cell style.');cells.set(key,descriptor(raw));}
 for(const raw of input.rowStyles){if(!coord(raw.row,1048576)||rowStyles.has(raw.row))fail('Invalid or duplicate row style.');rowStyles.set(raw.row,descriptor(raw));}
 for(const raw of input.columnStyles){if(!coord(raw.firstColumn,16384)||!coord(raw.lastColumn,16384)||raw.firstColumn>raw.lastColumn)fail('Invalid column style range.');columnStyles.push({firstColumn:raw.firstColumn,lastColumn:raw.lastColumn,...descriptor(raw)});}
 columnStyles.sort((a,b)=>a.firstColumn-b.firstColumn);for(let i=1;i<columnStyles.length;i++)if(columnStyles[i].firstColumn<=columnStyles[i-1].lastColumn)fail('Overlapping column style ranges.');
 const columns=[];let index=0;for(let c=0;c<width;c++){while(index<columnStyles.length&&columnStyles[index].lastColumn<c)index++;columns[c]=columnStyles[index]?.firstColumn<=c?columnStyles[index]:defaultStyle;}
 const styleRows=[],styleStatusRows=[];let styleMatrixAvailable=true,projectedUnits=0;
 projection:for(let r=0;r<height;r++){const styles=[],statuses=[];for(let c=0;c<width;c++){const item=cells.get(r+':'+c)||rowStyles.get(r)||columns[c];projectedUnits+=item.signature.length;if(projectedUnits>64*1024*1024){styleMatrixAvailable=false;styleRows.length=0;styleStatusRows.length=0;break projection;}styles.push(item.signature);statuses.push(item.unavailableGroups);}styleRows.push(styles);styleStatusRows.push(statuses);}
 const storedFormatting={available:input.available,reason:typeof input.reason==='string'?input.reason:null,defaultStyle,cells:[...cells].map(([key,style])=>{const [row,column]=key.split(':').map(Number);return {row,column,...style};}),rowStyles:[...rowStyles].map(([row,style])=>({row,...style})),columnStyles};
 return {styleRows,styleStatusRows,storedFormatting,styleMatrixAvailable};
}
module.exports={projectLegacyFormatting,GROUPS};
