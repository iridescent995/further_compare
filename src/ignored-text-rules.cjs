'use strict';
function validateIgnoredTextPatterns(value=[]){
 if(!Array.isArray(value)||value.length>16)throw Error('Use at most 16 ignored-text patterns.');
 return Object.freeze(Array.from(value,item=>{
  if(!item||typeof item!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(item))||Reflect.ownKeys(item).some(key=>!['pattern','matchCase'].includes(key))||typeof item.pattern!=='string'||!item.pattern.length||item.pattern.length>256)throw Error('Each ignored-text pattern must contain 1 to 256 characters.');
  if(item.matchCase!==undefined&&typeof item.matchCase!=='boolean')throw Error('Ignored-text case matching must be boolean.');
  return Object.freeze({pattern:item.pattern,matchCase:item.matchCase!==false});
 }));
}
module.exports={validateIgnoredTextPatterns};
