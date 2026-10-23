'use strict';
// XLSX admission already resolves package relationships and rejects nonworksheets.
// https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/how-to-retrieve-a-list-of-the-hidden-worksheets-in-a-spreadsheet
// ODF 1.3 Part3 §§16.2,16.4,19.510,20.416: inherited table display.
// https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part3-schema/OpenDocument-v1.3-os-part3-schema.html
const OFFICE='urn:oasis:names:tc:opendocument:xmlns:office:1.0',STYLE='urn:oasis:names:tc:opendocument:xmlns:style:1.0',TABLE='urn:oasis:names:tc:opendocument:xmlns:table:1.0';
const fail=message=>{throw Error('Workbook sheet metadata: '+message);};
const available=value=>({available:true,value}),unavailable=reason=>({available:false,reason});
const metadata=(ordinal,visibility)=>({ordinal,kind:'worksheet',visibility});
function readXlsxSheetMetadata(census,projected){
 if(!Array.isArray(census)||!census.length||census.length>64||!Array.isArray(projected)||census.length!==projected.length)fail('Worksheet census mismatch.');
 const names=new Set(),paths=new Set(),ids=new Set();
 return census.map((sheet,ordinal)=>{const actual=projected[ordinal];if(!sheet||typeof sheet.name!=='string'||!sheet.name||sheet.name.length>255||names.has(sheet.name.toLowerCase())||typeof sheet.path!=='string'||!sheet.path||paths.has(sheet.path)||!Number.isSafeInteger(sheet.id)||sheet.id<1||ids.has(sheet.id)||!Number.isSafeInteger(sheet.parserId)||sheet.parserId!==ordinal+1||!['visible','hidden','veryHidden'].includes(sheet.state)||!actual||actual.name!==sheet.name||actual.id!==sheet.parserId||(actual.state||'visible')!==sheet.state)fail('Worksheet identity or visibility disagrees with admitted package.');names.add(sheet.name.toLowerCase());paths.add(sheet.path);ids.add(sheet.id);return metadata(ordinal,available(sheet.state));});
}
function readLegacySheetMetadata(census,ordinal,parserVisibility){
 if(!Number.isInteger(ordinal)||ordinal<0||ordinal>=64)fail('Invalid worksheet ordinal.');
 if(census?.visibility===undefined)return metadata(ordinal,unavailable('Authoritative binary worksheet visibility is unavailable.'));
 if(![0,1,2].includes(census.visibility)||parserVisibility!==undefined&&parserVisibility!==census.visibility)fail('Binary worksheet visibility disagreement.');
 return metadata(ordinal,available(['visible','hidden','veryHidden'][census.visibility]));
}
const kids=n=>Array.from(n?.childNodes||[]).filter(x=>x.nodeType===1);
const attr=(n,ns,key)=>n.hasAttributeNS(ns,key)?n.getAttributeNS(ns,key):null;
function readOdsSheetMetadata(contentRoot,stylesRoot,tables){
 if(contentRoot?.namespaceURI!==OFFICE||contentRoot.localName!=='document-content'||stylesRoot&&(stylesRoot.namespaceURI!==OFFICE||stylesRoot.localName!=='document-styles')||!Array.isArray(tables)||tables.length>64)fail('Invalid ODS metadata roots.');
 const common=new Map(),automatic=new Map();let defaultStyle=null,count=0;
 function read(root,fromContent){for(const group of kids(root)){
  if(group.namespaceURI!==OFFICE||!['styles','automatic-styles'].includes(group.localName))continue;
  // styles.xml automatic styles are scoped to that document's master pages;
  // content.xml table styles cannot resolve through that automatic collection.
  if(!fromContent&&group.localName==='automatic-styles')continue;
  if(fromContent&&group.localName==='styles')fail('Common styles must be in styles.xml.');
  for(const node of kids(group)){if(++count>20000)fail('Style count limit exceeded.');if(node.namespaceURI!==STYLE||!['style','default-style'].includes(node.localName)||attr(node,STYLE,'family')!=='table')continue;
   if(node.localName==='default-style'){if(group.localName!=='styles'||defaultStyle)fail('Duplicate or misplaced default table style.');defaultStyle=node;continue;}
   const name=attr(node,STYLE,'name'),map=group.localName==='styles'?common:automatic;if(!name||name.length>1024||map.has(name))fail('Duplicate or invalid table style.');map.set(name,node);
  }
 }}
 read(contentRoot,true);if(stylesRoot)read(stylesRoot,false);
 function display(node){const props=kids(node).filter(n=>n.localName==='table-properties');if(props.some(n=>n.namespaceURI!==STYLE)||props.length>1)fail('Ambiguous table properties.');if(!props.length)return null;const p=props[0];if(Array.from(p.attributes||[]).some(a=>a.localName==='display'&&a.namespaceURI!==TABLE))fail('Foreign table display attribute.');const value=attr(p,TABLE,'display');if(value===null)return null;if(!['true','false','1','0'].includes(value))fail('Invalid table display value.');return available(value==='true'||value==='1'?'visible':'hidden');}
 function resolve(first){const visited=new Set();let node=first,resolved=null,conditional=false;while(node){if(visited.has(node)||visited.size>=128)fail('Cyclic or excessive table-style inheritance.');visited.add(node);if(kids(node).some(child=>child.localName==='map'))conditional=true;const value=display(node);resolved||=value;const parent=attr(node,STYLE,'parent-style-name');if(parent!==null){if(!parent||!common.has(parent))fail('Missing or automatic table-style parent.');node=common.get(parent);}else node=node===defaultStyle?null:defaultStyle;}if(conditional)return unavailable('Conditional ODS table styles are not qualified for visibility.');return resolved||unavailable('ODS table display is not specified by its style inheritance; application defaults are not inferred.');}
 return tables.map((table,ordinal)=>{if(table.namespaceURI!==TABLE||table.localName!=='table')fail('Invalid ODS sheet.');const name=attr(table,TABLE,'style-name');let style=null;if(name!==null){if(!name)fail('Empty table-style reference.');if(automatic.has(name))style=automatic.get(name);else if(common.has(name))style=common.get(name);else fail('Missing table style.');}return metadata(ordinal,resolve(style||defaultStyle));});
}
module.exports={readXlsxSheetMetadata,readLegacySheetMetadata,readOdsSheetMetadata};
