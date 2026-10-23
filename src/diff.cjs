const {validateIgnoreBlankLines,blankLineMask,isBlankLine,terminalNewlineIndex}=require('./text-blank-lines.cjs');
const {validateWhitespaceScope,normalizeWhitespace}=require('./text-whitespace.cjs');
const {diffArrays} = require('diff');
function lines(text) { return text === '' ? [] : text.split('\n'); }
const physicalTerminalIndex=value=>value.length>1&&value.at(-1)===''?value.length-1:-1;
function validateAnchors(anchors,a,b) {
  if(!Array.isArray(anchors)||anchors.length>1000) throw new Error('Manual alignment must contain at most 1,000 line pairs.');
  const left=lines(a).length,right=lines(b).length;
  let previousA=-1,previousB=-1;
  return Array.from(anchors,anchor=>{
    if(!anchor||typeof anchor!=='object'||!Number.isInteger(anchor.a)||!Number.isInteger(anchor.b)||anchor.a<0||anchor.b<0||anchor.a>=left||anchor.b>=right) throw new Error('Manual alignment lines must exist in both files.');
    if(anchor.a<=previousA||anchor.b<=previousB) throw new Error('Manual alignment pairs must increase in both files without crossing or repeating lines.');
    previousA=anchor.a;previousB=anchor.b;
    return {a:anchor.a,b:anchor.b};
  });
}
function compare(a,b,ignoreWhitespace=false,anchors=[],ignoreCase=false,whitespaceScope='all',ignoreBlankLines=false,preparedKeys) {
  validateWhitespaceScope(whitespaceScope);validateIgnoreBlankLines(ignoreBlankLines);
  const pairs=validateAnchors(anchors,a,b),left=lines(a),right=lines(b);
  if(preparedKeys!==undefined){
    if(!preparedKeys||typeof preparedKeys!=='object'||Array.isArray(preparedKeys)||Object.keys(preparedKeys).some(key=>!['a','b','omitA','omitB'].includes(key)))throw Error('Invalid prepared comparison keys.');
    for(const [side,original]of [['a',left],['b',right]])if(!Array.isArray(preparedKeys[side])||preparedKeys[side].length!==original.length||Array.from(preparedKeys[side]).some((key,i)=>typeof key!=='string'||key.length>original[i].length||key.includes('\n')))throw Error('Prepared comparison keys must retain physical line positions.');
  }
  for(const [side,original]of [['omitA',left],['omitB',right]]){
    const mask=preparedKeys?.[side];
    if(mask!==undefined&&(!Array.isArray(mask)||mask.length!==original.length||Array.from(mask).some(value=>typeof value!=='boolean')||mask[physicalTerminalIndex(original)]===true))throw Error('Prepared omission masks must retain physical lines and the final newline.');
  }
  const omitA=preparedKeys?.omitA??[],omitB=preparedKeys?.omitB??[];
  const omitLines=preparedKeys?.omitA!==undefined||preparedKeys?.omitB!==undefined,filterLines=ignoreBlankLines||omitLines;
  const keyLeft=preparedKeys?.a??left,keyRight=preparedKeys?.b??right;
  const normalize=line=>{const value=ignoreWhitespace?normalizeWhitespace(line,whitespaceScope):line;return ignoreCase?value.toLowerCase():value;};
  const normalizedLeft=ignoreWhitespace||ignoreCase||ignoreBlankLines||preparedKeys?keyLeft.map(normalize):left,normalizedRight=ignoreWhitespace||ignoreCase||ignoreBlankLines||preparedKeys?keyRight.map(normalize):right;
  const terminalIndex=omitLines?physicalTerminalIndex:terminalNewlineIndex;
  const terminalA=filterLines?terminalIndex(left):-1,terminalB=filterLines?terminalIndex(right):-1;
  if(filterLines){for(let i=0;i<normalizedLeft.length;i++)normalizedLeft[i]=JSON.stringify(i===terminalA?['eof']:['line',normalizedLeft[i]]);for(let i=0;i<normalizedRight.length;i++)normalizedRight[i]=JSON.stringify(i===terminalB?['eof']:['line',normalizedRight[i]]);}
  const blankA=ignoreBlankLines?blankLineMask(left):[],blankB=ignoreBlankLines?blankLineMask(right):[];
  const skipA=left.map((_,i)=>i!==terminalA&&(blankA[i]||omitA[i])),skipB=right.map((_,i)=>i!==terminalB&&(blankB[i]||omitB[i]));
  const deadline=Date.now()+2500;
  let ai=0,bi=0; const rows=[],hunks=[];
  function equal(anchor=false) {
    const row={a:left[ai],b:right[bi],ai:ai++,bi:bi++,type:'equal'};
    if(row.a!==row.b)row.minor=true;
    if(anchor)row.anchor=true;
    rows.push(row);
  }
  function changed(aCount,bCount,anchor=false) {
    const previous=hunks.at(-1),extend=filterLines&&!anchor&&!rows.at(-1)?.anchor&&previous&&rows.at(-1)?.hunk===hunks.length-1&&previous.aStart+previous.aCount===ai&&previous.bStart+previous.bCount===bi;
    const id=extend?hunks.length-1:hunks.length;
    if(extend){previous.aCount+=aCount;previous.bCount+=bCount;}else hunks.push({aStart:ai,bStart:bi,aCount,bCount,row:rows.length,...(ignoreBlankLines?{ignoreBlankLines:true}:{}),...(omitLines?{omitLines:true}:{})});
    for(let j=0;j<Math.max(aCount,bCount);j++) {
      const row={a:j<aCount?left[ai+j]:null,b:j<bCount?right[bi+j]:null,ai:j<aCount?ai+j:null,bi:j<bCount?bi+j:null,type:aCount&&bCount?'changed':aCount?'removed':'added',hunk:id};
      if(anchor)row.anchor=true;
      rows.push(row);
    }
    ai+=aCount;bi+=bCount;
  }
  function segment(endA,endB) {
    const remaining=deadline-Date.now();
    if(remaining<=0)throw new Error('These files have too many differences. Compare smaller sections.');
    const indexesA=filterLines?Array.from({length:endA-ai},(_,i)=>ai+i).filter(i=>!skipA[i]):null,indexesB=filterLines?Array.from({length:endB-bi},(_,i)=>bi+i).filter(i=>!skipB[i]):null;
    let positionA=0,positionB=0;
    const skipped=(stopA,stopB)=>{while(ai<stopA||bi<stopB){const hasA=ai<stopA,hasB=bi<stopB,a=hasA?left[ai]:null,b=hasB?right[bi]:null;rows.push({a,b,ai:hasA?ai++:null,bi:hasB?bi++:null,type:'equal',...(a!==b?{minor:true}:{})});}};
    const beforeNext=()=>skipped(indexesA[positionA]??endA,indexesB[positionB]??endB);
    const changes=diffArrays(filterLines?indexesA.map(i=>normalizedLeft[i]):normalizedLeft.slice(ai,endA),filterLines?indexesB.map(i=>normalizedRight[i]):normalizedRight.slice(bi,endB),{timeout:remaining,maxEditLength:12000});
    if(!changes)throw new Error('These files have too many differences. Compare smaller sections.');
    for(let i=0;i<changes.length;i++) {
      const change=changes[i];
      if(!change.added&&!change.removed){for(let j=0;j<change.count;j++){if(filterLines)beforeNext();equal();positionA++;positionB++;}continue;}
      let aCount=0,bCount=0;
      while(i<changes.length&&(changes[i].added||changes[i].removed)) {
        if(changes[i].removed)aCount+=changes[i].count;else bCount+=changes[i].count;
        i++;
      }
      i--;
      if(filterLines){
        // EOF newline is a structural edit after substantive lines, never a
        // replacement for one of them inside a mixed run.
        const eofA=aCount>0&&indexesA[positionA+aCount-1]===terminalA,eofB=bCount>0&&indexesB[positionB+bCount-1]===terminalB;
        const contentA=aCount-Number(eofA),contentB=bCount-Number(eofB);
        for(let j=0;j<Math.max(contentA,contentB);j++){beforeNext();const hasA=j<contentA,hasB=j<contentB;changed(hasA?1:0,hasB?1:0);if(hasA)positionA++;if(hasB)positionB++;}
        if(eofA||eofB){beforeNext();changed(Number(eofA),Number(eofB));positionA+=Number(eofA);positionB+=Number(eofB);}
      }else changed(aCount,bCount);
    }
    if(filterLines)skipped(endA,endB);
  }
  for(const pair of pairs) {
    segment(pair.a,pair.b);
    // Manual anchors expose a suppressed/significant pair as a physical change.
    if(filterLines&&Boolean(skipA[ai])!==Boolean(skipB[bi]))changed(1,1,true);
    else if(filterLines&&skipA[ai]&&skipB[bi])equal(true);
    else if(normalizedLeft[ai]===normalizedRight[bi])equal(true);
    else changed(1,1,true);
  }
  segment(left.length,right.length);
  // A comment-only newline-terminated file has no significant physical carrier
  // for its EOF. Copying that sentinel alone creates an extra blank line, whose
  // removal recreates the EOF difference. Expose the complete physical change
  // as one atomic hunk, including its comment carrier, rather than copying any
  // hidden text outside a selected hunk. Existing aligned rows/anchors survive.
  const needsCarrier=(original,skip,terminal)=>terminal>=0&&original.some((line,i)=>i!==terminal&&!isBlankLine(line)&&skip[i])&&original.every((_,i)=>i===terminal||skip[i]);
  if(omitLines&&hunks.length&&(needsCarrier(left,skipA,terminalA)||needsCarrier(right,skipB,terminalB))){
    hunks.splice(0,hunks.length,{aStart:0,bStart:0,aCount:left.length,bCount:right.length,row:0,omitLines:true,...(ignoreBlankLines?{ignoreBlankLines:true}:{}),physicalCarrier:true});
    for(const row of rows){row.type=row.ai===null?'added':row.bi===null?'removed':'changed';row.hunk=0;delete row.minor;}
  }
  return {rows,hunks,ignoredLineCount:rows.reduce((count,row)=>count+(row.minor?1:0),0),added:hunks.reduce((n,h)=>n+h.bCount,0),removed:hunks.reduce((n,h)=>n+h.aCount,0)};
}
function merge(a,b,h,from) {
  const source=lines(from==='a'?a:b), target=lines(from==='a'?b:a);
  const s=from==='a'?'a':'b', t=from==='a'?'b':'a';
  const terminalIndex=h.omitLines===true?physicalTerminalIndex:terminalNewlineIndex;
  const targetTerminal=terminalIndex(target),sourceTerminal=terminalIndex(source);
  const filtered=h.ignoreBlankLines===true||h.omitLines===true;
  const consumesTerminal=filtered&&targetTerminal>=h[t+'Start']&&targetTerminal<h[t+'Start']+h[t+'Count'];
  const suppliesTerminal=sourceTerminal>=h[s+'Start']&&sourceTerminal<h[s+'Start']+h[s+'Count'];
  const removesTail=h.ignoreBlankLines===true&&sourceTerminal===-1&&targetTerminal===-1&&source.slice(h[s+'Start']+h[s+'Count']).every(isBlankLine)&&target.slice(h[t+'Start']+h[t+'Count']).every(isBlankLine);
  target.splice(h[t+'Start'],h[t+'Count'],...source.slice(h[s+'Start'],h[s+'Start']+h[s+'Count']));
  // Removing EOF newline also removes empty trailing separators. Keeping them
  // would immediately recreate the same final-newline difference. Spaces/tabs
  // payload and all internal blank lines are preserved.
  if(consumesTerminal&&!suppliesTerminal||removesTail)while(target.at(-1)==='')target.pop();
  // A standalone empty physical line needs a separator to survive joining and
  // re-splitting. Recomputed grammar hunks can then fill any pending content.
  if(filtered&&(suppliesTerminal||h.omitLines===true&&h[s+'Count']>0)&&target.length===1&&target[0]==='')target.push('');
  return target.join('\n');
}
// Copy selected physical source lines through the existing alignment. Unselected
// destination rows (including destination-only gaps) remain untouched.
function mergeLines(a,b,rows,from,selected) {
  if(!['a','b'].includes(from)||!Array.isArray(rows)||!Array.isArray(selected))throw Error('Invalid line selection.');
  const source=lines(from==='a'?a:b),target=lines(from==='a'?b:a),to=from==='a'?'b':'a',picked=new Set(selected);
  if([...picked].some(i=>!Number.isInteger(i)||i<0||i>=source.length))throw Error('The selected lines changed. Select them again.');
  const output=[];let sourceIndex=0,targetIndex=0;
  for(const row of rows){
    const si=row[from+'i'],ti=row[to+'i'];
    if(si!==null&&(si!==sourceIndex++||row[from]!==source[si]))throw Error('The source changed. Compare it again.');
    if(ti!==null&&(ti!==targetIndex++||row[to]!==target[ti]))throw Error('The destination changed. Compare it again.');
    if(si!==null&&picked.has(si))output.push(source[si]);else if(ti!==null)output.push(target[ti]);
  }
  if(sourceIndex!==source.length||targetIndex!==target.length)throw Error('The comparison changed. Compare it again.');
  return output.join('\n');
}
module.exports={compare,merge,mergeLines,validateAnchors};
