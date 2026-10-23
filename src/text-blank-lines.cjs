'use strict';
function validateIgnoreBlankLines(value=false){if(typeof value!=='boolean')throw Error('Ignore blank lines must be boolean.');return value;}
const isBlankLine=line=>/^[ \t]*$/.test(line);
function terminalNewlineIndex(lines){return lines.length&&lines.at(-1)===''&&lines.some(line=>!isBlankLine(line))?lines.length-1:-1;}
function blankLineMask(lines){
 const terminal=terminalNewlineIndex(lines);
 return lines.map((line,index)=>isBlankLine(line)&&index!==terminal);
}
// JSON preserves empty normalized significant lines and the terminal newline
// sentinel, avoiding the collisions of joining a filtered sequence with '\n'.
function blankLineComparisonKey(text,normalize=line=>line){
 const lines=text===''?[]:text.split('\n'),mask=blankLineMask(lines);
 const terminal=terminalNewlineIndex(lines);
 return JSON.stringify([lines.flatMap((line,index)=>!mask[index]&&index!==terminal?[normalize(line,index)]:[]),terminal!==-1]);
}
module.exports={validateIgnoreBlankLines,isBlankLine,terminalNewlineIndex,blankLineMask,blankLineComparisonKey};
