'use strict';

const {classifyTextProfile,validateTextProfile}=require('./text-profile.cjs');
const SYNTAX_ALIGNMENT_VERSION=1;
const MAX_TEXT=4*1024*1024,MAX_RUN=2048,MAX_LINE=8192,MAX_TOKENS=256;
const split=text=>text===''?[]:text.split('\n');
// Identifiers are consumed before numbers, so digits in names never become
// literal placeholders. Operators stay tokens: `a < < b` is not `a << b`.
const tokenPattern=/[\p{ID_Start}_$][\p{ID_Continue}$]*|(?:0[xX][0-9a-fA-F_]+(?:\.[0-9a-fA-F_]*)?(?:[pP][+-]?[0-9_]+)?[fFdDlL]?|0[bB][01_]+[lL]?|(?:[0-9][0-9_]*(?:\.[0-9_]*)?|\.[0-9][0-9_]*)(?:[eE][+-]?[0-9_]+)?[fFdDlL]?)|>>>=|===|!==|>>>|<<=|>>=|->|::|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<|>>|<>|\|\||[^\s]/gu;
const identifier=/^[\p{ID_Start}_$]/u;

function signatures(text,lines,classified,profile,wanted){
 const keys=new Array(lines.length).fill(null);let offset=0,spanIndex=0;
 for(let line=0;line<lines.length;line++){
  const end=offset+lines[line].length;
  while(spanIndex<classified.spans.length&&classified.spans[spanIndex].end<=offset)spanIndex++;
  if(wanted.has(line)&&lines[line].length<=MAX_LINE){
   const tokens=[];let meaningful=false,unsupported=false;
   for(let s=spanIndex;s<classified.spans.length&&classified.spans[s].start<end;s++){
    const span=classified.spans[s],start=Math.max(offset,span.start),stop=Math.min(end,span.end);
    if(stop<=start)continue;
    if(span.type==='custom'){unsupported=true;break;}
    if(span.type!=='code'&&span.type!=='protected')continue; // Lexical comments, not strings that resemble comments.
    if(span.type==='protected'){
     if(span.start<offset||span.end>end){unsupported=true;break;}
     const value=text.slice(start,stop);
     if(profile==='xml'&&(value.startsWith('<!')||value.startsWith('<?'))){unsupported=true;break;}
     const quotedIdentifier=profile==='sql'&&['"','`','['].includes(value[0]);
     // Optimizer hints and executable SQL comments are protected executable
     // syntax, not string literals. Their entire contents retain identity.
     const executableComment=profile==='sql'&&value.startsWith('/*');
     tokens.push(quotedIdentifier?['identifier',value]:executableComment?['protected',value]:['literal',value[0]==="'"&&profile==='java'?'character':'string']);
     if(quotedIdentifier)meaningful=true;
    }else{
     tokenPattern.lastIndex=0;
     for(const match of text.slice(start,stop).matchAll(tokenPattern)){
      const value=match[0],isIdentifier=identifier.test(value);
      if(isIdentifier)meaningful=true;
      // XML character data is significant; only actual quoted attributes are
      // abstracted above. Java and SQL numeric literals are lexical tokens.
      tokens.push(profile!=='xml'&&!isIdentifier&&/^(?:\d|\.\d)/.test(value)?['literal','number']:['token',value]);
      if(tokens.length>MAX_TOKENS){unsupported=true;break;}
     }
    }
    if(unsupported||tokens.length>MAX_TOKENS){unsupported=true;break;}
   }
   if(!unsupported&&meaningful&&tokens.length)keys[line]=JSON.stringify(tokens);
  }
  offset=end+1;
 }
 return keys;
}

// Unique lexical signatures are candidate pairs, not equality claims. A longest
// increasing subsequence keeps them monotonic; moved statements never cross.
function monotonicPairs(left,right,keysA,keysB){
 const occurrences=(indexes,keys)=>{const map=new Map();for(let i=0;i<indexes.length;i++){const key=keys[indexes[i]];if(key!==null)map.set(key,map.has(key)?-1:i);}return map;};
 const a=occurrences(left,keysA),b=occurrences(right,keysB),candidates=[];
 for(let i=0;i<left.length;i++){const key=keysA[left[i]],j=b.get(key);if(key!==null&&a.get(key)===i&&j!==undefined&&j>=0)candidates.push({a:i,b:j});}
 const tails=[],previous=new Int32Array(candidates.length).fill(-1);
 for(let i=0;i<candidates.length;i++){
  let lo=0,hi=tails.length;while(lo<hi){const mid=(lo+hi)>>>1;if(candidates[tails[mid]].b<candidates[i].b)lo=mid+1;else hi=mid;}
  if(lo)previous[i]=tails[lo-1];tails[lo]=i;
 }
 const pairs=[];for(let i=tails.at(-1);i!==undefined&&i>=0;i=previous[i])pairs.push(candidates[i]);
 return pairs.reverse();
}

function alignSyntaxRows(result,a,b,profile='plain',grammar){
 validateTextProfile(profile);if(profile==='auto')throw Error('Resolve the text profile before aligning code structure.');
 if(typeof a!=='string'||typeof b!=='string'||!result||!Array.isArray(result.rows)||!Array.isArray(result.hunks))throw Error('Invalid syntax alignment input.');
 const metadata={version:SYNTAX_ALIGNMENT_VERSION,profile,runs:0,alignedRuns:0,pairedLines:0,fallbackRuns:0,fallbackReason:null};
 const unchanged=reason=>({...result,syntaxAlignment:{...metadata,fallbackReason:reason}});
 if(profile==='plain')return unchanged('Choose Java, XML, or SQL to align code structure.');
 if(a.length+b.length>MAX_TEXT)return unchanged('Code structure alignment is limited to 4,194,304 characters.');
 const classified=[classifyTextProfile(a,profile,grammar),classifyTextProfile(b,profile,grammar)];
 if(classified.some(item=>item.fallback))return unchanged(classified.find(item=>item.fallback).fallback);
 const left=split(a),right=split(b),terminalA=a.endsWith('\n')?left.length-1:-1,terminalB=b.endsWith('\n')?right.length-1:-1;
 let ai=0,bi=0;
 for(const row of result.rows){
  if(row.ai!==null&&(row.ai!==ai++||row.a!==left[row.ai])||row.bi!==null&&(row.bi!==bi++||row.b!==right[row.bi]))throw Error('The comparison changed. Compare it again.');
 }
 if(ai!==left.length||bi!==right.length)throw Error('The comparison changed. Compare it again.');
 const eligible=row=>row.hunk!==undefined&&row.type!=='equal'&&!row.minor&&!row.anchor&&row.ai!==terminalA&&row.bi!==terminalB&&!result.hunks[row.hunk]?.physicalCarrier;
 const wantedA=new Set(),wantedB=new Set();
 for(const row of result.rows)if(eligible(row)){if(row.ai!==null)wantedA.add(row.ai);if(row.bi!==null)wantedB.add(row.bi);}
 const keysA=signatures(a,left,classified[0],profile,wantedA),keysB=signatures(b,right,classified[1],profile,wantedB),rows=[];
 for(let start=0;start<result.rows.length;){
  const first=result.rows[start];if(!eligible(first)){rows.push(first);start++;continue;}
  let end=start+1;while(end<result.rows.length&&eligible(result.rows[end])&&result.rows[end].hunk===first.hunk)end++;
  const original=result.rows.slice(start,end),indexesA=original.flatMap(row=>row.ai===null?[]:[row.ai]),indexesB=original.flatMap(row=>row.bi===null?[]:[row.bi]);
  metadata.runs++;
  if(!indexesA.length||!indexesB.length){rows.push(...original);start=end;continue;}
  if(indexesA.length>MAX_RUN||indexesB.length>MAX_RUN){rows.push(...original);metadata.fallbackRuns++;start=end;continue;}
  const pairs=monotonicPairs(indexesA,indexesB,keysA,keysB);
  if(!pairs.length){rows.push(...original);metadata.fallbackRuns++;start=end;continue;}
  metadata.pairedLines+=pairs.length;
  const aligned=[];let nextA=0,nextB=0;
  const emit=(ai,bi)=>aligned.push({a:ai===null?null:left[ai],b:bi===null?null:right[bi],ai,bi,type:ai===null?'added':bi===null?'removed':'changed',hunk:first.hunk});
  const gap=(stopA,stopB)=>{while(nextA<stopA||nextB<stopB)emit(nextA<stopA?indexesA[nextA++]:null,nextB<stopB?indexesB[nextB++]:null);};
  for(const pair of pairs){gap(pair.a,pair.b);emit(indexesA[nextA++],indexesB[nextB++]);}
  gap(indexesA.length,indexesB.length);
  const changed=aligned.length!==original.length||aligned.some((row,i)=>row.ai!==original[i].ai||row.bi!==original[i].bi);
  rows.push(...(changed?aligned:original));if(changed)metadata.alignedRuns++;
  start=end;
 }
 const hunks=result.hunks.map(h=>({...h})),seen=new Set();
 rows.forEach((row,i)=>{if(row.hunk!==undefined&&!seen.has(row.hunk)){hunks[row.hunk].row=i;seen.add(row.hunk);}});
 return {...result,rows,hunks,syntaxAlignment:metadata};
}

module.exports={alignSyntaxRows,SYNTAX_ALIGNMENT_VERSION};
