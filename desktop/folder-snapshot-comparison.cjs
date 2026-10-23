'use strict';
const {hasTextGrammar,TEXT_GRAMMAR_VERSION}=require('../src/text-grammar.cjs');
const {validateFolderRules,effectiveFolderEncoding}=require('./folder-rules.cjs');
const {assertMetadataPlatform,applyMetadataComparison}=require('./folder-metadata-comparison.cjs');
const {timestampsEqualNs}=require('../src/folder-time.cjs');
const {resolveTextProfile,TEXT_PROFILE_RULES_VERSION}=require('../src/text-profile.cjs');
const textModes=new Set(['text-content','text-whitespace','text-case','text-whitespace-case']);
// Classify captured entries, never re-read files between eligibility and planning.
// Raw hashes remain part of the snapshot regardless of the comparison rule.
function classifySnapshotEntries(a,b,value={},paths) {
 const rules=validateFolderRules(value);assertMetadataPlatform(rules);
 for(const entry of [a,b])if(entry!=null){
  if(!entry||!['file','directory'].includes(entry.kind))throw Error('Invalid comparison snapshot entry.');
  if(entry.kind==='file'&&(!Number.isSafeInteger(entry.size)||entry.size<0||typeof entry.hash!=='string'||!/^[a-f0-9]{64}$/.test(entry.hash)))throw Error('Incomplete comparison snapshot file.');
 }
 if(a==null&&b==null)throw Error('Choose at least one snapshot entry.');
 if(a==null)return {status:'right',comparison:null};
 if(b==null)return {status:'left',comparison:null};
 if(a.kind!==b.kind)return {status:'conflict',comparison:null};
 if(a.kind==='directory')return applyMetadataComparison({status:'unchecked',comparison:null},a,b,rules,paths);
 let equal=false,comparison='content';
 if(textModes.has(rules.mode)){
  if(a.normalizationMode!==rules.mode||b.normalizationMode!==rules.mode||[a,b].some((entry,index)=>(entry.normalizationEncoding??'auto')!==effectiveFolderEncoding(rules,index?'b':'a')))throw Error('Snapshot text rules changed. Capture the comparison again.');
  for(const entry of [a,b])if(entry.normalizedHash!==null&&(typeof entry.normalizedHash!=='string'||!/^[a-f0-9]{64}$/.test(entry.normalizedHash)))throw Error('Incomplete normalized snapshot.');
  if(['text-whitespace','text-whitespace-case'].includes(rules.mode)&&[a,b].some(entry=>(entry.normalizationWhitespaceScope??'horizontal')!==(rules.textWhitespaceScope??'horizontal')))throw Error('Snapshot whitespace rules changed. Capture the comparison again.');
  if([a,b].some(entry=>(entry.normalizationTextProfile??'plain')!==(rules.textProfile??'plain')))throw Error('Snapshot text profile changed. Capture the comparison again.');
  if([a,b].some(entry=>(entry.normalizationIgnoreBlankLines??false)!==(rules.ignoreBlankLines??false)))throw Error('Snapshot blank-line rules changed. Capture the comparison again.');
  if([a,b].some(entry=>JSON.stringify(entry.normalizationIgnoredTextPatterns??[])!==JSON.stringify(rules.ignoredTextPatterns??[])))throw Error('Snapshot ignored-text rules changed. Capture the comparison again.');
  if([a,b].some(entry=>(entry.normalizationProfileMappings===undefined?'[]':entry.normalizationProfileMappings)!==JSON.stringify(rules.textProfileMappings??[])))throw Error('Snapshot filename mappings changed. Capture the comparison again.');
  const grammarActive=hasTextGrammar(rules.textGrammar);
  if([a,b].some(entry=>grammarActive?(entry.normalizationTextGrammar!==JSON.stringify(rules.textGrammar)||entry.normalizationGrammarVersion!==TEXT_GRAMMAR_VERSION):(entry.normalizationTextGrammar!==undefined||entry.normalizationGrammarVersion!==undefined)))throw Error('Snapshot grammar rules changed. Capture the comparison again.');
  let leftHash=a.normalizedHash,rightHash=b.normalizedHash;
  if(rules.textProfile==='auto'){
   if(!paths||typeof paths.a!=='string'||!paths.a||typeof paths.b!=='string'||!paths.b)throw Error('Snapshot automatic profile requires endpoint paths. Capture the comparison again.');
   const resolved=resolveTextProfile('auto',[paths.a,paths.b],rules.textProfileMappings);
   for(const [entry,name] of [[a,paths.a],[b,paths.b]]){
    if(entry.normalizationProfilePath!==name||entry.normalizationProfileVersion!==TEXT_PROFILE_RULES_VERSION||entry.normalizationResolvedProfile!==resolveTextProfile('auto',[name],rules.textProfileMappings))throw Error('Snapshot automatic profile provenance changed. Capture the comparison again.');
    if(entry.plainNormalizedHash!==null&&(typeof entry.plainNormalizedHash!=='string'||!/^[a-f0-9]{64}$/.test(entry.plainNormalizedHash)))throw Error('Incomplete automatic profile snapshot.');
    if((entry.normalizedHash===null)!==(entry.plainNormalizedHash===null))throw Error('Incomplete automatic profile snapshot.');
   }
   if(resolved==='plain'){leftHash=a.plainNormalizedHash;rightHash=b.plainNormalizedHash;}
  }
  equal=a.hash===b.hash;
  if((!equal||effectiveFolderEncoding(rules,'a')!==effectiveFolderEncoding(rules,'b'))&&leftHash!==null&&rightHash!==null){equal=leftHash===rightHash;comparison='text-normalized';}
 }else if(rules.mode==='content')equal=a.hash===b.hash;
 else{
  comparison='metadata';const sizeEqual=a.size===b.size;
  if(rules.mode==='size')equal=sizeEqual;
  else{
   for(const entry of [a,b])if(typeof entry.mtimeNs!=='string'||! /^-?\d{1,30}$/.test(entry.mtimeNs))throw Error('Snapshot modification time is missing.');
   const timeEqual=timestampsEqualNs(a.mtimeNs,b.mtimeNs,rules);
   equal=rules.mode==='modified'?timeEqual:sizeEqual&&timeEqual;
  }
 }
 return applyMetadataComparison({status:equal?'equal':'changed',comparison},a,b,rules,paths);
}
module.exports={classifySnapshotEntries};
