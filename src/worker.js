import {annotateMovedBlocks} from './text-moved-blocks.cjs';
import {validateTextGrammar,TEXT_GRAMMAR_VERSION} from './text-grammar.cjs';
import {classifyTextProfile,resolveTextProfile,validateTextProfileMappings,TEXT_PROFILE_RULES_VERSION} from './text-profile.cjs';
import {prepareComparisonKeys,comparisonPair} from './text-comparison-keys.cjs';
import engine from './diff.cjs';
import {alignSyntaxRows} from './syntax-line-alignment.cjs';
import {normalizeIgnoredText} from './ignored-text-normalize.cjs';
onmessage=({data})=>{try{
 if(data.action==='validate-patterns'){normalizeIgnoredText(data.texts||['',''],data.ignoredTextPatterns);postMessage({id:data.id,valid:true});return;}
 const textProfileMappings=validateTextProfileMappings(data.textProfileMappings);
 const resolvedTextProfile=resolveTextProfile(data.textProfile,data.names,textProfileMappings);
 const textGrammar=validateTextGrammar(data.textGrammar);
 if(data.action==='grammar-preview'){
  if(!Array.isArray(data.texts)||data.texts.length!==2||data.texts.some(text=>typeof text!=='string'||text.length>16384))throw Error('Grammar preview supports two samples up to 16,384 characters each.');
  const grammarPreview=data.texts.map(text=>classifyTextProfile(text,resolvedTextProfile,textGrammar));
  postMessage({id:data.id,grammarPreview,resolvedTextProfile,textGrammarVersion:TEXT_GRAMMAR_VERSION});return;
 }
 const prepared=prepareComparisonKeys([data.a,data.b],data.ignoredTextPatterns,resolvedTextProfile,textGrammar);
 const compared=engine.compare(data.a,data.b,data.ignore,data.anchors,data.ignoreCase===true,data.whitespaceScope??'all',data.ignoreBlankLines===true,comparisonPair(prepared));
 const aligned=data.syntaxAlignment===true?alignSyntaxRows(compared,data.a,data.b,resolvedTextProfile,textGrammar):compared;
 postMessage({id:data.id,resolvedTextProfile,textProfileMappings,textGrammar,textGrammarVersion:TEXT_GRAMMAR_VERSION,grammarFallbacks:prepared.map(item=>item.fallback||null),textProfileRulesVersion:TEXT_PROFILE_RULES_VERSION,...aligned,...(data.showMovedBlocks===true?{movedBlocks:annotateMovedBlocks(data.a,data.b,aligned,{anchors:data.anchors||[]})}:{})});
}catch(error){postMessage({id:data.id,error:error.message});}};
