'use strict';
const {validateTextGrammar,hasTextGrammar}=require('../src/text-grammar.cjs');
const {validateWhitespaceScope}=require('../src/text-whitespace.cjs');
const {validateIgnoreBlankLines}=require('../src/text-blank-lines.cjs');
const {validateIgnoredTextPatterns}=require('../src/ignored-text-rules.cjs');
const {validateTextProfile,validateTextProfileMappings}=require('../src/text-profile.cjs');
const {ENCODINGS}=require('../src/text-codec.cjs');
const MODES = Object.freeze(['content', 'text-content', 'text-whitespace', 'text-case', 'text-whitespace-case', 'size', 'modified', 'size-modified']);
function validateFolderRules(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).some(key => !['textGrammar', 'textProfileMappings', 'textProfile', 'mode', 'timeToleranceMs', 'textEncoding', 'textEncodingA', 'textEncodingB', 'textWhitespaceScope', 'ignoreBlankLines', 'ignoredTextPatterns', 'comparePermissions', 'compareOwner', 'compareGroup', 'compareFilename', 'ignoreDaylightSaving', 'ignoreTimezone'].includes(key))) {
    throw new Error('Invalid folder comparison rules.');
  }
  const mode = value.mode === undefined ? 'content' : value.mode;
  const timeToleranceMs = value.timeToleranceMs === undefined ? 0 : value.timeToleranceMs;
  if (!MODES.includes(mode) || !Number.isSafeInteger(timeToleranceMs) || timeToleranceMs < 0 || timeToleranceMs > 86400000) {
    throw new Error('Invalid folder comparison rules: choose a comparison mode and a timestamp tolerance from 0 to 86400000 milliseconds.');
  }
  const textEncoding=value.textEncoding===undefined?'auto':value.textEncoding;
  if(textEncoding!=='auto'&&!ENCODINGS.includes(textEncoding))throw new Error('Invalid folder text encoding.');
  const textWhitespaceScope=validateWhitespaceScope(value.textWhitespaceScope??'horizontal');
  if(value.textWhitespaceScope===null)throw Error('Invalid whitespace comparison scope.');
  const ignoreBlankLines=validateIgnoreBlankLines(value.ignoreBlankLines);
  const textGrammar=validateTextGrammar(value.textGrammar);
  const textProfile=validateTextProfile(value.textProfile);
  const textProfileMappings=validateTextProfileMappings(value.textProfileMappings);
  const ignoredTextPatterns=validateIgnoredTextPatterns(value.ignoredTextPatterns);
  const overrides={};
  for(const key of ['textEncodingA','textEncodingB'])if(value[key]!==undefined){
    if(value[key]!=='auto'&&!ENCODINGS.includes(value[key]))throw new Error('Invalid folder text encoding.');
    overrides[key]=value[key];
  }
  const metadata={};
  for(const key of ['comparePermissions','compareOwner','compareGroup','compareFilename']) {
    if(value[key]!==undefined&&typeof value[key]!=='boolean')throw Error('Folder metadata comparison options must be boolean.');
    if(value[key])metadata[key]=true;
  }
  const timestampExceptions={};
  for(const key of ['ignoreDaylightSaving','ignoreTimezone']) {
    if(value[key]!==undefined&&typeof value[key]!=='boolean')throw Error('Folder timestamp exceptions must be boolean.');
    if(value[key])timestampExceptions[key]=true;
  }
  return {mode, timeToleranceMs,...(hasTextGrammar(textGrammar)?{textGrammar}:{}),...(textProfile==='plain'?{}:{textProfile}),...(textProfileMappings.length?{textProfileMappings}:{}),...(ignoredTextPatterns.length?{ignoredTextPatterns}:{}),...(ignoreBlankLines?{ignoreBlankLines:true}:{}),...(textWhitespaceScope==='horizontal'?{}:{textWhitespaceScope}),...timestampExceptions,...metadata,...(textEncoding==='auto'?{}:{textEncoding}),...overrides};
}
function effectiveFolderEncoding(rules,side){
  if(!['a','b'].includes(side))throw Error('Invalid folder side.');
  return rules?.[side==='a'?'textEncodingA':'textEncodingB']??rules?.textEncoding??'auto';
}
// Read requests retain legacy shared strings and accept a fully resolved pair.
function validateFolderTextEncodings(value='auto'){
  if(typeof value==='string'){validateFolderRules({textEncoding:value});return {a:value,b:value};}
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).length!==2||!Object.hasOwn(value,'a')||!Object.hasOwn(value,'b'))throw Error('Invalid folder text encodings.');
  for(const side of ['a','b'])if(typeof value[side]!=='string')throw Error('Invalid folder text encoding.');
  validateFolderRules({textEncodingA:value.a,textEncodingB:value.b});
  return {a:value.a,b:value.b};
}
module.exports = {validateFolderRules, effectiveFolderEncoding, validateFolderTextEncodings, MODES};
