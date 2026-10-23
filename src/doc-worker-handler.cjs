'use strict';
const {extractDocText}=require('./doc-text.cjs');
function handleDocTask(data){
 try{if(!data||data.id!==1||!(data.bytes instanceof Uint8Array)||!['main-document','main-and-related-text'].includes(data.scope))throw Error('Invalid DOC worker request.');return {id:1,ok:true,result:extractDocText(data.bytes,{scope:data.scope})};}
 catch(error){return {id:1,ok:false,code:error.code||'DOCUMENT_INVALID',message:String(error.message||'DOC extraction failed.').slice(0,2048)};}
}
module.exports={handleDocTask};
