#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {main:compare}=require('./compare.cjs');
const {ENCODINGS}=require('../src/text-codec.cjs');
const {WHITESPACE_SCOPES}=require('../src/text-whitespace.cjs');
const {validateIgnoredTextPatterns}=require('../src/ignored-text-rules.cjs');
const {validateTextProfile,validateTextProfileMappings,resolveTextProfile,TEXT_PROFILE_RULES_VERSION}=require('../src/text-profile.cjs');
const {validateTextGrammar,hasTextGrammar,TEXT_GRAMMAR_VERSION}=require('../src/text-grammar.cjs');
const {isDocumentInput}=require('../src/text-input.cjs');
const TYPES=['text','folder','binary','table'],FORMATS=['json','text','html'];
const canonical=value=>process.platform==='win32'||process.platform==='darwin'?value.toLowerCase():value;
function within(root,file){const relative=path.relative(canonical(root),canonical(file));return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
async function planBatch(file){
 const stat=await fs.stat(file);if(!stat.isFile()||stat.size>1024*1024)throw Error('Batch must be a JSON file up to 1 MiB.');
 const content=await fs.readFile(file);if(content.length>1024*1024)throw Error('Batch must be a JSON file up to 1 MiB.');const document=JSON.parse(content.toString('utf8'));
 if(!document||document.version!==1||!Array.isArray(document.jobs)||!document.jobs.length||document.jobs.length>100||Object.keys(document).some(k=>!['version','jobs'].includes(k)))throw Error('Choose a version 1 batch with 1–100 jobs.');
 const base=path.dirname(path.resolve(file)),jobs=[],inputs=[],outputs=new Set();
 for(const [index,job]of document.jobs.entries()){
  if(!job||typeof job!=='object'||Array.isArray(job)||Object.keys(job).some(k=>!['textGrammar','textProfile','textProfileMappings','left','right','output','type','format','ignoreCase','ignoreWhitespace','ignoreBlankLines','ignoredTextPatterns','whitespaceScope','leftEncoding','rightEncoding','pdfOrder','docxScope','odtScope','docScope'].includes(k)))throw Error(`Invalid batch job ${index+1}.`);
  for(const key of ['left','right','output'])if(typeof job[key]!=='string'||!job[key].trim()||job[key].includes('\0')||job[key].length>32768)throw Error(`Job ${index+1}: choose ${key}.`);
  const type=job.type??'text',format=job.format??'json';if(!TYPES.includes(type)||!FORMATS.includes(format))throw Error(`Job ${index+1}: unsupported comparison or report format.`);
  for(const key of ['ignoreCase','ignoreWhitespace','ignoreBlankLines'])if(job[key]!==undefined&&typeof job[key]!=='boolean')throw Error(`Job ${index+1}: ${key} must be boolean.`);
  if(type!=='text'&&(job.ignoreCase||job.ignoreWhitespace||job.ignoreBlankLines))throw Error(`Job ${index+1}: text rules require a text comparison.`);
  if(job.whitespaceScope!==undefined&&(type!=='text'||job.ignoreWhitespace!==true||!WHITESPACE_SCOPES.includes(job.whitespaceScope)))throw Error(`Job ${index+1}: whitespaceScope requires ignoreWhitespace and a supported text scope.`);
  if(job.ignoredTextPatterns!==undefined&&type!=='text')throw Error(`Job ${index+1}: ignored-text patterns require text mode.`);
  if(job.textGrammar!==undefined&&type!=='text')throw Error(`Job ${index+1}: grammar rules require text mode.`);
  const textGrammar=validateTextGrammar(job.textGrammar);
  const textProfile=validateTextProfile(job.textProfile);
  if(job.textProfile!==undefined&&type!=='text')throw Error(`Job ${index+1}: text profile requires text mode.`);
  if(job.textProfileMappings!==undefined&&(type!=='text'||textProfile!=='auto'))throw Error(`Job ${index+1}: text-profile mappings require automatic profiles in text mode.`);
  const textProfileMappings=validateTextProfileMappings(job.textProfileMappings);
  const ignoredTextPatterns=validateIgnoredTextPatterns(job.ignoredTextPatterns);
  const entry={...(hasTextGrammar(textGrammar)?{textGrammar,textGrammarVersion:TEXT_GRAMMAR_VERSION}:{}),...(textProfileMappings.length?{textProfileMappings}:{}),...(textProfile==='plain'?{}:{textProfile}),...(ignoredTextPatterns.length?{ignoredTextPatterns}:{}),job:index+1,type,format,ignoreCase:job.ignoreCase===true,ignoreWhitespace:job.ignoreWhitespace===true,...(job.ignoreBlankLines?{ignoreBlankLines:true}:{}),...(job.whitespaceScope!==undefined?{whitespaceScope:job.whitespaceScope}:{})};
  if(job.docxScope!==undefined&&(type!=='text'||!['main-document','main-and-related-text'].includes(job.docxScope)))throw Error(`Job ${index+1}: docxScope requires text mode and main-document or main-and-related-text.`);if(type==='text')entry.docxScope=job.docxScope??'main-document';
  if(job.odtScope!==undefined&&(type!=='text'||!['main-document','main-and-related-text'].includes(job.odtScope)))throw Error(`Job ${index+1}: odtScope requires text mode and main-document or main-and-related-text.`);if(type==='text')entry.odtScope=job.odtScope??'main-document';
  if(job.docScope!==undefined&&(type!=='text'||!['main-document','main-and-related-text'].includes(job.docScope)))throw Error(`Job ${index+1}: docScope requires text mode and main-document or main-and-related-text.`);if(type==='text')entry.docScope=job.docScope??'main-document';
  if(job.pdfOrder!==undefined&&(type!=='text'||!['document','page-rows','page-columns','tagged-structure'].includes(job.pdfOrder)))throw Error(`Job ${index+1}: pdfOrder requires text mode and document, page-rows, page-columns or tagged-structure.`);if(type==='text')entry.pdfOrder=job.pdfOrder??'document';
  for(const key of ['leftEncoding','rightEncoding']){if(job[key]!==undefined&&(type!=='text'||!['auto',...ENCODINGS].includes(job[key])))throw Error(`Job ${index+1}: ${key} requires text mode and a supported encoding.`);if(type==='text')entry[key]=job[key]??'auto';}
  for(const side of ['left','right']){const name=path.resolve(base,job[side]),info=await fs.lstat(name);if(info.isSymbolicLink()||(type==='folder'?!info.isDirectory():!info.isFile()))throw Error(`Job ${index+1}: ${side} must be a regular ${type==='folder'?'directory':'file'}.`);entry[side]=await fs.realpath(name);inputs.push({path:entry[side],directory:type==='folder'});}
  if(type==='text'){const conversions={};for(const side of ['left','right'])if(isDocumentInput(entry[side])){if(entry[side+'Encoding']!=='auto')throw Error(`Job ${index+1}: document extraction requires auto encoding.`);const kind=path.extname(entry[side]).slice(1).toLowerCase();conversions[side]={kind,...(kind==='pdf'?{order:entry.pdfOrder}:{}),scope:kind==='pdf'?'page-text':kind==='docx'?entry.docxScope:kind==='doc'?entry.docScope:kind==='odt'?entry.odtScope:'main-document',limitations:[kind==='doc'?(entry.docScope==='main-and-related-text'?'Stored body, notes, comments, headers, footers and text boxes with qualified reference labels; hidden text is included, generated numbering and rendered layout are not reconstructed.':'Stored main-body text and cached field results; hidden text is included, related text, generated numbering and rendered layout are excluded.'):kind==='pdf'?(entry.pdfOrder==='tagged-structure'?'Page-local tagged extracted text with normalized boundaries and a labelled artifact tail; no layout, accessibility replacement text or OCR. Source tag coverage is verified only during execution.':'Extracted text only; no layout, images or OCR.'):((kind==='docx'&&entry.docxScope==='main-and-related-text')||(kind==='odt'&&entry.odtScope==='main-and-related-text')||(kind==='doc'&&entry.docScope==='main-and-related-text'))?'Logical body and referenced header/footer/note text only; no rendered pagination, layout or embedded objects.':kind==='rtf'?'Main document text and stored field results only; no layout, embedded objects or field evaluation.':'Main document text only; no layout or embedded objects.']};}if(Object.keys(conversions).length)entry.documentConversions=conversions;}
  if(textProfile!=='plain'){entry.resolvedTextProfile=resolveTextProfile(textProfile,[entry.left,entry.right],textProfileMappings);if(textProfile==='auto')entry.textProfileRulesVersion=TEXT_PROFILE_RULES_VERSION;}
  const requested=path.resolve(base,job.output),parent=await fs.realpath(path.dirname(requested));entry.output=path.join(parent,path.basename(requested));
  try{await fs.lstat(entry.output);throw Error(`Job ${index+1}: report already exists.`);}catch(error){if(error.code!=='ENOENT')throw error;}
  const key=canonical(entry.output);if(outputs.has(key))throw Error('Batch report destinations must be unique.');outputs.add(key);jobs.push(entry);
 }
 // Reports must not change any compared tree or become another job's input.
 const source=await fs.realpath(file);
 for(const job of jobs)if(canonical(job.output)===canonical(source)||inputs.some(input=>input.directory?within(input.path,job.output):canonical(input.path)===canonical(job.output)))throw Error('Report destinations must be outside all batch inputs.');
 return jobs;
}
async function runBatch(file,options={}){
 return runPlannedJobs(await planBatch(file),options);
}
async function runPlannedJobs(jobs,{dryRun=false,extractPdfText,extractDocText,signal}={}){
 const results=[];let code=0;
 for(const job of jobs){if(signal?.aborted){code=2;results.push({...job,status:'cancelled',attempted:false,error:'DOCUMENT_CANCELLED'});continue;}if(dryRun){results.push({...job,status:'planned'});continue;}
  const argv=['--left',job.left,'--right',job.right,'--type',job.type,'--format',job.format,'--output',job.output];if(job.ignoreCase)argv.push('--ignore-case');if(job.ignoreWhitespace)argv.push('--ignore-whitespace');if(job.ignoreBlankLines)argv.push('--ignore-blank-lines');
  if(job.textProfile!==undefined)argv.push('--text-profile',job.textProfile);
  if(job.whitespaceScope!==undefined)argv.push('--whitespace-scope',job.whitespaceScope);
  if(job.type==='text')argv.push('--doc-scope',job.docScope??'main-document','--odt-scope',job.odtScope??'main-document','--docx-scope',job.docxScope??'main-document','--pdf-order',job.pdfOrder??'document','--left-encoding',job.leftEncoding??'auto','--right-encoding',job.rightEncoding??'auto');
  try{const result=await compare(argv,{extractPdfText,extractDocText,signal,...(job.textGrammar?{textGrammar:job.textGrammar}:{}),...(job.ignoredTextPatterns?{ignoredTextPatterns:job.ignoredTextPatterns}:{}),...(job.textProfileMappings?{textProfileMappings:job.textProfileMappings}:{})});code=Math.max(code,result);results.push({...job,status:result?'different':'same'});}catch(error){code=2;results.push({...job,status:signal?.aborted?'cancelled':'error',...(signal?.aborted?{attempted:true}:{}),error:signal?.aborted?'DOCUMENT_CANCELLED':error.code||error.message});}
 }
 return {code,report:{version:1,dryRun,jobs:results}};
}
async function main(argv,options={}){
 if(argv.length===1&&argv[0]==='--help'){process.stdout.write('Usage: node scripts/batch.cjs --script FILE [--dry-run]\nJSON version 1, jobs: left, right, output, type, format, textProfile, textProfileMappings, textGrammar, ignoreCase, ignoreWhitespace, ignoreBlankLines, ignoredTextPatterns, whitespaceScope, leftEncoding, rightEncoding, pdfOrder (document, page-rows, page-columns or tagged-structure), docScope, docxScope and odtScope (main-document or main-and-related-text).\nPaths are relative to the script. Exit codes: 0 equal/planned, 1 differences, 2 error.\n');return 0;}
 let file,dryRun=false;for(let i=0;i<argv.length;i++){if(argv[i]==='--script'&&!file&&argv[i+1]&&!argv[i+1].startsWith('--'))file=argv[++i];else if(argv[i]==='--dry-run'&&!dryRun)dryRun=true;else throw Error('Invalid arguments. Use --help.');}if(!file)throw Error('Choose a batch script with --script.');const result=await runBatch(file,{...options,dryRun});process.stdout.write(JSON.stringify(result.report,null,2)+'\n');return result.code;
}
if(require.main===module){const controller=new AbortController(),abort=()=>controller.abort();process.on('SIGINT',abort);process.on('SIGTERM',abort);main(process.argv.slice(2),{signal:controller.signal}).then(code=>process.exitCode=controller.signal.aborted?2:code).catch(error=>{process.stderr.write('Batch failed: '+(error.code||error.message)+'\n');process.exitCode=2;}).finally(()=>{process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);});}
module.exports={planBatch,runBatch,runPlannedJobs,main};
