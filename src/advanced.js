import {createSheetInventory,compareSheetCells} from './workbook-sheet-review.cjs';
import {readXlsxSheetMetadata} from './workbook-sheet-metadata.cjs';
import {readXlsxBaseFormatting} from './xlsx-base-formatting.cjs';
import odsCellEdits from './ods-cell-edits.cjs';
const {validateOdsCellEdits,normalizeOdsCellEdit}=odsCellEdits;
const validateResultCellEdits=(value,context)=>context.template?.format==='ods'?validateOdsCellEdits(value,context):validateWorkbookCellEdits(value,context);
import {readOdsWorkbook} from './ods-input.js';
import workbookDates from './workbook-date.cjs';
import workbookConditional from './workbook-conditional.cjs';
import workbookNumberFormats from './workbook-number-formats.cjs';
const {readXlsxNumberFormats,compareNumberFormats}=workbookNumberFormats;
const {readConditionalFormatting,compareConditionalFormatting}=workbookConditional;
import workbookPackage from './workbook-package.cjs';
const {formatWorkbookDateSerial}=workbookDates;
import {readLegacyWorkbookFile} from './legacy-workbook-input.js';
const isSheetInput=name=>/\.(xlsx|ods|xls|xlsb)$/i.test(name||'');
const isValueWorkbook=name=>/\.(ods|xls|xlsb)$/i.test(name||'');
const valueSheet=sheet=>sheet?.capabilities?.preserveSource===false;
const odsTemplate=template=>template?.format==='ods';
const readTableWorkbook=(data,name,signal)=>/\.ods$/i.test(name)?readOdsWorkbook(data):/\.(xls|xlsb)$/i.test(name)?readLegacyWorkbookFile(decode(data),{format:name.toLowerCase().endsWith('.xlsb')?'xlsb':'xls',signal}):readWorkbook(data);
import {prepareWorkbookArrayFormulas} from './workbook-structural-array-formulas.js';
import {prepareWorkbookDynamicArrays} from './workbook-dynamic-arrays.js';
import {sha256} from '@noble/hashes/sha2.js';
import textCodec from './text-codec.cjs';
import documentInput from './text-input.cjs';
import documentProjection from './document-projection.cjs';
const {validateDocumentProjection}=documentProjection;
import {extractPdfTextInBrowser} from './pdf-text-browser.js';
import {extractDocTextInBrowser} from './doc-text-browser.js';
const {decodeTextInput,isDocumentInput}=documentInput;
import textFormat from './text-format.cjs';
const {decodeText,encodeText,validateText,validateFormat,ENCODINGS}=textCodec;
const encodingName=value=>({'shift-jis':'Shift-JIS (Japanese)','euc-jp':'EUC-JP (Japanese)','gb18030':'GB18030 (Chinese)','big5':'Big5 (Traditional Chinese)','euc-kr':'EUC-KR (Korean)',...textCodec.SINGLE_BYTE_LABELS})[value]||value.toUpperCase();
const {projectText}=textFormat;
import {installBulkTextInput} from './bulk-text-input.js';
import {createContextMenu} from './context-menu.js';
import engine from './structured-diff.cjs';
import workbookStyleEdits from './workbook-style-edits.cjs';
const {validateWorkbookStyleEdits}=workbookStyleEdits;
import workbookStructure from './workbook-structural-plan.cjs';
import workbookStructuralFormulas from './workbook-structural-formulas.cjs';
const {validateWorkbookStructuralPlan,validateWorkbookStructuralRows,applyStructuralShape,mapStructuralCell,unmapStructuralCell}=workbookStructure;
const {transformWorkbookStructuralFormula}=workbookStructuralFormulas;
import workbookCellEdits from './workbook-cell-edits.cjs';
const {normalizeWorkbookCellEdit,validateWorkbookCellEdits,translateWorkbookFormula}=workbookCellEdits;
import workbookComparison from './workbook-compare.cjs';
const {compareWorkbookTables,workbookStyleSignature}=workbookComparison;
import workbookTheme from './workbook-theme.cjs';
const {parseWorkbookTheme,parseWorkbookThemeFonts,resolveWorkbookThemeStyle}=workbookTheme;
import workbookLayout from './workbook-layout.cjs';
const {normalizeWorkbookLayout,compareWorkbookLayouts,WORKBOOK_VIEW_FLAGS}=workbookLayout;
import binaryEdits from './binary-edits.cjs';
const {binaryRangeOffsets}=binaryEdits;
import binaryHistoryModule from './binary-history.cjs';
const {BinaryEditHistory}=binaryHistoryModule;
import tableDifferenceCopy from './table-difference-copy.cjs';
const {tableComparisonRowId,createTableCopyOrigin,copyTableDifferences}=tableDifferenceCopy;
import tableHistoryModule from './table-history.cjs';
const {TableEditHistory}=tableHistoryModule;
const {parseDelimited,alignBinary}=engine;
const encode = bytes => {let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);};
const decode = data => Uint8Array.from(atob(data),c=>c.charCodeAt(0));
// Bound both advertised and actual ZIP expansion before handing workbook XML to ExcelJS.
export async function readWorkbook(data){
 const originalBytes=decode(data),admitted=await workbookPackage.prepareWorkbookPackage(originalBytes),bytes=admitted.bytes,view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),limit=64*1024*1024;
 const baseFormattingByName=new Map();let baseFormattingFailure=null;
 try{const census=await readXlsxBaseFormatting(originalBytes,{DOMParser});if(census.sheets.length!==admitted.sheets.length||census.sheets.some((sheet,i)=>sheet.name!==admitted.sheets[i].name))throw Error('Original formatting worksheet identity disagrees with admitted workbook.');for(const sheet of census.sheets)baseFormattingByName.set(sheet.name,sheet.formatting);}catch(error){const reason='Original XLSX base formatting is unavailable: '+String(error.message).slice(0,2048);baseFormattingFailure={available:false,reason,defaultStyle:{style:{},unavailableGroups:Object.fromEntries(['font','fill','border','alignment','protection','numFmt','richText'].map(group=>[group,reason]))},cells:[],rowStyles:[],columnStyles:[]};}
 if(bytes.length<22)throw Error('Invalid XLSX archive.');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
 if(end<0||view.getUint16(end+4,true)||view.getUint16(end+6,true))throw Error('Unsupported XLSX archive.');
 const count=view.getUint16(end+10,true);let offset=view.getUint32(end+16,true),total=0,actual=0,worksheetCells=0,worksheetCount=0,mergedCells=0,formulaGroupCells=0;
 const dynamicEntries=new Map(),worksheetDocs=new Map(),dynamicCellsByPart=new Map(),dynamicCellsByName=new Map();
 const arrayCellsByPart=new Map(),arrayCellsByName=new Map(),unsafeCellsByPart=new Map(),unsafeCellsByName=new Map(),layoutsByPart=new Map(),metadataXml=new Map(),archiveParts=new Map();
 if(count>4096||count===65535)throw Error('Workbook has too many archive entries.');
 for(let i=0;i<count;i++){
  if(offset+46>end||view.getUint32(offset,true)!==0x02014b50)throw Error('Invalid workbook directory.');
  const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),compressed=view.getUint32(offset+20,true),size=view.getUint32(offset+24,true),nameLength=view.getUint16(offset+28,true),extraLength=view.getUint16(offset+30,true),commentLength=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true);
  if(flags&1||![0,8].includes(method)||size===0xffffffff||compressed===0xffffffff)throw Error('Encrypted or ZIP64 workbooks are not supported.');
  total+=size;if(total>limit)throw Error('Workbook expanded data exceeds 64 MB.');
  if(local+30>bytes.length||view.getUint32(local,true)!==0x04034b50)throw Error('Invalid workbook entry.');
  const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
  if(start+compressed>bytes.length)throw Error('Truncated workbook entry.');
  const archiveName=new TextDecoder().decode(bytes.subarray(offset+46,offset+46+nameLength)),isSheet=/^xl\/worksheets\/[^/]+\.xml$/.test(archiveName),keepXml=/\.(xml|rels)$/i.test(archiveName),parts=[];if(archiveParts.has(archiveName))throw Error('Duplicate workbook archive part.');archiveParts.set(archiveName,{start,compressed,size,method});if(isSheet&&++worksheetCount>64)throw Error('Workbook exceeds 64 sheets.');const raw=bytes.subarray(start,start+compressed);let expanded=0;
  if(method===0){expanded=raw.length;actual+=expanded;if(keepXml)parts.push(raw);}
  else {const reader=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();try{while(true){const part=await reader.read();if(part.done)break;expanded+=part.value.length;actual+=part.value.length;if(keepXml)parts.push(part.value);if(actual>limit||expanded>size)throw Error('Workbook expansion limit exceeded.');}}finally{await reader.cancel().catch(()=>{});}}
  if(expanded!==size||actual>limit)throw Error('Workbook entry size is invalid.');dynamicEntries.set(archiveName,{kind:archiveName.endsWith('/')?'directory':'file',data:keepXml?new Uint8Array(await new Blob(parts).arrayBuffer()):new Uint8Array()});if(isSheet){const xml=await new Blob(parts).text();worksheetCells+=(xml.match(/<c[\s>]/g)||[]).length;if(worksheetCells>500000||(xml.match(/<row[\s>]/g)||[]).length>50000)throw Error('Workbook exceeds cell or row limits.');for(const match of xml.matchAll(/<row\b[^>]*\br=["'](\d+)["']/g))if(Number(match[1])>50000)throw Error('Worksheet row index exceeds 50,000.');for(const match of xml.matchAll(/<c\b[^>]*\br=["']([A-Z]+)(\d+)["']/g)){let column=0;for(const char of match[1])column=column*26+char.charCodeAt(0)-64;if(column>512||Number(match[2])>50000)throw Error('Worksheet cell address exceeds supported bounds.');}}
  if(isSheet){
   const xml=new DOMParser().parseFromString(await new Blob(parts).text(),'application/xml');
   if(xml.getElementsByTagName('parsererror').length)throw Error('Invalid worksheet XML.');worksheetDocs.set(archiveName,xml);
   const unsafe=new Set(),arrayCells=new Set();
   for(const cell of xml.getElementsByTagNameNS('*','c')){
    const formula=Array.from(cell.children).find(child=>child.localName==='f'),reference=cell.getAttribute('r');
    if(cell.hasAttribute('cm')||cell.hasAttribute('vm')||formula&&(formula.hasAttribute('t')&&formula.getAttribute('t')!=='normal'||formula.hasAttribute('ref'))){
     unsafe.add(reference);const area=formula?.getAttribute('ref');
     if(area!==undefined&&area!==null){
      const addresses=area.split(':');if(addresses.length>2)throw Error('Invalid formula group range.');
      const points=addresses.map(address=>{const match=/^([A-Z]{1,3})([1-9]\d*)$/.exec(address);if(!match)throw Error('Invalid formula group range.');let column=0;for(const letter of match[1])column=column*26+letter.charCodeAt(0)-64;const row=Number(match[2]);if(!Number.isSafeInteger(row)||row<1||row>50000||!Number.isSafeInteger(column)||column<1||column>512)throw Error('Formula group exceeds supported bounds.');return [row,column];}),first=points[0],last=points[1]||first;
      if(first[0]>last[0]||first[1]>last[1])throw Error('Invalid reversed formula group range.');
      formulaGroupCells+=(last[0]-first[0]+1)*(last[1]-first[1]+1);if(formulaGroupCells>500000)throw Error('Workbook formula groups exceed 500,000 cells.');
      for(let r=first[0];r<=last[0];r++)for(let c=first[1];c<=last[1];c++){unsafe.add(r+':'+c);if(formula?.getAttribute('t')==='array')arrayCells.add(r+':'+c);}
     }
    }
   }
   unsafeCellsByPart.set(archiveName,unsafe);arrayCellsByPart.set(archiveName,arrayCells);
   const merges=Array.from(xml.getElementsByTagNameNS('*','mergeCell'),node=>node.getAttribute('ref'));
   normalizeWorkbookLayout({merges});
   for(const ref of merges){const endpoints=ref.split(':').map(address=>{const match=/^([A-Z]+)([1-9]\d*)$/.exec(address);let column=0;for(const char of match[1])column=column*26+char.charCodeAt(0)-64;return {row:Number(match[2]),column};}),first=endpoints[0],last=endpoints[1]||first;mergedCells+=(last.row-first.row+1)*(last.column-first.column+1);if(mergedCells>500000)throw Error('Workbook merged ranges exceed 500,000 cells.');for(let r=first.row;r<=last.row;r++)for(let c=first.column;c<=last.column;c++)if(r!==first.row||c!==first.column)unsafe.add(r+':'+c);}
   const numeric=(node,attribute,key)=>node.hasAttribute(attribute)?{[key]:Number(node.getAttribute(attribute))}:{};
   const flags=node=>{const hidden=node.getAttribute('hidden');if(hidden!==null&&!['0','1','false','true'].includes(hidden))throw Error('Invalid worksheet hidden state.');return {...(hidden===null?{}:{hidden:hidden==='1'||hidden==='true'}),...numeric(node,'outlineLevel','outlineLevel')};};
   const columns=[];for(const col of xml.getElementsByTagNameNS('*','col')){const min=Number(col.getAttribute('min')),max=Number(col.getAttribute('max'));if(!Number.isInteger(min)||!Number.isInteger(max)||min<1||max<min||max>512)throw Error('Worksheet column layout exceeds supported bounds.');for(let index=min;index<=max;index++){columns.push({index,...numeric(col,'width','width'),...flags(col)});if(columns.length>512)throw Error('Worksheet column layout exceeds supported bounds.');}}
   const rows=Array.from(xml.getElementsByTagNameNS('*','row'),row=>({index:Number(row.getAttribute('r')),...numeric(row,'ht','height'),...flags(row)}));
   const format=xml.getElementsByTagNameNS('*','sheetFormatPr')[0],defaults=format?{...numeric(format,'defaultRowHeight','defaultRowHeight'),...numeric(format,'defaultColWidth','defaultColWidth')}:{};
   const views=Array.from(xml.getElementsByTagNameNS('*','sheetView'),node=>{
    const result={id:Number(node.getAttribute('workbookViewId'))};
    if(!node.hasAttribute('workbookViewId'))throw Error('Worksheet view ID is missing.');
    for(const key of Object.keys(WORKBOOK_VIEW_FLAGS))if(node.hasAttribute(key)){const value=node.getAttribute(key);if(!['0','1','true','false'].includes(value))throw Error('Invalid worksheet view flag.');result[key]=value==='1'||value==='true';}
    Object.assign(result,numeric(node,'zoomScale','zoomScale'));if(node.hasAttribute('view'))result.view=node.getAttribute('view');
    const panes=Array.from(node.children).filter(child=>child.localName==='pane');if(panes.length>1)throw Error('Duplicate worksheet view pane.');
    if(panes.length){const pane=panes[0];result.state=pane.getAttribute('state')||'split';Object.assign(result,numeric(pane,'xSplit','xSplit'),numeric(pane,'ySplit','ySplit'));if(pane.hasAttribute('topLeftCell'))result.paneTopLeftCell=pane.getAttribute('topLeftCell');}
    return result;
   });
   if(layoutsByPart.has(archiveName))throw Error('Duplicate worksheet archive part.');
   layoutsByPart.set(archiveName,normalizeWorkbookLayout({merges,rows,columns,defaults,views}));
  }
  if(['xl/workbook.xml','xl/_rels/workbook.xml.rels'].includes(archiveName)){if(metadataXml.has(archiveName))throw Error('Duplicate workbook metadata part.');const xml=new DOMParser().parseFromString(await new Blob(parts).text(),'application/xml');if(xml.getElementsByTagName('parsererror').length)throw Error('Invalid workbook metadata XML.');metadataXml.set(archiveName,xml);}
  offset+=46+nameLength+extraLength+commentLength;
 }
 const workbookXml=metadataXml.get('xl/workbook.xml'),relationshipsXml=metadataXml.get('xl/_rels/workbook.xml.rels');
 if(!workbookXml||!relationshipsXml)throw Error('Workbook worksheet relationships are missing.');
 const relationships=new Map();
 for(const relation of relationshipsXml.getElementsByTagNameNS('*','Relationship')){if(relation.getAttribute('TargetMode')==='External'||!relation.getAttribute('Type')?.endsWith('/worksheet'))continue;const id=relation.getAttribute('Id'),target=relation.getAttribute('Target'),segments=target?.startsWith('/')?[]:['xl'];if(!id||!target||target.includes('\\')||relationships.has(id))throw Error('Invalid worksheet relationship.');for(const part of target.split('/')){if(!part||part==='.')continue;if(part==='..'){if(!segments.length)throw Error('Invalid worksheet relationship path.');segments.pop();}else segments.push(part);}relationships.set(id,segments.join('/'));}
 // Resolve the relationship rather than assuming xl/theme/theme1.xml. The ZIP
 // pass above validates every expansion; retain only compressed ranges here.
 const themeRelations=Array.from(relationshipsXml.getElementsByTagNameNS('*','Relationship')).filter(relation=>relation.getAttribute('Type')?.endsWith('/theme'));
 if(themeRelations.length>1)throw Error('Workbook theme relationship is ambiguous.');
 let themeXml=null;
 if(themeRelations.length){
  const relation=themeRelations[0],id=relation.getAttribute('Id'),mode=relation.getAttribute('TargetMode');
  let target=relation.getAttribute('Target');
  if(!id||!target||(mode&&mode!=='Internal')||Array.from(relationshipsXml.getElementsByTagNameNS('*','Relationship')).filter(item=>item.getAttribute('Id')===id).length!==1)throw Error('Invalid workbook theme relationship.');
  if(/[\x00-\x20]/.test(target))throw Error('Invalid workbook theme relationship path.');
  try{target=decodeURIComponent(target);}catch{throw Error('Invalid workbook theme relationship path.');}
  if(/[\\:#?\x00-\x1f]/.test(target))throw Error('Invalid workbook theme relationship path.');
  const segments=target.startsWith('/')?[]:['xl'];
  for(const segment of target.split('/')){if(!segment||segment==='.')continue;if(segment==='..'){if(!segments.length)throw Error('Invalid workbook theme relationship path.');segments.pop();}else segments.push(segment);}
  const part=archiveParts.get(segments.join('/'));if(!part)throw Error('Workbook theme relationship target is missing.');if(part.size>1024*1024)throw Error('Workbook theme XML exceeds 1 MiB.');
  const raw=bytes.subarray(part.start,part.start+part.compressed),parts=[];let expanded=0;
  if(part.method===0){expanded=raw.length;parts.push(raw);}else{
   const reader=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
   try{while(true){const chunk=await reader.read();if(chunk.done)break;expanded+=chunk.value.length;if(expanded>part.size||expanded>limit)throw Error('Workbook theme expansion limit exceeded.');parts.push(chunk.value);}}finally{await reader.cancel().catch(()=>{});}
  }
  if(expanded!==part.size)throw Error('Workbook theme entry size is invalid.');
  themeXml=new DOMParser().parseFromString(await new Blob(parts).text(),'application/xml');
  if(themeXml.getElementsByTagName('parsererror').length)throw Error('Invalid workbook theme XML.');
 }
 const themePalette=themeXml?parseWorkbookTheme(themeXml):null,themeFonts=themeXml?parseWorkbookThemeFonts(themeXml):null;
 const styleRelations=Array.from(relationshipsXml.getElementsByTagNameNS('*','Relationship')).filter(relation=>relation.getAttribute('Type')?.endsWith('/styles'));
 if(styleRelations.length>1)throw Error('Workbook styles relationship is ambiguous.');
 let conditionalStylesXml=null;
 if(styleRelations.length){const relation=styleRelations[0];let target=relation.getAttribute('Target');if(!target||relation.getAttribute('TargetMode')==='External')throw Error('Invalid workbook styles relationship.');try{target=decodeURIComponent(target);}catch{throw Error('Invalid workbook styles relationship path.');}const segments=target.startsWith('/')?[]:['xl'];for(const segment of target.split('/')){if(!segment||segment==='.')continue;if(segment==='..'){if(!segments.length)throw Error('Invalid workbook styles relationship path.');segments.pop();}else segments.push(segment);}const entry=dynamicEntries.get(segments.join('/'));if(!entry)throw Error('Workbook styles relationship target is missing.');conditionalStylesXml=new DOMParser().parseFromString(new TextDecoder('utf-8',{fatal:true}).decode(entry.data),'application/xml');if(conditionalStylesXml.getElementsByTagName('parsererror').length)throw Error('Invalid workbook styles XML.');}

 // Dynamic annotations are derived from the package capability, never session
 // flags. Unsupported metadata stays readable under the existing group guards.
 let dynamicAnchors=[];
 try{const capability=prepareWorkbookDynamicArrays({entries:dynamicEntries,workbookPath:'xl/workbook.xml',sheets:Array.from(worksheetDocs,([path,doc])=>({path,doc}))});for(const doc of worksheetDocs.values())prepareWorkbookArrayFormulas(doc,[],capability);dynamicAnchors=capability.anchors;}catch{}
 for(const group of dynamicAnchors){
  const endpoints=group.ref.split(':').map(ref=>{const match=/^([A-Z]+)([1-9]\d*)$/.exec(ref);let column=0;for(const char of match[1])column=column*26+char.charCodeAt(0)-64;return {row:Number(match[2]),column};}),first=endpoints[0],last=endpoints[1]||first;
  const annotation={anchor:group.cell.getAttribute('r'),ref:group.ref,anchorOnly:endpoints.length===1||first.row===last.row&&first.column===last.column};
  const members=dynamicCellsByPart.get(group.path)||new Map();dynamicCellsByPart.set(group.path,members);
  for(let r=first.row;r<=last.row;r++)for(let c=first.column;c<=last.column;c++)members.set(r+':'+c,annotation);
 }

 const layoutsByName=new Map(),worksheetDocsByName=new Map();
 for(const sheet of workbookXml.getElementsByTagNameNS('*','sheet')){const id=Array.from(sheet.attributes).find(attribute=>attribute.localName==='id'&&attribute.namespaceURI?.includes('/relationships'))?.value,name=sheet.getAttribute('name'),part=relationships.get(id);if(!part)continue;if(!name||layoutsByName.has(name)||!layoutsByPart.has(part))throw Error('Worksheet layout relationship is missing or ambiguous.');layoutsByName.set(name,layoutsByPart.get(part));worksheetDocsByName.set(name,worksheetDocs.get(part));unsafeCellsByName.set(name,unsafeCellsByPart.get(part));arrayCellsByName.set(name,arrayCellsByPart.get(part));dynamicCellsByName.set(name,dynamicCellsByPart.get(part));}
 const workbookProperties=Array.from(workbookXml.getElementsByTagNameNS('*','workbookPr'));if(workbookProperties.length>1)throw Error('Ambiguous workbook date system.');
 const dateSystem=workbookProperties[0]?.getAttribute('date1904');if(dateSystem!==undefined&&dateSystem!==null&&!['0','1','false','true'].includes(dateSystem))throw Error('Invalid workbook date system.');const date1904=dateSystem==='1'||dateSystem==='true';
 const imported=await import('exceljs/dist/exceljs.min.js');const Excel=imported.default||imported;const workbook=new Excel.Workbook();await workbook.xlsx.load(bytes);
 if((workbook.properties.date1904===true)!==date1904)throw Error('Workbook date-system disagreement.');
 if(workbook.worksheets.length!==admitted.sheets.length||workbook.worksheets.some((sheet,i)=>sheet.name!==admitted.sheets[i].name||sheet.id!==admitted.sheets[i].parserId||(sheet.state||'visible')!==admitted.sheets[i].state))throw Error('Workbook parser omitted or changed worksheet identity.');
 let cells=0,styleTextLength=0;const styleCache=new WeakMap(),richStyleCache=new WeakMap(),styleSignatures=new Set();
 function signatureFor(style,richText){
  let cache=styleCache;if(richText){if(!richStyleCache.has(richText))richStyleCache.set(richText,new WeakMap());cache=richStyleCache.get(richText);}
  let signature=cache.get(style);if(signature!==undefined)return signature;
  signature=workbookStyleSignature(resolveWorkbookThemeStyle(richText?{...style,richText}:style,themePalette,themeFonts));
  if(!styleSignatures.has(signature)){styleTextLength+=signature.length;if(styleTextLength>32*1024*1024)throw Error('Workbook formatting data exceeds 32 MiB of text.');styleSignatures.add(signature);}
  cache.set(style,signature);return signature;
 }
 const sheetMetadata=readXlsxSheetMetadata(admitted.sheets,workbook.worksheets);
 return workbook.worksheets.map((sheet,sheetIndex)=>{
  if(sheet.rowCount>50000||sheet.columnCount>512)throw Error('Worksheet exceeds 50,000 rows or 512 columns.');
  cells+=sheet.rowCount*sheet.columnCount;if(cells>500000)throw Error('Workbook exceeds 500,000 cells.');
  const layout=layoutsByName.get(sheet.name);if(!layout)throw Error('Worksheet layout relationship is missing.');
  // ExcelJS converts numeric date caches to JS Date, losing the fictional
  // leap day, early-1900 calendar semantics and submillisecond distinctions.
  // Retain the original XML caches by actual worksheet relationship instead.
  const rawCells=new Map(),sourceDocument=worksheetDocsByName.get(sheet.name);
  for(const rawCell of sourceDocument.getElementsByTagNameNS('*','c')){const reference=rawCell.getAttribute('r');if(reference){if(rawCells.has(reference))throw Error('Duplicate worksheet cell address.');rawCells.set(reference,rawCell);if(rawCells.size>500000)throw Error('Worksheet cell count exceeds supported bounds.');}}
  for(const [address,source]of rawCells){const hasValue=Array.from(source.children).some(node=>node.namespaceURI===source.namespaceURI&&(['f','is'].includes(node.localName)||node.localName==='v'&&node.textContent!==''));if(hasValue&&sheet.getCell(address).value==null)throw Error('Workbook parser omitted a populated cell.');}
  let formulas=0,uncached=0;const formulaRows=[],styleRows=[],typedRows=[];
  const rows=Array.from({length:sheet.rowCount},(_,r)=>Array.from({length:sheet.columnCount},(_,c)=>{
   const cell=sheet.getCell(r+1,c+1);let value=cell.value;const signature=signatureFor(cell.style||{},value?.richText);(styleRows[r]??=[])[c]=signature;(formulaRows[r]??=[])[c]=null;
   let typed={type:value==null?'blank':typeof value==='number'?'number':typeof value==='boolean'?'boolean':'text',value:value??null};
   if(value&&typeof value==='object'&&('formula'in value||'sharedFormula'in value)){
    formulas++;let formula=value.formula;
    if(value.sharedFormula){const master=sheet.getCell(value.sharedFormula);formula=translateWorkbookFormula(master.value.formula,r+1-master.row,c+1-master.col);}
    if(typeof formula!=='string')throw Error('Unable to resolve workbook formula.');
    formulaRows[r][c]=formula;typed={type:'formula',value:formula,unsupported:!!(value.sharedFormula||value.shareType||value.ref||unsafeCellsByName.get(sheet.name)?.has(cell.address)||unsafeCellsByName.get(sheet.name)?.has((r+1)+':'+(c+1)))};
    typed.grouped=typed.unsupported;typed.array=arrayCellsByName.get(sheet.name)?.has((r+1)+':'+(c+1))||false;const dynamic=dynamicCellsByName.get(sheet.name)?.get((r+1)+':'+(c+1));if(dynamic)typed.dynamicArray=dynamic;(typedRows[r]??=[])[c]=typed;
    if(value.result===undefined){typed.cacheUnavailable=true;uncached++;return '[formula result unavailable] '+formula;}value=value.result;
   }else{
    if(typed.type==='text'&&typeof value!=='string'&&value!=null)typed={type:'text',value:cell.text,unsupported:true,grouped:false};
    if(unsafeCellsByName.get(sheet.name)?.has(cell.address)||unsafeCellsByName.get(sheet.name)?.has((r+1)+':'+(c+1)))typed.unsupported=true,typed.grouped=true;
    typed.array=arrayCellsByName.get(sheet.name)?.has((r+1)+':'+(c+1))||false;const dynamic=dynamicCellsByName.get(sheet.name)?.get((r+1)+':'+(c+1));if(dynamic)typed.dynamicArray=dynamic;(typedRows[r]??=[])[c]=typed;
   }
   if(value===null||value===undefined)return '';if(value instanceof Date){
    const source=rawCells.get(cell.address);if(!source)throw Error('Original date cache is unavailable.');
    const type=source.getAttribute('t'),values=Array.from(source.children).filter(node=>node.localName==='v'&&node.namespaceURI===source.namespaceURI);if(values.length!==1)throw Error('Date cache is missing or ambiguous.');
    if(type===null||type===''||type==='n'){
     const raw=values[0].textContent.trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw))throw Error('Invalid numeric date cache.');
     const serial=Number(raw),display=formatWorkbookDateSerial(serial,{date1904});
     typed.dateCache={serial,date1904};if(typed.type!=='formula'){typed.value=display;typed.xlsxValueType='date';typed.unsupported=true;}return display;
    }
    if(type!=='d')throw Error('Date cache type disagreement.');return value.toISOString();
   }if(typeof value==='object'){if(value.richText)return value.richText.map(p=>p.text).join('');if(value.text!==undefined)return String(value.text);if(value.error)return String(value.error);}return String(value);
  }));const tableHeaders=sheet.getTables().filter(table=>table.headerRow).map(table=>{const cell=sheet.getCell((table.ref||table.table.tableRef).split(':')[0]);return {row:cell.row,first:cell.col,last:cell.col+table.width-1};});return {name:sheet.name,format:'xlsx',baseFormatting:baseFormattingByName.get(sheet.name)||baseFormattingFailure,metadata:sheetMetadata[sheetIndex],rows,formulaRows,typedRows,styleRows,formulas,uncached,layout,tableHeaders,numberFormats:readXlsxNumberFormats({worksheetXml:sourceDocument,stylesXml:conditionalStylesXml}),conditionalRules:readConditionalFormatting({worksheetXml:sourceDocument,stylesXml:conditionalStylesXml,themeXml,DOMParser})};
 });
}
const csvText=(rows,delimiter=',')=>rows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(delimiter)).join('\r\n');
export function createAdvanced({host,desktop,notify,onDirty=()=>{},onInputReplaced=()=>{},renderToolbarActions=()=>[]}){
 const mergeMenu=createContextMenu('mergeContext','Three-way merge actions');let mergeMenuTicket=0,selectedConflict=null;
 const closeMergeMenu=()=>{mergeMenuTicket++;mergeMenu.close();};
 const tableMenu=createContextMenu('tableContext','Table comparison actions');let tableMenuTicket=0,tableRestorePending=null;const tablePending={a:null,b:null};
 let tableSelection=new Map(),tableAnchor=null,tableComparison=null,tableSelectionBinding=null;
 const tableHashes=new WeakMap();
 let sheetReview={binding:null,rows:[],statuses:new Map(),worker:null,ticket:0,page:0,open:true,completed:0,total:0,error:null};
 const tableSettings=()=>JSON.stringify([state.options.delimiter||'auto',state.options.keys||'',!!state.options.headers,state.options.sheeta||0,state.options.sheetb||0,state.options.workbookMode||'values',!!state.options.compareFormatting,!!state.options.onlyDifferences]);
 const clearTableSelection=()=>{tableSelection.clear();tableAnchor=null;};
 const closeTableMenu=()=>{tableMenuTicket++;tableMenu.close();};
 const tableBusy=()=>Boolean(tablePending.a||tablePending.b||tableRestorePending||loading.a||loading.b);
 const binaryMenu=createContextMenu('binaryContext','Binary comparison actions');let binaryMenuTicket=0,binaryMenuEntries=[];const binaryPending={a:null,b:null},buttonActions=new WeakMap();
 const closeBinaryMenu=()=>{binaryMenuTicket++;binaryMenu.close();};
 const binaryBusy=()=>Boolean(binaryPending.a||binaryPending.b);
 let importSerial=0,openSerial={a:0,b:0,base:0};
 const workbookReads=new Map();
 function cancelWorkbookReads(){for(const controller of workbookReads.values())controller.abort();workbookReads.clear();}
 async function readTrackedWorkbook(key,data,name){workbookReads.get(key)?.abort();const controller=new AbortController();workbookReads.set(key,controller);try{return await readTableWorkbook(data,name,controller.signal);}finally{if(workbookReads.get(key)===controller)workbookReads.delete(key);}}

 let state, binaryHistory=new BinaryEditHistory(), binarySelection=null, binaryPage=0, choices={}, merged=null, generation=0,tablePage=0,layoutPage=0,conditionalPage=0,numberFormatPage=0,workbooks={},loading={},tableCache={},binaryCache=null,binaryRange=-1;
 let mergeDocuments={},mergeRestorePending=null;
 const mergeReads=new Map();
 const cancelMergeReads=()=>{for(const controller of mergeReads.values())controller.abort();mergeReads.clear();};
 async function readMergeInput(key,input,options={},side){mergeReads.get(key)?.abort();const controller=new AbortController();mergeReads.set(key,controller);try{return await decodeTextInput(decode(input?.data||''),input?.name||'',options.mergeReadEncodings?.[side]||'auto',{extractPdfText:extractPdfTextInBrowser,extractDocText:extractDocTextInBrowser,docScope:options.mergeDocScopes?.[side]||'main-document',pdfOrder:options.mergePdfOrders?.[side]||'document',docxScope:options.mergeDocxScopes?.[side]||'main-document',odtScope:options.mergeOdtScopes?.[side]||'main-document',signal:controller.signal});}finally{if(mergeReads.get(key)===controller)mergeReads.delete(key);}}
 const mergeHistory=new TableEditHistory(),mergeRuntimes=new WeakMap(),mergePending={a:null,b:null,base:null};
 let mergeSourcePending=false,mergeComposing=false,mergeSourceTimer=null,mergeCache=null,mergeWorker=null,mergeWorkerTimer=null,mergeWorkerId=0,mergeComputing=false,mergeWorkerError=null;
 const mergeHistoryBusy=()=>mergeRestorePending||mergeSourcePending||mergeComputing||Object.values(mergePending).some(Boolean);
 const mergeBusy=()=>mergeRestorePending||mergeSourcePending||mergeComputing||Boolean(mergeWorkerError)||Object.values(mergePending).some(Boolean);
 const mergeSnapshot=()=>[[JSON.stringify(choices),state.output,JSON.stringify(state.inputs),JSON.stringify(state.options.mergeDrafts||{})]];
 const restoreMerge=value=>{choices=JSON.parse(value[0][0]);state.options.choices={...choices};state.output=value[0][1];if(value[0][2])state.inputs=JSON.parse(value[0][2]);if(value[0][3])state.options.mergeDrafts=JSON.parse(value[0][3]);};
 const mergeBinding=()=>['base','a','b'].map(side=>state.inputs[side]?{...state.inputs[side]}:null);
 const binaryRuntimes=new WeakMap(),tableRuntimes=new WeakMap(),tableHistory=new TableEditHistory();
 const binaryBinding=()=>['a','b'].map(side=>{const value=state.inputs[side];return value?{name:value.name,data:value.data,diskToken:value.diskToken}:null;});
 const sameBinaryBinding=(saved)=>saved.every((value,index)=>{const current=state.inputs[index===0?'a':'b'];return !value&&!current||Boolean(value&&current&&value.name===current.name&&value.data===current.data&&value.diskToken===current.diskToken);});
 const el=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
 let tableCellCommit=null;
 const button=(label,fn)=>{const b=el('button',label);b.type='button';buttonActions.set(b,fn);b.onclick=()=>Promise.resolve().then(async()=>{if(tableCellCommit)await tableCellCommit;return fn();}).catch(e=>notify(e.message,true));return b;};
 const input=(label,value,change,type='text')=>{const wrap=el('label',label+' '),field=el('input');field.type=type;field.value=value;field.onchange=()=>{change(field.value);onDirty();render();};wrap.append(field);return wrap;};
 const mergeDecoded=side=>isDocumentInput(state.inputs[side]?.name)?mergeDocuments[side]:(decodeText(decode(state.inputs[side]?.data||''),state.options.mergeReadEncodings?.[side]||'auto'));
 const text=side=>state.type==='text-merge3'?(state.options.mergeDrafts?.[side]??mergeDecoded(side).content):new TextDecoder('utf-8',{fatal:true}).decode(decode(state.inputs[side]?.data||''));
 const mergeOutputFormat=()=>state.options.mergeOutputFormat?validateFormat(state.options.mergeOutputFormat):mergeDecoded(['base','a','b'].find(side=>state.inputs[side])||'base').format;
 const mergeSourceBinding=()=>['base','a','b'].map(side=>encode(validateText(text(side).replace(/\r\n|\r/g,'\n'))));
 const bytes=side=>decode(state.inputs[side]?.data||'');
 function reset(){clearSheetReview();cancelMergeReads();mergeDocuments={};mergeRestorePending=null;cancelWorkbookReads();tableCellCommit=null;clearTableSelection();tableComparison=null;tableSelectionBinding=null;stopMergeWorker();host.setAttribute('aria-busy','false');mergeCache=null;clearTimeout(mergeSourceTimer);mergeSourcePending=false;mergeComposing=false;closeMergeMenu();selectedConflict=null;mergeHistory.clear();mergePending.a=mergePending.b=mergePending.base=null;closeTableMenu();tablePending.a=tablePending.b=null;tableRestorePending=null;closeBinaryMenu();binaryPending.a=binaryPending.b=null;generation++;importSerial++;openSerial={a:0,b:0,base:0};state={type:'binary-compare',inputs:{a:null,b:null,base:null},options:{delimiter:'auto',keys:'',headers:false,onlyDifferences:false},output:null};binaryHistory.clear();tableHistory.clear();binarySelection=null;choices={};merged=null;binaryPage=0;tablePage=0;layoutPage=0;conditionalPage=0;numberFormatPage=0;workbooks={};loading={};tableCache={};binaryCache=null;binaryRange=-1;}
 async function openSide(side){
  if(!['a','b','base'].includes(side))throw Error('Invalid side');
  if(mergeRestorePending)throw Error('Wait for the merge session to finish restoring.');
  if(tableRestorePending)throw Error('Wait for the workbook session to finish restoring before opening another file.');
  stopMergeWorker();clearTimeout(mergeSourceTimer);mergeSourcePending=false;mergeComposing=false;mergeHistory.flush();closeMergeMenu();closeTableMenu();closeBinaryMenu();tableRestorePending=null;importSerial++;const requestedGeneration=generation,requestedState=state,request=++openSerial[side]; let data;const binaryRequest=state.type==='binary-compare';if(binaryRequest){binaryPending[side]=request;render();}const mergeRequest=state.type==='text-merge3';if(mergeRequest){mergePending[side]=request;render();}const tableRequest=state.type==='table-compare';if(tableRequest){tablePending[side]=request;render();}
  try{
  if(desktop){const out=await desktop.openData(side,state.type==='text-merge3'?'text':state.type==='table-compare'?'table':'binary');if(!out||out.cancelled||requestedGeneration!==generation)return;data={name:out.name,data:out.data,...(out.diskToken?{diskToken:out.diskToken}:{})};}
  else {const file=await new Promise(resolve=>{const picker=el('input');picker.type='file';picker.onchange=()=>resolve(picker.files[0]);picker.oncancel=()=>resolve(null);picker.click();});if(!file||requestedGeneration!==generation)return;if(file.size>16*1024*1024)throw Error('Choose a file below 16 MB.');data={name:file.name,data:encode(new Uint8Array(await file.arrayBuffer()))};}
  if(requestedGeneration!==generation||requestedState!==state||request!==openSerial[side])return;
  const mergeParsed=mergeRequest?await readMergeInput('open:'+side,data,state.options,side):null;
  if(state.type==='table-compare'&&!isSheetInput(data.name))new TextDecoder('utf-8',{fatal:true}).decode(decode(data.data));
  const parsed=state.type==='table-compare'&&isSheetInput(data.name)?await readTrackedWorkbook('open:'+side,data.data,data.name):null;
  if(requestedGeneration!==generation||requestedState!==state||request!==openSerial[side])return;
  state.inputs[side]=data;if(mergeRequest){mergeDocuments[side]=mergeParsed;state.options.mergeDocumentProjections={...state.options.mergeDocumentProjections};if(mergeParsed.documentProjection)state.options.mergeDocumentProjections[side]=mergeParsed.documentProjection;else delete state.options.mergeDocumentProjections[side];}if(tableRequest&&isValueWorkbook(data.name)){if(!parsed?.every(sheet=>sheet.capabilities?.formulaComparison===true))state.options.workbookMode='values';if(!parsed?.every(sheet=>sheet.capabilities?.formattingComparison===true))state.options.compareFormatting=false;state.options.compareLayout=false;}if(mergeRequest&&state.options.mergeDrafts)delete state.options.mergeDrafts[side];if(parsed)workbooks[side]=parsed;else delete workbooks[side];loading[side]=false;delete tableCache[side];state.options.tableResult=null;delete state.options.tableTemplate;delete state.options.tableCopyBinding;delete state.options.tableCellEdits;delete state.options.tableStyleEdits;delete state.options.tableStructure;clearTableSelection();tablePage=0;layoutPage=0;conditionalPage=0;numberFormatPage=0;state.output=null;choices={};state.options.choices={};selectedConflict=null;binaryHistory.clear();tableHistory.clear();mergeHistory.clear();binarySelection=null;binaryPage=0;binaryRange=-1;onInputReplaced(side);onDirty();render();
  }catch(error){if(requestedGeneration===generation&&requestedState===state&&request===openSerial[side])throw error;}
  finally{if(mergeRequest&&requestedGeneration===generation&&requestedState===state&&mergePending[side]===request){mergePending[side]=null;render();}if(tableRequest&&requestedGeneration===generation&&requestedState===state&&tablePending[side]===request){tablePending[side]=null;render();}if(binaryRequest&&requestedGeneration===generation&&requestedState===state&&binaryPending[side]===request){binaryPending[side]=null;render();}}
 }
 const tableSnapshot=()=>[[JSON.stringify({template:state.options.tableTemplate||null,binding:state.options.tableCopyBinding||null,edits:state.options.tableCellEdits||null,styles:state.options.tableStyleEdits||null,structure:state.options.tableStructure||null})],...(state.options.tableResult||[])];
 const restoreTableSnapshot=snapshot=>{const metadata=JSON.parse(snapshot[0][0]);state.options.tableTemplate=metadata.template;state.options.tableCopyBinding=metadata.binding;state.options.tableCellEdits=metadata.edits||null;state.options.tableStyleEdits=metadata.styles||null;state.options.tableStructure=metadata.structure||null;state.options.tableResult=snapshot.length===1&&snapshot[0][1]==='empty'?null:snapshot.slice(1);};
 const currentTableSnapshot=()=>{const snapshot=tableSnapshot();if(!Array.isArray(state.options.tableResult))snapshot[0].push('empty');return snapshot;};
 function applyTableResult(rows,{template=state.options.tableTemplate||null,structural=false,group=null,binding=state.options.tableCopyBinding||null,edits=state.options.tableCellEdits||null,styles=state.options.tableStyleEdits||null,structure=state.options.tableStructure||null}={}){
  if(odsTemplate(template)&&(structural||structure||styles))throw Error('ODS workbook copies do not support structural or formatting edits. Choose Use values only for other edits.');
  if(structural&&styles?.cells.length)throw Error('Row and column changes cannot preserve copied formatting. Choose Use values only first, or undo formatting copies.');
  if(structural&&template){if(edits?.cells.some(cell=>!['text','blank'].includes(cell.type)))throw Error('Row and column changes cannot preserve workbook formulas or typed edits. Start a values-only result instead.');template={...template,structural:true};edits=null;}
  if(structure)structure=validateWorkbookStructuralRows(structure,{template,rows});
  if(edits)edits=validateResultCellEdits(edits,{rows,template,structure});
  if(styles)styles=validateWorkbookStyleEdits(styles,{rows,template,structure});
  const after=tableHistory.apply(currentTableSnapshot(),[[JSON.stringify({template,binding,edits,styles,structure})],...rows],group);restoreTableSnapshot(after);
 }
 // Pending opens invalidate exports immediately, before asynchronous parsing commits.
 const captureResultRequest=()=>{const original=state,signature=JSON.stringify(state),token=generation,serial=importSerial,requests=JSON.stringify(openSerial);return ()=>state===original&&JSON.stringify(state)===signature&&generation===token&&importSerial===serial&&JSON.stringify(openSerial)===requests;};
 const workbookHash=async data=>Array.from(globalThis.crypto?.subtle?new Uint8Array(await crypto.subtle.digest('SHA-256',decode(data))):sha256(decode(data)),byte=>byte.toString(16).padStart(2,'0')).join('');
 async function tableCopyContext(){
  const sources=await Promise.all(['a','b'].map(async side=>{const source=state.inputs[side];if(!source)return null;let hash=tableHashes.get(source);if(!hash){hash=workbookHash(source.data);tableHashes.set(source,hash);}return [await hash,/\.xlsx$/i.test(source.name)?'xlsx':isValueWorkbook(source.name)?source.name.split('.').pop().toLowerCase():'delimited'];}));
  return JSON.stringify([sources,state.options.delimiter||'auto',(state.options.keys||'').split(',').map(x=>x.trim()).filter(Boolean),!!state.options.headers,state.options.sheeta||0,state.options.sheetb||0]);
 }
 async function initializeTableResult(side,rows){
  const current=captureResultRequest(),input=state.inputs[side],sheet=workbooks[side]?.[state.options['sheet'+side]||0];
  if(valueSheet(sheet)&&sheet.uncached)throw Error(`This ${sheet.format.toUpperCase()} sheet has formula cells without stored results. Recalculate it in a spreadsheet app before using it as a result.`);
  let template=null;
  if(sheet&&/\.(xlsx|ods)$/i.test(input?.name||''))template={side,sheetName:sheet.name,sourceHash:await workbookHash(input.data),structural:false,...(/\.ods$/i.test(input.name)?{format:'ods'}:{})};
  if(odsTemplate(template)){const {exportOdsCopy}=await import('./ods-preserve.js');await exportOdsCopy(decode(input.data),sheet.name,[]);}
  if(!current())throw Error('The table changed while preparing the result. Choose a side again.');
  const context=await tableCopyContext();if(!current())throw Error('The table changed while preparing the result. Choose a side again.');
  const binding=createTableCopyOrigin({comparison:tableComparison,side,headerOffset:state.options.headers&&rows.length?1:0,context});
  applyTableResult(rows,{template,binding,edits:null,styles:null,structure:null});state.options.resultPage=0;onDirty();render();
 }
 const resultShape=(rows,structure=null)=>({rows:rows.length,columns:rows.length?rows.reduce((max,row)=>Math.max(max,row.length),0):structure?structure.operations.reduce(applyStructuralShape,{rows:structure.sourceRows,columns:structure.sourceColumns}).columns:0});
 const originalPosition=(row,column,structure)=>{let point={row,column};for(const op of [...(structure?.operations||[])].reverse()){if(!point)break;point=unmapStructuralCell(point,op);}return point;};
 const rewrittenFormula=(formula,structure,sheetName)=>{for(const op of structure?.operations||[])formula=transformWorkbookStructuralFormula(formula,{...op,formulaSheet:sheetName,targetSheet:sheetName});return formula;};
 function originalResultCell(sheet,row,column,structure){const point=originalPosition(row,column,structure);if(!point)return {cell:null,display:''};const cell=sheet.typedRows[point.row-1]?.[point.column-1];if(structure?.operations.length){const dynamic=cell?.dynamicArray?{dynamicArray:{...cell.dynamicArray,anchor:rewrittenFormula(cell.dynamicArray.anchor,structure,sheet.name),ref:rewrittenFormula(cell.dynamicArray.ref,structure,sheet.name)}}:{};if(cell?.type==='formula'){const transformed={...cell,...dynamic,value:rewrittenFormula(cell.value,structure,sheet.name),unsupported:!!cell.array,grouped:!!cell.array};return {cell:transformed,display:cellDisplay(transformed)};}if(cell?.array)return {cell:{...cell,...dynamic,type:'blank',value:null,unsupported:true,grouped:true,array:true},display:''};}return {cell,display:sheet.rows[point.row-1]?.[point.column-1]??''};}
 async function preservedWorkbook(styleOverlay=state.options.tableStyleEdits||null,candidate=null,context=null){
  const inputs=context?.inputs||state.inputs,parsed=context?.workbooks||workbooks;
  const options=candidate||state.options,template=options.tableTemplate,structure=options.tableStructure||null;
  if(odsTemplate(template)){
   const input=inputs[template.side],sheet=parsed[template.side]?.find(item=>item.name===template.sheetName),rows=options.tableResult;
   const overlay=options.tableCellEdits?validateOdsCellEdits(options.tableCellEdits,{rows,template}):null;
   if(!input||!/\.ods$/i.test(input.name)||!sheet||!Array.isArray(rows)||template.sourceHash!==await workbookHash(input.data))throw Error('The original ODS workbook no longer matches this result. Choose its side again.');
   if(template.structural||structure||styleOverlay)throw Error('ODS workbook copies do not support structural, formula or formatting changes.');
   if(rows.length!==sheet.rows.length||rows.some((row,r)=>!Array.isArray(row)||row.length!==sheet.rows[r].length||row.some(value=>typeof value!=='string')))throw Error('ODS workbook copies require unchanged row and column positions.');
   const changes=new Map((overlay?.cells||[]).map(cell=>[cell.row+':'+cell.column,cell]));
   rows.forEach((row,r)=>row.forEach((value,c)=>{const key=(r+1)+':'+(c+1);if(!changes.has(key)&&value!==sheet.rows[r][c])changes.set(key,{row:r+1,column:c+1,type:value===''?'blank':'text',value:value===''?null:value});}));
   const {exportOdsCopy}=await import('./ods-preserve.js');
   return {data:encode(await exportOdsCopy(decode(input.data),template.sheetName,[...changes.values()])),name:input.name.replace(/\.ods$/i,'-copy.ods')};
  }
  if(!template||!['a','b'].includes(template.side))throw Error('Choose an XLSX side as the result before saving a workbook copy.');
  if(template.structural&&!structure)throw Error('This older structural result cannot preserve its workbook. Undo those edits or export values only.');
  const input=inputs[template.side],sheet=parsed[template.side]?.find(item=>item.name===template.sheetName),rows=options.tableResult;
  if(!input||!/\.xlsx$/i.test(input.name)||!sheet||!Array.isArray(rows)||template.sourceHash!==await workbookHash(input.data))throw Error('The original workbook for this result is unavailable. Choose an XLSX side as the result again.');
  if(structure)validateWorkbookStructuralRows(structure,{template,sourceShape:resultShape(sheet.rows),rows});
  else if(rows.length!==sheet.rows.length)throw Error('Workbook copies require the original row and column positions. Export values only for structural changes.');
  const overlay=options.tableCellEdits?validateResultCellEdits(options.tableCellEdits,{rows,template,structure}):null;
  const changes=new Map((overlay?.cells||[]).map(cell=>[cell.row+':'+cell.column,cell]));
  rows.forEach((row,r)=>row.forEach((value,c)=>{const key=(r+1)+':'+(c+1);if(!changes.has(key)&&value!==originalResultCell(sheet,r+1,c+1,structure).display)changes.set(key,{row:r+1,column:c+1,type:'text',value});}));
  const styles=styleOverlay?validateWorkbookStyleEdits(styleOverlay,{rows,template,structure}):null;
  if(styles)await verifyStyleSources(styles,inputs,parsed);
  const {exportWorkbookCopy}=await import('./workbook-preserve.js');
  return {data:encode(await exportWorkbookCopy(input.data,template.sheetName,[...changes.values()],{styles:styles?.cells||[],sources:{a:inputs.a?.data,b:inputs.b?.data},...(structure?{structure}:{})})),name:input.name.replace(/\.xlsx$/i,'-copy.xlsx')};
 }
 function withCellEdits(cells,rows=state.options.tableResult){
  const template=state.options.tableTemplate,structure=state.options.tableStructure||null;if(!template||template.structural&&!structure)throw Error('Choose a preservable XLSX result to edit cell types or formulas.');
  const original=workbooks[template.side]?.find(sheet=>sheet.name===template.sheetName),map=new Map((state.options.tableCellEdits?.cells||[]).map(cell=>[cell.row+':'+cell.column,cell]));
  for(const cell of cells){const edit=odsTemplate(template)?normalizeOdsCellEdit(cell):normalizeWorkbookCellEdit(cell),prior=originalResultCell(original,edit.row,edit.column,structure);if(prior.cell?.unsupported&&prior.cell?.grouped)throw Error('Editing shared, array or spill formula groups is not supported.');if(odsTemplate(template)&&(prior.cell?.odsFormula||prior.cell?.odsValueType&&['number','boolean'].includes(edit.type)))throw Error('ODS formula targets and semantic date, time, currency or percentage targets cannot be changed to this type.');if(prior.cell?.type===edit.type&&prior.cell.value===edit.value){map.delete(edit.row+':'+edit.column);rows[edit.row-1][edit.column-1]=prior.display;}else map.set(edit.row+':'+edit.column,edit);}
  return validateResultCellEdits({version:1,side:template.side,sheetName:template.sheetName,sourceHash:template.sourceHash,cells:[...map.values()]},{rows,template,structure});
 }
 function isWorkbookHeader(row,column){
  const template=state.options.tableTemplate;if(!template)return false;
  const source=workbooks[template.side]?.find(sheet=>sheet.name===template.sheetName);
  return (source?.tableHeaders||[]).some(header=>{
   let first={row:header.row,column:header.first},last={row:header.row,column:header.last};
   for(const op of state.options.tableStructure?.operations||[]){
    if(op.operation==='delete'&&op.axis==='column'){
     const end=op.index+op.count-1;if(first.column>=op.index&&last.column<=end)return false;
     first.column=first.column<op.index?first.column:first.column>end?first.column-op.count:op.index;
     last.column=last.column<op.index?last.column:last.column>end?last.column-op.count:op.index-1;
    }else{first=mapStructuralCell(first,op);last=mapStructuralCell(last,op);if(!first||!last)return false;}
   }
   return row===first.row&&column>=first.column&&column<=last.column;
  });
 }
 async function changeWorkbookCell(edit,rows){
  const current=captureResultRequest(),options=state.options,template=options.tableTemplate,structure=options.tableStructure||null;
  const overlay=withCellEdits([edit],rows),cells=new Map((overlay?.cells||[]).map(cell=>[cell.row+':'+cell.column,cell]));
  if(odsTemplate(template)){await preservedWorkbook(null,{...options,tableResult:rows,tableCellEdits:overlay});if(!current())throw Error('The workbook changed while checking the cell edit. Try again.');applyTableResult(rows,{edits:overlay});onDirty();render();return;}
  const draft=await preservedWorkbook(),{exportWorkbookCopy}=await import('./workbook-preserve.js');
  const bytes=await exportWorkbookCopy(draft.data,template.sheetName,[edit]);
  const projected=(await readWorkbook(encode(bytes))).find(sheet=>sheet.name===template.sheetName);
  const source=workbooks[template.side]?.find(sheet=>sheet.name===template.sheetName);
  if(!projected)throw Error('The edited worksheet is unavailable.');
  rows.forEach((row,r)=>row.forEach((value,c)=>{
   const key=(r+1)+':'+(c+1),actual=projected.typedRows[r]?.[c],prior=originalResultCell(source,r+1,c+1,structure),expected=cells.get(key)||(value===prior.display?prior.cell:{type:'text',value});
   if((actual?.type||'blank')===(expected?.type||'blank')&&(actual?.value??null)===(expected?.value??null))return;
   if(actual?.unsupported)throw Error('The changed cell cannot be represented safely in the editor.');
   const next=normalizeWorkbookCellEdit({row:r+1,column:c+1,type:actual?.type||'blank',value:actual?.value??null});cells.set(key,next);row[c]=actual?.type==='formula'?cellDisplay(actual):(projected.rows[r]?.[c]??'');
  }));
  const edits=validateResultCellEdits({version:1,side:template.side,sheetName:template.sheetName,sourceHash:template.sourceHash,cells:[...cells.values()]},{rows,template,structure});
  await preservedWorkbook(options.tableStyleEdits||null,{...options,tableResult:rows,tableCellEdits:edits});
  if(!current())throw Error('The workbook changed while checking the cell edit. Try again.');
  applyTableResult(rows,{edits});onDirty();render();
 }
 async function changeWorkbookStructure(axis,operation,index){
  if(odsTemplate(state.options.tableTemplate))throw Error('ODS row and column changes are not supported. Choose Use values only first.');
  if(tableBusy())throw Error('Wait for workbook loading to finish.');
  const current=captureResultRequest(),options=state.options,oldTemplate=options.tableTemplate,source=workbooks[oldTemplate.side]?.find(sheet=>sheet.name===oldTemplate.sheetName);
  if(!source||oldTemplate.structural&&!options.tableStructure)throw Error('Choose an original workbook result before changing its structure.');
  const op={axis,operation,index,count:1},template={...oldTemplate,structural:true},initial=resultShape(source.rows),prior=options.tableStructure||{version:1,side:template.side,sheetName:template.sheetName,sourceHash:template.sourceHash,sourceRows:initial.rows,sourceColumns:initial.columns,operations:[]};
  const structure=validateWorkbookStructuralPlan({...prior,operations:[...prior.operations,op]},{template,sourceShape:initial});
  const before=resultShape(options.tableResult,prior),after=applyStructuralShape(before,op),rows=options.tableResult.map(row=>Array.from({length:before.columns},(_,c)=>row[c]??''));
  if(axis==='row')rows.splice(index-1,operation==='delete'?1:0,...(operation==='insert'?[Array(after.columns).fill('')]:[]));
  else for(const row of rows)row.splice(index-1,operation==='delete'?1:0,...(operation==='insert'?['']:[]));
  const moveOverlay=(overlay,formulas=false)=>overlay?{...overlay,cells:overlay.cells.flatMap(cell=>{const point=mapStructuralCell({row:cell.row,column:cell.column},op);return point?[{...cell,...point,...(formulas&&cell.type==='formula'?{value:transformWorkbookStructuralFormula(cell.value,{...op,formulaSheet:template.sheetName,targetSheet:template.sheetName})}:{})}]:[];})}:null;
  const oldEdits=new Map((options.tableCellEdits?.cells||[]).map(cell=>[cell.row+':'+cell.column,cell]));
  options.tableResult.forEach((row,r)=>row.forEach((value,c)=>{const key=(r+1)+':'+(c+1);if(!oldEdits.has(key)&&value!==originalResultCell(source,r+1,c+1,options.tableStructure).display)oldEdits.set(key,{row:r+1,column:c+1,type:'text',value});}));
  const baseEdits=oldEdits.size?{version:1,side:template.side,sheetName:template.sheetName,sourceHash:template.sourceHash,cells:[...oldEdits.values()]}:null;
  let edits=moveOverlay(baseEdits,true);const styles=moveOverlay(options.tableStyleEdits),overrides=new Map((edits?.cells||[]).map(cell=>[cell.row+':'+cell.column,cell]));
  rows.forEach((row,r)=>row.forEach((value,c)=>{const edit=overrides.get((r+1)+':'+(c+1));if(edit)row[c]=cellDisplay(edit);else {const priorCell=originalResultCell(source,r+1,c+1,structure);if(priorCell.cell?.type==='formula'||priorCell.cell?.array)row[c]=priorCell.display;}}));
  let binding=options.tableCopyBinding?structuredClone(options.tableCopyBinding):null;
  if(axis==='column'||axis==='row'&&index===1&&binding?.headerOffset)binding=null;else if(binding)binding.rowIds.splice(index-1,operation==='delete'?1:0,...(operation==='insert'?[null]:[]));
  const candidate={...options,tableResult:rows,tableTemplate:template,tableCellEdits:edits,tableStyleEdits:styles,tableStructure:structure,tableCopyBinding:binding};
  // Every graph/format refusal occurs before publishing a result or undo entry.
  try{
   // Apply the new operation to the actual current draft, including edits made
   // mid-journal. The package engine owns structured-reference and table context.
   const draft=await preservedWorkbook(options.tableStyleEdits||null),draftHash=await workbookHash(draft.data);
   const {exportWorkbookCopy}=await import('./workbook-preserve.js');
   const nextBytes=await exportWorkbookCopy(draft.data,template.sheetName,[],{structure:{version:1,side:template.side,sheetName:template.sheetName,sourceHash:draftHash,sourceRows:before.rows,sourceColumns:before.columns,operations:[op]}});
   const sheets=await readWorkbook(encode(nextBytes)),projected=sheets.find(sheet=>sheet.name===template.sheetName);
   if(!projected)throw Error('The edited worksheet is unavailable.');
   // Structural handlers can generate table headers and calculated cells. Publish
   // their actual saved values so the grid and subsequent edits use the same data.
   const cells=new Map((edits?.cells||[]).map(cell=>[cell.row+':'+cell.column,cell]));
   rows.forEach((row,r)=>row.forEach((value,c)=>{
    const actual=projected.typedRows[r]?.[c],display=actual?.type==='formula'?cellDisplay(actual):(projected.rows[r]?.[c]??'');
    const key=(r+1)+':'+(c+1),priorCell=originalResultCell(source,r+1,c+1,structure);
    const expected=cells.get(key)||(value===priorCell.display?priorCell.cell:{type:'text',value});
    if(value===display&&(actual?.type||'blank')===(expected?.type||'blank')&&(actual?.value??null)===(expected?.value??null))return;
    if(actual?.unsupported)throw Error('The generated cell cannot be represented safely in the editor.');
    const cell=normalizeWorkbookCellEdit({row:r+1,column:c+1,type:actual?.type||'blank',value:actual?.value??null});
    cells.set(key,cell);row[c]=display;
   }));
   edits=cells.size?validateResultCellEdits({version:1,side:template.side,sheetName:template.sheetName,sourceHash:template.sourceHash,cells:[...cells.values()]},{rows,template,structure}):null;
   await preservedWorkbook(styles,{...candidate,tableCellEdits:edits});
  }catch(error){if(!current())throw Error('The workbook changed while checking structural edits. Try the operation again.');throw error;}
  if(!current())throw Error('The workbook changed while checking structural edits. Try the operation again.');
  applyTableResult(rows,{template,binding,edits,styles,structure});state.options.resultPage=Math.min(state.options.resultPage||0,Math.max(0,Math.ceil(rows.length/100)-1));onDirty();render();
 }
 const cellDisplay=cell=>cell.type==='formula'?'[recalculate] ='+cell.value:cell.type==='blank'?'':String(cell.value);
 function useValuesOnly(){
  const template=state.options.tableTemplate,sheet=template&&workbooks[template.side]?.find(sheet=>sheet.name===template.sheetName),edits=state.options.tableCellEdits?.cells||[];
  if(template?.structural&&!state.options.tableStructure&&sheet?.formulas)throw Error('Undo structural changes before converting formulas to values only.');
  const rows=state.options.tableResult.map(row=>row.slice()),overrides=new Map(edits.map(cell=>[cell.row+':'+cell.column,cell]));let cleared=0;
  rows.forEach((row,r)=>row.forEach((value,c)=>{const edit=overrides.get((r+1)+':'+(c+1)),prior=sheet&&originalResultCell(sheet,r+1,c+1,state.options.tableStructure);if(edit?.type==='formula'||!edit&&(prior?.cell?.type==='formula'||prior?.cell?.odsFormula&&value===prior.display)){row[c]='';cleared++;}}));
  if(!window.confirm(`Create a values-only result? This removes workbook types and formatting${cleared?` and clears ${cleared} formula result cells because recalculated values are unavailable`:''}. Undo edit restores the workbook result.`))return;
  applyTableResult(rows,{template:null,edits:null,styles:null,structure:null});onDirty();render();
 }
 function valuesExportRows(){
  const rows=state.options.tableResult,template=state.options.tableTemplate,sheet=template&&workbooks[template.side]?.find(item=>item.name===template.sheetName),edits=state.options.tableCellEdits?.cells||[];
  if(edits.some(cell=>cell.type==='formula')||sheet?.formulas&&(edits.length||JSON.stringify(rows)!==JSON.stringify(sheet.rows)))throw Error('Formula results require recalculation. Save a workbook copy and recalculate in your spreadsheet app before exporting values only, or choose Use values only to explicitly clear formula results.');
  return rows.map(row=>row.slice());
 }
 async function saveResult(format='csv'){
  if(tableCellCommit)await tableCellCommit;
  const current=captureResultRequest();
  let data,name;
  if(state.type==='binary-compare'){if(binaryBusy())throw Error('Wait for binary loading to finish.');data=state.inputs.b?.data;if(typeof data!=='string')throw Error('Open or edit the right file first.');name=state.inputs.b.name||'result.bin';}
  else if(state.type==='text-merge3'){if(mergeBusy())throw Error('Wait for merge inputs to finish loading.');if(state.output===null)throw Error('Resolve every conflict before saving.');data=encode(encodeText(state.output,mergeOutputFormat()));name='merged.txt';}
  else if(state.type==='table-compare'){if(tableBusy())throw Error('Wait for table loading to finish.');if(!Array.isArray(state.options.tableResult))throw Error('Choose a side as the result first.');if(format==='workbook'){({data,name}=await preservedWorkbook());}else if(format==='xlsx'){const rows=valuesExportRows(),imported=await import('exceljs/dist/exceljs.min.js'),Excel=imported.default||imported,workbook=new Excel.Workbook();workbook.addWorksheet('Result').addRows(rows);data=encode(new Uint8Array(await workbook.xlsx.writeBuffer()));name='table-result.xlsx';}else{data=encode(new TextEncoder().encode(csvText(valuesExportRows())));name='table-result.csv';}}else throw Error('Unsupported result type.');
  if(!current())throw Error('The result changed while preparing the save. Review and save again.');
  if(desktop)await desktop.saveData(data,name,...(state.type==='table-compare'?[{kind:format==='workbook'&&odsTemplate(state.options.tableTemplate)?'ods-copy':'table-values'}]:state.type==='text-merge3'?[{kind:'merge-text'}]:[]));else {const url=URL.createObjectURL(new Blob([decode(data)]));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 }
 async function getArchiveResult(side){
  if(tableCellCommit)await tableCellCommit;
  if(state.type!=='table-compare')throw Error('Archive table export requires a table comparison.');
  if(tableBusy())throw Error('Wait for table loading to finish.');
  if(!['a','b'].includes(side)||!state.inputs[side])throw Error('Open the archive entry on this side first.');
  const name=state.inputs[side].name,extension=/\.(csv|tsv|xlsx|ods)$/i.exec(name||'')?.[1].toLowerCase();
  if(!extension)throw Error('Apply table results only to CSV, TSV, XLSX, or ODS archive entries.');
  if(!Array.isArray(state.options.tableResult))throw Error('Choose a side as the result first.');
  const current=captureResultRequest(),rows=structuredClone(state.options.tableResult);
  if(rows.length>50000||rows.some(row=>!Array.isArray(row)||row.length>512)||rows.reduce((count,row)=>count+row.length,0)>500000)throw Error('Result exceeds row, column, or cell limits.');
  // Results contain literal values, never executable formulas or workbook metadata.
  if(rows.some(row=>row.some(value=>value!==null&&(!['string','number','boolean'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value)))))throw Error('Table results must contain literal cell values.');
  let output;
  if(extension==='xlsx'||extension==='ods'){
   if((state.options.tableTemplate?.format||'xlsx')!==extension)throw Error('The result template format must match the target workbook entry.');
   output=decode((await preservedWorkbook()).data);
  }else output=new TextEncoder().encode(csvText(valuesExportRows().map(row=>row.map(value=>value??'')),extension==='tsv'?'\t':','));
  if(!current())throw Error('The table changed while preparing the archive result. Review the result again.');
  if(output.byteLength>32*1024*1024)throw Error('The archive result exceeds 32 MiB.');
  return {name,data:encode(output),...(['xlsx','ods'].includes(extension)?{preservedWorkbook:true,templateSide:state.options.tableTemplate.side,sheetName:state.options.tableTemplate.sheetName}:{})};
 }
 function undo(){
  if(state.type==='text-merge3'){if(mergeHistoryBusy()||!mergeHistory.canUndo)return;stopMergeWorker();restoreMerge(mergeHistory.undo(mergeSnapshot()));onDirty();render();return;}
  if(state.type==='table-compare'){if(tableBusy())return;if(!tableHistory.canUndo)return;restoreTableSnapshot(tableHistory.undo(currentTableSnapshot()));onDirty();render();return;}
  if(state.type!=='binary-compare'||binaryBusy()||!state.inputs.b||!binaryHistory.canUndo)return;
  state.inputs.b={...state.inputs.b,data:encode(binaryHistory.undo(bytes('b')))};onDirty();render();
 }
 function redo(){
  if(state.type==='text-merge3'){if(mergeHistoryBusy()||!mergeHistory.canRedo)return;stopMergeWorker();restoreMerge(mergeHistory.redo(mergeSnapshot()));onDirty();render();return;}
  if(state.type==='table-compare'){if(tableBusy())return;if(!tableHistory.canRedo)return;restoreTableSnapshot(tableHistory.redo(currentTableSnapshot()));onDirty();render();return;}
  if(state.type!=='binary-compare'||binaryBusy()||!state.inputs.b||!binaryHistory.canRedo)return;
  state.inputs.b={...state.inputs.b,data:encode(binaryHistory.redo(bytes('b')))};onDirty();render();
 }
 function getRuntimeState(){
  if(state.type==='text-merge3'){const token=Object.freeze({});mergeRuntimes.set(token,{inputs:JSON.stringify(mergeBinding()),value:JSON.stringify(mergeSnapshot()),history:mergeHistory.capture(),selectedConflict});return token;}
  if(state.type==='table-compare'){const token=Object.freeze({});tableRuntimes.set(token,{inputs:binaryBinding(),result:JSON.stringify(currentTableSnapshot()),history:tableHistory.capture()});return token;}
  if(state.type!=='binary-compare')return null;
  const token=Object.freeze({});
  binaryRuntimes.set(token,{inputs:binaryBinding(),history:binaryHistory.capture()});
  return token;
 }
 function refreshActions(){
  closeMergeMenu();closeTableMenu();closeBinaryMenu();
  const toolbar=host.querySelector('[data-advanced-main-toolbar]');if(!toolbar)return;
  for(const control of toolbar.querySelectorAll('button'))if(/^Open (left|right|base)$/.test(control.textContent))control.disabled=Boolean(tableRestorePending);
  toolbar.querySelectorAll('[data-advanced-extra-action]').forEach(action=>action.remove());
  for(const action of renderToolbarActions(state.type)||[]){action.dataset.advancedExtraAction='';toolbar.append(action);}
 }
 function render(){
  syncSheetReview();
  if(state.type==='text-merge3'&&mergeComposing){refreshMergePending();return;}
  const active=document.activeElement,mergeSourceFocus=state.type==='text-merge3'&&active?.dataset?.mergeSource?{side:active.dataset.mergeSource,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection,top:active.scrollTop,left:active.scrollLeft}:null,mergeConflictFocus=state.type==='text-merge3'?active?.closest?.('[data-merge-conflict]')?.dataset.mergeConflict:null,mergeChoiceFocus=active?.dataset?.mergeChoice,mergeOutputFocus=state.type==='text-merge3'&&active?.classList.contains('advanced-output')?{start:active.selectionStart,end:active.selectionEnd,top:active.scrollTop,left:active.scrollLeft}:null,mergeHistoryFocus=state.type==='text-merge3'&&(active?.hasAttribute('data-merge-undo')?'undo':active?.hasAttribute('data-merge-redo')?'redo':null),restoreTable=state.type==='table-compare'&&host.contains(active),tableFocus=active?.getAttribute?.('aria-label'),tableRow=active?.closest?.('[data-result-row]')?.dataset.resultRow,tableColumn=active?.closest?.('[data-result-column]')?.dataset.resultColumn,restoreBinary=state.type==='binary-compare'&&host.contains(active),focusedPane=active?.closest?.('[data-binary-side]')?.dataset.binarySide,focusedOffset=active?.dataset?.offset;
  closeMergeMenu();closeTableMenu();closeBinaryMenu();binaryMenuEntries=[];
  tableHistory.flush();mergeHistory.flush();
  host.replaceChildren();host.classList.add('advanced-workspace');
  const toolbar=el('div',undefined,'advanced-toolbar');toolbar.dataset.advancedMainToolbar='';
  for(const side of state.type==='text-merge3'?['base','a','b']:['a','b'])toolbar.append(button(`Open ${side==='a'?'left':side==='b'?'right':'base'}`,()=>openSide(side)),el('span',state.inputs[side]?.name||'No file','advanced-file'));
  const save=button(state.type==='table-compare'?'Export result CSV':'Save result',()=>saveResult());if(state.type==='text-merge3')save.disabled=mergeBusy()||state.output===null;if(state.type==='table-compare')save.disabled=tableBusy()||!Array.isArray(state.options.tableResult);if(state.type==='binary-compare')save.disabled=binaryBusy()||!state.inputs.b;toolbar.append(save);if(state.type==='table-compare'){toolbar.append(button('Export result XLSX',()=>saveResult('xlsx')));const preserve=button(odsTemplate(state.options.tableTemplate)?'Save ODS workbook copy':'Save workbook copy',()=>saveResult('workbook'));preserve.disabled=tableBusy()||!Array.isArray(state.options.tableResult)||!state.options.tableTemplate||state.options.tableTemplate.structural&&!state.options.tableStructure;preserve.title=state.options.tableTemplate?.structural&&!state.options.tableStructure?'Undo inserted or deleted rows and columns, or export values only.':'Preserve the original workbook and replace edited cell values.';toolbar.append(preserve);};host.append(toolbar);refreshActions();
  try{if(state.type==='binary-compare')renderBinary();else if(state.type==='table-compare')renderTable();else renderMerge();}catch(e){host.append(el('p',e.message,'advanced-error'));}
  if(state.type==='table-compare'){
   host.tabIndex=0;for(const control of host.querySelectorAll('button'))if(tableRestorePending||!/^Open (left|right)$/.test(control.textContent)&&tableBusy()||control.textContent==='Export result XLSX'&&!Array.isArray(state.options.tableResult))control.disabled=true;
   for(const control of host.querySelectorAll('input,select,textarea'))control.disabled=control.disabled||tableBusy();
   if(restoreTable){let target=tableFocus?[...host.querySelectorAll('[aria-label]')].find(node=>node.getAttribute('aria-label')===tableFocus):null;if(!target&&tableRow){const row=[...host.querySelectorAll('[data-result-row]')].find(node=>node.dataset.resultRow===tableRow);target=tableColumn?[...row?.querySelectorAll('[data-result-column]')||[]].find(node=>node.dataset.resultColumn===tableColumn):row;}(target||host).focus({preventScroll:true});}
  }
  if(mergeSourceFocus){const source=host.querySelector('[data-merge-source="'+mergeSourceFocus.side+'"]');if(source){source.focus({preventScroll:true});source.setSelectionRange(mergeSourceFocus.start,mergeSourceFocus.end,mergeSourceFocus.direction);source.scrollTop=mergeSourceFocus.top;source.scrollLeft=mergeSourceFocus.left;}}
  if(mergeOutputFocus){const output=host.querySelector('.advanced-output');if(output){output.focus({preventScroll:true});output.setSelectionRange(mergeOutputFocus.start,mergeOutputFocus.end);output.scrollTop=mergeOutputFocus.top;output.scrollLeft=mergeOutputFocus.left;}}else if(mergeHistoryFocus){host.querySelector('[data-merge-'+mergeHistoryFocus+']')?.focus({preventScroll:true});}
  if(mergeConflictFocus!==null&&mergeConflictFocus!==undefined&&selectedConflict===Number(mergeConflictFocus)){const box=host.querySelector('[data-merge-conflict="'+mergeConflictFocus+'"]');(mergeChoiceFocus?box?.querySelector('[data-merge-choice="'+mergeChoiceFocus+'"]'):box)?.focus({preventScroll:true});}
  if(restoreBinary){const pane=[...host.querySelectorAll('[data-binary-side]')].find(node=>node.dataset.binarySide===focusedPane)||host.querySelector('[data-binary-side]');const byte=focusedOffset!==undefined&&pane?[...pane.querySelectorAll('[data-offset]')].find(node=>node.dataset.offset===focusedOffset):null;(byte||pane)?.focus({preventScroll:true});}
 }
 function renderBinary(){
  const mode=state.options.binaryAlignment==='offset'?'offset':'aligned';
  const leftData=state.inputs.a?.data||'',rightData=state.inputs.b?.data||'';
  if(!binaryCache||binaryCache.leftData!==leftData||binaryCache.rightData!==rightData||binaryCache.mode!==mode){
   const a=decode(leftData),b=decode(rightData);binaryRange=-1;binarySelection=null;
   binaryCache={leftData,rightData,mode,a,b,result:alignBinary(a,b,{mode})};
  }
  const {a,b,result}=binaryCache,pages=Math.max(1,Math.ceil(result.length/4096));
  binaryPage=Math.max(0,Math.min(binaryPage,pages-1));
  const description=result.alignment==='aligned'?'Insertion alignment · gaps preserve matching bytes.':`Offset comparison${result.fallbackReason?' · '+result.fallbackReason:''}.`;
  host.append(el('p',`${result.differingBytes.toLocaleString()} differing byte positions · ${result.rangeCount.toLocaleString()} ranges · ${description}`, 'advanced-note'));
  const controls=el('div',undefined,'advanced-toolbar'),modeLabel=el('label','Binary comparison '),modeSelect=el('select');
  modeSelect.setAttribute('aria-label','Binary comparison');
  for(const [value,label]of [['aligned','Align inserted bytes'],['offset','Compare at same offset']]){const option=el('option',label);option.value=value;modeSelect.append(option);}
  const changeMode=value=>{state.options.binaryAlignment=value;binaryPage=0;onDirty();render();};modeSelect.value=mode;modeSelect.onchange=()=>changeMode(modeSelect.value);modeLabel.append(modeSelect);controls.append(modeLabel);
  const previous=button('Previous page',()=>{binaryPage--;binaryRange=-1;render();}),nextPage=button('Next page',()=>{binaryPage++;binaryRange=-1;render();});previous.disabled=binaryPage===0;nextPage.disabled=binaryPage===pages-1;
  controls.append(previous,el('span',`Page ${binaryPage+1} / ${pages}`),nextPage);
  const navigateDifference=direction=>{
   const ranges=result.ranges;if(!ranges.length)return;
   if(binaryRange>=0)binaryRange=(binaryRange+direction+ranges.length)%ranges.length;
   else if(direction>0){binaryRange=ranges.findIndex(range=>range.end>binaryPage*4096);if(binaryRange<0)binaryRange=0;}
   else {binaryRange=ranges.findLastIndex(range=>range.start<(binaryPage+1)*4096);if(binaryRange<0)binaryRange=ranges.length-1;}
   binaryPage=Math.floor(ranges[binaryRange].start/4096);binarySelection=null;render();
   host.querySelector(direction>0?'.binary-next-difference':'.binary-previous-difference')?.focus({preventScroll:true});
   const viewport=host.querySelector('.binary-panes'),target=viewport?.querySelector('.binary-current');
   if(target){viewport.scrollTop+=target.getBoundingClientRect().top-viewport.getBoundingClientRect().top-44;
    for(const pane of viewport.children){const byte=pane.querySelector('.binary-current');if(byte)pane.scrollLeft+=byte.getBoundingClientRect().left-pane.getBoundingClientRect().left-100;}}
  };
  const previousDifference=button('Previous difference',()=>navigateDifference(-1)),nextDifference=button('Next difference',()=>navigateDifference(1));
  previousDifference.className='binary-previous-difference';nextDifference.className='binary-next-difference';
  previousDifference.disabled=nextDifference.disabled=!result.ranges.length;
  const position=el('span',result.ranges.length?`Difference ${binaryRange<0?'—':binaryRange+1} / ${result.ranges.length}${result.truncated?' listed':''}`:'No differences','binary-difference-position');position.setAttribute('role','status');
  controls.append(previousDifference,nextDifference,position);
  let offset='',value='';controls.append(input('Byte offset (hex)',offset,v=>{offset=v;}),input('Right byte (hex)',value,v=>{value=v;}));
  // Edits always address the physical right file, never the aligned display position.
  const fields=controls.querySelectorAll('input');fields[0].onchange=()=>offset=fields[0].value;fields[1].onchange=()=>value=fields[1].value;
  const commitEdit=(start,end,replacement)=>{
   if(binaryBusy())throw Error('Wait for binary loading to finish.');
   const edited=binaryHistory.apply(b,start,end,replacement);
   if(edited===b)return;
   state.inputs.b={...state.inputs.b,data:encode(edited)};onDirty();render();
  };
  const applyByte=button('Apply byte',()=>{
   offset=fields[0].value;value=fields[1].value;
   if(!/^[0-9a-f]+$/i.test(offset)||!/^[0-9a-f]{2}$/i.test(value))throw Error('Enter a hexadecimal offset and exactly two hex digits.');
   const at=parseInt(offset,16);if(at>=b.length)throw Error('Offset must be within the right file.');
   commitEdit(at,at+1,Uint8Array.of(parseInt(value,16)));
  });
  const undoEdit=button('Undo edit',undo);undoEdit.disabled=!binaryHistory.canUndo;
  const redoEdit=button('Redo edit',redo);redoEdit.disabled=!binaryHistory.canRedo;
  const range=result.ranges[binaryRange],copyOffsets=range?binaryRangeOffsets(result.segments,range):null;
  const copyDifference=button('Copy difference to right',()=>{
   if(!copyOffsets||!state.inputs.a||!state.inputs.b)return;
   commitEdit(copyOffsets.rightStart,copyOffsets.rightEnd,a.subarray(copyOffsets.leftStart,copyOffsets.leftEnd));
  });copyDifference.disabled=!copyOffsets||!state.inputs.a||!state.inputs.b;
    const editRange=button('Edit byte range…',()=>{
   if(!state.inputs.b)return;
   const requestedGeneration=generation,originalData=rightData,dialog=el('dialog',undefined,'binary-range-dialog');dialog.setAttribute('aria-label','Edit right byte range');
   dialog.append(el('h2','Edit right byte range'),el('p','Offsets are hexadecimal positions in the right file. The end offset is exclusive. Changes stay in memory until Save result.'));
   const field=(label,tag='input')=>{const wrapper=el('label',label),control=el(tag);control.setAttribute('aria-label',label);wrapper.append(control);dialog.append(wrapper);return control;};
   const operation=field('Operation','select');for(const [value,label]of [['replace','Replace bytes'],['insert','Insert bytes'],['delete','Delete bytes']]){const option=el('option',label);option.value=value;operation.append(option);}
   const begin=field('Start offset (hex)'),end=field('End offset (hex, exclusive)'),replacement=field('Replacement bytes (hex)','textarea');
   begin.value=(binarySelection?Math.min(binarySelection.anchor,binarySelection.end):copyOffsets?.rightStart||0).toString(16);
   end.value=(binarySelection?Math.max(binarySelection.anchor,binarySelection.end)+1:copyOffsets?.rightEnd||0).toString(16);
   replacement.rows=4;replacement.maxLength=3*32*1024*1024;replacement.placeholder='e.g. 00 ff 2a — spaces and line breaks are allowed';
   const error=el('p',undefined,'binary-range-error');error.setAttribute('role','alert');dialog.append(error);
   operation.onchange=()=>{end.disabled=operation.value==='insert';replacement.disabled=operation.value==='delete';error.textContent='';};
   const cancel=button('Cancel',()=>dialog.close()),apply=button('Apply range edit',()=>{
    try{
     if(generation!==requestedGeneration||state.inputs.b?.data!==originalData)throw Error('The right file changed. Reopen the range editor.');
     const parseOffset=value=>{if(!/^(?:0x)?[0-9a-f]+$/i.test(value.trim()))throw Error('Enter hexadecimal start and end offsets.');const number=parseInt(value.trim(),16);if(!Number.isSafeInteger(number))throw Error('Offset is too large.');return number;};
     const start=parseOffset(begin.value),stop=operation.value==='insert'?start:parseOffset(end.value);
     if(start>stop||stop>b.length)throw Error('The range must be within the right file. Insertion at its end is allowed.');
     if(operation.value==='delete'&&start===stop)throw Error('Choose at least one byte to delete.');
     const hex=operation.value==='delete'?'':replacement.value.replace(/\s/g,'');
     if(operation.value!=='delete'&&(!hex.length||hex.length%2||!/^[0-9a-f]+$/i.test(hex)))throw Error('Enter complete pairs of hexadecimal digits, such as 00 ff 2a. Use Delete bytes to remove a range.');
     if(hex.length>64*1024*1024)throw Error('Replacement bytes exceed 32 MB.');
     const data=new Uint8Array(hex.length/2);for(let i=0;i<data.length;i++)data[i]=parseInt(hex.slice(i*2,i*2+2),16);
     commitEdit(start,stop,data);if(dialog.isConnected)dialog.close();host.querySelector('.binary-edit-range')?.focus({preventScroll:true});
    }catch(problem){error.textContent=problem.message;}
   });
   const actions=el('div',undefined,'advanced-toolbar');actions.append(cancel,apply);dialog.append(actions);host.append(dialog);
   dialog.addEventListener('close',()=>{dialog.remove();host.querySelector('.binary-edit-range')?.focus({preventScroll:true});});dialog.showModal();begin.focus();
  });editRange.className='binary-edit-range';editRange.disabled=!state.inputs.b;
  controls.append(applyByte,undoEdit,redoEdit,copyDifference,editRange);host.append(controls);
  if(copyOffsets)host.append(el('p',`Copy will replace ${(copyOffsets.rightEnd-copyOffsets.rightStart).toLocaleString()} right bytes at 0x${copyOffsets.rightStart.toString(16)} with ${(copyOffsets.leftEnd-copyOffsets.leftStart).toLocaleString()} left bytes at 0x${copyOffsets.leftStart.toString(16)}. Save result writes the edited file.`, 'advanced-note binary-copy-summary'));
  host.append(el('p','Offsets are hexadecimal positions in each original file. Hover a byte for its exact offset. ·· marks an alignment gap. Editing uses the right file’s offset. Click a right byte, then Shift-click to select a range. Undo/Redo retain up to 100 edits and 32 MB of history.', 'advanced-note'));
  if(result.truncated)host.append(el('p','Navigation lists the first 10,000 difference ranges. All bytes are counted and accessible by page.','advanced-note'));
  const start=binaryPage*4096,end=Math.min(result.length,start+4096),slots=[];
  for(const segment of result.segments){
   if(segment.end<=start)continue;if(segment.start>=end)break;
   for(let position=Math.max(start,segment.start);position<Math.min(end,segment.end);position++){
    const delta=position-segment.start,left=delta<segment.leftLength?segment.leftStart+delta:null,right=delta<segment.rightLength?segment.rightStart+delta:null;
    slots.push({left,right,changed:left===null||right===null||a[left]!==b[right]});
   }
  }
  const panes=el('div',undefined,'advanced-panes binary-panes');
  const activeRange=result.ranges[binaryRange];
  for(const [side,data,key]of [['Left',a,'left'],['Right',b,'right']]){
   const pane=el('div',undefined,'advanced-hex');pane.tabIndex=0;pane.dataset.binarySide=key;pane.setAttribute('role','group');pane.setAttribute('aria-label',side+' binary comparison');pane.append(el('h3',`${side} · ${data.length.toLocaleString()} bytes`));
   for(let at=0;at<slots.length;at+=16){
    const row=el('div',undefined,'advanced-hex-row'),rowSlots=slots.slice(at,at+16),first=rowSlots.find(slot=>slot[key]!==null);
    row.append(el('span',first?first[key].toString(16).padStart(8,'0'):'--------','advanced-offset'));let ascii='';
    for(let i=0;i<16;i++){
     const slot=rowSlots[i],address=slot?.[key],exists=address!==null&&address!==undefined;
     const span=el('span',exists?data[address].toString(16).padStart(2,'0'):slot?'··':'  ','advanced-byte'+(slot?.changed?' changed':'')+(slot&&!exists?' binary-gap':''));
     if(slot){span.dataset.position=String(start+at+i);if(activeRange&&start+at+i>=activeRange.start&&start+at+i<activeRange.end)span.classList.add('binary-current');}
     if(exists){span.tabIndex=-1;span.dataset.offset=String(address);span.title=`${side} offset 0x${address.toString(16).padStart(8,'0')}`;}else if(slot)span.title='No byte on this side';
     if(exists&&key==='right'){
      if(binarySelection&&address>=Math.min(binarySelection.anchor,binarySelection.end)&&address<=Math.max(binarySelection.anchor,binarySelection.end))span.classList.add('binary-selected');
      span.onclick=event=>{closeBinaryMenu();binarySelection={anchor:event.shiftKey&&binarySelection?binarySelection.anchor:address,end:address};
       for(const byte of pane.querySelectorAll('.advanced-byte[data-offset]')){const at=Number(byte.dataset.offset);byte.classList.toggle('binary-selected',at>=Math.min(binarySelection.anchor,binarySelection.end)&&at<=Math.max(binarySelection.anchor,binarySelection.end));}};
     }
     row.append(span);ascii+=exists?(data[address]>=32&&data[address]<=126?String.fromCharCode(data[address]):'.'):slot?'·':' ';
    }
    row.append(el('span',ascii,'advanced-ascii'));pane.append(row);
   }
   panes.append(pane);
  }
  host.append(panes);
  for(const control of [applyByte,undoEdit,redoEdit,copyDifference,editRange])control.disabled=control.disabled||binaryBusy();applyByte.disabled=applyByte.disabled||!b.length;
  const entry=(label,run,disabled=()=>false)=>({label,run,disabled});
  const fromButton=control=>entry(control.textContent,buttonActions.get(control),()=>control.disabled||!control.isConnected);
  binaryMenuEntries=[{label:'Files',children:[entry('Open left',()=>openSide('a')),entry('Open right',()=>openSide('b')),entry('Save result',()=>saveResult(),()=>binaryBusy()||!state.inputs.b)]},
   {label:'Navigate',children:[previous,nextPage,previousDifference,nextDifference].map(fromButton)},
   {label:'Comparison mode',children:[entry('Align inserted bytes',()=>changeMode('aligned')),entry('Compare at same offset',()=>changeMode('offset'))]},
   {label:'Edit right file',children:[editRange,applyByte,copyDifference,undoEdit,redoEdit].map(fromButton)},
   {label:'Byte fields',children:[entry('Byte offset (hex)',()=>fields[0].focus()),entry('Right byte (hex)',()=>fields[1].focus())]}];
 }

 function showBinaryContext(event,keyboard=false){
  if(state.type!=='binary-compare'||event.target.isContentEditable||event.target.closest('input,textarea,select,dialog'))return;
  event.preventDefault();event.stopPropagation();closeBinaryMenu();
  const byte=event.target.closest('.advanced-byte[data-offset]'),pane=event.target.closest('[data-binary-side]');
  if(byte&&pane?.dataset.binarySide==='right'){
   const address=Number(byte.dataset.offset),inside=binarySelection&&address>=Math.min(binarySelection.anchor,binarySelection.end)&&address<=Math.max(binarySelection.anchor,binarySelection.end);
   if(!inside)binarySelection={anchor:address,end:address};
   for(const value of pane.querySelectorAll('.advanced-byte[data-offset]')){const at=Number(value.dataset.offset);value.classList.toggle('binary-selected',at>=Math.min(binarySelection.anchor,binarySelection.end)&&at<=Math.max(binarySelection.anchor,binarySelection.end));}
   const fields=host.querySelectorAll('.advanced-toolbar input');if(fields.length>=2){fields[0].value=address.toString(16);fields[1].value=byte.textContent;}
  }
  const restore=byte||pane||host.querySelector('[data-binary-side]')||host,side=pane?.dataset.binarySide,offset=byte?.dataset.offset;
  const ticket=binaryMenuTicket,token=generation,currentState=state,left=state.inputs.a,right=state.inputs.b,requests=JSON.stringify(openSerial),selection=JSON.stringify(binarySelection),values=[...host.querySelectorAll('.advanced-toolbar input')].map(input=>input.value).join('|');
  const valid=()=>ticket===binaryMenuTicket&&token===generation&&state===currentState&&left===state.inputs.a&&right===state.inputs.b&&requests===JSON.stringify(openSerial)&&selection===JSON.stringify(binarySelection)&&values===[...host.querySelectorAll('.advanced-toolbar input')].map(input=>input.value).join('|')&&host.isConnected&&!host.closest('[hidden]')&&document.getElementById('binaryContext')?.hidden===false;
  const invoke=run=>{try{Promise.resolve(run()).catch(error=>notify(error.message,true));}catch(error){notify(error.message,true);}};
  const convert=entries=>entries.map(entry=>entry.children?{label:entry.label,children:convert(entry.children)}:{label:entry.label,disabled:entry.disabled(),validate:()=>valid()&&!entry.disabled(),action:()=>invoke(entry.run)});
  const entries=[...binaryMenuEntries],extra=[...host.querySelectorAll('[data-advanced-extra-action]')].filter(action=>typeof action.onclick==='function').map(action=>{const handler=action.onclick;return {label:action.textContent.trim()||action.getAttribute('aria-label')||action.title,run:()=>handler.call(action),disabled:()=>binaryBusy()||!action.isConnected||action.disabled||Boolean(action.closest('[hidden]'))||action.onclick!==handler};}).filter(action=>action.label);
  if(extra.length)entries.push({label:'Archive entry',children:extra});
  const rect=restore.getBoundingClientRect();binaryMenu.open(convert(entries),keyboard?rect.left+12:event.clientX,keyboard?rect.top+Math.min(rect.height,28):event.clientY,()=>{if(!host.isConnected||host.closest('[hidden]'))return;const current=side?[...host.querySelectorAll('[data-binary-side]')].find(node=>node.dataset.binarySide===side):null;const target=offset&&current?[...current.querySelectorAll('[data-offset]')].find(node=>node.dataset.offset===offset):null;(target||current||(restore.isConnected?restore:host)).focus({preventScroll:true});});
 }
 host.addEventListener('contextmenu',event=>showBinaryContext(event));
 host.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')showBinaryContext(event,true);});
 host.addEventListener('input',()=>{if(state.type==='text-merge3')closeMergeMenu();if(state.type==='table-compare')closeTableMenu();if(state.type==='binary-compare')closeBinaryMenu();});
 function showTableContext(event,keyboard=false){
  if(state.type!=='table-compare'||event.target.isContentEditable||event.target.closest('input,textarea,select,dialog'))return;
  event.preventDefault();event.stopPropagation();closeTableMenu();
  const source=event.target.closest('[data-copy-row]');if(source){const key=source.dataset.copyRow+'|'+(source.dataset.copyColumn??'row');if(!tableSelection.has(key)&&!tableSelection.has(source.dataset.copyRow+'|row'))selectTableDifference(source,event);}
  const row=event.target.closest('[data-result-row]'),cell=event.target.closest('[data-result-column]');
  if(row){state.options.editRow=Number(row.dataset.resultRow);if(cell)state.options.editColumn=Number(cell.dataset.resultColumn);for(const [label,value]of [['Result row number',state.options.editRow],['Result column number',state.options.editColumn||1]]){const field=host.querySelector('[aria-label="'+label+'"]');if(field)field.value=String(value);}for(const value of host.querySelectorAll('[data-result-row],[data-result-column]'))value.classList.remove('table-context-selected');(cell||row).classList.add('table-context-selected');}
  const restore=source||cell||row||event.target.closest('.advanced-table-scroll')||host,ticket=tableMenuTicket,token=generation,currentState=state,left=state.inputs.a,right=state.inputs.b,result=state.options.tableResult,serial=importSerial,requests=JSON.stringify(openSerial),selection=String(state.options.editRow)+'/'+String(state.options.editColumn);
  const controlValues=()=>[...host.querySelectorAll('input,select,textarea')].map(input=>input.type==='checkbox'?String(input.checked):input.value).join('\u0001'),values=controlValues();
  const valid=()=>ticket===tableMenuTicket&&token===generation&&state===currentState&&state.type==='table-compare'&&left===state.inputs.a&&right===state.inputs.b&&result===state.options.tableResult&&serial===importSerial&&requests===JSON.stringify(openSerial)&&selection===String(state.options.editRow)+'/'+String(state.options.editColumn)&&values===controlValues()&&host.isConnected&&!host.closest('[hidden]')&&document.getElementById('tableContext')?.hidden===false;
  const invoke=fn=>{try{Promise.resolve(fn()).catch(error=>notify(error.message,true));}catch(error){notify(error.message,true);}};
  const item=(label,fn,disabled)=>({label,disabled:disabled(),validate:()=>valid()&&!disabled(),action:()=>invoke(fn)});
  const controls=[...host.querySelectorAll('button')],findButton=label=>controls.find(control=>control.textContent===label&&!control.hasAttribute('data-advanced-extra-action'));
  const fromButton=label=>{const control=findButton(label),run=control&&buttonActions.get(control);return item(label,run||(()=>{}),()=>!run||!control.isConnected||control.disabled||(!/^Open (left|right)$/.test(label)&&tableBusy()));};
  const entries=[{label:'Files',children:['Open left','Open right','Export result CSV','Export result XLSX','Save workbook copy'].map(fromButton)},
   {label:'Navigate',children:['Previous rows','Next rows','Previous result rows','Next result rows','Previous layout differences','Next layout differences'].map(fromButton)},
   {label:'Result',children:['Use left as result','Use right as result','Copy left cells to result','Copy right cells to result','Copy left formatting to result','Copy right formatting to result','Use values only','Undo edit','Redo edit'].map(fromButton)},
   {label:'Rows and columns',children:['Insert row before','Delete row','Insert column before','Delete column'].map(fromButton)}];
  const settings=[...host.querySelectorAll('.advanced-toolbar input,.advanced-toolbar select,.advanced-toolbar textarea')].map(control=>{const label=control.getAttribute('aria-label')||control.closest('label')?.firstChild?.textContent?.trim();return label?item(label,()=>control.focus(),()=>tableBusy()||!control.isConnected||control.disabled):null;}).filter(Boolean);
  if(settings.length)entries.push({label:'Settings',children:settings});
  const extra=[...host.querySelectorAll('[data-advanced-extra-action]')].filter(action=>typeof action.onclick==='function').map(action=>{const handler=action.onclick,label=action.textContent.trim()||action.getAttribute('aria-label')||action.title;return item(label,()=>handler.call(action),()=>tableBusy()||!action.isConnected||action.disabled||Boolean(action.closest('[hidden]'))||action.onclick!==handler);});if(extra.length)entries.push({label:'Archive entry',children:extra});
  const rect=restore.getBoundingClientRect();tableMenu.open(entries,keyboard?rect.left+12:event.clientX,keyboard?rect.top+Math.min(rect.height,28):event.clientY,()=>{if(host.isConnected&&!host.closest('[hidden]'))(restore.isConnected?restore:host).focus({preventScroll:true});});
 }
 host.addEventListener('contextmenu',event=>showTableContext(event));
 host.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')showTableContext(event,true);});
 const sheetReviewOptions=()=>Object.fromEntries(['workbookMode','headers','keys','compareFormatting','compareLayout','compareConditionalRules','compareNumberFormats'].map(key=>[key,state.options[key]]));
 function sheetReviewBinding(){return {a:state.inputs.a,b:state.inputs.b,wa:workbooks.a,wb:workbooks.b,criteria:JSON.stringify(sheetReviewOptions()),generation,serial:importSerial,opens:JSON.stringify(openSerial)};}
 function sameSheetReviewBinding(binding){if(!binding||state.type!=='table-compare')return false;const current=sheetReviewBinding();return Object.keys(current).every(key=>current[key]===binding[key]);}
 function stopSheetReview(cancelled=true){sheetReview.ticket++;sheetReview.worker?.terminate();sheetReview.worker=null;if(cancelled)for(const [id,value]of sheetReview.statuses)if(['queued','comparing'].includes(value.status))sheetReview.statuses.set(id,{status:'cancelled'});}
 function clearSheetReview(){stopSheetReview(false);sheetReview.binding=null;sheetReview.rows=[];sheetReview.statuses.clear();sheetReview.completed=0;sheetReview.total=0;sheetReview.page=0;sheetReview.error=null;}
 function syncSheetReview(){if(sheetReview.binding&&!sameSheetReviewBinding(sheetReview.binding))clearSheetReview();}
 function openReviewPair(row){if(tableBusy()||row.aIndex===null||row.bIndex===null)return;state.options.sheeta=row.aIndex;state.options.sheetb=row.bIndex;clearTableSelection();tablePage=layoutPage=conditionalPage=numberFormatPage=0;onDirty();render();}
 function paintSheetReview(){
  const section=host.querySelector('[data-workbook-sheet-review]');if(!section)return;const current=section.contains(document.activeElement)?document.activeElement?.getAttribute('aria-label'):null;section.replaceChildren();
  const rows=sheetReview.rows,matched=rows.filter(row=>row.aIndex!==null&&row.bIndex!==null),finished=matched.filter(row=>['same','different','unavailable','error'].includes(sheetReview.statuses.get(row.id)?.status)),structural=rows.filter(row=>row.aIndex===null||row.bIndex===null||row.orderChanged||row.visibility!=='same');
  const allSame=matched.length>0&&finished.length===matched.length&&!structural.length&&finished.every(row=>sheetReview.statuses.get(row.id)?.status==='same');
  const summary=el('summary',`Workbook sheets · ${rows.length} entries · ${finished.length} / ${matched.length} compared`);section.append(summary);
  const actions=el('div',undefined,'advanced-toolbar'),compare=button('Compare all sheets',startSheetReview),stop=button('Stop sheet review',()=>{stopSheetReview();paintSheetReview();});compare.disabled=tableBusy()||Boolean(sheetReview.worker)||!matched.length;stop.disabled=!sheetReview.worker;actions.append(compare,stop);section.append(actions);
  const note=el('p',allSame?'All source sheets match for the selected criteria.':'Review original source sheets; result edits are separate. Exact names pair automatically. Differently named sheets remain separate.', 'advanced-note');note.setAttribute('role','status');section.append(note);
  if([...sheetReview.statuses.values()].some(value=>value.counts?.formattingDomain?.restricted))section.append(el('p','Cross-format formatting uses the shared native cell grid. Styles outside that grid are reported in the sheet detail; matching does not imply identical rendered appearance.','advanced-note'));
  if(sheetReview.error)section.append(el('p',sheetReview.error,'advanced-error'));
  const selectedA=workbooks.a?.[state.options.sheeta||0]?.name,selectedB=workbooks.b?.[state.options.sheetb||0]?.name;section.append(el('p',`Current detail: ${selectedA??'—'} ↔ ${selectedB??'—'}. Navigating does not replace your result or workbook-copy template.`,'advanced-note'));
  const pages=Math.max(1,Math.ceil(rows.length/50));sheetReview.page=Math.max(0,Math.min(sheetReview.page,pages-1));if(pages>1){const navigation=el('div',undefined,'advanced-toolbar'),previous=button('Previous sheets',()=>{sheetReview.page--;paintSheetReview();}),next=button('Next sheets',()=>{sheetReview.page++;paintSheetReview();});previous.disabled=sheetReview.page===0;next.disabled=sheetReview.page===pages-1;navigation.append(previous,el('span',`Sheets page ${sheetReview.page+1} / ${pages}`),next);section.append(navigation);}
  const scroll=el('div',undefined,'workbook-sheet-list'),table=el('table'),head=el('tr');for(const title of ['Sheet','Left','Right','Metadata','Review'])head.append(el('th',title));table.append(head);
  const position=(sheet,index)=>{if(index===null)return '—';const visibility=sheet?.metadata?.visibility;return `${index+1} · ${visibility?.available?visibility.value:'visibility unavailable'}`;};
  for(const row of rows.slice(sheetReview.page*50,(sheetReview.page+1)*50)){
   const tr=el('tr');tr.dataset.sheetReviewId=row.id;tr.dataset.sheetName=row.name;const status=sheetReview.statuses.get(row.id)||{status:row.status,reason:row.reason};tr.dataset.sheetReviewStatus=status.status;const name=el('td');if(row.aIndex!==null&&row.bIndex!==null){const open=button(row.name,()=>openReviewPair(row));open.setAttribute('aria-label','Review sheet '+row.name);open.setAttribute('aria-pressed',String(row.aIndex===(state.options.sheeta||0)&&row.bIndex===(state.options.sheetb||0)));open.disabled=tableBusy();name.append(open);}else name.textContent=row.name;
   const metadata=[row.orderChanged?'Relative order differs':'',row.visibility==='different'?'Visibility differs':row.visibility==='unavailable'?'Visibility unavailable':''].filter(Boolean).join(' · ')||'Same metadata';const labels={'not-compared':'Not compared','left-only':'Left only','right-only':'Right only',same:'Same for criteria',different:'Different',unavailable:'Unavailable',cancelled:'Cancelled',queued:'Queued',comparing:'Comparing',error:'Error'};const statusCell=el('td',labels[status.status]||status.status);statusCell.title=status.reason||status.reasons?.join('; ')||row.reason||'';if(statusCell.title)statusCell.append(el('small',statusCell.title));tr.append(name,el('td',position(workbooks.a?.[row.aIndex],row.aIndex)),el('td',position(workbooks.b?.[row.bIndex],row.bIndex)),el('td',metadata),statusCell);table.append(tr);
  }scroll.append(table);section.append(scroll);if(current)[...section.querySelectorAll('[aria-label]')].find(node=>node.getAttribute('aria-label')===current)?.focus({preventScroll:true});
 }
 function renderSheetReview(){
  if(!['a','b'].every(side=>isSheetInput(state.inputs[side]?.name)&&workbooks[side]?.length))return;
  syncSheetReview();if(!sheetReview.binding){sheetReview.binding=sheetReviewBinding();try{sheetReview.rows=createSheetInventory(workbooks.a,workbooks.b);}catch(error){sheetReview.error='Workbook inventory unavailable: '+error.message;}}
  const section=el('details',undefined,'workbook-sheet-review');section.dataset.workbookSheetReview='';section.setAttribute('aria-label','Workbook sheet review');section.open=sheetReview.open;section.ontoggle=()=>{if(section.isConnected)sheetReview.open=section.open;};host.append(section);paintSheetReview();
 }
 function startSheetReview(){
  syncSheetReview();if(tableBusy()||!sheetReview.binding||sheetReview.worker)return;stopSheetReview(false);const ticket=sheetReview.ticket,binding=sheetReview.binding,rows=sheetReview.rows;sheetReview.statuses=new Map(rows.filter(row=>row.status==='not-compared').map(row=>[row.id,{status:'queued'}]));sheetReview.completed=0;sheetReview.total=sheetReview.statuses.size;sheetReview.error=null;
  const worker=sheetReview.worker=new Worker('workbook-review-worker.js'),valid=()=>sheetReview.worker===worker&&ticket===sheetReview.ticket&&sameSheetReviewBinding(binding);
  const fail=message=>{if(!valid())return;for(const [id,value]of sheetReview.statuses)if(['queued','comparing'].includes(value.status))sheetReview.statuses.set(id,{status:'error',reason:message});stopSheetReview(false);sheetReview.error=message;paintSheetReview();};
  worker.onmessage=({data})=>{if(!valid()||data.id!==ticket)return;if(data.type==='comparing'&&sheetReview.statuses.has(data.entryId))sheetReview.statuses.set(data.entryId,{status:'comparing'});if(data.type==='progress'&&sheetReview.statuses.has(data.entryId)){sheetReview.statuses.set(data.entryId,data.result);sheetReview.completed=data.completed;sheetReview.total=data.total;}if(data.type==='error'){fail(data.error||'Sheet comparison failed.');return;}if(data.type==='done')stopSheetReview(false);paintSheetReview();};worker.onerror=()=>fail('Sheet comparison worker could not run.');
  const priorityId=rows.find(row=>row.aIndex===(state.options.sheeta||0)&&row.bIndex===(state.options.sheetb||0))?.id;try{worker.postMessage({action:'start',id:ticket,sheetsA:workbooks.a,sheetsB:workbooks.b,options:sheetReviewOptions(),priorityId});}catch(error){fail(error.message);}paintSheetReview();
 }
 function tableRows(side){
  const item=state.inputs[side];if(!item)return [];
  if(isSheetInput(item.name))return workbooks[side]?.[state.options['sheet'+side]||0]?.rows||[];
  const key=item.data+'|'+state.options.delimiter;if(tableCache[side]?.key===key)return tableCache[side].rows;
  const source=text(side);let delimiter=state.options.delimiter||'auto';
  if(delimiter==='auto')delimiter=[',','\t',';'].map(d=>{try{return {d,width:parseDelimited(source,d)[0]?.length||0};}catch{return {d,width:-1};}}).sort((a,b)=>b.width-a.width)[0].d;
  const rows=parseDelimited(source,delimiter);if(rows.length>50000||rows.some(row=>row.length>512)||rows.reduce((n,r)=>n+r.length,0)>500000)throw Error('Table exceeds 50,000 rows, 512 columns, or 500,000 cells.');tableCache[side]={key,rows};return rows;
 }
 function renderNumberFormats(){
  const selected=side=>workbooks[side]?.[state.options['sheet'+side]||0],section=el('section',undefined,'workbook-number-formats');section.setAttribute('aria-label','Number format differences');
  section.append(el('h3','Number formats'),el('p','Stored number-format codes at physical worksheet coordinates, including explicit styled blank cells. Independent of key columns and header rows. This does not compare rendered values, locale appearance, other formatting or conditional rules.','advanced-note'));
  const missing=['a','b'].filter(side=>!selected(side)?.numberFormats);if(missing.length){section.dataset.available='false';section.append(el('p','Number format comparison unavailable: '+missing.map(side=>(side==='a'?'Left':'Right')+' requires qualified XLSX, XLS or XLSB metadata').join('; ')+'.','advanced-note'));host.append(section);return;}
  const result=compareNumberFormats(selected('a').numberFormats,selected('b').numberFormats);section.dataset.available=String(result.available);if(!result.available){section.append(el('p','Number format comparison unavailable: '+result.reason,'advanced-note'));host.append(section);return;}
  section.dataset.equal=String(result.equal);section.append(el('p',result.equal?'No number format differences.':`${result.differences.length} number format differences`));
  if(!result.equal){const pages=Math.ceil(result.differences.length/50);numberFormatPage=Math.max(0,Math.min(numberFormatPage,pages-1));const navigation=el('div',undefined,'advanced-toolbar'),previous=button('Previous number format differences',()=>{numberFormatPage--;render();}),next=button('Next number format differences',()=>{numberFormatPage++;render();});previous.disabled=numberFormatPage===0;next.disabled=numberFormatPage===pages-1;navigation.append(previous,el('span',`Number formats page ${numberFormatPage+1} / ${pages}`),next);section.append(navigation);const pane=el('div',undefined,'advanced-table-scroll'),table=el('table'),head=el('tr');for(const name of ['Cell','Left format','Right format'])head.append(el('th',name));table.append(head);for(const item of result.differences.slice(numberFormatPage*50,(numberFormatPage+1)*50)){let column=item.column+1,address='';while(column){column--;address=String.fromCharCode(65+column%26)+address;column=Math.floor(column/26);}address+=item.row+1;const row=el('tr',undefined,'changed');row.dataset.numberFormatCell=address;row.append(el('td',address),el('td',item.left),el('td',item.right));table.append(row);}pane.append(table);section.append(pane);}
  host.append(section);
 }
 function renderConditionalRules(){
  const selected=side=>workbooks[side]?.[state.options['sheet'+side]||0],section=el('section',undefined,'workbook-conditional');section.setAttribute('aria-label','Conditional rule differences');
  section.append(el('h3','Conditional rules'),el('p','Stored rules at physical worksheet coordinates, including ranges without cell values. Formulas and rule settings are compared, not evaluated; displayed colors may differ in a spreadsheet app. Rules are not copied by cell formatting actions.','advanced-note'));
  const missing=['a','b'].filter(side=>!selected(side)?.conditionalRules);if(missing.length){section.dataset.available='false';section.append(el('p','Conditional rule comparison unavailable: '+missing.map(side=>(side==='a'?'Left':'Right')+' requires an XLSX worksheet').join('; ')+'.','advanced-note'));host.append(section);return;}
  const result=compareConditionalFormatting(selected('a').conditionalRules,selected('b').conditionalRules);section.dataset.available=String(result.available);
  if(!result.available){section.append(el('p','Conditional rule comparison unavailable: '+result.reason,'advanced-note'));host.append(section);return;}
  section.dataset.equal=String(result.equal);section.append(el('p',result.equal?'No conditional rule differences.':`${result.differences.length} conditional rule differences`));
  if(!result.equal){const pages=Math.max(1,Math.ceil(result.differences.length/50));conditionalPage=Math.max(0,Math.min(conditionalPage,pages-1));const navigation=el('div',undefined,'advanced-toolbar'),previous=button('Previous conditional differences',()=>{conditionalPage--;render();}),next=button('Next conditional differences',()=>{conditionalPage++;render();});previous.disabled=conditionalPage===0;next.disabled=conditionalPage===pages-1;navigation.append(previous,el('span',`Conditional rules page ${conditionalPage+1} / ${pages}`),next);section.append(navigation);
   const labels={ranges:'Ranges',priority:'Priority',type:'Rule type',stopIfTrue:'Stop if true',formulas:'Formulas',style:'Differential formatting',visual:'Visual rule settings',operator:'Operator',text:'Text',timePeriod:'Time period',rank:'Rank',percent:'Percent',bottom:'Bottom',aboveAverage:'Above average',equalAverage:'Equal average',stdDev:'Standard deviation'};
   for(const difference of result.differences.slice(conditionalPage*50,(conditionalPage+1)*50)){const details=el('details',undefined,'workbook-style');details.dataset.conditionalDifference=difference.status;details.append(el('summary',(difference.status==='left-only'?'Left only':difference.status==='right-only'?'Right only':'Changed')+': '+difference.changes.map(field=>labels[field]||field).join(', ')));for(const [title,rule]of [['Left',difference.left],['Right',difference.right]]){details.append(el('strong',title));if(!rule){details.append(el('p','No corresponding rule'));continue;}details.append(el('p',`Ranges: ${rule.ranges.join(' ')} · Priority: ${rule.priority} · ${rule.type}`),el('pre',JSON.stringify(rule,null,2)));}section.append(details);}
  }host.append(section);
 }
 function renderWorkbookLayout(){
  const selected=side=>workbooks[side]?.[state.options['sheet'+side]||0];
  const result=compareWorkbookLayouts(selected('a')?.layout||{},selected('b')?.layout||{}),section=el('section',undefined,'workbook-layout');section.setAttribute('aria-label','Workbook layout differences');
  section.append(el('h3',result.equal?'No layout differences.':`${result.changes.length} layout differences`),el('p','Layout uses physical worksheet coordinates independently of key columns and header rows. Compares merged ranges, row heights, column widths, hidden rows/columns, outline levels, sheet dimension defaults, frozen/split panes, gridlines, row/column headings, formula/zero display, ruler, outline symbols, page whitespace, reading direction, zoom and view mode. Split positions use twentieths of a point; frozen splits count columns/rows. Active selections are not compared. Row heights use points; column widths use character units.','advanced-note'));
  for(const [side,title]of [['a','Left'],['b','Right']])if(!selected(side))section.append(el('p',`${title}: no workbook layout; CSV, TSV or missing input is treated as empty layout metadata.`,'advanced-note'));
  if(!result.equal){
   const pages=Math.ceil(result.changes.length/100);layoutPage=Math.max(0,Math.min(layoutPage,pages-1));
   const navigation=el('div',undefined,'advanced-toolbar'),previous=button('Previous layout differences',()=>{layoutPage--;render();}),next=button('Next layout differences',()=>{layoutPage++;render();});previous.disabled=layoutPage===0;next.disabled=layoutPage===pages-1;navigation.append(previous,el('span',`Layout page ${layoutPage+1} / ${pages}`),next);section.append(navigation);
   const pane=el('div',undefined,'advanced-table-scroll'),table=el('table'),head=el('tr');for(const title of ['Setting','Location','Left','Right'])head.append(el('th',title));table.append(head);
   const valueText=value=>{if(value==null)return 'Not set';if(typeof value!=='object')return String(value);const labels={height:'Height',width:'Width',hidden:'Hidden',outlineLevel:'Outline level',state:'Pane state',xSplit:'Horizontal split',ySplit:'Vertical split',paneTopLeftCell:'Pane top-left cell',showGridLines:'Gridlines',rightToLeft:'Right to left',showFormulas:'Show formulas',showRowColHeaders:'Row/column headings',showZeros:'Show zero values',showRuler:'Ruler',showOutlineSymbols:'Outline symbols',showWhiteSpace:'Page whitespace',zoomScale:'Zoom (%)',view:'View mode'};return Object.entries(value).filter(([key])=>key!=='index'&&key!=='id').map(([key,entry])=>`${labels[key]||key}: ${entry===true?'Yes':entry===false?'No':entry}`).join(' · ')||'Default';};
   for(const change of result.changes.slice(layoutPage*100,(layoutPage+1)*100)){const row=el('tr',undefined,'changed');row.dataset.layoutKind=change.kind;row.dataset.layoutLocation=String(change.location);row.append(el('td',({default:'Default',merge:'Merged range',row:'Row',column:'Column',view:'Worksheet view'})[change.kind]||change.kind),el('td',({defaultRowHeight:'Default row height',defaultColWidth:'Default column width'})[change.location]||String(change.location)),el('td',valueText(change.left)),el('td',valueText(change.right)));table.append(row);}pane.append(table);section.append(pane);
  }
  host.append(section);
 }
 function paintTableSelection(){
  for(const node of host.querySelectorAll('[data-copy-row]')){const key=node.dataset.copyRow+'|'+(node.dataset.copyColumn??'row'),selected=tableSelection.has(key)||tableSelection.has(node.dataset.copyRow+'|row');node.classList.toggle('table-copy-selected',selected);node.setAttribute('aria-selected',String(selected));}
  for(const control of host.querySelectorAll('[data-copy-side]'))control.disabled=tableBusy()||!tableSelection.size||!state.options.tableCopyBinding||!Array.isArray(state.options.tableResult);
  for(const control of host.querySelectorAll('[data-copy-format-side]'))control.disabled=odsTemplate(state.options.tableTemplate)||tableBusy()||!tableSelection.size||!state.options.tableCopyBinding||!state.options.tableTemplate||state.options.tableTemplate.structural&&!state.options.tableStructure||!workbooks[control.dataset.copyFormatSide]||!/\.xlsx$/i.test(state.inputs[control.dataset.copyFormatSide]?.name||'');
  const missing=[...tableSelection.values()].filter(item=>item.column===null&&!state.options.tableCopyBinding?.rowIds.includes(item.rowId)).length;const hint=host.querySelector('[data-copy-selection]');if(hint)hint.textContent=tableSelection.size?`${tableSelection.size} selected · cell content${missing?` · Copy appends ${missing} missing rows`:''}`:'Click a cell or row number · ⌘ / Ctrl adds · Shift selects a range';
 }
 function selectTableDifference(node,event){
  if(tableBusy())return;
  closeTableMenu();const rowId=node.dataset.copyRow,column=node.dataset.copyColumn===undefined?null:Number(node.dataset.copyColumn),key=rowId+'|'+(column===null?'row':column),selection={rowId,column};
  if(event.shiftKey&&tableAnchor&&tableAnchor.column===column){const visible=tableComparison.rows.filter(row=>(!state.options.onlyDifferences||row.status!=='equal')&&(column===null||row.cells.some(cell=>cell.column===column))),ids=visible.map(tableComparisonRowId),start=ids.indexOf(tableAnchor.rowId),end=ids.indexOf(rowId);if(!event.metaKey&&!event.ctrlKey)tableSelection.clear();if(start>=0&&end>=0)for(let i=Math.min(start,end);i<=Math.max(start,end);i++)tableSelection.set(ids[i]+'|'+(column===null?'row':column),{rowId:ids[i],column});}
  else{if(!event.metaKey&&!event.ctrlKey)tableSelection.clear();if(tableSelection.has(key)&&(event.metaKey||event.ctrlKey))tableSelection.delete(key);else tableSelection.set(key,selection);tableAnchor=selection;}
  paintTableSelection();
 }
 async function verifyStyleSources(overlay,inputs,parsed){
  const hashes=new Map();
  for(const cell of overlay.cells){const input=inputs[cell.sourceSide];if(!input||!/\.xlsx$/i.test(input.name))throw Error('Copied formatting source workbook is unavailable.');if(!hashes.has(cell.sourceSide))hashes.set(cell.sourceSide,await workbookHash(input.data));if(hashes.get(cell.sourceSide)!==cell.sourceHash||!parsed[cell.sourceSide]?.some(sheet=>sheet.name===cell.sourceSheet))throw Error('Copied formatting source no longer matches its saved binding.');}
 }
 async function copySelectedTableFormatting(sourceSide){
  if(odsTemplate(state.options.tableTemplate))throw Error('Copying formatting into ODS results is not supported.');
  if(tableBusy())throw Error('Wait for table loading to finish.');
  const current=captureResultRequest(),comparison=tableComparison,selections=[...tableSelection.values()],selection=JSON.stringify(selections),template=state.options.tableTemplate,rows=state.options.tableResult,binding=state.options.tableCopyBinding,source=state.inputs[sourceSide],sheet=workbooks[sourceSide]?.[state.options['sheet'+sourceSide]||0];
  if(!template||template.structural&&!state.options.tableStructure||!Array.isArray(rows))throw Error('Choose an unchanged XLSX result before copying formatting.');
  if(!source||!sheet||!/\.xlsx$/i.test(source.name))throw Error('Formatting requires an XLSX source workbook.');
  const context=await tableCopyContext(),hash=await workbookHash(source.data);
  if(!current()||comparison!==tableComparison||selection!==JSON.stringify([...tableSelection.values()]))throw Error('The table selection changed. Select formatting again.');
  if(!binding||binding.context!==context)throw Error('The table comparison changed. Choose a result side again.');
  if(!selections.length)throw Error('Select comparison cells or rows first.');
  const comparisonRows=new Map(comparison.rows.map(row=>[tableComparisonRowId(row),row])),positions=new Map(binding.rowIds.map((id,index)=>[id,index])),selected=new Map(),cells=new Map((state.options.tableStyleEdits?.cells||[]).map(cell=>[cell.row+':'+cell.column,cell]));
  for(const {rowId,column} of selections){if(!selected.has(rowId))selected.set(rowId,new Set());selected.get(rowId).add(column);}
  let count=0;
  for(const [rowId,chosen] of selected){const row=comparisonRows.get(rowId),target=positions.get(rowId),sourceIndex=row?.[sourceSide==='a'?'leftIndex':'rightIndex'];
   if(target===undefined||sourceIndex===undefined||sourceIndex===null)throw Error('Formatting can only copy between existing source and result rows. Choose an XLSX result with this row.');
   const sourceRow=sourceIndex+(state.options.headers?1:0),columns=chosen.has(null)?Array.from({length:rows[target].length},(_,i)=>i):chosen;
   for(const column of columns){if(column>=rows[target].length)throw Error('Formatting cannot create result columns. Choose a result with this column.');const edit={row:target+1,column:column+1,sourceSide,sourceHash:hash,sourceSheet:sheet.name,sourceRow:sourceRow+1,sourceColumn:column+1};cells.set(edit.row+':'+edit.column,edit);count++;}
  }
  const styles=validateWorkbookStyleEdits({version:1,side:template.side,sheetName:template.sheetName,sourceHash:template.sourceHash,cells:[...cells.values()]},{rows,template,structure:state.options.tableStructure});
  // Validate preservation support before publishing the queued style changes.
  await preservedWorkbook(styles);
  if(!current()||comparison!==tableComparison||selection!==JSON.stringify([...tableSelection.values()]))throw Error('The table changed while checking formatting. Select formatting again.');
  applyTableResult(rows,{styles});onDirty();render();notify(`${count} cell formatting copies queued. Save workbook copy to export; the result grid does not render copied styles.`);
 }
 async function copySelectedTableValues(sourceSide){
  if(tableBusy())throw Error('Wait for table loading to finish.');
  const current=captureResultRequest(),comparison=tableComparison,selections=[...tableSelection.values()],selection=JSON.stringify(selections),context=await tableCopyContext();
  if(!current()||comparison!==tableComparison||selection!==JSON.stringify([...tableSelection.values()]))throw Error('The table selection changed. Select the values again.');
  const copied=copyTableDifferences({comparison,rows:state.options.tableResult,origin:state.options.tableCopyBinding,context,sourceSide,selections});
  if(copied.structural&&state.options.tableTemplate)throw Error('Insert workbook rows explicitly before copying missing rows.');
  let edits=state.options.tableCellEdits||null;const typed=[];
  const sourceSheet=workbooks[sourceSide]?.[state.options['sheet'+sourceSide]||0],offset=state.options.headers?1:0;
  const comparisonRows=new Map(comparison.rows.map(row=>[tableComparisonRowId(row),row])),positions=new Map(copied.origin.rowIds.map((id,index)=>[id,index])),selected=new Map();
  for(const {rowId,column} of selections){if(!selected.has(rowId))selected.set(rowId,new Set());selected.get(rowId).add(column);}
  for(const [rowId,chosen] of selected){const row=comparisonRows.get(rowId),sourceIndex=row[sourceSide==='a'?'leftIndex':'rightIndex']+offset,targetIndex=positions.get(rowId),source=row[sourceSide==='a'?'left':'right'];
   const columns=chosen.has(null)?Array.from({length:Math.max(source.length,copied.rows[targetIndex].length)},(_,i)=>i):chosen;
   for(const column of columns){let cell=sourceSheet?.typedRows[sourceIndex]?.[column]||{type:source[column]===undefined?'blank':'text',value:source[column]??null};
    if(odsTemplate(state.options.tableTemplate)&&(cell.odsValueType||cell.type==='formula'))throw Error('Copying formulas or date, time, currency and percentage cells into ODS results is unavailable. Use an explicit literal edit instead.');
    if(valueSheet(sourceSheet)){if(cell.cacheUnavailable)throw Error(`This ${sourceSheet.format.toUpperCase()} formula has no stored result to copy. Recalculate it in a spreadsheet app first.`);cell={type:cell.type,value:cell.value};}else if(!state.options.tableTemplate&&cell.type==='formula'&&['a','b'].some(side=>isValueWorkbook(state.inputs[side]?.name))){cell={type:'text',value:source[column]??''};}if(cell.unsupported)throw Error('Copying grouped formulas, merged subordinate cells, rich text, dates or errors is not supported. Ordinary rich cells can be replaced using explicit cell editing.');
    if(cell.type==='formula'&&!state.options.tableTemplate)throw Error('Choose an XLSX result to preserve copied formulas.');
    if(state.options.tableTemplate){cell={row:targetIndex+1,column:column+1,type:cell.type,value:cell.type==='formula'?translateWorkbookFormula(cell.value,targetIndex-sourceIndex,0):cell.value};while(copied.rows[targetIndex].length<=column)copied.rows[targetIndex].push('');copied.rows[targetIndex][column]=cellDisplay(cell);typed.push(cell);}
   }
  }
  if(typed.length)edits=withCellEdits(typed,copied.rows);
  if(odsTemplate(state.options.tableTemplate)){await preservedWorkbook(null,{...state.options,tableResult:copied.rows,tableCellEdits:edits});if(!current())throw Error('The ODS result changed while checking copied cells. Try again.');}
  applyTableResult(copied.rows,{binding:copied.origin,structural:copied.structural,edits});onDirty();render();notify(`${typed.length||copied.copiedCells} cells copied${copied.insertedRows?` · ${copied.insertedRows} missing rows appended`:''}.`);
 }
 function renderTable(){
  const valueInput=['a','b'].some(side=>isValueWorkbook(state.inputs[side]?.name));
  const settings=tableSettings();if(!tableSelectionBinding||tableSelectionBinding.a!==state.inputs.a||tableSelectionBinding.b!==state.inputs.b||tableSelectionBinding.settings!==settings){clearTableSelection();tableSelectionBinding={a:state.inputs.a,b:state.inputs.b,settings};}
  tableComparison=null;let waiting=false;
  for(const side of ['a','b'])if(isSheetInput(state.inputs[side]?.name)&&!workbooks[side]){
   waiting=true;if(!loading[side]){loading[side]=true;const requested=generation,data=state.inputs[side].data;readTrackedWorkbook('render:'+side,data,state.inputs[side].name).then(sheets=>{if(requested!==generation||state.inputs[side]?.data!==data)return;workbooks[side]=sheets;loading[side]=false;render();}).catch(error=>{if(requested!==generation||state.inputs[side]?.data!==data)return;loading[side]=false;workbooks[side]=[];notify(error.message,true);host.append(el('p',error.message,'advanced-error'));});}
  }
  if(waiting){host.append(el('p','Reading workbook and validating expansion limits…','advanced-note'));return;}
  for(const side of ['a','b'])if(workbooks[side]?.length&&(!Number.isInteger(state.options['sheet'+side])||state.options['sheet'+side]<0||state.options['sheet'+side]>=workbooks[side].length))state.options['sheet'+side]=0;
  const formulaSupported=['a','b'].every(side=>!isValueWorkbook(state.inputs[side]?.name)||workbooks[side]?.[state.options['sheet'+side]||0]?.capabilities?.formulaComparison===true);
  if(!formulaSupported)state.options.workbookMode='values';
  const formattingSupported=['a','b'].every(side=>!isValueWorkbook(state.inputs[side]?.name)||workbooks[side]?.[state.options['sheet'+side]||0]?.capabilities?.formattingComparison===true);
  if(!formattingSupported)state.options.compareFormatting=false;
  if(valueInput){state.options.compareLayout=false;const disclosure=el('details',undefined,'advanced-note');disclosure.append(el('summary',`${[...new Set(['a','b'].map(side=>state.inputs[side]?.name).filter(isValueWorkbook).map(name=>name.split('.').pop().toUpperCase()))].join(' / ')} · ${formulaSupported?'values and formula expressions':'cached values only'}`),el('p',`Formula results are not recalculated; missing results are marked unavailable in values mode. ${formulaSupported?'Qualified formula expressions compare within their declared dialect. Unsupported expressions and cross-dialect pairs are marked unavailable. ':'Formula expression comparison is unavailable for this pair. '}Stored base formatting can be compared for qualified XLS/XLSB inputs. Unknown properties and cross-format pairs are reported unavailable. Layout comparison, source workbook preservation and archive writeback remain unavailable for these formats. Export results as CSV or a new XLSX.`));host.append(disclosure);}
  const controls=el('div',undefined,'advanced-toolbar'),select=el('select');select.setAttribute('aria-label','Delimiter');for(const [value,label]of [['auto','Auto delimiter'],[',','Comma'],['\t','Tab'],[';','Semicolon']]){const o=el('option',label);o.value=value;select.append(o);}select.value=state.options.delimiter;select.onchange=()=>{state.options.delimiter=select.value;tablePage=0;onDirty();render();};controls.append(select,input('Key columns (1,2…)',state.options.keys||'',v=>{state.options.keys=v;tablePage=0;}));
  for(const side of ['a','b'])if(workbooks[side]){const label=el('label',side==='a'?'Left sheet ':'Right sheet '),choice=el('select');choice.setAttribute('aria-label',side==='a'?'Left sheet':'Right sheet');workbooks[side].forEach((sheet,i)=>{const o=el('option',sheet.name);o.value=String(i);choice.append(o);});choice.value=String(state.options['sheet'+side]||0);choice.onchange=()=>{state.options['sheet'+side]=Number(choice.value);tablePage=0;layoutPage=0;conditionalPage=0;numberFormatPage=0;onDirty();render();};label.append(choice);controls.append(label);const sheet=workbooks[side][choice.value];if(sheet?.formulas)host.append(el('p',`${side==='a'?'Left':'Right'}: ${sheet.formulas} formulas · ${sheet.uncached} lack cached values. ${sheet.formulaComparisonCoverage?`${sheet.formulaComparisonCoverage.supported} / ${sheet.formulaComparisonCoverage.total} expressions qualified. `:''}${state.options.workbookMode==='formulas'?'Comparing qualified formula identities; cached results do not affect formula matches.':'Comparing cached results.'} Formula recalculation is not supported.`,'advanced-note'));}
  if(workbooks.a||workbooks.b){const label=el('label','Compare workbook '),mode=el('select');mode.setAttribute('aria-label','Workbook comparison');for(const [value,title]of [['values','Cell values'],['formulas','Formulas']]){const option=el('option',title);option.value=value;mode.append(option);}mode.value=state.options.workbookMode||'values';mode.disabled=!formulaSupported;mode.title=!formulaSupported?'This format supports cached cell values only.':'';mode.onchange=()=>{state.options.workbookMode=mode.value;tablePage=0;onDirty();render();};label.append(mode);controls.append(label);const formatLabel=el('label','Compare formatting '),formatToggle=el('input');formatToggle.type='checkbox';formatToggle.disabled=!formattingSupported;formatToggle.checked=state.options.compareFormatting===true;formatToggle.onchange=()=>{state.options.compareFormatting=formatToggle.checked;tablePage=0;onDirty();render();};formatLabel.append(formatToggle);controls.append(formatLabel);const layoutLabel=el('label','Compare layout '),layoutToggle=el('input');layoutToggle.type='checkbox';layoutToggle.disabled=valueInput;layoutToggle.checked=state.options.compareLayout===true;layoutToggle.onchange=()=>{state.options.compareLayout=layoutToggle.checked;layoutPage=0;conditionalPage=0;numberFormatPage=0;onDirty();render();};layoutLabel.append(layoutToggle);controls.append(layoutLabel);const conditionalLabel=el('label','Compare conditional rules '),conditionalToggle=el('input');conditionalToggle.type='checkbox';conditionalToggle.checked=state.options.compareConditionalRules===true;conditionalToggle.onchange=()=>{state.options.compareConditionalRules=conditionalToggle.checked;conditionalPage=0;numberFormatPage=0;onDirty();render();};conditionalLabel.append(conditionalToggle);controls.append(conditionalLabel);const numberLabel=el('label','Compare number formats '),numberToggle=el('input');numberToggle.type='checkbox';numberToggle.checked=state.options.compareNumberFormats===true;numberToggle.onchange=()=>{state.options.compareNumberFormats=numberToggle.checked;numberFormatPage=0;onDirty();render();};numberLabel.append(numberToggle);controls.append(numberLabel);}
  for(const [key,label]of [['headers','First row is header'],['onlyDifferences','Differences only']]){const l=el('label',label+' '),c=el('input');c.type='checkbox';c.checked=state.options[key];c.onchange=()=>{state.options[key]=c.checked;tablePage=0;onDirty();render();};l.append(c);controls.append(l);}host.append(controls);
  renderSheetReview();
  if(state.options.compareLayout&&(workbooks.a||workbooks.b))renderWorkbookLayout();
  if(state.options.compareConditionalRules)renderConditionalRules();
  if(state.options.compareNumberFormats)renderNumberFormats();
  const originals={a:tableRows('a'),b:tableRows('b')};
  const {result,headers,headerResult,formattingReview,unavailableCells,unavailableFormulas,formulaReasons}=compareSheetCells(workbooks.a?.[state.options.sheeta||0]||{rows:originals.a},workbooks.b?.[state.options.sheetb||0]||{rows:originals.b},state.options);
  if(formattingReview){const section=el('details',undefined,'advanced-note');section.dataset.storedFormatting='';section.dataset.available=String(formattingReview.available);section.dataset.equal=String(formattingReview.equal);section.append(el('summary',`Stored formatting · ${formattingReview.differences.length+(formattingReview.beyondDomain?.filter(region=>region.nonrepresentable).length||0)}${formattingReview.truncated?'+':''} changed regions${formattingReview.available?'':' · some properties unavailable'}`));section.append(el('p','Compares original cell addresses, including styled blanks and row/column defaults. Key columns only align the value table.'));if(formattingReview.domain?.restricted)section.append(el('p',`Cross-format base styles are compared within the shared ${formattingReview.domain.rows.toLocaleString()} × ${formattingReview.domain.columns.toLocaleString()} cell grid. Stored styles beyond that grid are reported separately; this does not compare rendered appearance.`));if(formattingReview.reason)section.append(el('p',formattingReview.reason));for(const change of formattingReview.differences)section.append(el('p',`Rows ${change.firstRow+1}–${change.lastRow+1}, columns ${change.firstColumn+1}–${change.lastColumn+1}: ${change.groups.join(', ')}`));for(const change of formattingReview.beyondDomain||[])section.append(el('p',`${change.side==='left'?'Left':'Right'} outside shared grid · rows ${change.firstRow+1}–${change.lastRow+1}, columns ${change.firstColumn+1}–${change.lastColumn+1}: ${change.groups.join(', ')||(Object.keys(change.unavailableGroups||{}).length?'properties unavailable':'matches source default')}${Object.keys(change.unavailableGroups||{}).length?' · '+Object.values(change.unavailableGroups).join('; '):''}`));if(formattingReview.truncated)section.append(el('p','Only the first changed regions are listed.'));host.append(section);}
  if(result.duplicates.length){host.append(el('p',result.duplicates.slice(0,50).map(d=>`Duplicate key ${d.key} on ${d.side}, rows ${d.rows.map(i=>i+1+(headers?1:0)).join(', ')}`).join('\n'),'advanced-error'));return;}
  if(unavailableFormulas)host.append(el('p',`${unavailableFormulas} formula expressions cannot be compared reliably and are never marked equal. ${formulaReasons.join(' ')||'Unsupported expressions, repeated formula references or incompatible dialects require qualification.'}`,'advanced-note'));
  if(unavailableCells)host.append(el('p',`${unavailableCells} cells cannot be compared because their stored formula results are unavailable. These cells are never marked equal; recalculate the source workbook to compare them.`,'advanced-note'));
  if(headerResult&&!headerResult.equal){const details=el('details',undefined,'advanced-note');details.dataset.headerComparison='';details.append(el('summary','Header differences or unavailable comparisons'));for(const cell of headerResult.rows.flatMap(row=>row.cells).filter(cell=>!cell.equal)){const show=(value,formula)=>state.options.workbookMode==='formulas'&&formula!==null?'='+formula:value??'∅';details.append(el('p',`Column ${cell.column+1}: ${show(cell.left,cell.formulaLeft)} ↔ ${show(cell.right,cell.formulaRight)}${cell.formulaUnavailable||cell.cacheUnavailable||cell.formattingUnavailable?' · unavailable':''}`));}host.append(details);}
  tableComparison=result;
  const rows=result.rows.filter(r=>!state.options.onlyDifferences||r.status!=='equal'),pageSize=100,pages=Math.max(1,Math.ceil(rows.length/pageSize));tablePage=Math.max(0,Math.min(tablePage,pages-1));
  host.append(el('p',`${result.rows.length} rows · ${result.rows.filter(r=>r.status!=='equal').length} changed, unmatched or unavailable · ${state.options.workbookMode==='formulas'?'Formula expressions by dialect (literal cells use values; keys use cached values)':'XLSX / ODS / XLS / XLSB cached cell values'} / CSV / TSV. ${valueInput?'These results export as values-only CSV or new XLSX. Original workbooks stay unchanged. Missing formula results are shown as unavailable.':'Export result CSV/XLSX creates values only. Save workbook copy preserves the chosen workbook, its other sheets, formatting and untouched formulas; typed edits and copied formulas retain their explicit types.'}`,'advanced-note'));
  if(state.options.compareFormatting)host.append(el('p',valueInput?'Formatting: qualified stored number formats, fonts, fills, borders, alignment and protection. Unsupported properties, including unqualified rich-text runs, remain unavailable. Original workbook bytes stay unchanged; this does not compare rendered appearance.':'Formatting: stored number formats, fonts, fills, borders, alignment, protection and rich text, including theme colors and referenced theme font definitions. Font rendering is not compared. Use Compare conditional rules for stored conditional formatting, and Compare layout for merged ranges and row/column dimensions.','advanced-note'));
  const navigation=el('div',undefined,'advanced-toolbar');navigation.append(button('Previous rows',()=>{tablePage--;render();}),el('span',`Rows page ${tablePage+1} / ${pages}`),button('Next rows',()=>{tablePage++;render();}),input('Page',String(tablePage+1),v=>{if(!/^\d+$/.test(v))throw Error('Enter a page number.');tablePage=Number(v)-1;},'number'));
  navigation.querySelectorAll('button')[0].disabled=tablePage===0;navigation.querySelectorAll('button')[1].disabled=tablePage===pages-1;
  for(const [side,label]of [['a','Use left as result'],['b','Use right as result']]){const initialize=button(label,()=>initializeTableResult(side,originals[side]));initialize.disabled=!state.inputs[side];navigation.append(initialize);}const tableUndo=button('Undo edit',undo),tableRedo=button('Redo edit',redo);tableUndo.dataset.tableUndo='';tableRedo.dataset.tableRedo='';tableUndo.disabled=!tableHistory.canUndo;tableRedo.disabled=!tableHistory.canRedo;navigation.append(tableUndo,tableRedo);host.append(navigation);
  const copyTools=el('div',undefined,'advanced-toolbar table-copy-tools');for(const [side,label]of [['a','Copy left cells to result'],['b','Copy right cells to result']]){const control=button(label,()=>copySelectedTableValues(side));control.dataset.copySide=side;control.title='Copies selected values, types and ordinary formulas into an XLSX result. Relative references follow destination rows. Styles are retained from the result workbook.';copyTools.append(control);}for(const [side,label]of [['a','Copy left formatting to result'],['b','Copy right formatting to result']]){const control=button(label,()=>copySelectedTableFormatting(side));control.dataset.copyFormatSide=side;control.title='Queue base cell formatting only. Does not copy conditional formats, table styles or rich-text run formatting.';copyTools.append(control);}const selectionHint=el('span',undefined,'advanced-note');selectionHint.dataset.copySelection='';copyTools.append(selectionHint);host.append(copyTools);
  if(Array.isArray(state.options.tableResult)&&!state.options.tableCopyBinding)host.append(el('p','Choose a result side again to enable selective copying after column changes or for an older saved result.','advanced-note'));
  const pane=el('div',undefined,'advanced-table-scroll'),table=el('table'),head=el('tr');pane.tabIndex=0;pane.setAttribute('aria-label','Table comparison');head.append(el('th','Left row'),el('th','Right row'));let columns=0;for(const row of result.rows)columns=Math.max(columns,row.cells.length);for(const h of headers||[])columns=Math.max(columns,h.length);for(let c=0;c<columns;c++)head.append(el('th',headers?`${headers[0][c]??''} / ${headers[1][c]??''}`:`Column ${c+1}`));table.append(head);
  for(const row of rows.slice(tablePage*pageSize,(tablePage+1)*pageSize)){const tr=el('tr',undefined,row.status);const rowId=tableComparisonRowId(row);for(const index of [row.leftIndex,row.rightIndex]){const label=el('td',index===null?'—':String(index+1+(headers?1:0)),'table-copy-row');label.dataset.copyRow=rowId;label.tabIndex=0;label.setAttribute('aria-label','Select comparison row '+rowId);label.onclick=event=>selectTableDifference(label,event);label.onkeydown=event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();selectTableDifference(label,event);}};tr.append(label);}for(const cell of row.cells){const td=el('td',undefined,cell.equal?'':'changed');td.dataset.copyRow=rowId;td.dataset.copyColumn=String(cell.column);if(cell.formulaUnavailable){td.dataset.formulaUnavailable='true';td.title='Formula expression comparison unavailable for this cell.';}if(cell.cacheUnavailable){td.dataset.cacheUnavailable='true';td.title='Comparison unavailable: a formula has no stored result.';}if(cell.formattingUnavailable){td.classList.add('unavailable');td.title='Formatting unavailable: '+Object.entries(cell.formattingUnavailableGroups||{}).map(([group,reason])=>group+': '+reason).join('; ');}td.tabIndex=0;td.setAttribute('aria-label',`Comparison row ${rowId} column ${cell.column+1}`);td.onclick=event=>{if(!event.target.closest('details'))selectTableDifference(td,event);};td.onkeydown=event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();selectTableDifference(td,event);}};for(const [side,value,formula]of [['Left',cell.left,cell.formulaLeft],['Right',cell.right,cell.formulaRight]]){const entry=el('div');entry.append(el('span',value??'∅'));if(state.options.workbookMode==='formulas'){const detail=el('small',formula==null?'Literal value':'='+formula,'workbook-formula');detail.setAttribute('aria-label',side+' '+(formula==null?'literal value':'formula'));entry.append(detail);}td.append(entry);}if(state.options.compareFormatting&&cell.styleChanges.length){const detail=el('details',undefined,'workbook-style'),summary=el('summary','Formatting differs: '+cell.styleChanges.join(', '));detail.append(summary);for(const [side,signature]of [['Left',cell.styleLeft],['Right',cell.styleRight]])detail.append(el('strong',side),el('pre',JSON.stringify(JSON.parse(signature),null,2)));td.append(detail);}tr.append(td);}table.append(tr);}pane.append(table);host.append(pane);paintTableSelection();
  if(Array.isArray(state.options.tableResult)){
   host.append(el('h3','Result table — editable cells'));
   if(state.options.tableStyleEdits?.cells.length)host.append(el('p',`${state.options.tableStyleEdits.cells.length} cell formatting copies queued for Save workbook copy. The result grid does not preview these styles. Base cell formatting only; conditional formats, table styles and rich-text runs are not copied.`,'advanced-note'));
   if(state.options.tableTemplate)host.append(el('p',`Workbook copy: ${state.inputs[state.options.tableTemplate.side]?.name||'Original workbook'} · ${state.options.tableTemplate.sheetName}. ${odsTemplate(state.options.tableTemplate)?'ODS copy supports existing-cell text, number, boolean and blank edits. Copied formula values use the original source cache; they are not recalculated. Typing creates literal text; explicit cell controls set the type. Formatting and other package content are retained. Edited copies clear formula caches until recalculation in a spreadsheet app; displayed formula results come from the original workbook. Protected, merged or matrix edits may be refused. Save to a new .ods filename; existing files are not overwritten.':state.options.tableTemplate.structural?(state.options.tableStructure?'Row and column edits retain supported workbook references. Formulas need recalculation.':'Older structural edits require undo before saving a workbook copy, or export values only.'):'Typing creates literal text; explicit cell controls set numbers, booleans, blanks or formulas. Unselected formatting and other workbook content are retained. Value or formula edits request recalculation when opened.'}`,'advanced-note'));
   let output=state.options.tableResult;const outPages=Math.max(1,Math.ceil(output.length/pageSize)),outPage=Math.max(0,Math.min(state.options.resultPage||0,outPages-1)),wrapper=el('div',undefined,'advanced-table-scroll'),grid=el('table');state.options.resultPage=outPage;
   const actions=el('div',undefined,'advanced-toolbar');
   actions.append(button('Previous result rows',()=>{state.options.resultPage=Math.max(0,outPage-1);render();}),el('span',`Result page ${outPage+1} / ${outPages}`),button('Next result rows',()=>{state.options.resultPage=Math.min(outPages-1,outPage+1);render();}));
   actions.querySelectorAll('button')[0].disabled=outPage===0;actions.querySelectorAll('button')[1].disabled=outPage===outPages-1;
   if(state.options.tableTemplate)actions.append(button('Use values only',useValuesOnly));
   const rowLabel=el('label','Result row number '),rowNumber=el('input');rowNumber.setAttribute('aria-label','Result row number');rowNumber.type='number';rowNumber.min='1';rowNumber.value=String(state.options.editRow||outPage*pageSize+1);rowLabel.append(rowNumber);
   const colLabel=el('label','Result column number '),colNumber=el('input');colNumber.setAttribute('aria-label','Result column number');colNumber.type='number';colNumber.min='1';colNumber.value=String(state.options.editColumn||1);colLabel.append(colNumber);actions.append(rowLabel,colLabel);
   const position=(field,max)=>{if(!/^[1-9]\d*$/.test(field.value)||Number(field.value)>max)throw Error(`Choose a position from 1 to ${max}.`);state.options[field===rowNumber?'editRow':'editColumn']=Number(field.value);return Number(field.value)-1;};
   const width=()=>resultShape(output,state.options.tableStructure).columns,cells=()=>output.reduce((n,row)=>n+row.length,0);
   if(state.options.tableTemplate&&(!state.options.tableTemplate.structural||state.options.tableStructure)){
    const kind=el('select');kind.setAttribute('aria-label','Cell type');for(const type of (odsTemplate(state.options.tableTemplate)?['text','number','boolean','blank']:['text','number','boolean','blank','formula'])){const option=el('option',type[0].toUpperCase()+type.slice(1));option.value=type;kind.append(option);}
    const value=el('textarea');value.className='table-cell-editor table-typed-editor';value.rows=1;value.wrap='off';value.setAttribute('aria-label','Typed cell value');value.placeholder='Value or formula';
    const load=()=>{const r=Number(rowNumber.value)-1,c=Number(colNumber.value)-1,edit=state.options.tableCellEdits?.cells.find(cell=>cell.row===r+1&&cell.column===c+1),template=state.options.tableTemplate,sheet=workbooks[template.side]?.find(sheet=>sheet.name===template.sheetName),cell=edit||(sheet?originalResultCell(sheet,r+1,c+1,state.options.tableStructure).cell:null);kind.value=cell?.type||'text';value.value=cell?.value??output[r]?.[c]??'';};load();rowNumber.addEventListener('change',load);colNumber.addEventListener('change',load);
    actions.append(kind,value,button('Apply cell',()=>{const r=position(rowNumber,output.length),c=position(colNumber,output[r].length),type=kind.value;let typed=value.value;if(type==='number'){if(!typed.trim())throw Error('Enter a finite number.');typed=Number(typed);}if(type==='boolean'){if(!['true','false'].includes(typed.toLowerCase()))throw Error('Enter true or false.');typed=typed.toLowerCase()==='true';}if(type==='blank')typed=null;const edit=normalizeWorkbookCellEdit({row:r+1,column:c+1,type,value:typed}),next=output.map(row=>row.slice());next[r][c]=cellDisplay(edit);return changeWorkbookCell(edit,next);}));
   }
   actions.append(button('Insert row before',()=>{if(state.options.tableTemplate)return changeWorkbookStructure('row','insert',Number(rowNumber.value));const index=position(rowNumber,output.length+1),columns=Math.max(1,width());if(output.length>=50000||cells()+columns>500000)throw Error('Result exceeds row or cell limits.');const next=output.slice();next.splice(index,0,Array(columns).fill(''));const binding=state.options.tableCopyBinding?structuredClone(state.options.tableCopyBinding):null;if(binding)binding.rowIds.splice(index,0,null);applyTableResult(next,{structural:true,binding});state.options.resultPage=Math.floor(index/pageSize);onDirty();render();}),button('Delete row',()=>{if(state.options.tableTemplate)return changeWorkbookStructure('row','delete',Number(rowNumber.value));if(!output.length)throw Error('The result has no rows.');const next=output.slice();const index=position(rowNumber,output.length);next.splice(index,1);let binding=state.options.tableCopyBinding?structuredClone(state.options.tableCopyBinding):null;if(binding&&index===0&&binding.headerOffset)binding=null;else if(binding)binding.rowIds.splice(index,1);applyTableResult(next,{structural:true,binding});onDirty();render();}),button('Insert column before',()=>{if(state.options.tableTemplate)return changeWorkbookStructure('column','insert',Number(colNumber.value));const columns=width(),index=position(colNumber,columns+1);if(columns>=512||(columns+1)*output.length>500000)throw Error('Result exceeds column or cell limits.');const next=output.map(old=>{const row=old.slice();while(row.length<columns)row.push('');row.splice(index,0,'');return row;});if(!next.length)next.push(['']);applyTableResult(next,{structural:true,binding:null});onDirty();render();}),button('Delete column',()=>{if(state.options.tableTemplate)return changeWorkbookStructure('column','delete',Number(colNumber.value));const columns=width();if(!columns)throw Error('The result has no columns.');const index=position(colNumber,columns);const next=output.map(old=>{if(index>=old.length)return old;const row=old.slice();row.splice(index,1);return row;});applyTableResult(next,{structural:true,binding:null});onDirty();render();}));const structural=[...actions.querySelectorAll('button')];structural.find(control=>control.textContent==='Delete row').disabled=!output.length;structural.find(control=>control.textContent==='Delete column').disabled=!width();if(odsTemplate(state.options.tableTemplate))for(const control of structural)if(['Insert row before','Delete row','Insert column before','Delete column'].includes(control.textContent)){control.disabled=true;control.title='ODS structure changes are unavailable. Choose Use values only to edit a values export.';}host.append(actions);
   output.slice(outPage*pageSize,(outPage+1)*pageSize).forEach((row,i)=>{const tr=el('tr');tr.tabIndex=0;tr.dataset.resultRow=String(outPage*pageSize+i+1);tr.setAttribute('aria-label','Result row '+tr.dataset.resultRow);tr.append(el('th',String(outPage*pageSize+i+1)));row.forEach((value,c)=>{const td=el('td'),field=el('textarea');field.className='table-cell-editor';field.wrap='off';field.rows=Math.min(4,Math.max(1,String(value).split('\n').length));field.addEventListener('input',()=>{field.rows=Math.min(4,Math.max(1,field.value.split('\n').length));});td.tabIndex=-1;td.dataset.resultColumn=String(c+1);if(Number(tr.dataset.resultRow)===state.options.editRow&&c+1===(state.options.editColumn||1))td.classList.add('table-context-selected');field.value=value;field.setAttribute('aria-label',`Result row ${outPage*pageSize+i+1} column ${c+1}`);const template=state.options.tableTemplate,source=template&&workbooks[template.side]?.find(sheet=>sheet.name===template.sheetName),dynamic=source&&originalResultCell(source,outPage*pageSize+i+1,c+1,state.options.tableStructure).cell?.dynamicArray;if(dynamic){field.dataset.dynamicArray=dynamic.anchor;field.title=dynamic.anchorOnly?'Dynamic array anchor '+dynamic.anchor+'. The future spill range is determined when the workbook recalculates.':'Dynamic array '+dynamic.ref+'. Edit the whole saved group using row or column operations.';}field.onblur=()=>tableHistory.flush();field.oninput=()=>{try{const current=state.options.tableResult,index=outPage*pageSize+i,next=current.slice();next[index]=current[index].slice();next[index][c]=field.value;applyTableResult(next,{group:field,edits:state.options.tableTemplate&&(!state.options.tableTemplate.structural||state.options.tableStructure)?withCellEdits([{row:index+1,column:c+1,type:'text',value:field.value}],next):null});output=state.options.tableResult;host.querySelector('[data-table-undo]').disabled=!tableHistory.canUndo;host.querySelector('[data-table-redo]').disabled=!tableHistory.canRedo;onDirty();}catch(error){notify(error.message,true);field.value=state.options.tableResult[outPage*pageSize+i][c];}};if(isWorkbookHeader(outPage*pageSize+i+1,c+1)){
     field.oninput=()=>{};
     field.onblur=()=>{
      const index=outPage*pageSize+i;try{tableHistory.flush();const rows=state.options.tableResult.map(row=>row.slice());
      if(field.value===rows[index][c])return;
      const edit=normalizeWorkbookCellEdit({row:index+1,column:c+1,type:'text',value:field.value});rows[index][c]=field.value;
      field.setAttribute('aria-busy','true');
      const locked=[...host.querySelectorAll('input,select,textarea')].filter(control=>!control.disabled);for(const control of locked)control.disabled=true;
      const pending=changeWorkbookCell(edit,rows).catch(error=>{notify(error.message,true);if(field.isConnected)field.value=state.options.tableResult?.[index]?.[c]??'';throw error;}).finally(()=>{if(tableCellCommit===pending)tableCellCommit=null;field.removeAttribute('aria-busy');for(const control of locked)if(control.isConnected)control.disabled=false;});
      tableCellCommit=pending;pending.catch(()=>{});
      }catch(error){notify(error.message,true);field.value=state.options.tableResult?.[index]?.[c]??'';}
     };
    }td.append(field);tr.append(td);});grid.append(tr);});wrapper.append(grid);host.append(wrapper);

  }
 }
 function stopMergeWorker(){mergeWorkerId++;clearTimeout(mergeWorkerTimer);mergeWorkerTimer=null;mergeWorker?.terminate();mergeWorker=null;mergeComputing=false;mergeWorkerError=null;}
 function requestMergeComputation(sourceBinding){
  if(mergeRestorePending||mergeComputing||mergeWorkerError||mergeSourcePending||Object.values(mergePending).some(Boolean))return;
  const token=generation,currentState=state,id=++mergeWorkerId;let worker;
  const current=()=>id===mergeWorkerId&&worker===mergeWorker&&token===generation&&state===currentState&&state.type==='text-merge3'&&mergeSourceBinding().every((value,index)=>value===sourceBinding[index]);
  const fail=message=>{if(!current())return;clearTimeout(mergeWorkerTimer);worker?.terminate();mergeWorker=null;mergeComputing=false;mergeWorkerError=message;render();};
  try{
   worker=new Worker(new URL('merge-worker.js',location.href));mergeWorker=worker;mergeComputing=true;
   mergeWorkerTimer=setTimeout(()=>fail('Merge comparison timed out after 8 seconds. Retry or use smaller inputs.'),8000);
   worker.onmessage=({data})=>{if(!current()||data?.id!==id)return;if(data.error){fail(data.error);return;}if(!data.result||!Array.isArray(data.result.segments)||!Array.isArray(data.result.conflicts)){fail('The merge worker returned an invalid result. Retry the comparison.');return;}clearTimeout(mergeWorkerTimer);worker.terminate();mergeWorker=null;mergeComputing=false;mergeWorkerError=null;mergeCache={inputs:sourceBinding,result:data.result};render();};
   worker.onerror=()=>fail('The merge worker could not complete the comparison. Retry the comparison.');
   worker.postMessage({id,inputs:sourceBinding});
  }catch(error){clearTimeout(mergeWorkerTimer);worker?.terminate();mergeWorker=null;mergeComputing=false;mergeWorkerError='The merge worker could not start. Retry the comparison.';}
 }
 function retryMergeComputation(){if(state.type!=='text-merge3'||mergeSourcePending||Object.values(mergePending).some(Boolean))return;stopMergeWorker();render();}
 function setMergeWrap(value){closeMergeMenu();state.options.mergeWrap=Boolean(value);for(const area of host.querySelectorAll('[data-merge-source],.advanced-output'))area.wrap=value?'soft':'off';const control=host.querySelector('[aria-label="Wrap text"]');if(control)control.checked=value;onDirty();}
 function refreshMergePending(){
  if(state.type!=='text-merge3')return;host.setAttribute('aria-busy',String(mergeBusy()));const status=host.querySelector('.merge-live-status');if(status){status.hidden=false;status.textContent='Updating merge…';}
  for(const button of host.querySelectorAll('button'))if(button.textContent==='Save result'||button.hasAttribute('data-merge-choice')||button.hasAttribute('data-merge-undo')||button.hasAttribute('data-merge-redo')||button.hasAttribute('data-merge-navigation'))button.disabled=true;
  for(const control of host.querySelectorAll('.merge-document-controls select,.merge-document-controls button'))control.disabled=true;
  const output=host.querySelector('.advanced-output');if(output)output.disabled=true;
 }
 function scheduleMergeSource(){
  clearTimeout(mergeSourceTimer);if(mergeComposing)return;const token=generation,currentState=state;
  mergeSourceTimer=setTimeout(()=>{if(token!==generation||currentState!==state)return;mergeSourcePending=false;render();host.setAttribute('aria-busy',String(mergeBusy()));},180);
 }
 function editMergeSource(side,area){
  if(state.type!=='text-merge3'||Object.values(mergePending).some(Boolean))return;
  let content;try{content=projectText(text(side),area.value);validateText(content);}catch(error){notify(error.message,true);area.value=text(side);return;}if(text(side)===content)return;
  stopMergeWorker();const before=mergeSnapshot(),drafts={...state.options.mergeDrafts,[side]:content};
  restoreMerge(mergeHistory.apply(before,[[JSON.stringify({}),null,JSON.stringify(state.inputs),JSON.stringify(drafts)]],area));selectedConflict=null;mergeSourcePending=true;closeMergeMenu();refreshMergePending();onDirty();scheduleMergeSource();
 }
 function mergeConflictTarget(direction,unresolved=false){
  const indices=(merged?.conflicts||[]).map((_,index)=>index).filter(index=>!unresolved||!choices[index]);
  if(selectedConflict===null)return direction>0?indices[0]??null:null;
  return direction>0?indices.find(index=>index>selectedConflict)??null:indices.filter(index=>index<selectedConflict).at(-1)??null;
 }
 function selectMergeConflict(index){
  if(index!==selectedConflict){closeMergeMenu();selectedConflict=index;}
  for(const box of host.querySelectorAll('[data-merge-conflict]'))box.classList.toggle('merge-conflict-selected',Number(box.dataset.mergeConflict)===index);
  for(const button of host.querySelectorAll('[data-merge-navigation]')){const label=button.dataset.mergeNavigation;button.disabled=mergeBusy()||mergeConflictTarget(label.startsWith('Previous')?-1:1,label.includes('unresolved'))===null;}
 }
 function navigateMergeConflict(direction,unresolved=false){if(state.type!=='text-merge3'||mergeBusy())return;const index=mergeConflictTarget(direction,unresolved);if(index===null)return;selectMergeConflict(index);const box=host.querySelector('[data-merge-conflict="'+index+'"]');box?.focus({preventScroll:true});box?.scrollIntoView({block:'nearest'});}
 function showMergeContext(event,keyboard=false){
  if(state.type!=='text-merge3'||event.target.isContentEditable||event.target.closest('input,textarea,select,dialog'))return;
  event.preventDefault();event.stopPropagation();const box=event.target.closest('[data-merge-conflict]');if(box)selectMergeConflict(Number(box.dataset.mergeConflict));closeMergeMenu();
  const restore=box||event.target.closest('[data-merge-pane]')||host,ticket=mergeMenuTicket,token=generation,currentState=state,binding=JSON.stringify(mergeBinding()),snapshot=JSON.stringify(mergeSnapshot()),requests=JSON.stringify(openSerial),serial=importSerial,index=selectedConflict,wrap=state.options.mergeWrap;
  const valid=()=>ticket===mergeMenuTicket&&token===generation&&state===currentState&&state.type==='text-merge3'&&binding===JSON.stringify(mergeBinding())&&snapshot===JSON.stringify(mergeSnapshot())&&requests===JSON.stringify(openSerial)&&serial===importSerial&&index===selectedConflict&&wrap===state.options.mergeWrap&&host.isConnected&&!host.closest('[hidden]')&&document.getElementById('mergeContext')?.hidden===false;
  const invoke=fn=>{try{Promise.resolve(fn()).catch(error=>notify(error.message,true));}catch(error){notify(error.message,true);}};
  const item=(label,run,disabled=()=>false)=>({label,disabled:disabled(),validate:()=>valid()&&!disabled(),action:()=>invoke(run)});
  const entries=[{label:'Files',children:[item('Open base',()=>openSide('base')),item('Open left',()=>openSide('a')),item('Open right',()=>openSide('b')),item('Save result',()=>saveResult(),()=>mergeBusy()||state.output===null),item('Retry merge comparison',retryMergeComputation,()=>!mergeWorkerError||mergeSourcePending||Object.values(mergePending).some(Boolean))]},
   {label:'Navigate',children:[['Previous conflict',-1,false],['Next conflict',1,false],['Previous unresolved conflict',-1,true],['Next unresolved conflict',1,true]].map(([label,direction,unresolved])=>item(label,()=>navigateMergeConflict(direction,unresolved),()=>mergeBusy()||mergeConflictTarget(direction,unresolved)===null))},
   {label:'Resolve conflict',children:['base','left','right','both','both-reverse'].map(choice=>item(choice==='both-reverse'?'Use both (right then left)':'Use '+choice,()=>chooseMerge(index,choice),()=>mergeBusy()||index===null||!merged?.conflicts[index]))},
   {label:'View',children:[item(state.options.mergeWrap===false?'Wrap text':'Disable text wrap',()=>setMergeWrap(state.options.mergeWrap===false))]},
   {label:'History',children:[item('Undo edit',undo,()=>mergeHistoryBusy()||!mergeHistory.canUndo),item('Redo edit',redo,()=>mergeHistoryBusy()||!mergeHistory.canRedo)]}];
  const extra=[...host.querySelectorAll('[data-advanced-extra-action]')].filter(action=>typeof action.onclick==='function').map(action=>{const handler=action.onclick;return item(action.textContent.trim()||action.getAttribute('aria-label')||action.title,()=>handler.call(action),()=>mergeBusy()||!action.isConnected||action.disabled||Boolean(action.closest('[hidden]'))||action.onclick!==handler);});if(extra.length)entries.push({label:'Archive entry',children:extra});
  const rect=restore.getBoundingClientRect();mergeMenu.open(entries,keyboard?rect.left+12:event.clientX,keyboard?rect.top+Math.min(rect.height,28):event.clientY,()=>{if(host.isConnected&&!host.closest('[hidden]'))(restore.isConnected?restore:host).focus({preventScroll:true});});
 }
 host.addEventListener('contextmenu',event=>showMergeContext(event));
 host.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')showMergeContext(event,true);});
 host.addEventListener('focusin',event=>{if(state.type==='text-merge3'){const box=event.target.closest('[data-merge-conflict]');if(box)selectMergeConflict(Number(box.dataset.mergeConflict));}});
 host.addEventListener('click',event=>{if(state.type==='text-merge3'){const box=event.target.closest('[data-merge-conflict]');if(box)selectMergeConflict(Number(box.dataset.mergeConflict));}});
 function generatedMerge(selectedChoices){
  if(!merged||merged.conflicts.some((_,index)=>!selectedChoices[index]))return null;
  let index=0;const result=merged.segments.map(segment=>{if(segment.type==='text')return segment.text;const choice=selectedChoices[index++];return choice==='both'?segment.left+segment.right:choice==='both-reverse'?segment.right+segment.left:segment[choice];}).join('');const source=['base','a','b'].find(side=>state.inputs[side])||'base';const ending=mergeOutputFormat().lineEnding;return projectText(text(source),result,['lf','crlf','cr'].includes(ending)?ending:'preserve');
 }
 function chooseMerge(index,choice){
  if(!Number.isInteger(index)||!merged?.conflicts[index]||!['base','left','right','both','both-reverse'].includes(choice))throw Error('Choose a current conflict and a valid resolution.');
  if(mergeBusy()||choices[index]===choice)return;
  const before=mergeSnapshot(),nextChoices={...choices,[index]:choice},nextOutput=generatedMerge(nextChoices),next=[[JSON.stringify(nextChoices),nextOutput,JSON.stringify(state.inputs),JSON.stringify(state.options.mergeDrafts||{})]];
  const apply=()=>{restoreMerge(mergeHistory.apply(before,next));onDirty();render();host.querySelector('[data-merge-conflict="'+index+'"] [data-merge-choice="'+choice+'"]')?.focus({preventScroll:true});};
  if(state.output===null||state.output===generatedMerge(choices)){apply();return;}
  const choiceFocus=document.activeElement,expectedState=state,token=generation,serial=importSerial,signature=JSON.stringify(before),binding=JSON.stringify(mergeBinding()),dialog=el('dialog',undefined,'merge-choice-review');dialog.setAttribute('aria-label','Review merged result replacement');
  dialog.append(el('h2','Review merged result replacement'),el('p','This choice replaces your edited merged result. Review both versions below. Undo edit can restore the previous result after replacement.'));
  for(const [label,value]of [['Current edited result',state.output],['Result after changing choice',nextOutput]]){const wrapper=el('label',label),preview=el('textarea');preview.readOnly=true;preview.setAttribute('aria-label',label);preview.value=value===null?'Other conflicts still need a choice.':value;wrapper.append(preview);dialog.append(wrapper);}
  const error=el('p');error.setAttribute('role','alert');dialog.append(error);const actions=el('div',undefined,'advanced-toolbar');actions.append(button('Keep edited result',()=>dialog.close()),button('Replace merged result',()=>{if(state!==expectedState||token!==generation||serial!==importSerial||signature!==JSON.stringify(mergeSnapshot())||binding!==JSON.stringify(mergeBinding())||mergeBusy()){error.textContent='The comparison changed. Close this review and choose again.';return;}dialog.close();apply();}));dialog.append(actions);dialog.addEventListener('close',()=>{dialog.remove();if(choiceFocus.isConnected&&!host.closest('[hidden]'))choiceFocus.focus({preventScroll:true});});host.append(dialog);dialog.showModal();actions.firstElementChild.focus();
 }
 function mergeSelect(label,values,current,change){
  const select=el('select');select.setAttribute('aria-label',label);for(const [value,name]of values){const option=el('option',name);option.value=value;select.append(option);}select.value=current;select.disabled=mergeBusy();select.onchange=()=>{try{change(select.value);}catch(error){select.value=current;notify(error.message,true);}};return select;
 }
 function mergeEncodingControl(side,label){
  const selected=state.options.mergeReadEncodings?.[side]||'auto';
  const control=mergeSelect(label+' input encoding',[['auto','Auto (BOM / UTF-8)'],...ENCODINGS.map(value=>[value,encodingName(value)])],selected,value=>{
   decodeText(decode(state.inputs[side]?.data||''),value);
   if(state.inputs[side]&&(state.output!==null||Object.keys(choices).length||state.options.mergeDrafts?.[side]!==undefined)&&!window.confirm('Changing the input encoding recalculates this merge and clears conflict choices and the edited result. Source edits are retained. Continue?')){render();return;}
   stopMergeWorker();state.options.mergeReadEncodings={...state.options.mergeReadEncodings,[side]:value};state.output=null;choices={};state.options.choices={};mergeHistory.clear();mergeCache=null;selectedConflict=null;onDirty();render();
  });control.disabled=control.disabled||isDocumentInput(state.inputs[side]?.name);return control;
 }
 async function changeMergePdfOrder(side,order){
  if(mergeBusy())throw Error('Wait for the merge comparison before re-extracting a document.');
  if(!['document','page-rows','page-columns','tagged-structure'].includes(order))throw Error('Invalid PDF reading order.');
  const source=state.inputs[side];if(!/\.pdf$/i.test(source?.name||'')){state.options.mergePdfOrders={...state.options.mergePdfOrders,[side]:order};onDirty();return;}
  if(!window.confirm('Re-extract this PDF? This clears its source edits, conflict choices, edited result and undo history. The original document remains unchanged.')){render();return;}
  const current=state,epoch=generation,request=++openSerial[side],unchanged=captureResultRequest();mergePending[side]=request;render();
  try{const next=await readMergeInput('open:'+side,source,{...state.options,mergePdfOrders:{...state.options.mergePdfOrders,[side]:order}},side);if(current!==state||epoch!==generation||request!==openSerial[side]||!unchanged())return;stopMergeWorker();mergeDocuments[side]=next;state.options.mergePdfOrders={...state.options.mergePdfOrders,[side]:order};state.options.mergeDocumentProjections={...state.options.mergeDocumentProjections,[side]:next.documentProjection};if(state.options.mergeDrafts)delete state.options.mergeDrafts[side];state.output=null;choices={};state.options.choices={};mergeHistory.clear();mergeCache=null;selectedConflict=null;onDirty();}catch(error){if(current===state&&epoch===generation&&request===openSerial[side])throw error;}finally{if(current===state&&epoch===generation&&mergePending[side]===request){mergePending[side]=null;render();}}
 } async function changeMergeDocxScope(side,order){
  if(mergeBusy())throw Error('Wait for the merge comparison before re-extracting a document.');
  if(!['main-document','main-and-related-text'].includes(order))throw Error('Invalid DOCX text scope.');
  const source=state.inputs[side];if(!/\.docx$/i.test(source?.name||'')){state.options.mergeDocxScopes={...state.options.mergeDocxScopes,[side]:order};onDirty();return;}
  if(!window.confirm('Re-extract this DOCX using the selected logical text scope? This clears its source edits, conflict choices, edited result and undo history. The original document remains unchanged.')){render();return;}
  const current=state,epoch=generation,request=++openSerial[side],unchanged=captureResultRequest();mergePending[side]=request;render();
  try{const next=await readMergeInput('open:'+side,source,{...state.options,mergeDocxScopes:{...state.options.mergeDocxScopes,[side]:order}},side);if(current!==state||epoch!==generation||request!==openSerial[side]||!unchanged())return;stopMergeWorker();mergeDocuments[side]=next;state.options.mergeDocxScopes={...state.options.mergeDocxScopes,[side]:order};state.options.mergeDocumentProjections={...state.options.mergeDocumentProjections,[side]:next.documentProjection};if(state.options.mergeDrafts)delete state.options.mergeDrafts[side];state.output=null;choices={};state.options.choices={};mergeHistory.clear();mergeCache=null;selectedConflict=null;onDirty();}catch(error){if(current===state&&epoch===generation&&request===openSerial[side])throw error;}finally{if(current===state&&epoch===generation&&mergePending[side]===request){mergePending[side]=null;render();}}
 } async function changeMergeOdtScope(side,order){
  if(mergeBusy())throw Error('Wait for the merge comparison before re-extracting a document.');
  if(!['main-document','main-and-related-text'].includes(order))throw Error('Invalid ODT text scope.');
  const source=state.inputs[side];if(!/\.odt$/i.test(source?.name||'')){state.options.mergeOdtScopes={...state.options.mergeOdtScopes,[side]:order};onDirty();return;}
  if(!window.confirm('Re-extract this ODT using the selected logical text scope? This clears its source edits, conflict choices, edited result and undo history. The original document remains unchanged.')){render();return;}
  const current=state,epoch=generation,request=++openSerial[side],unchanged=captureResultRequest();mergePending[side]=request;render();
  try{const next=await readMergeInput('open:'+side,source,{...state.options,mergeOdtScopes:{...state.options.mergeOdtScopes,[side]:order}},side);if(current!==state||epoch!==generation||request!==openSerial[side]||!unchanged())return;stopMergeWorker();mergeDocuments[side]=next;state.options.mergeOdtScopes={...state.options.mergeOdtScopes,[side]:order};state.options.mergeDocumentProjections={...state.options.mergeDocumentProjections,[side]:next.documentProjection};if(state.options.mergeDrafts)delete state.options.mergeDrafts[side];state.output=null;choices={};state.options.choices={};mergeHistory.clear();mergeCache=null;selectedConflict=null;onDirty();}catch(error){if(current===state&&epoch===generation&&request===openSerial[side])throw error;}finally{if(current===state&&epoch===generation&&mergePending[side]===request){mergePending[side]=null;render();}}
 } async function changeMergeDocScope(side,order){
  if(mergeBusy())throw Error('Wait for the merge comparison before re-extracting a document.');
  if(!['main-document','main-and-related-text'].includes(order))throw Error('Invalid DOC text scope.');
  const source=state.inputs[side];if(!/\.doc$/i.test(source?.name||'')){state.options.mergeDocScopes={...state.options.mergeDocScopes,[side]:order};onDirty();return;}
  if(!window.confirm('Re-extract this DOC using the selected logical text scope? This clears its source edits, conflict choices, edited result and undo history. The original document remains unchanged.')){render();return;}
  const current=state,epoch=generation,request=++openSerial[side],unchanged=captureResultRequest();mergePending[side]=request;render();
  try{const next=await readMergeInput('open:'+side,source,{...state.options,mergeDocScopes:{...state.options.mergeDocScopes,[side]:order}},side);if(current!==state||epoch!==generation||request!==openSerial[side]||!unchanged())return;stopMergeWorker();mergeDocuments[side]=next;state.options.mergeDocScopes={...state.options.mergeDocScopes,[side]:order};state.options.mergeDocumentProjections={...state.options.mergeDocumentProjections,[side]:next.documentProjection};if(state.options.mergeDrafts)delete state.options.mergeDrafts[side];state.output=null;choices={};state.options.choices={};mergeHistory.clear();mergeCache=null;selectedConflict=null;onDirty();}catch(error){if(current===state&&epoch===generation&&request===openSerial[side])throw error;}finally{if(current===state&&epoch===generation&&mergePending[side]===request){mergePending[side]=null;render();}}
 }
 function mergeDocumentControls(side,label){
  const controls=el('div',undefined,'merge-document-controls'),projection=mergeDocuments[side]?.documentProjection;
  const select=mergeSelect(label+' PDF reading order',[['document','PDF document order'],['page-rows','PDF page rows'],['page-columns','PDF page columns'],['tagged-structure','Tagged structure']],state.options.mergePdfOrders?.[side]||'document',value=>{changeMergePdfOrder(side,value).catch(error=>notify(error.message,true));});select.title='Tagged structure orders normalized extracted text within each page; artifacts remain in a labelled tail. No whole-document reading order or source-whitespace reconstruction.';controls.append(select);
  for(const kind of ['docx','odt','doc']){
  let scope=state.options['merge'+(kind==='docx'?'Docx':kind==='odt'?'Odt':'Doc')+'Scopes']?.[side]||'main-document';const docx=mergeSelect(label+' '+kind.toUpperCase()+' text scope',[['main-document',kind.toUpperCase()+' main body'],['main-and-related-text',kind.toUpperCase()+' body + related text']],scope,value=>{scope=value;});const extract=button('Re-extract '+label.toLowerCase()+' '+kind.toUpperCase(),()=>(kind==='docx'?changeMergeDocxScope:kind==='odt'?changeMergeOdtScope:changeMergeDocScope)(side,scope));extract.disabled=mergeBusy()||!state.inputs[side]?.name?.toLowerCase().endsWith('.'+kind);extract.title=kind==='doc'?'Stored headers, footers, notes, comments and text boxes with reference markers; not rendered pages. Replaces this source draft after confirmation.':'Logical referenced headers, footers and notes; not rendered pages. Replaces this source draft after confirmation.';controls.append(docx,extract);
  }
  if(projection){const note=el('p',projection.kind.toUpperCase()+' extracted text · '+projection.scope+(projection.order==='tagged-structure'?' · Tagged structure: normalized text within each page; artifacts in a labelled tail.':'')+' Original document unchanged.','advanced-note');note.dataset.mergeProjection=side;note.title='Excluded: '+projection.exclusions.join('; ');controls.append(note);}
  return controls;
 }
 function renderMergeOutputFormat(){
  const format=mergeOutputFormat(),toolbar=el('div',undefined,'advanced-toolbar');toolbar.append(el('span','Result format'));
  const change=patch=>{const next={...format,...patch};if(patch.encoding&&patch.encoding!==format.encoding){delete next.legacyBytes;delete next.normalizeLegacy;}state.options.mergeOutputFormat=validateFormat(next);onDirty();render();};
  toolbar.append(mergeSelect('Result encoding',ENCODINGS.map(value=>[value,encodingName(value)]),format.encoding,encoding=>change({encoding,bom:encoding.startsWith('utf')&&format.bom})),mergeSelect('Result line endings',[['mixed','Preserve'],['lf','LF'],['crlf','CRLF'],['cr','CR']],['mixed','none'].includes(format.lineEnding)?'mixed':format.lineEnding,lineEnding=>change({lineEnding})));
  const label=el('label','BOM '),bom=el('input');bom.type='checkbox';bom.setAttribute('aria-label','Result BOM');bom.checked=format.bom;bom.disabled=mergeBusy()||!format.encoding.startsWith('utf');bom.onchange=()=>change({bom:bom.checked});label.append(bom);toolbar.append(label);if(format.legacyBytes){const normalizeLabel=el('label','Normalize alternate byte mappings when saving edits '),normalize=el('input');normalize.type='checkbox';normalize.setAttribute('aria-label','Result normalize alternate byte mappings');normalize.checked=format.normalizeLegacy===true;normalize.disabled=mergeBusy();normalize.onchange=()=>change({normalizeLegacy:normalize.checked});normalizeLabel.append(normalize);toolbar.append(normalizeLabel);}host.append(toolbar);
 }
 function renderMerge(){
  const sourceBinding=mergeSourceBinding();if(!mergeCache||sourceBinding.some((value,index)=>value!==mergeCache.inputs[index]))requestMergeComputation(sourceBinding);
  host.tabIndex=0;host.setAttribute('aria-busy',String(mergeBusy()));const liveStatus=el('p',mergeBusy()?'Updating merge…':'','merge-live-status');liveStatus.setAttribute('role','status');liveStatus.hidden=!mergeBusy();host.append(liveStatus);
  host.append(el('p','Three-way line merge · Base is the common ancestor. Input encodings are detected from BOMs; choose an encoding for legacy files. Result format defaults to the base, then left file.','advanced-note'));
  const panes=el('div',undefined,'advanced-merge-inputs');for(const [side,label]of [['base','Base'],['a','Left'],['b','Right']]){const wrap=el('div',label),area=el('textarea');wrap.tabIndex=0;wrap.dataset.mergePane=side;wrap.setAttribute('aria-label',label+' merge input');area.setAttribute('aria-label',label);area.value=text(side);area.spellcheck=false;area.dataset.mergeSource=side;area.wrap=state.options.mergeWrap===false?'off':'soft';area.oninput=()=>editMergeSource(side,area);installBulkTextInput(area,{flush:()=>mergeHistory.flush(),isComposing:()=>mergeComposing});area.addEventListener('compositionstart',()=>{mergeComposing=true;clearTimeout(mergeSourceTimer);});area.addEventListener('compositionend',()=>{mergeComposing=false;editMergeSource(side,area);scheduleMergeSource();});area.disabled=Boolean(mergeRestorePending)||Object.values(mergePending).some(Boolean);wrap.append(mergeEncodingControl(side,label),mergeDocumentControls(side,label),area);panes.append(wrap);}host.append(panes);renderMergeOutputFormat();
  if(!mergeCache||sourceBinding.some((value,index)=>value!==mergeCache.inputs[index])){
   merged=null;host.setAttribute('aria-busy',String(mergeSourcePending||mergeComputing||Object.values(mergePending).some(Boolean)));liveStatus.hidden=false;liveStatus.textContent=mergeWorkerError?'Merge comparison unavailable':'Comparing merge inputs…';
   const save=[...host.querySelectorAll('[data-advanced-main-toolbar] button')].find(button=>button.textContent==='Save result');if(save)save.disabled=true;
   const recoveryHistory=el('div',undefined,'advanced-toolbar'),recoveryUndo=button('Undo edit',undo),recoveryRedo=button('Redo edit',redo);recoveryUndo.dataset.mergeUndo='';recoveryRedo.dataset.mergeRedo='';recoveryUndo.disabled=mergeHistoryBusy()||!mergeHistory.canUndo;recoveryRedo.disabled=mergeHistoryBusy()||!mergeHistory.canRedo;recoveryHistory.append(recoveryUndo,recoveryRedo);host.append(recoveryHistory);
   if(mergeWorkerError){const error=el('p',mergeWorkerError,'advanced-error merge-worker-error');error.setAttribute('role','alert');host.append(error,button('Retry merge comparison',retryMergeComputation));}
   if(state.output!==null){const label=el('label','Merged result — awaiting comparison'),output=el('textarea',undefined,'advanced-output');output.value=state.output;output.disabled=true;output.wrap=state.options.mergeWrap===false?'off':'soft';label.append(output);host.append(label);}
   return;
  }merged=mergeCache.result;if(selectedConflict!==null&&selectedConflict>=merged.conflicts.length)selectedConflict=null;const navigation=el('div',undefined,'advanced-toolbar');for(const [label,direction,unresolved]of [['Previous conflict',-1,false],['Next conflict',1,false],['Previous unresolved conflict',-1,true],['Next unresolved conflict',1,true]]){const control=button(label,()=>navigateMergeConflict(direction,unresolved));control.dataset.mergeNavigation=label;control.disabled=mergeBusy()||mergeConflictTarget(direction,unresolved)===null;navigation.append(control);}const wrapLabel=el('label','Wrap text '),wrapControl=el('input');wrapControl.type='checkbox';wrapControl.checked=state.options.mergeWrap!==false;wrapControl.setAttribute('aria-label','Wrap text');wrapControl.onchange=()=>setMergeWrap(wrapControl.checked);wrapLabel.append(wrapControl);navigation.append(wrapLabel);host.append(navigation);let conflictIndex=0;
  for(const segment of merged.segments){if(segment.type!=='conflict')continue;const index=conflictIndex++,box=el('section',undefined,'advanced-conflict');box.dataset.mergeConflict=String(index);box.tabIndex=0;box.setAttribute('aria-label','Conflict '+(index+1));box.classList.toggle('merge-conflict-selected',selectedConflict===index);box.append(el('h3',`Conflict ${index+1} · base lines ${segment.start+1}–${Math.max(segment.start+1,segment.end)}`));const values=el('div',undefined,'advanced-merge-inputs');for(const side of ['base','left','right']){const pre=el('pre',segment[side]);const wrap=el('div');wrap.append(el('strong',side),pre);values.append(wrap);}box.append(values);for(const choice of ['base','left','right','both','both-reverse']){const b=button(choice==='both-reverse'?'Use both (right then left)':`Use ${choice}`,()=>chooseMerge(index,choice));b.dataset.mergeChoice=choice;b.disabled=mergeBusy();b.classList.toggle('active',choices[index]===choice);box.append(b);}host.append(box);}
  const historyControls=el('div',undefined,'advanced-toolbar'),undoButton=button('Undo edit',undo),redoButton=button('Redo edit',redo);undoButton.dataset.mergeUndo='';redoButton.dataset.mergeRedo='';undoButton.disabled=mergeBusy()||!mergeHistory.canUndo;redoButton.disabled=mergeBusy()||!mergeHistory.canRedo;historyControls.append(undoButton,redoButton);host.append(historyControls);
  const unresolved=merged.conflicts.filter((_,i)=>!choices[i]).length;
  if(unresolved){const save=[...host.querySelectorAll('[data-advanced-main-toolbar] button')].find(button=>button.textContent==='Save result');if(save)save.disabled=true;host.append(el('p',`${unresolved} unresolved conflicts. Saving is disabled until all are resolved.`,'advanced-error'));state.output=null;return;}
  if(state.output===null){try{state.output=generatedMerge(choices);}catch(error){host.append(el('p',error.message,'advanced-error'));const save=[...host.querySelectorAll('[data-advanced-main-toolbar] button')].find(button=>button.textContent==='Save result');if(save)save.disabled=true;return;}}
  const save=[...host.querySelectorAll('[data-advanced-main-toolbar] button')].find(button=>button.textContent==='Save result');if(save)save.disabled=mergeBusy();
  const label=el('label','Merged result — editable'),output=el('textarea',undefined,'advanced-output');output.value=state.output;output.spellcheck=false;output.wrap=state.options.mergeWrap===false?'off':'soft';output.disabled=mergeBusy();output.onblur=()=>mergeHistory.flush();installBulkTextInput(output,{flush:()=>mergeHistory.flush(),isComposing:()=>mergeComposing});output.oninput=()=>{let content;try{content=projectText(state.output,output.value);validateText(content);}catch(error){notify(error.message,true);output.value=state.output;return;}restoreMerge(mergeHistory.apply(mergeSnapshot(),[[JSON.stringify(choices),content,JSON.stringify(state.inputs),JSON.stringify(state.options.mergeDrafts||{})]],output));undoButton.disabled=!mergeHistory.canUndo;redoButton.disabled=!mergeHistory.canRedo;onDirty();};label.append(output);host.append(label);
 }
 function commitType(type,saved,runtime,parsed={},documents={}){reset();mergeDocuments=documents;state.type=type;if(saved){state={...state,...structuredClone(saved),options:{...state.options,...structuredClone(saved.options||{})}};state.type=type;state.output??=null;choices={...(state.options.choices||{})};}const mergeRetained=runtime&&typeof runtime==='object'?mergeRuntimes.get(runtime):null;if(type==='text-merge3'&&mergeRetained&&mergeRetained.inputs===JSON.stringify(mergeBinding())&&mergeRetained.value===JSON.stringify(mergeSnapshot())){mergeHistory.restore(mergeRetained.history);selectedConflict=Number.isInteger(mergeRetained.selectedConflict)?mergeRetained.selectedConflict:null;}const retained=runtime&&typeof runtime==='object'?binaryRuntimes.get(runtime):null;if(type==='binary-compare'&&retained&&sameBinaryBinding(retained.inputs))binaryHistory.restore(retained.history);const tableRetained=runtime&&typeof runtime==='object'?tableRuntimes.get(runtime):null;if(type==='table-compare'&&tableRetained&&sameBinaryBinding(tableRetained.inputs)&&tableRetained.result===JSON.stringify(currentTableSnapshot()))tableHistory.restore(tableRetained.history);workbooks=parsed;render();}
 function setType(type,saved=null,runtime=null){
  const candidate=saved?structuredClone(saved):null;
  if(candidate?.options?.compareNumberFormats!==undefined&&typeof candidate.options.compareNumberFormats!=='boolean')throw Error('Invalid number formats comparison setting.');
  if(candidate?.options?.compareConditionalRules!==undefined&&typeof candidate.options.compareConditionalRules!=='boolean')throw Error('Invalid conditional rules comparison setting.');
  if(candidate?.options?.tableTemplate?.format==='xlsx')delete candidate.options.tableTemplate.format;
  if(type==='table-compare'&&candidate?.options?.tableTemplate){const template=candidate.options.tableTemplate,format=template.format||'xlsx';if(!['xlsx','ods'].includes(format)||!(format==='ods'?/\.ods$/i:/\.xlsx$/i).test(candidate.inputs?.[template.side]?.name||''))throw Error('Workbook preservation requires its original matching workbook input.');if(format==='ods'&&(template.structural||candidate.options.tableStyleEdits||candidate.options.tableStructure))throw Error('ODS results do not support structural or formatting edits.');}
  if(type==='text-merge3'&&candidate){for(const key of ['mergePdfOrders','mergeDocxScopes','mergeOdtScopes','mergeDocScopes','mergeDocumentProjections']){const map=candidate.options?.[key];if(map!==undefined){if(!map||typeof map!=='object'||Array.isArray(map)||Object.keys(map).some(side=>!['base','a','b'].includes(side)))throw Error('Invalid merge document options.');for(const [side,value]of Object.entries(map)){if(['mergeDocxScopes','mergeOdtScopes','mergeDocScopes'].includes(key)){if(!['main-document','main-and-related-text'].includes(value))throw Error('Invalid document text scope.');}else if(key==='mergePdfOrders'){if(!['document','page-rows','page-columns','tagged-structure'].includes(value))throw Error('Invalid PDF reading order.');}else{map[side]=validateDocumentProjection(value);if(value.kind==='docx'&&(candidate.options.mergeDocxScopes?.[side]||'main-document')!==value.scope)throw Error('Saved DOCX text scope does not match its extraction provenance.');if(value.kind==='doc'&&(candidate.options.mergeDocScopes?.[side]||'main-document')!==value.scope)throw Error('Saved DOC text scope does not match its extraction provenance.');if(value.kind==='odt'&&(candidate.options.mergeOdtScopes?.[side]||'main-document')!==value.scope)throw Error('Saved ODT text scope does not match its extraction provenance.');if(value.kind==='pdf'&&(candidate.options.mergePdfOrders?.[side]||'document')!==(value.order||'document'))throw Error('Saved PDF reading order does not match its extraction provenance.');if(!isDocumentInput(candidate.inputs?.[side]?.name))throw Error('Document metadata requires its original source.');}}}}if(candidate.options?.mergeOutputFormat)validateFormat(candidate.options.mergeOutputFormat);for(const side of ['base','a','b']){if(!isDocumentInput(candidate.inputs?.[side]?.name))decodeText(decode(candidate.inputs?.[side]?.data||''),candidate.options?.mergeReadEncodings?.[side]||'auto');if(candidate.options?.mergeDrafts?.[side]!==undefined)validateText(candidate.options.mergeDrafts[side]);}}
  if(candidate?.options?.tableStructure)candidate.options.tableStructure=validateWorkbookStructuralRows(candidate.options.tableStructure,{template:candidate.options.tableTemplate,rows:candidate.options.tableResult});
  if(candidate?.options?.tableCellEdits)candidate.options.tableCellEdits=validateResultCellEdits(candidate.options.tableCellEdits,{rows:candidate.options.tableResult,template:candidate.options.tableTemplate,structure:candidate.options.tableStructure});
  if(candidate?.options?.tableStyleEdits)candidate.options.tableStyleEdits=validateWorkbookStyleEdits(candidate.options.tableStyleEdits,{rows:candidate.options.tableResult,template:candidate.options.tableTemplate,structure:candidate.options.tableStructure});
  clearSheetReview();cancelMergeReads();cancelWorkbookReads();stopMergeWorker();closeMergeMenu();closeTableMenu();closeBinaryMenu();
  for(const side of ['a','b','base'])openSerial[side]++;
  const request=++importSerial,requestedGeneration=generation;
  if(type==='text-merge3'&&['base','a','b'].some(side=>isDocumentInput(candidate?.inputs?.[side]?.name))){
   mergeRestorePending=request;if(state.type==='text-merge3')render();
   const readSide=async side=>{const value=await readMergeInput('restore:'+request+':'+side,candidate.inputs[side],candidate.options,side),savedProjection=candidate.options?.mergeDocumentProjections?.[side];if(value.documentProjection){if(savedProjection&&JSON.stringify(savedProjection)!==JSON.stringify(value.documentProjection))throw Error('Document extraction changed. Reopen the source before restoring merge decisions.');if(!savedProjection&&(candidate.output!=null||Object.keys(candidate.options?.choices||{}).length||Object.keys(candidate.options?.mergeDrafts||{}).length))throw Error('This document merge has no extraction provenance. Reopen its sources in a new merge.');}else if(savedProjection)throw Error('Document metadata does not match this merge source.');return [side,value];};
   const restored=['base','a','b'].some(side=>/\.doc$/i.test(candidate.inputs?.[side]?.name||''))?(async()=>{const entries=[];for(const side of ['base','a','b']){if(request!==importSerial||requestedGeneration!==generation)return [];entries.push(await readSide(side));}return entries;})():Promise.all(['base','a','b'].map(readSide));
   return restored.then(entries=>{if(request!==importSerial||requestedGeneration!==generation)return;candidate.options={...candidate.options,mergeDocumentProjections:Object.fromEntries(entries.filter(([,value])=>value.documentProjection).map(([side,value])=>[side,value.documentProjection]))};commitType(type,candidate,runtime,{},Object.fromEntries(entries));}).catch(error=>{for(const [key,controller]of mergeReads)if(key.startsWith('restore:'+request+':')){controller.abort();mergeReads.delete(key);}if(request===importSerial&&requestedGeneration===generation)throw error;}).finally(()=>{if(mergeRestorePending===request){mergeRestorePending=null;render();}});
  }
  const workbookInputs=type==='table-compare'?['a','b'].filter(side=>isSheetInput(candidate?.inputs?.[side]?.name)):[];
  if(!workbookInputs.length){if(candidate?.options?.tableStructure)throw Error('Structural edits require their original XLSX workbook.');if(candidate?.options?.tableStyleEdits)throw Error('Copied formatting requires its source workbooks.');commitType(type,candidate,runtime);return;}
  tableRestorePending=request;if(state.type==='table-compare')render();else refreshActions();
  return Promise.all(workbookInputs.map(async side=>[side,await readTrackedWorkbook('restore:'+side,candidate.inputs[side].data,candidate.inputs[side].name)])).then(async entries=>{
   if(candidate.options?.tableCellEdits||candidate.options?.tableStyleEdits||candidate.options?.tableStructure){const template=candidate.options.tableTemplate;if(template.sourceHash!==await workbookHash(candidate.inputs[template.side].data)||!Object.fromEntries(entries)[template.side]?.some(sheet=>sheet.name===template.sheetName))throw Error('Workbook edit source no longer matches its template.');}
   if(candidate.options?.tableStructure){const template=candidate.options.tableTemplate,sheet=Object.fromEntries(entries)[template.side].find(sheet=>sheet.name===template.sheetName);validateWorkbookStructuralRows(candidate.options.tableStructure,{template,sourceShape:resultShape(sheet.rows),rows:candidate.options.tableResult});}
   if(candidate.options?.tableStyleEdits)await verifyStyleSources(candidate.options.tableStyleEdits,candidate.inputs,Object.fromEntries(entries));
   if(candidate.options?.tableStructure||odsTemplate(candidate.options?.tableTemplate))await preservedWorkbook(candidate.options.tableStyleEdits||null,candidate.options,{inputs:candidate.inputs,workbooks:Object.fromEntries(entries)});
   if(request!==importSerial||requestedGeneration!==generation)return;
   commitType(type,candidate,runtime,Object.fromEntries(entries));
  }).catch(error=>{if(request===importSerial&&requestedGeneration===generation)throw error;}).finally(()=>{if(tableRestorePending===request){tableRestorePending=null;if(state.type==='table-compare')render();else refreshActions();}});
 }
 reset();return {setType,getRuntimeState,undo,redo,navigateConflict:navigateMergeConflict,getState(){const saved=structuredClone(state);if(saved.output===null)delete saved.output;return saved;},openSide,saveResult,getArchiveResult,refreshActions,reset(){reset();render();}};
}
