'use strict';
const POLICY='stored-story-text-v1',MAX_PARTS=10000;
const KINDS=['footnote','endnote','annotation','textbox','header-textbox','separator','header-footer'];
const HEADER_VARIANTS=['even-header','odd-header','even-footer','odd-footer','first-header','first-footer'];
const SEPARATOR_VARIANTS=['footnote-separator','footnote-continuation-separator','footnote-continuation-notice','endnote-separator','endnote-continuation-separator','endnote-continuation-notice'];
const COMMON=Object.freeze(['Formatting, page layout, images, embedded objects and generated list/reference numbering','Stored hidden and inserted text is included; supported deletion-marked text is excluded','Field instructions are excluded; stored results are included without evaluation','Stored text ranges do not reconstruct rendered page placement, comment authors or document layout']);
const MAIN_EXCLUSIONS=Object.freeze([...COMMON,'Footnotes, endnotes, comments, headers, footers and text boxes']);
const fail=()=>{throw Error('Invalid saved DOC text projection metadata.');};
const record=x=>x&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
function exact(x,keys){if(!record(x)||Reflect.ownKeys(x).length!==keys.length||keys.some(k=>!Object.hasOwn(x,k)))fail();}
function validateDocPart(p){
 const header=p?.kind==='header-footer',separator=p?.kind==='separator',keys=['kind','ordinal',...(header||separator?['section','variant','empty','inherits']:[])];exact(p,keys);
 if(!KINDS.includes(p.kind)||!Number.isInteger(p.ordinal)||p.ordinal<1||p.ordinal>MAX_PARTS)fail();
 if(header||separator){if(!Number.isInteger(p.section)||(separator?p.section!==0:p.section<1||p.section>MAX_PARTS)||!(header?HEADER_VARIANTS:SEPARATOR_VARIANTS).includes(p.variant)||typeof p.empty!=='boolean'||typeof p.inherits!=='boolean'||p.inherits!==Boolean(header&&p.empty&&p.section>1))fail();}
 return Object.fromEntries(keys.map(k=>[k,p[k]]));
}
function validateDocProjection(value){
 exact(value,['kind','version','policy','scope','nFib','relatedParts','exclusions']);
 const related=value.scope==='main-and-related-text',exclusions=related?COMMON:MAIN_EXCLUSIONS;
 if(value.kind!=='doc'||value.version!==1||value.policy!==POLICY||!['main-document','main-and-related-text'].includes(value.scope)||![0xc1,0xd9,0x101,0x10c,0x112].includes(value.nFib)||!Array.isArray(value.relatedParts)||value.relatedParts.length>MAX_PARTS||!related&&value.relatedParts.length||!Array.isArray(value.exclusions)||value.exclusions.length!==exclusions.length||!exclusions.every((x,i)=>x===value.exclusions[i]))fail();
 const counts=new Map(),order=['footnote','separator','header-footer','annotation','endnote','textbox','header-textbox'];let previous=-1;
 const relatedParts=value.relatedParts.map(p=>{const part=validateDocPart(p),rank=order.indexOf(part.kind),ordinal=(counts.get(part.kind)||0)+1;if(rank<previous||part.ordinal!==ordinal)fail();previous=rank;counts.set(part.kind,ordinal);
  if(part.kind==='separator'&&(part.ordinal>6||part.variant!==SEPARATOR_VARIANTS[part.ordinal-1]))fail();
  if(part.kind==='header-footer'&&(part.section!==Math.floor((part.ordinal-1)/6)+1||part.variant!==HEADER_VARIANTS[(part.ordinal-1)%6]))fail();
  return part;});
 if(counts.has('separator')&&(counts.get('separator')!==6||!counts.has('header-footer'))||counts.has('header-footer')&&(!counts.has('separator')||counts.get('header-footer')%6))fail();
 return {kind:'doc',version:1,policy:POLICY,scope:value.scope,nFib:value.nFib,relatedParts,exclusions:[...exclusions]};
}
module.exports={validateDocProjection,validateDocPart,POLICY,MAX_PARTS,DOC_RELATED_EXCLUSIONS:COMMON,DOC_MAIN_EXCLUSIONS:MAIN_EXCLUSIONS};
