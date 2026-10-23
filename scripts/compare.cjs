#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash}=require('node:crypto');
const localSnapshot=require('../desktop/local-file-snapshot.cjs');
const {decodeTextInput,isDocumentInput}=require('../src/text-input.cjs');
const cancelled=signal=>{if(signal?.aborted)throw Object.assign(Error('Document comparison cancelled.'),{code:'DOCUMENT_CANCELLED'});};
async function outputLocation(file){
 const requested=path.resolve(file),parent=await fs.realpath(path.dirname(requested)),directories=[];
 for(let current=parent;;){const stat=await fs.lstat(current,{bigint:true});if(!stat.isDirectory())throw Error('Report directory changed.');directories.push([current,`${stat.dev}:${stat.ino}`]);const next=path.dirname(current);if(next===current)break;current=next;}
 const validate=async()=>{if(await fs.realpath(path.dirname(requested))!==parent)throw Error('Report directory changed.');for(const [name,id]of directories){const stat=await fs.lstat(name,{bigint:true});if(!stat.isDirectory()||`${stat.dev}:${stat.ino}`!==id)throw Error('Report directory changed.');}};
 return {file:path.join(parent,path.basename(requested)),validate};
}
const fileStamp=s=>`${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}:${s.nlink}`;
async function publish(location,output,validate){
 let handle,owned,written;const bytes=Buffer.from(output);
 try{await location.validate();handle=await fs.open(location.file,'wx+',0o600);owned=await handle.stat({bigint:true});await location.validate();await handle.writeFile(bytes);written=await handle.stat({bigint:true});await validate();await location.validate();const chunk=Buffer.alloc(Math.min(65536,bytes.length));for(let position=0;position<bytes.length;){const {bytesRead}=await handle.read(chunk,0,Math.min(chunk.length,bytes.length-position),position);if(!bytesRead||!chunk.subarray(0,bytesRead).equals(bytes.subarray(position,position+bytesRead)))throw Error('Report file changed while writing.');position+=bytesRead;}const final=await fs.lstat(location.file,{bigint:true}),descriptor=await handle.stat({bigint:true});if(!final.isFile()||final.nlink!==1n||fileStamp(final)!==fileStamp(written)||fileStamp(descriptor)!==fileStamp(written)||final.size!==BigInt(bytes.length))throw Error('Report file changed while writing.');await handle.close();handle=null;}
 catch(error){if(handle)await handle.close().catch(()=>{});if(owned){
  // A failed write may leave a prefix; never remove content another writer changed.
  const before=await fs.lstat(location.file,{bigint:true}).catch(()=>null);
  if(before?.dev===owned.dev&&before?.ino===owned.ino&&before.nlink===1n&&before.size<=BigInt(bytes.length)&&(!written||fileStamp(before)===fileStamp(written))){
   const content=await fs.readFile(location.file).catch(()=>null),after=await fs.lstat(location.file,{bigint:true}).catch(()=>null);
   if(content&&after&&fileStamp(before)===fileStamp(after)&&content.equals(bytes.subarray(0,content.length)))await fs.unlink(location.file).catch(()=>{});
  }
 }throw error;}
}
const {readDataLimited} = require('../desktop/sessions.cjs');
const {createSnapshot,compareSnapshots} = require('../desktop/snapshots.cjs');
const {decodeText,ENCODINGS,MAX_BYTES}=require('../src/text-codec.cjs');
const {compare} = require('../src/diff.cjs');
const {WHITESPACE_SCOPES}=require('../src/text-whitespace.cjs');
const {validateIgnoredTextPatterns}=require('../src/ignored-text-rules.cjs');
const {validateTextProfile,validateTextProfileMappings,resolveTextProfile,TEXT_PROFILE_RULES_VERSION}=require('../src/text-profile.cjs');
const {validateTextGrammar,hasTextGrammar,TEXT_GRAMMAR_VERSION}=require('../src/text-grammar.cjs');
const {comparisonPair}=require('../src/text-comparison-keys.cjs');
const {prepareIgnoredText,prepareTextComparison}=require('../desktop/ignored-text-client.cjs');
const {compareBinary,compareTables,parseDelimited} = require('../src/structured-diff.cjs');
const escape = value => value.replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function main(argv,options={}) {
  if (argv.includes('--help')) { process.stdout.write('Usage: node scripts/compare.cjs --left FILE --right FILE --type text|folder|binary|table --format json|text|html [--output FILE] [--text-profile plain|auto|java|xml|sql] [--text-profile-mappings JSON_FILE] [--text-grammar JSON_FILE] [--ignore-case] [--ignore-blank-lines] [--ignore-patterns JSON_FILE] [--ignore-whitespace] [--whitespace-scope all|horizontal|leading|trailing|edges|embedded|leading-embedded|trailing-embedded] [--left-encoding ENCODING] [--right-encoding ENCODING] [--pdf-order document|page-rows|page-columns|tagged-structure] [--docx-scope main-document|main-and-related-text] [--odt-scope main-document|main-and-related-text] [--doc-scope main-document|main-and-related-text]\nExit codes: 0 same, 1 differences, 2 error. Output files must not already exist.\n'); return 0; }
  const args = {};
  for (let i=0;i<argv.length;i++) {
    const key = argv[i];
    if (['--ignore-case','--ignore-whitespace','--ignore-blank-lines'].includes(key)) { if(args[key] !== undefined) throw new Error('Duplicate comparison rule.'); args[key] = true; continue; }
    if (!['--text-grammar','--text-profile','--text-profile-mappings','--left','--right','--type','--format','--output','--ignore-patterns','--whitespace-scope','--left-encoding','--right-encoding','--pdf-order','--docx-scope','--odt-scope','--doc-scope'].includes(key) || args[key] !== undefined || !argv[i+1] || argv[i+1].startsWith('--')) throw new Error('Invalid arguments. Use --help.');
    args[key] = argv[++i];
  }
  const type = args['--type'] || 'text', format = args['--format'] || 'text';
  if (!args['--left'] || !args['--right'] || !['text','folder','binary','table'].includes(type) || !['json','text','html'].includes(format)) throw new Error('Invalid arguments. Use --help.');
  if(args['--text-grammar']!==undefined&&options.textGrammar!==undefined)throw Error('Choose one text grammar source.');
  if(type!=='text'&&(args['--text-grammar']!==undefined||options.textGrammar!==undefined))throw Error('Grammar rules require text mode.');
  let grammarInput=options.textGrammar;
  if(args['--text-grammar']!==undefined){const encoded=await readDataLimited(args['--text-grammar'],65536);grammarInput=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(encoded));}
  const textGrammar=validateTextGrammar(grammarInput),grammarActive=hasTextGrammar(textGrammar);
  const requestedTextProfile=validateTextProfile(args['--text-profile']);
  const hasMappingSource=args['--text-profile-mappings']!==undefined||options.textProfileMappings!==undefined;
  if(args['--text-profile-mappings']!==undefined&&options.textProfileMappings!==undefined)throw Error('Choose one text-profile mapping source.');
  if(hasMappingSource&&(type!=='text'||requestedTextProfile!=='auto'))throw Error('Text-profile mappings require automatic profiles in text mode.');
  let mappingInput=options.textProfileMappings;
  if(args['--text-profile-mappings']!==undefined){const encoded=await readDataLimited(args['--text-profile-mappings'],65536);mappingInput=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(encoded));}
  const textProfileMappings=validateTextProfileMappings(mappingInput);
  const textProfile=resolveTextProfile(requestedTextProfile,[args['--left'],args['--right']],textProfileMappings);
  if(type!=='text'&&args['--text-profile']!==undefined)throw Error('Text profiles require text mode.');
  const ignoreCase=args['--ignore-case']===true,ignoreWhitespace=args['--ignore-whitespace']===true,ignoreBlankLines=args['--ignore-blank-lines']===true;
  if(type!=='text'&&(ignoreCase||ignoreWhitespace||ignoreBlankLines))throw new Error('Case, whitespace and blank-line rules apply only to text comparisons.');
  const docxScope=args['--docx-scope']??'main-document';if(args['--docx-scope']!==undefined&&(type!=='text'||!['main-document','main-and-related-text'].includes(docxScope)))throw Error('DOCX scope requires text mode and main-document or main-and-related-text.');
  const odtScope=args['--odt-scope']??'main-document';if(args['--odt-scope']!==undefined&&(type!=='text'||!['main-document','main-and-related-text'].includes(odtScope)))throw Error('ODT scope requires text mode and main-document or main-and-related-text.');
  const docScope=args['--doc-scope']??'main-document';if(args['--doc-scope']!==undefined&&(type!=='text'||!['main-document','main-and-related-text'].includes(docScope)))throw Error('DOC scope requires text mode and main-document or main-and-related-text.');
  const pdfOrder=args['--pdf-order']??'document';if(args['--pdf-order']!==undefined&&(type!=='text'||!['document','page-rows','page-columns','tagged-structure'].includes(pdfOrder)))throw Error('PDF ordering requires text mode and document, page-rows, page-columns or tagged-structure.');
  for(const key of ['--left-encoding','--right-encoding'])if(args[key]!==undefined&&(type!=='text'||!['auto',...ENCODINGS].includes(args[key])))throw Error('Encoding options require text mode and a supported encoding.');
  const whitespaceScope=args['--whitespace-scope']??'all';
  if(!WHITESPACE_SCOPES.includes(whitespaceScope)||(args['--whitespace-scope']!==undefined&&(type!=='text'||!ignoreWhitespace)))throw Error('Whitespace scope requires --ignore-whitespace in text mode and a supported scope.');
  if(args['--ignore-patterns']!==undefined&&options.ignoredTextPatterns!==undefined)throw Error('Choose one ignored-text pattern source.');
  let patternInput=options.ignoredTextPatterns;
  if(args['--ignore-patterns']!==undefined){const encoded=await readDataLimited(args['--ignore-patterns'],65536);patternInput=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(encoded));}
  const ignoredTextPatterns=validateIgnoredTextPatterns(patternInput);
  if(type!=='text'&&(args['--ignore-patterns']!==undefined||options.ignoredTextPatterns!==undefined))throw Error('Ignored-text patterns require text mode.');
  cancelled(options.signal);
  for(const side of ['left','right'])if(type==='text'&&isDocumentInput(args['--'+side])&&(args['--'+side+'-encoding']||'auto')!=='auto')throw Error('Document extraction requires auto encoding for the '+side+' input.');
  const destination=args['--output']?await outputLocation(args['--output']):null;
  let result;const snapshots=[],inputPaths=[];
  const regularInput=async file=>{if(!(await fs.lstat(file)).isFile())throw Error('Comparison inputs must be regular files, not symbolic links.');};
  const validateSources=async()=>{cancelled(options.signal);for(const file of inputPaths)await regularInput(file);for(const snapshot of snapshots)await localSnapshot.validate(snapshot);cancelled(options.signal);};
  if (type === 'folder') result = compareSnapshots(await createSnapshot(args['--left']),await createSnapshot(args['--right']));
  else {
    const inputs={};for(const side of ['left','right']){cancelled(options.signal);const file=path.resolve(args['--'+side]);await regularInput(file);inputPaths.push(file);const item=await localSnapshot.read(file,type==='text'?(isDocumentInput(args['--'+side])?32*1024*1024:MAX_BYTES):undefined);await regularInput(file);inputs[side]=item;snapshots.push(item.snapshot);}
    const a=inputs.left.bytes,b=inputs.right.bytes;
    if (type === 'binary') result = compareBinary(a,b);
    else if(type==='text'){const decode=async(bytes,side)=>{cancelled(options.signal);let extractPdfText=options.extractPdfText;if(/\.pdf$/i.test(args['--'+side])&&extractPdfText===undefined){try{extractPdfText=require('../src/pdf-text-node.cjs').extractPdfTextInNode;}catch(error){throw Object.assign(Error('PDF text extraction is unavailable in this runtime.'),{code:'DOCUMENT_ENGINE_UNAVAILABLE',cause:error});}}const extractDocText=options.extractDocText??require('../src/doc-text-node.cjs').extractDocTextInNode;const value=await decodeTextInput(bytes,args['--'+side],args['--'+side+'-encoding']||'auto',{extractPdfText,extractDocText,pdfOrder,docxScope,odtScope,docScope,signal:options.signal});cancelled(options.signal);return value;};const left=await decode(a,'left'),right=await decode(b,'right');const leftContent=ignoredTextPatterns.length||(textProfile!=='plain'||grammarActive)?left.content.replace(/\r\n|\r/g,'\n'):left.content,rightContent=ignoredTextPatterns.length||(textProfile!=='plain'||grammarActive)?right.content.replace(/\r\n|\r/g,'\n'):right.content;const preparedItems=(textProfile!=='plain'||grammarActive)?await prepareTextComparison([leftContent,rightContent],ignoredTextPatterns,textProfile,textGrammar):null;const prepared=preparedItems?comparisonPair(preparedItems):ignoredTextPatterns.length?await prepareIgnoredText([leftContent,rightContent],ignoredTextPatterns):null;const detail=compare(leftContent,rightContent,ignoreWhitespace,[],ignoreCase,whitespaceScope,ignoreBlankLines,prepared?((textProfile!=='plain'||grammarActive)?prepared:{a:prepared[0],b:prepared[1]}):undefined);const documentProjections=Object.fromEntries(Object.entries({left,right}).filter(([,v])=>v.documentProjection).map(([k,v])=>[k,v.documentProjection]));result={...(Object.keys(documentProjections).length?{documentProjections,comparisonMeaning:'extracted-text',inputIdentities:Object.fromEntries(Object.entries(inputs).map(([side,item])=>[side,{bytes:item.bytes.length,sha256:createHash('sha256').update(item.bytes).digest('hex')}]))}:{}),equal:detail.hunks.length===0,...(preparedItems?.some(item=>item.fallback)?{grammarFallbacks:preparedItems.map(item=>item.fallback||null)}:{}),comparisonRules:{ignoreCase,ignoreWhitespace,...(grammarActive?{textGrammar,textGrammarVersion:TEXT_GRAMMAR_VERSION}:{}),...(textProfileMappings.length?{textProfileMappings}:{}),...(requestedTextProfile==='plain'?{}:{textProfile:requestedTextProfile,resolvedTextProfile:textProfile,...(requestedTextProfile==='auto'?{textProfileRulesVersion:TEXT_PROFILE_RULES_VERSION}:{})}),...(ignoredTextPatterns.length?{ignoredTextPatterns}:{}),...(ignoreBlankLines?{ignoreBlankLines:true}:{}),...(args['--whitespace-scope']!==undefined?{whitespaceScope}:{})},sourceFormats:Object.fromEntries(Object.entries({left:left.format,right:right.format}).map(([side,{encoding,bom,lineEnding}])=>[side,{encoding,bom,lineEnding}])),...detail};}
    else {
      const decoder = new TextDecoder('utf-8',{fatal:true}), left = decoder.decode(a), right = decoder.decode(b);
      if (type === 'table') result = compareTables(parseDelimited(left,path.extname(args['--left']).toLowerCase()==='.tsv'?'\t':','),parseDelimited(right,path.extname(args['--right']).toLowerCase()==='.tsv'?'\t':','));
    }
  }
  const report = {version:1,type,...result};
  const json = JSON.stringify(report,null,2);
  let output = format === 'json' ? json : `${result.equal?(result.documentProjections?'Equivalent extracted text':ignoreCase||ignoreWhitespace||ignoreBlankLines||ignoredTextPatterns.length||(textProfile!=='plain'||grammarActive)?'Equivalent under comparison rules':'Identical'):'Differences found'} (${type})\n${json}`;
  if(format!=='json'&&result.documentProjections)output='Extracted document text comparison (not byte or visual identity).\n'+Object.entries(result.documentProjections).map(([side,p])=>`${side}: ${p.kind.toUpperCase()} — ${p.scope}\nExcluded: ${p.exclusions.join('; ')}`).join('\n')+'\n'+output;
  if (format === 'html') output = '<!doctype html><meta charset="utf-8"><title>Comparison report</title><style>body{font:14px system-ui;margin:2rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Comparison report</h1><pre>'+escape(output)+'</pre>';
  await validateSources();
  if (args['--output']) await publish(destination,output+'\n',validateSources);
  else process.stdout.write(output+'\n');
  return result.equal?0:1;
}
if(require.main===module){const controller=new AbortController(),abort=()=>controller.abort();process.on('SIGINT',abort);process.on('SIGTERM',abort);main(process.argv.slice(2),{signal:controller.signal}).then(code=>{process.exitCode=controller.signal.aborted?2:code;}).catch(error=>{process.stderr.write(`Comparison failed: ${error.code ? error.code : error.message}\n`);process.exitCode=2;}).finally(()=>{process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);});}
module.exports = {main};
