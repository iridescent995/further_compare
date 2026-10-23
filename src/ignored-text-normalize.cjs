'use strict';
// Worker-only: callers must enforce an external timeout and terminate the worker.
const {validateIgnoredTextPatterns}=require('./ignored-text-rules.cjs');
const MAX_TEXT=20*1024*1024,MAX_LINES=100000,MAX_MATCHES=200000;
function normalizeIgnoredText(texts,value=[]){
 const rules=validateIgnoredTextPatterns(value);
 if(!Array.isArray(texts)||texts.length>20||Array.from(texts).some(text=>typeof text!=='string'||text.includes('\r')))throw Error('Invalid ignored-text inputs.');
 let length=0,lineCount=0,matches=0;
 const inputs=texts.map(text=>{length+=text.length;if(length>MAX_TEXT)throw Error('Ignored-text input exceeds 20 MiB.');const lines=text===''?[]:text.split('\n');lineCount+=lines.length;if(lineCount>MAX_LINES)throw Error('Ignored-text input exceeds 100,000 lines.');return lines;});
 let patterns;try{patterns=rules.map(rule=>new RegExp(rule.pattern,rule.matchCase?'gu':'giu'));}catch{throw Error('Invalid ignored-text regular expression. Use JavaScript Unicode syntax.');}
 return inputs.map(lines=>lines.map(line=>{
  const spans=[];
  for(const pattern of patterns){pattern.lastIndex=0;let match;
   while((match=pattern.exec(line))!==null){
    if(++matches>MAX_MATCHES)throw Error('Ignored-text patterns matched too many spans. Narrow the patterns.');
    if(match[0].length)spans.push([match.index,match.index+match[0].length]);
    else{const index=pattern.lastIndex;pattern.lastIndex=index+(index<line.length&&line.codePointAt(index)>0xffff?2:1);}
   }
  }
  if(!spans.length)return line;
  spans.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let cursor=0,out='';
  for(const [start,end]of spans){if(start>cursor)out+=line.slice(cursor,start);cursor=Math.max(cursor,end);}return out+line.slice(cursor);
 }));
}
module.exports={normalizeIgnoredText};
