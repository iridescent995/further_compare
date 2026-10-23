'use strict';
const WHITESPACE_SCOPES=Object.freeze(['all','horizontal','leading','trailing','edges','embedded','leading-embedded','trailing-embedded']);
function validateWhitespaceScope(scope,defaultScope='all'){
 if(scope===undefined)scope=defaultScope;
 if(!WHITESPACE_SCOPES.includes(scope))throw Error('Invalid whitespace comparison scope.');
 return scope;
}
function normalizeWhitespace(text,scope='all'){
 validateWhitespaceScope(scope);
 if(typeof text!=='string')throw Error('Whitespace comparison requires text.');
 if(scope==='all')return text.replace(/\s/g,'');
 if(scope==='horizontal')return text.replace(/[ \t]/g,'');
 // Keep physical line endings and orphan lines; only comparison keys change.
 return text.replace(/[^\r\n]+/g,line=>{
  return line.replace(/[ \t]+/g,(run,offset)=>{
   const leading=offset===0,trailing=offset+run.length===line.length;
   const removeLeading=['leading','edges','leading-embedded'].includes(scope),removeTrailing=['trailing','edges','trailing-embedded'].includes(scope),removeEmbedded=['embedded','leading-embedded','trailing-embedded'].includes(scope);
   return leading&&removeLeading||trailing&&removeTrailing||!leading&&!trailing&&removeEmbedded?'':run;
  });
 });
}
module.exports={WHITESPACE_SCOPES,validateWhitespaceScope,normalizeWhitespace};
