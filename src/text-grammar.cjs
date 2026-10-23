'use strict';
const TEXT_GRAMMAR_VERSION=1;
const own=(o,keys)=>Object.keys(o).every(k=>keys.includes(k));
const object=o=>o&&typeof o==='object'&&!Array.isArray(o);
const literal=(s,max)=>typeof s==='string'&&s.length>0&&s.length<=max&&!/[\0\r\n]/.test(s);
function validateTextGrammar(input){
 if(input===undefined)return {version:1,importance:{},elements:[]};
 if(!object(input)||!own(input,['version','importance','elements'])||input.version!==1||!object(input.importance)||!own(input.importance,['lineComment','blockComment','docComment'])||!Array.isArray(input.elements)||input.elements.length>32)throw Error('Invalid text grammar configuration.');
 const importance={};for(const key of ['lineComment','blockComment','docComment'])if(Object.hasOwn(input.importance,key)){if(!['important','unimportant'].includes(input.importance[key]))throw Error('Invalid grammar importance.');importance[key]=input.importance[key];}
 const names=new Set();const elements=Array.from(input.elements,e=>{
  if(!object(e)||!literal(e.name,64)||names.has(e.name)||!['pattern','line','block'].includes(e.kind)||!['important','unimportant'].includes(e.importance))throw Error('Grammar elements require unique names, a kind, and importance.');names.add(e.name);
  const result={name:e.name,kind:e.kind,importance:e.importance};
  if(e.kind==='pattern'){
   if(!own(e,['name','kind','importance','pattern','matchCase'])||!literal(e.pattern,256)||(e.matchCase!==undefined&&typeof e.matchCase!=='boolean'))throw Error('Invalid grammar pattern.');
   try{new RegExp(e.pattern,e.matchCase===false?'iyu':'yu');}catch{throw Error('Invalid grammar regular expression.');}result.pattern=e.pattern;result.matchCase=e.matchCase!==false;
  }else{
   if(!own(e,e.kind==='line'?['name','kind','importance','start']:['name','kind','importance','start','end','escape'])||!literal(e.start,128))throw Error('Invalid grammar delimiter.');result.start=e.start;
   if(e.kind==='block'){if(!literal(e.end,128)||(e.escape!==undefined&&e.escape!==''&&!literal(e.escape,16)))throw Error('Invalid grammar block delimiter.');result.end=e.end;result.escape=e.escape||'';}
  }return result;
 });return {version:1,importance,elements};
}
function hasTextGrammar(input){const value=validateTextGrammar(input);return Object.keys(value.importance).length>0||value.elements.length>0;}
module.exports={TEXT_GRAMMAR_VERSION,validateTextGrammar,hasTextGrammar};
