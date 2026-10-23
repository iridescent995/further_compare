'use strict';
// Read-only main-story projection, never a Word layout renderer or package writer.
// https://learn.microsoft.com/en-us/office/open-xml/word/how-to-open-and-add-text-to-a-word-processing-document
const {parseArchive}=require('./archive-core.cjs');
const MAX_XML=8*1024*1024,MAX_CONTENT=8*1024*1024,MAX_NODES=200000,MAX_PARAGRAPHS=100000;
const WORD=new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main']);
const REL='http://schemas.openxmlformats.org/package/2006/relationships',CT='http://schemas.openxmlformats.org/package/2006/content-types';
const OFFICE=new Set(['http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument','http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument']);
const MAIN_TYPE='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const EXCLUSIONS=Object.freeze(['Formatting, styles, numbering labels and page layout','Headers, footers, footnotes, endnotes and comments','Images, drawings, text boxes, equations and embedded objects','Deleted and moved-from revisions; inserted and moved-to text is included','Field instructions; stored field results are included without recalculation','External resources, linked content, macros and unsupported alternate content']);
const RELATED_EXCLUSIONS=Object.freeze([EXCLUSIONS[0],'Comments and unreferenced related stories; header/footer variants are logical references, not rendered pages',...EXCLUSIONS.slice(2)]);
const RELATED_KINDS=['header','footer','footnote','endnote'];
const fail=message=>{throw Error('DOCX text extraction: '+message);};
const children=node=>Array.from(node.childNodes||[]).filter(child=>child.nodeType===1);
// Canonical archive names are decoded exactly once at the URI boundary.
// Saved provenance contains the literal ZIP name: '%' there is ordinary text.
function canonicalPartPath(value){
 if(typeof value!=='string'||!value||value.length>32768||/[\\\x00-\x1f\x7f]/.test(value)||value.startsWith('/')||/^[A-Za-z]:/.test(value)||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)||value.split('/').some(part=>!part||part==='.'||part==='..'))fail('Unsafe canonical package part path.');
 return value;
}
function partPath(value){
 if(typeof value!=='string'||!value||value.length>32768||/[\\\x00-\x20\x7f?#]/.test(value)||/^[a-z][a-z0-9+.-]*:/i.test(value)||/%(?:2f|5c)/i.test(value))fail('Unsafe package part path.');
 let decoded;try{decoded=decodeURIComponent(value);}catch{fail('Invalid package part encoding.');}
 return canonicalPartPath(decoded.replace(/^\//,''));
}
function validateDocumentProjection(value){
 const related=value?.version===2,exclusions=related?RELATED_EXCLUSIONS:EXCLUSIONS,keys=['kind','version','scope','mainPart','paragraphs','tables','exclusions',...(related?['relatedParts']:[])];
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))||value.kind!=='docx'||value.version!==(related?2:1)||value.scope!==(related?'main-and-related-text':'main-document')||typeof value.mainPart!=='string'||canonicalPartPath(value.mainPart)!==value.mainPart||!Number.isInteger(value.paragraphs)||value.paragraphs<0||value.paragraphs>MAX_PARAGRAPHS||!Number.isInteger(value.tables)||value.tables<0||value.tables>MAX_NODES||!Array.isArray(value.exclusions)||value.exclusions.length!==exclusions.length||!exclusions.every((item,index)=>value.exclusions[index]===item))fail('Invalid saved document projection metadata.');
 const parts=[];if(related){if(!Array.isArray(value.relatedParts)||value.relatedParts.length>4096)fail('Invalid related document parts.');const seen=new Set();for(const item of value.relatedParts){if(!item||![Object.prototype,null].includes(Object.getPrototypeOf(item))||Reflect.ownKeys(item).length!==2||!Object.hasOwn(item,'kind')||!Object.hasOwn(item,'part')||!RELATED_KINDS.includes(item.kind)||canonicalPartPath(item.part)!==item.part||item.part===value.mainPart||seen.has(item.part))fail('Invalid related document part.');seen.add(item.part);parts.push({kind:item.kind,part:item.part});}}
 return {kind:'docx',version:related?2:1,scope:value.scope,mainPart:value.mainPart,paragraphs:value.paragraphs,tables:value.tables,...(related?{relatedParts:parts}:{}),exclusions:[...exclusions]};
}
function parseXML(bytes,name,Parser,limit=MAX_XML,nodeLimit=MAX_NODES){
 if(bytes.length>limit)fail('XML part exceeds the size limit: '+name);
 let encoding='utf-8';if(bytes[0]===255&&bytes[1]===254||bytes[0]===60&&bytes[1]===0)encoding='utf-16le';if(bytes[0]===254&&bytes[1]===255||bytes[0]===0&&bytes[1]===60)encoding='utf-16be';
 let text;try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{fail('Invalid XML encoding: '+name);}
 if(/<!DOCTYPE|<!ENTITY/i.test(text)||/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/u.test(text))fail('Unsafe XML declarations or characters: '+name);
 for(const reference of text.matchAll(/&#(x[0-9a-f]+|[0-9]+);/gi)){const code=reference[1][0].toLowerCase()==='x'?parseInt(reference[1].slice(1),16):Number(reference[1]);if(!Number.isSafeInteger(code)||!(code===9||code===10||code===13||code>=32&&code<=0xd7ff||code>=0xe000&&code<=0xfffd||code>=0x10000&&code<=0x10ffff))fail('Invalid XML character reference.');}
 const declaration=/^\s*<\?xml\s[^?]*encoding\s*=\s*['"]([^'"]+)['"]/i.exec(text)?.[1]?.toLowerCase();
 if(declaration&&!['utf-8','utf-16','utf-16le','utf-16be'].includes(declaration)||declaration&&declaration!=='utf-16'&&declaration!==encoding)fail('Unsupported or inconsistent XML encoding: '+name);
 // Bound nesting before constructing a DOM, including parsers that recover
 // from malformed input. The native parser remains the well-formedness check.
 let depth=0,tokens=0;for(const token of text.matchAll(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[A-Za-z_][^<>"']*(?:(?:"[^"]*"|'[^']*')[^<>"']*)*>/g)){
  const tag=token[0];if(tag.startsWith('<!')||tag.startsWith('<?'))continue;if(++tokens>nodeLimit)fail('XML contains too many nodes.');if(tag.startsWith('</'))depth--;else if(!tag.endsWith('/>'))depth++;if(depth>128)fail('XML nesting exceeds 128 levels.');
 }
 let document;try{document=new Parser({errorHandler:{warning:()=>fail('Malformed XML: '+name),error:()=>fail('Malformed XML: '+name),fatalError:()=>fail('Malformed XML: '+name)}}).parseFromString(text,'application/xml');}catch{fail('Malformed XML: '+name);}
 if(!document?.documentElement||document.getElementsByTagName('parsererror').length)fail('Malformed XML: '+name);
 let count=0;const stack=[[document,0]];while(stack.length){const [node,level]=stack.pop();if(++count>nodeLimit||level>128)fail('XML node or nesting limit exceeded.');if(node.nodeType===10||node.nodeType===7&&node.target!=='xml')fail('Unsupported XML processing instruction.');for(let child=node.lastChild;child;child=child.previousSibling)stack.push([child,level+1]);}
 return document.documentElement;
}
async function extractDocxText(input,{DOMParser:Parser=globalThis.DOMParser,scope='main-document'}={}){
 if(!['main-document','main-and-related-text'].includes(scope))fail('Invalid DOCX text scope.');const related=scope==='main-and-related-text';
 if(typeof Parser!=='function')fail('XML parser is unavailable.');
 if(!(input instanceof Uint8Array)||input.length>32*1024*1024)fail('Document input must be bytes.');
 // Own the asynchronous read input so callers cannot change a compressed part
 // after its central directory has been checked.
 const bytes=new Uint8Array(input);if(bytes[0]!==80||bytes[1]!==75||bytes[2]!==3||bytes[3]!==4)fail('Choose an unencrypted DOCX ZIP package.');
 const archive=parseArchive(bytes);
 let xmlBytes=0,xmlNodes=0;const parsedParts=new Map();
 const readXML=async(name,limit)=>{const entry=archive.entries.get(name);if(!entry||entry.kind!=='file')fail('Missing required package part: '+name);if(entry.size>(limit||MAX_XML))fail('XML part exceeds the size limit: '+name);if(related&&parsedParts.has(name))return parsedParts.get(name);if(related&&(xmlBytes+=entry.size)>MAX_XML)fail('Related XML parts exceed the aggregate 8 MiB limit.');const root=parseXML(await archive.read(name),name,Parser,limit,related?MAX_NODES-xmlNodes:MAX_NODES);if(related){const stack=[root];while(stack.length){const node=stack.pop();if(++xmlNodes>MAX_NODES)fail('Related XML parts exceed the aggregate node limit.');for(let c=node.lastChild;c;c=c.previousSibling)stack.push(c);}parsedParts.set(name,root);}return root;};
 const types=await readXML('[Content_Types].xml',1024*1024),relationships=await readXML('_rels/.rels',1024*1024);
 if(types.namespaceURI!==CT||types.localName!=='Types'||relationships.namespaceURI!==REL||relationships.localName!=='Relationships')fail('Invalid package content types or relationships.');
 const overrides=new Map(),defaults=new Map();
 for(const node of children(types)){
  if(node.namespaceURI!==CT||!['Default','Override'].includes(node.localName))fail('Invalid content type entry.');
  const type=node.getAttribute('ContentType');if(!type)fail('Missing content type.');
  const key=node.localName==='Override'?partPath(node.getAttribute('PartName')):node.getAttribute('Extension').toLowerCase(),map=node.localName==='Override'?overrides:defaults;
  if(!key||map.has(key))fail('Duplicate or invalid content type entry.');map.set(key,type);
 }
 const ids=new Set(),main=[];
 for(const node of children(relationships)){
  if(node.namespaceURI!==REL||node.localName!=='Relationship')fail('Invalid root relationship.');
  const id=node.getAttribute('Id');if(!id||ids.has(id))fail('Duplicate or missing relationship identifier.');ids.add(id);
  if(OFFICE.has(node.getAttribute('Type'))){if(node.hasAttribute('TargetMode')&&node.getAttribute('TargetMode')!=='Internal')fail('Main document must be an internal package part.');main.push(partPath(node.getAttribute('Target')));}
 }
 if(main.length!==1)fail('Package must contain exactly one main office document relationship.');
 const mainPart=main[0],type=overrides.get(mainPart)||defaults.get(mainPart.split('.').at(-1).toLowerCase());if(type!==MAIN_TYPE)fail('Package is not a DOCX word-processing document.');
 const document=await readXML(mainPart);if(!WORD.has(document.namespaceURI)||document.localName!=='document')fail('Invalid Word document root.');
 const namespace=document.namespaceURI,bodies=children(document).filter(node=>node.namespaceURI===namespace&&node.localName==='body');if(bodies.length!==1)fail('Document must contain exactly one body.');
 let paragraphs=0,tables=0,length=0,mainStory=true,storyVisits=0;const noteRefs={footnote:new Map(),endnote:new Map()};
 const noteId=node=>{const raw=node.getAttributeNS(namespace,'id');if(!/^[+-]?\d{1,10}$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)<-2147483648||Number(raw)>2147483647)fail('Invalid note identifier.');return String(Number(raw));};
 const add=text=>{length+=text.length;if(length>MAX_CONTENT)fail('Extracted text exceeds 8 MiB.');return text;};
 const wrappers=new Set(['sdt','sdtContent','ins','moveTo','customXml','smartTag','hyperlink','fldSimple']);
 function inline(node){
  if(related&&++storyVisits>MAX_NODES)fail('Related story traversal exceeds the aggregate node limit.');
  if(node.namespaceURI!==namespace)return '';
  const name=node.localName;
  if(related&&['footnoteReference','endnoteReference'].includes(name)){if(!mainStory)fail('Notes referenced outside the main story are unsupported.');const kind=name==='footnoteReference'?'footnote':'endnote',id=noteId(node),map=noteRefs[kind];if(!map.has(id)){if(map.size>=10000)fail('Too many note references.');map.set(id,map.size+1);}return add('['+(kind==='footnote'?'Footnote':'Endnote')+' '+map.get(id)+']');}
  if(name==='t'){if(children(node).length)fail('Invalid nested text element.');return add(node.textContent||'');}
  if(name==='tab')return add('\t');if(name==='br'||name==='cr')return add('\n');if(name==='noBreakHyphen')return add('\u2011');if(name==='softHyphen')return add('\u00ad');
  if(name==='r'||wrappers.has(name))return children(node).map(inline).join('');return '';
 }
 function structuralChildren(node,name){const items=children(node);if(related&&(storyVisits+=items.length)>MAX_NODES)fail('Related story traversal exceeds the aggregate node limit.');return items.flatMap(child=>child.namespaceURI!==namespace?[]:child.localName===name?[child]:wrappers.has(child.localName)?structuralChildren(child,name):[]);}
 function blocks(node){
  if(related&&++storyVisits>MAX_NODES)fail('Related story traversal exceeds the aggregate node limit.');
  if(node.namespaceURI!==namespace)return '';
  if(node.localName==='p'){if(++paragraphs>MAX_PARAGRAPHS)fail('Document has too many paragraphs.');return children(node).map(inline).join('')+add('\n');}
  if(node.localName==='tbl'){
   tables++;let result='';for(const row of structuralChildren(node,'tr')){
    const cells=structuralChildren(row,'tc');
    const values=cells.map(cell=>children(cell).map(blocks).join('').replace(/\n$/,''));add('\t'.repeat(Math.max(0,cells.length-1)));result+=values.join('\t')+add('\n');
   }return result;
  }
  if(node.localName==='body'||wrappers.has(node.localName))return children(node).map(blocks).join('');return '';
 }
 let content=blocks(bodies[0]);
 const relatedParts=[];
 if(related){
  mainStory=false;
  // References are logical story links, not pagination. Word's default variant
  // inherits the previous default (MS-OI29500 2.1.298); first/even activation is
  // deliberately not asserted by this referenced-variant projection.
  // https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/5de15e59-3ec1-4f80-aa4d-00bdd447b86f
  const slash=mainPart.lastIndexOf('/'),base=slash<0?'':mainPart.slice(0,slash+1),relsPart=base+'_rels/'+mainPart.slice(slash+1)+'.rels',relations=new Map();
  const relationKind=type=>{for(const prefix of ['http://schemas.openxmlformats.org/officeDocument/2006/relationships/','http://purl.oclc.org/ooxml/officeDocument/relationships/'])if(type.startsWith(prefix))return type.slice(prefix.length);return null;};
  if(archive.entries.has(relsPart)){const root=await readXML(relsPart,1024*1024);if(root.namespaceURI!==REL||root.localName!=='Relationships')fail('Invalid main document relationships.');for(const node of children(root)){if(node.namespaceURI!==REL||node.localName!=='Relationship')fail('Invalid document relationship.');const id=node.getAttribute('Id');if(!id||id.length>1024||relations.has(id)||relations.size>=10000)fail('Duplicate, missing or excessive document relationships.');relations.set(id,{kind:relationKind(node.getAttribute('Type')),target:node.getAttribute('Target'),mode:node.hasAttribute('TargetMode')?node.getAttribute('TargetMode'):'Internal'});}}
  function resolveTarget(target){if(typeof target!=='string'||!target||target.length>32768||/[\\\x00-\x20\x7f?#]/.test(target)||/^[a-z][a-z0-9+.-]*:/i.test(target)||/%(?:2f|5c)/i.test(target))fail('Unsafe related part target.');let decoded;try{decoded=decodeURIComponent(target);}catch{fail('Invalid related part encoding.');}const parts=decoded.startsWith('/')?[]:base.split('/').filter(Boolean);for(const part of decoded.replace(/^\//,'').split('/')){if(part==='..'){if(!parts.length)fail('Related target escapes package.');parts.pop();}else if(part==='.')continue;else{if(!part)fail('Invalid related target.');parts.push(part);}}return canonicalPartPath(parts.join('/'));}
  const loaded=new Map();
  async function loadRelated(relation,kind){if(!relation||relation.kind!==(kind==='footnote'?'footnotes':kind==='endnote'?'endnotes':kind)||relation.mode!=='Internal')fail('Missing, external or incorrectly typed related relationship.');const part=resolveTarget(relation.target),expected='application/vnd.openxmlformats-officedocument.wordprocessingml.'+(kind==='footnote'?'footnotes':kind==='endnote'?'endnotes':kind)+'+xml',contentType=overrides.get(part)||defaults.get(part.split('.').at(-1).toLowerCase());if(contentType!==expected)fail('Incorrect related part content type.');if(loaded.has(part)){if(loaded.get(part).kind!==kind)fail('Conflicting related part roles.');return loaded.get(part).root;}if(loaded.size>=4096)fail('Too many related parts.');const root=await readXML(part),expectedRoot=kind==='header'?'hdr':kind==='footer'?'ftr':kind==='footnote'?'footnotes':'endnotes';if(root.namespaceURI!==namespace||root.localName!==expectedRoot)fail('Invalid related document root.');loaded.set(part,{kind,root});relatedParts.push({kind,part});return root;}
  // Non-normal separator records cannot be referenced as notes (ISO/IEC 29500).
  // https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.footnoteendnotetype.type
  for(const kind of ['footnote','endnote'])if(noteRefs[kind].size){const matches=[...relations.values()].filter(r=>r.kind===kind+'s');if(matches.length!==1)fail('Expected one related notes part.');const root=await loadRelated(matches[0],kind),definitions=new Map();for(const note of children(root)){if(note.namespaceURI!==namespace||note.localName!==kind)fail('Invalid note definition.');const id=noteId(note);if(definitions.has(id))fail('Duplicate note definition.');definitions.set(id,note);}for(const [id,ordinal]of noteRefs[kind]){const note=definitions.get(id),type=note?.hasAttributeNS(namespace,'type')?note.getAttributeNS(namespace,'type'):'normal';if(!note||type!=='normal')fail('Dangling reference or reference to a separator note.');content+=add('\n['+(kind==='footnote'?'Footnote':'Endnote')+' '+ordinal+']\n')+children(note).map(blocks).join('');}}
  const sections=[];function collectSections(node){if(node.namespaceURI!==namespace)return;if(node.localName==='sectPr'){sections.push(node);if(sections.length>1000)fail('Too many document sections.');return;}if(['body','p','pPr'].includes(node.localName)||wrappers.has(node.localName))for(const child of children(node))collectSections(child);}collectSections(bodies[0]);
  const inherited=new Map();for(let i=0;i<sections.length;i++){const explicit=new Set();for(const ref of children(sections[i]))if(ref.namespaceURI===namespace&&['headerReference','footerReference'].includes(ref.localName)){const kind=ref.localName==='headerReference'?'header':'footer',variant=ref.getAttributeNS(namespace,'type');if(!['first','even','default'].includes(variant)||explicit.has(kind+':'+variant))fail('Duplicate or invalid section reference variant.');explicit.add(kind+':'+variant);const relationshipNamespaces=['http://schemas.openxmlformats.org/officeDocument/2006/relationships','http://purl.oclc.org/ooxml/officeDocument/relationships'],ids=relationshipNamespaces.filter(ns=>ref.hasAttributeNS(ns,'id')).map(ns=>ref.getAttributeNS(ns,'id'));if(ids.length!==1)fail('Invalid section relationship identifier.');const relation=relations.get(ids[0]);await loadRelated(relation,kind);inherited.set(kind+':'+variant,relation);}
   for(const kind of ['header','footer'])for(const variant of ['first','even','default']){const relation=inherited.get(kind+':'+variant);if(!relation)continue;const root=await loadRelated(relation,kind);content+=add('\n[Section '+(i+1)+' '+kind+' '+variant+' — referenced variant]\n')+children(root).map(blocks).join('');}
  }
 }
 if(new TextEncoder().encode(content).length>MAX_CONTENT)fail('Extracted text exceeds 8 MiB.');
 return {content,projection:validateDocumentProjection({kind:'docx',version:related?2:1,scope,mainPart,paragraphs,tables,...(related?{relatedParts}:{}),exclusions:[...(related?RELATED_EXCLUSIONS:EXCLUSIONS)]})};
}
module.exports={extractDocxText,validateDocumentProjection,MAX_DOCX_XML_BYTES:MAX_XML,MAX_DOCX_TEXT_BYTES:MAX_CONTENT};
