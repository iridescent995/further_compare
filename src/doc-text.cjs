'use strict';
const {extractDocStories}=require('./doc-text-engine.cjs');
const {validateDocProjection,validateDocPart,POLICY,MAX_PARTS,DOC_RELATED_EXCLUSIONS,DOC_MAIN_EXCLUSIONS}=require('./doc-projection.cjs');
const MAX_TEXT=8*1024*1024;
const LABELS={footnote:'Footnote',endnote:'Endnote',annotation:'Comment',textbox:'Text box','header-textbox':'Header text box',separator:'Separator','header-footer':'Header/footer'};
function extractDocText(input,{scope='main-document',signal}={}){
 if(!['main-document','main-and-related-text'].includes(scope))throw Error('Unsupported DOC text scope.');
 const result=extractDocStories(input,{signal}),related=scope==='main-and-related-text';
 if(result.policy!==POLICY||result.relatedParts.length>MAX_PARTS)throw Error('Unsupported or excessive DOC text parts.');
 const pieces=[],metadata=[],encoder=new TextEncoder(),identities=new Set(result.relatedParts.map(p=>p.kind+':'+p.ordinal));let size=0;
 function emit(text){size+=encoder.encode(text).byteLength;if(size>MAX_TEXT)throw Object.assign(Error('DOC extracted text exceeds 8 MiB.'),{code:'DOCUMENT_LIMIT'});pieces.push(text);}
 function emitReferenced(text,references){
  if(!Array.isArray(references)||references.length>MAX_PARTS)throw Error('Invalid DOC reference list.');let previous=0;
  for(const ref of references){if(!ref||Reflect.ownKeys(ref).length!==3||!['offset','kind','ordinal'].every(k=>Object.hasOwn(ref,k))||!Number.isInteger(ref.offset)||ref.offset<previous||ref.offset>text.length||!['footnote','endnote','annotation','textbox','header-textbox'].includes(ref.kind)||!identities.has(ref.kind+':'+ref.ordinal)||ref.offset>0&&ref.offset<text.length&&/[\uD800-\uDBFF]/.test(text[ref.offset-1])&&/[\uDC00-\uDFFF]/.test(text[ref.offset]))throw Error('Invalid DOC reference position.');
   emit(text.slice(previous,ref.offset));emit(`[DOC reference: ${LABELS[ref.kind]} ${ref.ordinal}]`);previous=ref.offset;
  }emit(text.slice(previous));
 }
 if(related)emitReferenced(result.stories.body,result.bodyReferences);else emit(result.stories.body);
 if(related)for(const part of result.relatedParts){
  const keys=['kind','ordinal',...(['header-footer','separator'].includes(part.kind)?['section','variant','empty','inherits']:[])];
  const saved=validateDocPart(Object.fromEntries(keys.map(k=>[k,part[k]])));metadata.push(saved);
  const label=saved.kind==='header-footer'?`Section ${saved.section} ${saved.variant}${saved.inherits?' (inherited)':saved.empty?' (empty)':''}`:saved.kind==='separator'?`${saved.variant}${saved.empty?' (empty)':''}`:`${LABELS[saved.kind]} ${saved.ordinal}`;
  emit(`\n\n[DOC ${label}]\n`);emitReferenced(part.text,part.references);
 }
 const projection=validateDocProjection({kind:'doc',version:1,policy:POLICY,scope,nFib:result.nFib,relatedParts:metadata,exclusions:[...(related?DOC_RELATED_EXCLUSIONS:DOC_MAIN_EXCLUSIONS)]});
 return {content:pieces.join(''),projection};
}
module.exports={extractDocText,MAX_DOC_TEXT_BYTES:MAX_TEXT};
