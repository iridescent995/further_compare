'use strict';
// Expression identity only: no evaluation or conversion to another formula language.
// ODF 1.3 Part 4 §5: quoted text, names and reference syntax are significant.
const OPENFORMULA='urn:oasis:names:tc:opendocument:xmlns:of:1.2';
function describeOdsFormula(formula,{repeated=false}={}) {
 if(!formula)return null;
 const {expression,namespace}=formula;
 if(typeof expression!=='string'||!expression||expression.length>8192||typeof namespace!=='string'||!namespace||namespace.length>8192)throw Error('ODS input: Invalid formula identity.');
 const prefix=/^([A-Za-z_][\w.-]*):/.exec(expression);
 const qualified=prefix?expression.slice(prefix[0].length):expression;
 const body=qualified.startsWith('=')?qualified.slice(1):qualified;
 // Do not claim identity for malformed/empty expressions or repeated references.
 // Repeated ODF cells can require relative-reference interpretation at each address.
 const reason=repeated?'repeated-formula':!qualified.startsWith('=')||!body||body.startsWith('=')?'unsupported-expression':null;
 return {display:body&&!body.startsWith('=')?body:'[unsupported expression] '+expression,
  identity:reason?null:JSON.stringify({dialect:namespace,expression:body}),
  status:reason?{supported:false,reason}:{supported:true,mode:'exact-expression',dialect:namespace===OPENFORMULA?'openformula':'other'}};
}
module.exports={describeOdsFormula,OPENFORMULA};
