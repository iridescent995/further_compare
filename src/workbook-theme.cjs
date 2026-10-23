'use strict';
// SpreadsheetML uses Excel's light/dark ordering, not DrawingML document order.
// https://github.com/SheetJS/sheetjs/issues/389
// Tint is retained as a parameter of the resolved base color: its HLS operation
// is specified by ISO 29500 §18.8.3, not an RGB channel interpolation.
// https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.foregroundcolor
const THEME_COLOR_NAMES=Object.freeze(['lt1','dk1','lt2','dk2','accent1','accent2','accent3','accent4','accent5','accent6','hlink','folHlink']);
const NS=new Set(['http://schemas.openxmlformats.org/drawingml/2006/main','http://purl.oclc.org/ooxml/drawingml/main']);
const plain=v=>v&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const rgb=v=>{if(typeof v!=='string'||! /^[a-f0-9]{6}$/i.test(v))throw Error('Invalid workbook theme RGB color.');return 'FF'+v.toUpperCase();};
const children=node=>Array.from(node.childNodes||[]).filter(child=>child.nodeType===1);
function parseWorkbookTheme(source,Parser=globalThis.DOMParser){
 if(source==null)return null;
 if(typeof source==='string'){
  if(source.length>1024*1024||/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('Unsupported or oversized workbook theme XML.');
  if(typeof Parser!=='function')throw Error('Workbook theme XML parser is unavailable.');
  source=new Parser().parseFromString(source,'application/xml');
 }
 let descriptors;
 if(source?.nodeType===9){
  if(source.doctype||source.getElementsByTagName('parsererror').length)throw Error('Invalid workbook theme XML.');
  const root=source.documentElement;if(root?.localName!=='theme'||!NS.has(root.namespaceURI))throw Error('Invalid workbook theme root.');
  const elements=children(root).filter(node=>node.localName==='themeElements'&&node.namespaceURI===root.namespaceURI);
  if(elements.length!==1)throw Error('Workbook theme elements are missing or ambiguous.');
  const schemes=children(elements[0]).filter(node=>node.localName==='clrScheme'&&node.namespaceURI===root.namespaceURI);
  if(schemes.length!==1)throw Error('Workbook theme color scheme is missing or ambiguous.');
  descriptors={};
  for(const node of children(schemes[0])){
   if(node.localName==='extLst')continue;
   if(!THEME_COLOR_NAMES.includes(node.localName)||Object.hasOwn(descriptors,node.localName)||node.namespaceURI!==root.namespaceURI)throw Error('Invalid workbook theme color scheme.');
   const values=children(node);if(values.length!==1||values[0].namespaceURI!==root.namespaceURI||children(values[0]).length)throw Error('Unsupported workbook theme color definition.');
   const value=values[0];if(value.localName==='srgbClr')descriptors[node.localName]=value.getAttribute('val');
   else if(value.localName==='sysClr')descriptors[node.localName]=value.getAttribute('lastClr');
   else throw Error('Unsupported workbook theme color type.');
  }
 }else{
  if(!plain(source)||Object.keys(source).some(key=>!THEME_COLOR_NAMES.includes(key)))throw Error('Invalid workbook theme palette.');
  descriptors=source;
 }
 return Object.freeze(THEME_COLOR_NAMES.map(name=>rgb(descriptors[name])));
}
// Theme font collections are definitions, not a prediction of installed fonts or
// script/glyph selection. Keep all supplemental mappings for semantic comparison.
// https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.supplementalfont
// https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.fontscheme
const validatedFonts=new WeakSet();
function normalizeThemeFonts(value){
 if(value==null)return null;
 if(validatedFonts.has(value))return value;
 const fail=()=>{throw Error('Invalid workbook theme font definition.');};
 const text=(v,max=1024)=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))fail();return v;};
 if(!plain(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'major')||!Object.hasOwn(value,'minor'))fail();
 const output={};
 for(const role of ['major','minor']){
  const collection=value[role];if(!plain(collection)||Object.keys(collection).length!==4||!['latin','ea','cs','scripts'].every(key=>Object.hasOwn(collection,key)))fail();
  const result={};
  for(const key of ['latin','ea','cs']){
   const font=collection[key];if(!plain(font)||!Object.hasOwn(font,'typeface')||Object.keys(font).some(k=>!['typeface','panose','pitchFamily','charset'].includes(k)))fail();
   const normalized={typeface:text(font.typeface)};
   if(Object.hasOwn(font,'panose')){if(typeof font.panose!=='string'||!/^[a-f0-9]{20}$/i.test(font.panose))fail();normalized.panose=font.panose.toUpperCase();}
   for(const [name,fallback] of [['pitchFamily',0],['charset',1]])if(Object.hasOwn(font,name)){
    const number=font[name];if(!Number.isInteger(number)||number< -128||number>127)fail();if(number!==fallback)normalized[name]=number;
   }
   result[key]=Object.freeze(normalized);
  }
  const scripts=collection.scripts;if(!plain(scripts)||Object.keys(scripts).length>256)fail();
  result.scripts={};for(const key of Object.keys(scripts).sort()){
   if(!text(key,128)||['__proto__','constructor','prototype'].includes(key))fail();result.scripts[key]=text(scripts[key]);
  }
  Object.freeze(result.scripts);output[role]=Object.freeze(result);
 }
 Object.freeze(output);validatedFonts.add(output);return output;
}
function parseWorkbookThemeFonts(source,Parser=globalThis.DOMParser){
 if(source==null)return null;
 if(typeof source==='string'){
  if(source.length>1024*1024||/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('Unsupported or oversized workbook theme XML.');
  if(typeof Parser!=='function')throw Error('Workbook theme XML parser is unavailable.');
  let invalid=false;
  source=new Parser({errorHandler:{warning(){invalid=true;},error(){invalid=true;},fatalError(){invalid=true;}}}).parseFromString(source,'application/xml');
  if(invalid)throw Error('Invalid workbook theme XML.');
 }
 if(source?.nodeType!==9)throw Error('Invalid workbook theme XML document.');
 if(source.doctype||source.getElementsByTagName('parsererror').length)throw Error('Invalid workbook theme XML.');
 const root=source.documentElement;if(root?.localName!=='theme'||!NS.has(root.namespaceURI))throw Error('Invalid workbook theme root.');
 // Bound pre-parsed documents as well as XML strings, including ignored extensions.
 let nodes=0,size=0;const stack=[[root,0]];
 while(stack.length){const [node,depth]=stack.pop();if(++nodes>20000||depth>64)throw Error('Workbook theme XML exceeds font resolution limits.');
  size+=(node.nodeValue||'').length;for(const attr of Array.from(node.attributes||[]))size+=attr.name.length+attr.value.length;
  if(size>1024*1024)throw Error('Workbook theme XML exceeds font resolution limits.');
  for(const child of Array.from(node.childNodes||[]))stack.push([child,depth+1]);
 }
 const ns=root.namespaceURI;
 const named=(parent,name)=>{
  const matches=children(parent).filter(node=>node.localName===name);
  if(matches.some(node=>node.namespaceURI!==ns)||matches.length>1)throw Error('Ambiguous workbook theme font elements.');return matches[0];
 };
 const elements=named(root,'themeElements');if(!elements)throw Error('Workbook theme elements are missing.');
 const scheme=named(elements,'fontScheme');if(!scheme)return null;
 const attrs=(node,allowed)=>{const result={};for(const attr of Array.from(node.attributes||[])){
  if(attr.namespaceURI==='http://www.w3.org/2000/xmlns/')continue;
  if(attr.namespaceURI||!allowed.includes(attr.name)||Object.hasOwn(result,attr.name))throw Error('Unsupported workbook theme font attribute.');result[attr.name]=attr.value;
 }return result;};
 attrs(scheme,['name']);
 const output={};
 for(const node of children(scheme)){
  if(node.namespaceURI!==ns)throw Error('Invalid workbook theme font namespace.');
  if(node.localName==='extLst')throw Error('Unsupported workbook theme font extensions.');
  const role={majorFont:'major',minorFont:'minor'}[node.localName];if(!role||Object.hasOwn(output,role))throw Error('Invalid or duplicate workbook theme font collection.');
  attrs(node,[]);const collection={scripts:{}};
  for(const font of children(node)){
   if(font.namespaceURI!==ns||children(font).length||Array.from(font.childNodes||[]).some(c=>[3,4].includes(c.nodeType)&&c.nodeValue.trim()))throw Error('Invalid workbook theme font element.');
   if(['latin','ea','cs'].includes(font.localName)){
    if(Object.hasOwn(collection,font.localName))throw Error('Duplicate workbook theme font.');
    const descriptor=attrs(font,['typeface','panose','pitchFamily','charset']);
    for(const key of ['pitchFamily','charset'])if(Object.hasOwn(descriptor,key)){
     if(!/^[+-]?\d+$/.test(descriptor[key].trim()))throw Error('Invalid workbook theme font number.');descriptor[key]=Number(descriptor[key]);
    }
    collection[font.localName]=descriptor;
   }else if(font.localName==='font'){
    const descriptor=attrs(font,['script','typeface']),script=descriptor.script;
    if(typeof script!=='string'||['__proto__','constructor','prototype'].includes(script)||Object.hasOwn(collection.scripts,script)||!Object.hasOwn(descriptor,'typeface'))throw Error('Invalid or duplicate workbook theme script font.');
    collection.scripts[script]=descriptor.typeface;
   }else throw Error('Unsupported workbook theme font element.');
  }
  output[role]=collection;
 }
 return normalizeThemeFonts(output);
}
function resolveWorkbookThemeStyle(style,palette,fonts){
 fonts=normalizeThemeFonts(fonts);
 if(palette!==null&&palette!==undefined&&(!Array.isArray(palette)||palette.length!==12||palette.some(v=>typeof v!=='string'||!/^FF[0-9A-F]{6}$/.test(v))))throw Error('Invalid workbook theme palette.');
 const seen=new Set();let count=0,text=0;
 function clone(value,depth=0,color=false,font=false){
  if(++count>20000||depth>32)throw Error('Workbook style exceeds theme resolution limits.');
  if(value===null||value===undefined||typeof value==='boolean')return value;
  if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Invalid workbook style number.');return value;}
  if(typeof value==='string'){text+=value.length;if(text>1024*1024)throw Error('Workbook style text exceeds theme resolution limits.');return value;}
  if(!Array.isArray(value)&&!plain(value)||seen.has(value))throw Error('Invalid or circular workbook style.');
  seen.add(value);let result;
  if(color&&plain(value)){
   const modes=['theme','argb','indexed','auto'].filter(key=>Object.hasOwn(value,key));
   if(modes.length>1)throw Error('Ambiguous workbook style color.');
   const tint=value.tint===undefined?0:value.tint;if(typeof tint!=='number'||!Number.isFinite(tint)||tint< -1||tint>1)throw Error('Invalid workbook color tint.');
   if(Object.hasOwn(value,'theme')){
    if(!Number.isInteger(value.theme)||value.theme<0||value.theme>11)throw Error('Invalid workbook theme color index.');
    if(!palette)throw Error('Workbook theme color references a missing theme.');
    if(Object.keys(value).some(key=>!['theme','tint'].includes(key)))throw Error('Unsupported workbook theme color properties.');
    result={argb:palette[value.theme],...(tint?{tint}: {})};
   }else if(Object.hasOwn(value,'argb')){
    if(typeof value.argb!=='string'||! /^[a-f0-9]{8}$/i.test(value.argb)||Object.keys(value).some(key=>!['argb','tint'].includes(key)))throw Error('Invalid workbook ARGB color.');
    result={argb:value.argb.toUpperCase(),...(tint?{tint}: {})};
   }
  }
  if(!result){result=Array.isArray(value)?[]:{};for(const key of Object.keys(value)){if(['__proto__','constructor','prototype'].includes(key))throw Error('Invalid workbook style key.');result[key]=clone(value[key],depth+1,['color','fgColor','bgColor'].includes(key),key==='font');}}
  if(font&&plain(value)&&Object.hasOwn(value,'scheme')){
   if(!['major','minor','none'].includes(value.scheme))throw Error('Invalid workbook font scheme.');
   if(value.scheme==='none')delete result.scheme;
   else if(fonts){const definition=fonts[value.scheme];delete result.scheme;result.name=definition.latin.typeface;result.themeFont=definition;}
  }
  seen.delete(value);return Object.freeze(result);
 }
 return clone(style);
}
module.exports={THEME_COLOR_NAMES,parseWorkbookTheme,parseWorkbookThemeFonts,resolveWorkbookThemeStyle};
