'use strict';
// Derived navigation annotations only. Never changes diff rows or copy authority.
const LIMITS=Object.freeze({text:4*1024*1024,lines:100000,seeds:100000,line:8192,block:2048,pairs:1000,work:16000000,candidates:10000});
function annotateMovedBlocks(a,b,result,{anchors=[],signal,limits={}}={}){
 const empty=reason=>({pairs:[],reason});
 if(typeof a!=='string'||typeof b!=='string'||!result||!Array.isArray(result.rows)||!Array.isArray(result.hunks))throw TypeError('Invalid moved-block comparison.');
 const cap={...LIMITS};for(const key of Object.keys(limits)){if(!Object.hasOwn(cap,key)||!Number.isSafeInteger(limits[key])||limits[key]<1||limits[key]>cap[key])throw TypeError('Invalid moved-block limit.');cap[key]=limits[key];}
 let work=0;const stop=reason=>{throw {movedFallback:reason};};
 const charge=(n=1)=>{if(signal?.aborted)stop('cancelled');work+=n;if(work>cap.work)stop('work limit');};
 try{
  charge();if(a.length+b.length>cap.text)return empty('input size limit');
  const lines=[a===''?[]:a.split('\n'),b===''?[]:b.split('\n')];if(lines[0].length+lines[1].length>cap.lines)return empty('line count limit');
  if(Array.isArray(anchors)&&anchors.length===0)anchors=result.rows.filter(row=>row.anchor&&Number.isInteger(row.ai)&&Number.isInteger(row.bi)).map(row=>({a:row.ai,b:row.bi}));
  if(!Array.isArray(anchors)||anchors.length>1000)throw TypeError('Invalid moved-block anchors.');
  let previous={a:-1,b:-1};for(const anchor of anchors){if(!anchor||!Number.isInteger(anchor.a)||!Number.isInteger(anchor.b)||anchor.a<=previous.a||anchor.b<=previous.b||anchor.a>=lines[0].length||anchor.b>=lines[1].length)throw TypeError('Invalid moved-block anchors.');previous=anchor;}
  const eligible=lines.map(x=>new Uint8Array(x.length)),rowAt=lines.map(x=>new Int32Array(x.length).fill(-1)),partitions=lines.map(x=>new Int32Array(x.length));let next=[0,0];
  for(let r=0;r<result.rows.length;r++){charge();const row=result.rows[r];for(let side=0;side<2;side++){const index=row[side?'bi':'ai'];if(index===null)continue;if(index!==next[side]++||row[side?'b':'a']!==lines[side][index])return empty('comparison changed');rowAt[side][index]=r;
    const terminal=lines[side].length>1&&index===lines[side].length-1&&lines[side][index]==='';
    if(Number.isInteger(row.hunk)&&result.hunks[row.hunk]&&row.type!=='equal'&&!row.minor&&!row.anchor&&!result.hunks[row.hunk].physicalCarrier&&!terminal&&lines[side][index].length<=cap.line)eligible[side][index]=1;
  }}
  if(next.some((n,i)=>n!==lines[i].length))return empty('comparison changed');
  // Explicit anchors partition both sides; row anchor flags remain excluded too.
  for(let side=0;side<2;side++){let p=0;for(let i=0;i<lines[side].length;i++){charge();while(p<anchors.length&&i>anchors[p][side?'b':'a'])p++;partitions[side][i]=p;if(p<anchors.length&&i===anchors[p][side?'b':'a'])eligible[side][i]=0;}}
  // Intern full strings; seed keys are exact line identities, never unchecked hashes.
  const dictionary=new Map();let serial=0;const ids=lines.map(list=>list.map(line=>{charge(line.length+1);if(!dictionary.has(line))dictionary.set(line,++serial);return dictionary.get(line);}));
  const seed=(side,i)=>ids[side][i]+','+ids[side][i+1]+','+ids[side][i+2];
  const full=[new Map(),new Map()],candidate=[new Map(),new Map()];let seeds=0;
  for(let side=0;side<2;side++)for(let i=0;i+2<lines[side].length;i++){charge();if(++seeds>cap.seeds)stop('seed count limit');const key=seed(side,i);if(!full[side].has(key))full[side].set(key,[]);full[side].get(key).push(i);if(eligible[side][i]&&eligible[side][i+1]&&eligible[side][i+2]&&partitions[side][i]===partitions[side][i+2]){if(!candidate[side].has(key))candidate[side].set(key,[]);candidate[side].get(key).push(i);}}
  const found=new Map(),covered=new Map();let attempts=0;
  const match=(x,y)=>{charge();return ids[0][x]===ids[1][y];};
  for(const[key,left]of candidate[0]){const right=candidate[1].get(key);if(!right||left.length>8||right.length>8)continue;for(const ai of left)for(const bi of right){charge();if(++attempts>cap.candidates)stop('candidate limit');if(partitions[0][ai]!==partitions[1][bi])continue;
    const diagonal=bi-ai,old=covered.get(diagonal);if(old&&ai>=old.start&&ai+3<=old.end)continue;
    if(cap.block<3)stop('block size limit');let x=ai,y=bi,endA=ai+3,endB=bi+3;
    while(x>0&&y>0&&eligible[0][x-1]&&eligible[1][y-1]&&partitions[0][x-1]===partitions[0][ai]&&partitions[1][y-1]===partitions[1][bi]&&match(x-1,y-1)){x--;y--;if(endA-x>cap.block)stop('block size limit');}
    while(endA<lines[0].length&&endB<lines[1].length&&eligible[0][endA]&&eligible[1][endB]&&partitions[0][endA]===partitions[0][ai]&&partitions[1][endB]===partitions[1][bi]&&match(endA,endB)){endA++;endB++;if(endA-x>cap.block)stop('block size limit');}
    covered.set(diagonal,{start:x,end:endA});const count=endA-x;let significant=0,nonblank=0,sameRows=true;
    for(let i=0;i<count;i++){charge(lines[0][x+i].length+1);const n=lines[0][x+i].replace(/\s/gu,'').length;significant+=n;if(n)nonblank++;if(rowAt[0][x+i]!==rowAt[1][y+i])sameRows=false;}
    if(sameRows||nonblank<2||significant<24)continue;
    found.set(x+':'+y+':'+count,{aStart:x,bStart:y,lineCount:count});if(found.size>cap.pairs)stop('pair count limit');
  }}
  const unique=[];
  for(const pair of found.values()){
   const key=seed(0,pair.aStart);let qualifies=true;
   for(let side=0;side<2&&qualifies;side++){let count=0;for(const start of full[side].get(key)||[]){charge();if(start+pair.lineCount>ids[side].length)continue;let equal=true;for(let j=0;j<pair.lineCount;j++){charge();if(ids[0][pair.aStart+j]!==ids[side][start+j]){equal=false;break;}}if(equal&&++count>1){qualifies=false;break;}}if(count!==1)qualifies=false;}
   if(qualifies)unique.push(pair);
  }
  // Ambiguous overlapping candidates are all omitted, never greedily assigned.
  const rejected=new Set();for(let i=0;i<unique.length;i++)for(let j=i+1;j<unique.length;j++){charge();const p=unique[i],q=unique[j];if(['aStart','bStart'].some(key=>p[key]<q[key]+q.lineCount&&q[key]<p[key]+p.lineCount)){rejected.add(i);rejected.add(j);}}
  const pairs=unique.filter((_,i)=>!rejected.has(i)).sort((p,q)=>p.aStart-q.aStart||p.bStart-q.bStart).map((p,i)=>({id:'move-'+i,...p}));return {pairs,reason:null};
 }catch(error){if(error?.movedFallback)return empty(error.movedFallback);throw error;}
}
module.exports={annotateMovedBlocks,MOVED_BLOCK_LIMITS:LIMITS};
