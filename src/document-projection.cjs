'use strict';
const {validateDocProjection}=require('./doc-projection.cjs');
const {validateDocumentProjection:validateDocx}=require('./docx-text.cjs');
const {validateRtfProjection}=require('./rtf-text.cjs');
const {validateOdtProjection}=require('./odt-text.cjs');
const PDF_EXCLUSIONS=Object.freeze(['Page layout, fonts, colors and graphics','Images and scanned text without an existing text layer (no OCR)','Annotations, attachments, forms and scripts','Reading order follows extracted page text; columns may differ from visual order']);
const PDF_PAGE_ROWS_EXCLUSIONS=Object.freeze([...PDF_EXCLUSIONS.slice(0,3),'Text ordered by geometric page rows; columns, tables, rotated text and logical reading order may differ from visual order']);
const PDF_PAGE_COLUMNS_EXCLUSIONS=Object.freeze([...PDF_EXCLUSIONS.slice(0,3),'Text ordered by geometric columns and spanning rows; tables, rotated text and logical reading order may differ from visual order']);
const PDF_TAGGED_EXCLUSIONS=Object.freeze([
 'Page layout, fonts, colors and graphics',
 'Images and scanned text without an existing text layer (no OCR)',
 'Annotations, attachments, forms and scripts',
 'Page-local structure order of extracted text; paragraph-edge whitespace normalized',
 'Artifacts preserved in a labelled per-page tail in original drawing order',
 'Accessibility replacement text, empty structural cells, cell spans and original layout are not reconstructed'
]);
function validateDocumentProjection(value){
 if(value?.kind==='docx')return validateDocx(value);
 if(value?.kind==='rtf')return validateRtfProjection(value);
 if(value?.kind==='doc')return validateDocProjection(value);
 if(value?.kind==='odt')return validateOdtProjection(value);
 const tagged=value?.version===4,columns=value?.version===3,geometric=value?.version===2||columns||tagged,order=tagged?'tagged-structure':columns?'page-columns':'page-rows',exclusions=tagged?PDF_TAGGED_EXCLUSIONS:columns?PDF_PAGE_COLUMNS_EXCLUSIONS:geometric?PDF_PAGE_ROWS_EXCLUSIONS:PDF_EXCLUSIONS;
 const keys=['kind','version','engine','engineVersion','scope','pages','emptyPages','exclusions',...(geometric?['order','orderVersion']:[])];
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))||value.kind!=='pdf'||(!geometric&&value.version!==1)||geometric&&(value.order!==order||value.orderVersion!==1)||value.engine!=='pdfjs'||value.engineVersion!=='6.2.108'||value.scope!=='page-text'||!Number.isInteger(value.pages)||value.pages<1||value.pages>1000||!Number.isInteger(value.emptyPages)||value.emptyPages<0||value.emptyPages>=value.pages||!Array.isArray(value.exclusions)||value.exclusions.length!==exclusions.length||!exclusions.every((v,i)=>value.exclusions[i]===v))throw Error('Invalid saved document projection metadata.');
 return {kind:'pdf',version:tagged?4:columns?3:geometric?2:1,...(geometric?{order,orderVersion:1}:{}),engine:'pdfjs',engineVersion:'6.2.108',scope:'page-text',pages:value.pages,emptyPages:value.emptyPages,exclusions:[...exclusions]};
}
module.exports={validateDocumentProjection,PDF_EXCLUSIONS,PDF_PAGE_ROWS_EXCLUSIONS,PDF_PAGE_COLUMNS_EXCLUSIONS,PDF_TAGGED_EXCLUSIONS};
