'use strict';
// Cached-value adapter: callers must provide the pinned parser and strict preflight.
// Only validated, derived workbook streams enter the third-party parser.
const LEGACY_CAPABILITIES=Object.freeze({cachedValues:true,formulaComparison:true,formattingComparison:false,layoutComparison:false,preserveSource:false});
const fail=message=>{throw new Error('Binary workbook input: '+message);};
const {formatWorkbookDateSerial}=require('./workbook-date.cjs');
const {readLegacySheetMetadata}=require('./workbook-sheet-metadata.cjs');
const {decodeLegacyFormula,createLegacyFormulaBudget}=require('./legacy-formula.cjs');
const {validateNumberFormats}=require('./workbook-number-formats.cjs');
const {projectLegacyFormatting}=require('./legacy-workbook-formatting.cjs');
const MAX_BYTES=32*1024*1024,MAX_CELLS=500000;
function address(value){const match=/^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(value);if(!match)fail('Invalid cell address.');let c=0;for(const ch of match[1])c=c*26+ch.charCodeAt(0)-64;const r=Number(match[2]);if(r>50000||c>512)fail('Nonempty worksheet exceeds 50,000 rows or 512 columns.');return {r:r-1,c:c-1};}

async function readLegacyWorkbook(input,{format,parser,preflight}={}){
 if(!['xls','xlsb'].includes(format))fail('Explicit XLS or XLSB format is required.');
 if(!(input instanceof Uint8Array)||!input.length||input.length>MAX_BYTES)fail('Workbook must contain at most 32 MiB.');
 if(parser?.version!=='0.20.3'||typeof parser.read!=='function'||typeof preflight!=='function')fail('Qualified parser and preflight are required.');
 const bytes=input.slice();
 const verified=await preflight(bytes);
 if(!verified||verified.format!==format)fail('Preflight format does not match.');
 const parseBytes=format==='xls'?verified.rawWorkbook:verified.sanitizedBytes;if(!(parseBytes instanceof Uint8Array)||!parseBytes.length||parseBytes.length>MAX_BYTES)fail('Validated workbook stream is missing.');
 const workbook=parser.read(parseBytes,{type:'array',WTF:true,cellFormula:false,cellDates:false,cellNF:true,cellText:false,cellStyles:false,sheetStubs:true,bookVBA:false,bookFiles:false,dense:false});
 if(!Array.isArray(workbook.SheetNames)||!workbook.SheetNames.length||workbook.SheetNames.length>64||new Set(workbook.SheetNames).size!==workbook.SheetNames.length)fail('Invalid worksheet list.');
 const date1904=workbook.Workbook?.WBProps?.date1904===true||workbook.Workbook?.WBProps?.date1904===1;
 if(verified.date1904!==undefined&&verified.date1904!==date1904)fail('Date-system disagreement.');
 const formulaBudget=createLegacyFormulaBudget();
 let totalCells=0,totalText=0;const encoder=new TextEncoder();
 const charge=value=>{if(value.length>1024*1024)fail('Cell text exceeds 1 MiB.');const size=encoder.encode(value).length;if(size>1024*1024)fail('Cell text exceeds 1 MiB.');totalText+=size;if(totalText>32*1024*1024)fail('Projected text exceeds 32 MiB.');};
 return workbook.SheetNames.map((name,index)=>{
  if(typeof name!=='string'||!name||name.length>255)fail('Invalid worksheet name.');
  if(!Object.hasOwn(workbook.Sheets||{},name))fail('Missing own worksheet.');const sheet=workbook.Sheets[name];if(!sheet||typeof sheet!=='object')fail('Missing worksheet.');
  if(verified.sheets?.length!==workbook.SheetNames.length)fail('Worksheet census mismatch.');const census=verified.sheets?.[index];if(!census||census.name!==name||!Array.isArray(census.formulas)||census.formulas.length>MAX_CELLS)fail('Missing authoritative formula census.');
  if(!Array.isArray(census.coordinates)||census.coordinates.length>MAX_CELLS)fail('Missing authoritative cell census.');
  const coordinates=new Map();for(const item of census.coordinates){if(!Number.isInteger(item.row)||!Number.isInteger(item.column)||item.row<0||item.row>=50000||item.column<0||item.column>=512||typeof item.blank!=='boolean')fail('Invalid cell census.');const key=item.row+':'+item.column;if(coordinates.has(key))fail('Duplicate cell census.');coordinates.set(key,item);}
  const declared=new Map();for(const item of census.formulas){if(!Number.isInteger(item.row)||!Number.isInteger(item.column)||item.row<0||item.row>=50000||item.column<0||item.column>=512)fail('Invalid formula census address.');const key=item.row+':'+item.column;if(declared.has(key))fail('Duplicate formula census address.');declared.set(key,item);}
  const formulaContext={...verified.formulaContext,groups:census.formulaGroups,budget:formulaBudget};
  const describeFormula=declaration=>{
   if(!declaration)return null;
   const result=declaration.tokens instanceof Uint8Array?decodeLegacyFormula({format,tokens:declaration.tokens,extra:declaration.extra||new Uint8Array(),row:declaration.row,column:declaration.column,context:formulaContext}):{available:false,expression:null,identity:null,reason:'Formula token metadata is unavailable.'};
   charge(result.expression||'');charge(result.identity||'');return result;
  };
  const projected=[];let height=0,width=0,formulas=0,uncached=0;

  for(const key of Object.keys(sheet)){
   if(key.startsWith('!'))continue;const cell=sheet[key];if(!cell||typeof cell!=='object')fail('Invalid cell.');
   const {r,c}=address(key);const originalCell=coordinates.get(r+':'+c);if(!originalCell)fail('Parser introduced an undeclared cell.');coordinates.delete(r+':'+c);if(cell.t==='z'&&!originalCell.blank&&!declared.has(r+':'+c))fail('Parser blanked a nonblank cell.');if(cell.t==='z'&&!declared.has(r+':'+c))continue;
   height=Math.max(height,r+1);width=Math.max(width,c+1);
   if(totalCells+height*width>MAX_CELLS)fail('Workbook exceeds 500,000 projected cells.');
   const declaration=declared.get(r+':'+c),formulaCell=!!declaration;declared.delete(r+':'+c);const formula=describeFormula(declaration);
   if(declaration){const expected={number:'n',string:'s',boolean:'b',error:'e',blank:'z',unavailable:null};if(!Object.hasOwn(expected,declaration.cacheType))fail('Unknown authoritative cache type.');const actual=cell.t==='str'?'s':cell.t;if(declaration.cacheType!=='unavailable'&&actual!==expected[declaration.cacheType])fail('Formula cache type disagreement.');}
   let display='',typed={type:'blank',value:null};
   if(formulaCell&&declaration.cacheType!=='blank'&&(declaration.cacheType==='unavailable'||cell.v===undefined||cell.v===null||cell.t==='z')){display='[formula result unavailable]';typed={type:'text',value:display,cacheUnavailable:true};uncached++;}
   else if(cell.t==='n'){if(typeof cell.v!=='number'||!Number.isFinite(cell.v))fail('Invalid numeric cache.');if(typeof cell.z==='string'&&parser.SSF?.is_date?.(cell.z)){display=formatWorkbookDateSerial(cell.v,{date1904});typed={type:'text',value:display,legacyValueType:'date',serial:cell.v,date1904};}else{display=String(cell.v);typed={type:'number',value:cell.v};}}
   else if(cell.t==='b'){if(typeof cell.v!=='boolean'&&cell.v!==0&&cell.v!==1)fail('Invalid boolean cache.');typed={type:'boolean',value:!!cell.v};display=String(typed.value);}
   else if(cell.t==='s'||cell.t==='str'){if(typeof cell.v!=='string')fail('Invalid string cache.');display=cell.v;typed={type:'text',value:display};}
   else if(cell.t==='e'){const errors={0:'#NULL!',7:'#DIV/0!',15:'#VALUE!',23:'#REF!',29:'#NAME?',36:'#NUM!',42:'#N/A',43:'#GETTING_DATA'};if(!Object.hasOwn(errors,cell.v))fail('Unsupported error cache.');display=errors[cell.v];typed={type:'error',value:display};}
   else if(cell.t!=='z')fail('Unsupported cached cell type.');
   if(display.length>1024*1024||encoder.encode(display).length>1024*1024)fail('Cell text exceeds 1 MiB.');
   if(formulaCell){formulas++;typed={...typed,unsupported:true,cacheAvailable:!typed.cacheUnavailable,legacyFormula:{expression:formula?.expression??null,arrayRange:null,format}};}
   charge(display);charge(JSON.stringify(typed));projected.push({r,c,display,typed,formula});
  }
  for(const [key,item] of coordinates){if(!item.blank&&!declared.has(key))fail('Parser omitted a nonblank cell.');}
  for(const declaration of declared.values()){if(!['unavailable','blank'].includes(declaration.cacheType))fail('Parser omitted a known formula cache.');const {row:r,column:c}=declaration;height=Math.max(height,r+1);width=Math.max(width,c+1);if(totalCells+height*width>MAX_CELLS)fail('Workbook exceeds 500,000 projected cells.');const formula=describeFormula(declaration),unavailable=declaration.cacheType==='unavailable',display=unavailable?'[formula result unavailable]':'',typed={type:unavailable?'text':'blank',value:unavailable?display:null,unsupported:true,cacheAvailable:!unavailable,...(unavailable?{cacheUnavailable:true}:{}),legacyFormula:{expression:formula?.expression??null,arrayRange:null,format}};charge(display);charge(JSON.stringify(typed));projected.push({r,c,display,typed,formula});formulas++;if(unavailable)uncached++;}
  totalCells+=height*width;
  const rows=Array.from({length:height},()=>Array(width).fill('')),typedRows=Array.from({length:height},()=>Array.from({length:width},()=>({type:'blank',value:null}))),formulaRows=Array.from({length:height},()=>Array(width).fill(null)),formulaIdentityRows=Array.from({length:height},()=>Array(width).fill(null)),formulaStatusRows=Array.from({length:height},()=>Array(width).fill(null));
  let supportedFormulas=0;const formulaUnavailableReasons=new Set();
  for(const cell of projected){rows[cell.r][cell.c]=cell.display;typedRows[cell.r][cell.c]=cell.typed;if(cell.formula){formulaRows[cell.r][cell.c]=cell.formula.expression||'[formula expression unavailable]';formulaIdentityRows[cell.r][cell.c]=cell.formula.identity;formulaStatusRows[cell.r][cell.c]={available:cell.formula.available,reason:cell.formula.reason};if(cell.formula.available)supportedFormulas++;else formulaUnavailableReasons.add(cell.formula.reason);}}
  const hidden=census.visibility??workbook.Workbook?.Sheets?.[index]?.Hidden??0;if(![0,1,2].includes(hidden))fail('Unsupported sheet visibility.');
  return {name,metadata:readLegacySheetMetadata(census,index,workbook.Workbook?.Sheets?.[index]?.Hidden),format,capabilities:{...LEGACY_CAPABILITIES,formattingComparison:Boolean(census.formatting)},numberFormats:validateNumberFormats(census.numberFormats||{available:false,reason:'Number-format metadata was not qualified for this input.',cells:[]}),rows,typedRows,formulaRows,formulaIdentityRows,formulaStatusRows,formulaComparisonCoverage:{supported:supportedFormulas,total:formulas,reasons:[...formulaUnavailableReasons].slice(0,8)},...projectLegacyFormatting(census.formatting,height,width),formulas,uncached,layout:null,tableHeaders:[],date1904,visibility:['visible','hidden','veryHidden'][hidden]};
 });
}
module.exports={readLegacyWorkbook,LEGACY_CAPABILITIES};
