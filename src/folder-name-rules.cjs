'use strict';
// Portable policy shared by sessions, the tree model and browser controls.
function validateFolderNameRules(value={}) {
  if(!value || ![Object.prototype,null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).some(key=>!['ignoreCase','normalizeUnicode','ignoreExtension'].includes(key))) throw Error('Invalid folder filename matching rules.');
  const result={};
  for(const key of ['ignoreCase','normalizeUnicode','ignoreExtension']) {
    if(!Object.hasOwn(value,key))continue;
    if(typeof value[key]!=='boolean')throw Error('Invalid folder filename matching rule.');
    if(value[key])result[key]=true;
  }
  return Object.freeze(result);
}
module.exports={validateFolderNameRules};
