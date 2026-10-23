'use strict';
const LIMIT=10*1024*1024;
function substitute(replacement,match,text){return replacement.replace(/\$(\$|&|`|'|<[^>]*>|\d{1,2})/g,(token,key)=>{if(key==='$')return '$';if(key==='&')return match[0];if(key==='`')return text.slice(0,match.index);if(key==="'")return text.slice(match.index+match[0].length);if(key[0]==='<')return match.groups?match.groups[key.slice(1,-1)]??'':token;const n=Number(key);if(n>0&&n<match.length)return match[n]??'';if(key.length===2&&Number(key[0])>0&&Number(key[0])<match.length)return (match[Number(key[0])]??'')+key[1];return token;});}
function regexSearch({text,query,matchCase=false,start=0,end=start,operation='scan',replacement='',skipZeroAt=null}){
 if(typeof text!=='string'||text.length>LIMIT||typeof query!=='string'||query.length>65536||typeof replacement!=='string'||replacement.length>LIMIT)throw Error('Search input is too large.');
 const pattern=new RegExp(query,matchCase?'gm':'gmi'),stats={count:0,first:null,last:null,next:null,previous:null,selected:null};let match,cursor=0,length=0,parts=[];
 const append=value=>{length+=value.length;if(length>LIMIT)throw Error('Replacement would exceed the 10 MB text limit.');parts.push(value);};
 while((match=pattern.exec(text))!==null){
  const found={index:match.index,length:match[0].length,ordinal:++stats.count};stats.first??=found;stats.last=found;
  if(stats.next===null&&found.index>=end&&!(found.length===0&&found.index===skipZeroAt))stats.next=found;
  if(found.index<start)stats.previous=found;
  if(found.index===start&&found.index+found.length===end)stats.selected={...found,replacement:operation==='replace-current'?substitute(replacement,match,text):null};
  if(operation==='replace-all'){if(stats.count>200000)throw Error('Too many replacements. Narrow the expression.');append(text.slice(cursor,match.index));append(substitute(replacement,match,text));cursor=match.index+match[0].length;}
  if(match[0].length===0)pattern.lastIndex++;
 }
 if(operation==='replace-all'){append(text.slice(cursor));stats.output=parts.join('');}
 if(operation==='replace-current'&&stats.selected){const value=stats.selected.replacement;if(text.length-(end-start)+value.length>LIMIT)throw Error('Replacement would exceed the 10 MB text limit.');stats.output=text.slice(0,start)+value+text.slice(end);}
 return stats;
}
module.exports={regexSearch};
