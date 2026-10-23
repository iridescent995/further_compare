'use strict';

const {validateTextGrammar}=require('./text-grammar.cjs');
const MAX_BYTES=20*1024*1024, MAX_LINES=100000;
function validateTextProfile(value='plain') {
 if(!['plain','auto','java','xml','sql'].includes(value))throw Error('Text profile must be plain, auto, java, xml, or sql.');
 return value;
}
// Filename detection version 1: literal final extensions only; never inspect content.
const TEXT_PROFILE_RULES_VERSION=1;
// Ordered basename globs deliberately support only * and ?. Regex syntax is literal.
// Bounds cap matching work even for adversarial wildcard input.
const MAX_PROFILE_MAPPINGS=32, MAX_PROFILE_PATTERN=128;
function validateTextProfileMappings(input=[]) {
 if(!Array.isArray(input)||input.length>MAX_PROFILE_MAPPINGS)throw Error('Choose at most 32 filename format mappings.');
 return Array.from(input,rule=>{
  if(!rule||typeof rule!=='object'||Array.isArray(rule)||Object.keys(rule).some(key=>!['pattern','profile'].includes(key))||
   typeof rule.pattern!=='string'||!rule.pattern.length||rule.pattern.length>MAX_PROFILE_PATTERN||/[\x00-\x1f\x7f/\\]/.test(rule.pattern)||
   !['plain','java','xml','sql'].includes(rule.profile))throw Error('Filename mappings require a basename pattern up to 128 characters and plain, java, xml, or sql.');
  return {pattern:rule.pattern,profile:rule.profile};
 });
}
// Dynamic programming avoids regular-expression backtracking. ? matches one
// Unicode code point; casing follows the same locale-independent rule as detection.
function matchesFilenamePattern(name,pattern) {
 const chars=Array.from(name,c=>c.toLowerCase()),tokens=Array.from(pattern,c=>c.toLowerCase());
 let previous=new Uint8Array(chars.length+1);previous[0]=1;
 for(const token of tokens) {
  const next=new Uint8Array(chars.length+1);
  if(token==='*')next[0]=previous[0];
  for(let i=1;i<=chars.length;i++)next[i]=token==='*'?(previous[i]||next[i-1]):previous[i-1]&&(token==='?'||token===chars[i-1])?1:0;
  previous=next;
 }
 return previous[chars.length]===1;
}
function detectValidatedProfile(name,mappings) {
 if(typeof name!=='string'||!name||name.includes('\0'))return 'plain';
 const basename=name.split(/[\\/]/).pop();
 // Native names are much shorter; bounded imported display names stay conservative.
 if(!basename||basename.length>1024)return 'plain';
 for(const rule of mappings)if(matchesFilenamePattern(basename,rule.pattern))return rule.profile;
 const lower=basename.toLowerCase(),dot=lower.lastIndexOf('.');
 if(dot<=0)return 'plain';
 const extension=lower.slice(dot);
 return extension==='.java'?'java':extension==='.sql'?'sql':['.xml','.xsd','.xsl','.xslt','.svg','.xhtml','.wsdl','.fxml'].includes(extension)?'xml':'plain';
}
function detectTextProfile(name,mappings=[]) {
 return detectValidatedProfile(name,validateTextProfileMappings(mappings));
}
function resolveTextProfile(profile='plain',names=[],mappings=[]) {
 validateTextProfile(profile);
 const validated=validateTextProfileMappings(mappings);
 if(profile!=='auto')return profile;
 if(!Array.isArray(names))throw Error('Text profile filenames must be an array.');
 const supplied=names.filter(name=>name!==null&&name!==undefined&&name!=='');
 if(!supplied.length)return 'plain';
 const profiles=supplied.map(name=>detectValidatedProfile(name,validated));
 return profiles.every(value=>value===profiles[0])?profiles[0]:'plain';
}
// This deliberately recognizes lexical comments, not executable language semantics.
// Ambiguous or unfinished constructs retain the complete original input. This makes
// the comparison conservative: malformed sources cannot hide meaningful changes.
function classifyTextProfile(text,profile='plain',grammar) {
 const config=validateTextGrammar(grammar);
 validateTextProfile(profile);
 if(profile==='auto')throw Error('Resolve the automatic text profile from filenames before preparing text.');
 if(typeof text!=='string')throw Error('Text profile input must be text.');
 // Counting UTF-8 bytes without Buffer keeps the module usable in browser bundles.
 let bytes=0,lineCount=text===''?0:1;
 for(let i=0;i<text.length;i++) {
  const c=text.charCodeAt(i);
  bytes+=c<128?1:c<2048?2:c>=0xd800&&c<=0xdbff&&i+1<text.length&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff?(i++,4):3;
  if(c===10)lineCount++;
  if(bytes>MAX_BYTES||lineCount>MAX_LINES)throw Error('Text profile input exceeds 20 MiB or 100,000 lines.');
 }
 const original=reason=>({spans:text?[{start:0,end:text.length,type:'code',element:'code',protected:false,importance:'important'}]:[],fallback:reason||null});
 if(!text||profile==='plain'&&!config.elements.length)return original();
 if(/\r(?!\n)/.test(text))return original('Standalone carriage return');
 if(profile==='java'&&/\\u+[0-9a-fA-F]{4}/.test(text))return original('Java Unicode escape');
 const spans=[];
 const add=(start,end,type='protected',importance='important',name)=>{
  if(end<=start)return;
  const last=spans.at(-1);
  if(last&&last.end===start&&last.type===type&&last.importance===importance&&last.name===name)last.end=end;
  else {if(spans.length>=200000)throw Error('Text grammar exceeds 200,000 spans.');spans.push({start,end,type,element:name||type,protected:type==='protected',importance,...(name?{name}:{})});}
 };
 const comment=(a,b,type)=>add(a,b,type,config.importance[type]||'unimportant');
 const custom=config.elements.map(e=>({...e,...(e.kind==='pattern'?{regex:new RegExp(e.pattern,e.matchCase?'yu':'iyu')}:{})}));
 let i=0,xmlTag=false,gapStart=-1,gapEnd=-1;

 const quoted=(start,quote,backslash=false,doubled=false,multiline=true)=>{
  let p=start+1;
  for(;p<text.length;p++) {
   if(!multiline&&(text[p]==='\n'||text[p]==='\r'))return -1;
   if(backslash&&text[p]==='\\'){if(profile==='sql')return -1;if(!multiline&&(text[p+1]==='\n'||text[p+1]==='\r'))return -1;p++;continue;}
   if(text[p]===quote){if(doubled&&text[p+1]===quote){p++;continue;}return p+1;}
  }
  return -1;
 };
 while(i<text.length) {
  if(profile==='xml') {
   if(text.startsWith('<![CDATA[',i)){const end=text.indexOf(']]>',i+9);if(end<0)return original('Unfinished or ambiguous syntax');add(i,end+3);i=end+3;continue;}
   if(text.startsWith('<!--',i)){if(xmlTag)return original('Comment inside XML tag');const end=text.indexOf('-->',i+4);if(end<0||(text.slice(i+4,end).includes('--')||text[end-1]==='-'))return original('Unfinished or ambiguous syntax');comment(i,end+3,'blockComment');i=end+3;continue;}
   // A DTD internal subset can declare entities that alter interpretation. Keep it
   // intact rather than guessing which apparent comments are document content.
   if(text.startsWith('<!DOCTYPE',i))return original('Unfinished or ambiguous syntax');
   if(text.startsWith('<?',i)){const end=text.indexOf('?>',i+2);if(end<0)return original('Unfinished or ambiguous syntax');add(i,end+2);i=end+2;continue;}
   if(text[i]==='<'){if(xmlTag)return original('Nested XML tag opener');xmlTag=true;add(i,i+1,'code');i++;continue;}
   if(xmlTag&&(text[i]==='"'||text[i]==="'")){const end=quoted(i,text[i]);if(end<0)return original('Unfinished XML attribute');add(i,end);i=end;continue;}
   if(text[i]==='>'){xmlTag=false;add(i,i+1,'code');i++;continue;}
  }
  if(profile==='java'&&text.startsWith('"""',i)) {
   let p=i+3;
   while(text[p]===' '||text[p]==='\t'||text[p]==='\f')p++;
   if(text[p]==='\r')p++;
   if(text[p]!=='\n')return original('Unfinished or ambiguous syntax');
   p++;
   for(;p<text.length;p++){if(text[p]==='\\'){p++;continue;}if(text.startsWith('"""',p))break;}
   if(p>=text.length)return original('Unfinished or ambiguous syntax');add(i,p+3);i=p+3;continue;
  }
  if(profile==='sql') {
   // PostgreSQL dollar strings, Oracle alternative quoting, SQL Server names,
   // and MySQL backtick names all protect comment-looking contents.
   if(text[i]==='#')return original('Unfinished or ambiguous syntax'); // MySQL line comment vs other dialect operators.
   if(text[i]==='$'&&!/[A-Za-z0-9_$]/.test(text[i-1]||'')) {
    let p=i+1;
    if(text[p]!=='$'&&/[A-Za-z_]/.test(text[p]||'')){p++;while(p<text.length&&/[A-Za-z0-9_]/.test(text[p]))p++;}
    if(text[p]==='$') {const delimiter=text.slice(i,p+1),end=text.indexOf(delimiter,p+1);if(end<0)return original('Unfinished or ambiguous syntax');add(i,end+delimiter.length);i=end+delimiter.length;continue;}
   }
   if((text[i]==='q'||text[i]==='Q')&&!/[A-Za-z0-9_$]/.test(text[i-1]||'')&&text[i+1]==="'"&&text[i+2]) {
    const delimiter=({'[':']','(':')','{':'}','<':'>'})[text[i+2]]||text[i+2];
    const end=text.indexOf(delimiter+"'",i+3);if(end<0)return original('Unfinished or ambiguous syntax');add(i,end+2);i=end+2;continue;
   }
   if(text[i]==='['){const end=quoted(i,']',false,true);if(end<0)return original('Unfinished or ambiguous syntax');add(i,end);i=end;continue;}
  }
  const ch=text[i];
  if((profile==='java'||profile==='sql')&&(ch==='"'||ch==="'"||(profile==='sql'&&ch==='`'))) {
   const end=quoted(i,ch,true,profile==='sql',profile==='sql');if(end<0)return original('Unfinished or ambiguous syntax');add(i,end);i=end;continue;
  }
  if((profile==='java'&&text.startsWith('//',i))||(profile==='sql'&&text.startsWith('--',i))) {
   if(profile==='sql'&&i+2<text.length&&!/\s/.test(text[i+2]))return original('Unfinished or ambiguous syntax');
   let end=text.indexOf('\n',i);if(end<0)end=text.length;
   // Preserve CR in CRLF inputs, consistent with splitting only physical LF.
   if(text[end-1]==='\r')end--;
   comment(i,end,'lineComment');i=end;continue;
  }
  if((profile==='java'||profile==='sql')&&text.startsWith('/*',i)) {
   // SQL optimizer hints and executable comments are significant SQL.
   const significant=profile==='sql'&&(text[i+2]==='!'||text[i+2]==='+'||text.startsWith('/*M!',i));
   let p=i+2,depth=1;
   while(p<text.length&&depth) {
    if(profile==='sql'&&text.startsWith('/*',p))return original('Unfinished or ambiguous syntax');
    else if(text.startsWith('*/',p)){depth--;p+=2;}else p++;
   }
   if(depth)return original('Unfinished or ambiguous syntax');
   if(significant)add(i,p);else comment(i,p,profile==='java'&&text.startsWith('/**',i)?'docComment':'blockComment');i=p;continue;
  }
  let matched=false;
  for(const element of custom){
   let end=-1;
   if(element.kind==='pattern'){
    if(text[i]==='\n')continue;
    if(i>=gapEnd){gapStart=i;gapEnd=text.indexOf('\n',i);if(gapEnd<0)gapEnd=text.length;
     for(let p=i+1;p<gapEnd;p++)if(builtinStart(text,p,profile,xmlTag)){gapEnd=p;break;}
    }
    const source=text.slice(gapStart,gapEnd);element.regex.lastIndex=i-gapStart;const match=element.regex.exec(source);
    if(match&&match[0].length===0)return original('Zero-width grammar pattern');
    if(match&&match.index===i-gapStart)end=i+match[0].length;
   }else if(text.startsWith(element.start,i)){
    if(element.kind==='line'){end=text.indexOf('\n',i);if(end<0)end=text.length;if(text[end-1]==='\r')end--;}
    else{let p=i+element.start.length;while(p<text.length){if(element.escape&&text.startsWith(element.escape,p)){p+=element.escape.length;if(p<text.length)p+=text.codePointAt(p)>65535?2:1;continue;}if(text.startsWith(element.end,p)){end=p+element.end.length;break;}p++;}if(end<0)return original('Unfinished custom block: '+element.name);}
   }
   if(end>i){add(i,end,'custom',element.importance,element.name);i=end;matched=true;break;}
  }
  if(matched)continue;
  const width=text.codePointAt(i)>65535?2:1;add(i,i+width,'code');i+=width;
 }
 if(xmlTag)return original('Unfinished XML tag');
 return {spans,fallback:null};
}
function builtinStart(text,i,profile,xmlTag){
 if(profile==='xml')return text.startsWith('<!--',i)||text.startsWith('<![CDATA[',i)||text.startsWith('<?',i)||text.startsWith('<!DOCTYPE',i)||text[i]==='<'||text[i]==='>'||(xmlTag&&(text[i]==='"'||text[i]==="'"));
 if(profile==='plain')return false;
 const c=text[i];return c==='"'||c==="'"||text.startsWith('/*',i)||(profile==='java'&&text.startsWith('//',i))||(profile==='sql'&&(text.startsWith('--',i)||c==='['||c==='`'||c==='$'||c==='#'||((c==='q'||c==='Q')&&text[i+1]==="'")));
}
function prepareTextProfileDetailed(text,profile='plain',grammar){
 const classified=classifyTextProfile(text,profile,grammar);
 const spans=classified.spans.filter(span=>span.importance==='unimportant').map(span=>[span.start,span.end]);
 const lines=text===''?[]:text.split('\n');
 // Build each physical line from spans. A single separating space prevents a
 // discarded comment joining tokens (e.g. int/**/name must not equal intname).
 // XML comments are zero-width, including within mixed text content.
 const keys=[],omit=[];
 let offset=0,span=0;
 for(let line=0;line<lines.length;line++) {
  const source=lines[line],end=offset+source.length;
  let pos=offset,key='',covered=false,pendingBoundary=false;
  const append=segment=>{
   if(!segment)return;
   if(profile!=='xml'&&pendingBoundary&&key&&!/\s/.test(key.at(-1))&&!/\s/.test(segment[0]))key+=' ';
   key+=segment;pendingBoundary=false;
  };
  while(span<spans.length&&spans[span][1]<=offset)span++;
  let s=span;
  while(s<spans.length&&spans[s][0]<=end) {
   const [a,b]=spans[s];
   if(b>offset&&a<end){const start=Math.max(offset,a),stop=Math.min(end,b);append(text.slice(pos,start));pendingBoundary=true;pos=stop;covered=true;}
   // Empty physical lines inside a multiline comment also belong to it.
   if(a<offset&&b>end)covered=true;
   if(b>end)break;s++;
  }
  append(text.slice(pos,end));
  const terminal=line===lines.length-1&&source===''&&text.endsWith('\n');
  const ignored=covered&&/^[ \t\r]*$/.test(key)&&!terminal;
  keys.push(ignored?'':key);omit.push(ignored);
  offset=end+1;
 }
 return {keys,omit,...(classified.fallback?{fallback:classified.fallback}:{})};
}
function prepareTextProfile(text,profile='plain',grammar){const {keys,omit}=prepareTextProfileDetailed(text,profile,grammar);return {keys,omit};}
module.exports={prepareTextProfileDetailed,classifyTextProfile,validateTextProfile,prepareTextProfile,detectTextProfile,resolveTextProfile,validateTextProfileMappings,TEXT_PROFILE_RULES_VERSION};
