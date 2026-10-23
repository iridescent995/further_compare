import profileTools from './text-profile.cjs';
const {resolveTextProfile}=profileTools;
import {createFileContentReport} from './file-content-report.cjs';
import {prepareComparisonKeys,comparisonPair} from './text-comparison-keys.cjs';
self.onmessage=event=>{try{const {payload,rules={}}=event.data;const prepared=payload.files.map(file=>{const keys=prepareComparisonKeys(['left','right'].map(side=>file[side]?.content.replace(/\r\n|\r/g,'\n')??''),rules.mode?.startsWith('text-')?rules.ignoredTextPatterns:[],rules.mode?.startsWith('text-')?resolveTextProfile(rules.textProfile,[file.pathA,file.pathB],rules.textProfileMappings):'plain',rules.mode?.startsWith('text-')?rules.textGrammar:undefined);return {...comparisonPair(keys),grammarFallbacks:keys.map(item=>item.fallback||null)};});self.postMessage({report:createFileContentReport(payload,rules,prepared)});}catch(error){self.postMessage({error:error.message});}};
