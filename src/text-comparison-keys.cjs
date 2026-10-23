"use strict";
// Run preparation in a bounded worker whenever user regular expressions apply.
const {prepareTextProfileDetailed,validateTextProfile}=require('./text-profile.cjs');
const {hasTextGrammar}=require('./text-grammar.cjs');
const {normalizeIgnoredText}=require('./ignored-text-normalize.cjs');
const {normalizeWhitespace}=require('./text-whitespace.cjs');
const {blankLineMask,blankLineComparisonKey}=require('./text-blank-lines.cjs');
function prepareComparisonKeys(texts,patterns=[],profile='plain',grammar){
 profile=validateTextProfile(profile);
 if(profile==='auto')throw Error('Resolve the automatic text profile from filenames before preparing text.');
 const prepared=texts.map(text=>prepareTextProfileDetailed(text,profile,grammar));
 const normalized=normalizeIgnoredText(prepared.map(item=>item.keys.join('\n')),patterns);
 return prepared.map((item,index)=>({... (item.fallback?{fallback:item.fallback}:{}),keys:item.keys.length===1&&item.keys[0]===''?['']:normalized[index],...(profile==='plain'&&!hasTextGrammar(grammar)?{}:{omit:item.omit})}));
}
function comparisonPair(prepared){return {a:prepared[0].keys,b:prepared[1].keys,...(prepared[0].omit?{omitA:prepared[0].omit,omitB:prepared[1].omit}:{})};}
function folderComparisonKey(text,rules,prepared){
 const normalize=line=>{if(['text-whitespace','text-whitespace-case'].includes(rules.mode))line=normalizeWhitespace(line,rules.textWhitespaceScope??'horizontal');return ['text-case','text-whitespace-case'].includes(rules.mode)?line.toLowerCase():line;};
 const lines=text===''?[]:text.split('\n'),keys=prepared?.keys??lines;
 if(prepared?.omit){const terminal=text.endsWith('\n')?lines.length-1:-1,blank=rules.ignoreBlankLines?blankLineMask(lines):[];return JSON.stringify(lines.flatMap((_,i)=>i!==terminal&&(blank[i]||prepared.omit[i])?[]:[i===terminal?['eof']:['line',normalize(keys[i])]]));}
 return rules.ignoreBlankLines?blankLineComparisonKey(text,(_,i)=>normalize(keys[i])):prepared?JSON.stringify(keys.map(normalize)):text.split('\n').map(normalize).join('\n');
}
module.exports={prepareComparisonKeys,comparisonPair,folderComparisonKey};
