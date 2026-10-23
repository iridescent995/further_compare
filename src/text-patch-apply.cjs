'use strict';
const {parsePatch,applyPatch,reversePatch}=require('diff');
const MAX_PATCH_BYTES=32*1024*1024,MAX_TEXT_BYTES=10*1024*1024,MAX_TEXT_LINES=50000;
const MAX_RECORDS=256,MAX_HUNKS=10000,MAX_PATCH_LINES=250000;
function validateString(value,limit,label){
 if(typeof value!=='string'||value.length>limit||value.includes('\0'))throw Error(`Invalid ${label}: expected bounded text without NUL characters.`);
 for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw Error(`Invalid ${label}: unpaired Unicode surrogate.`);}else if(code>=0xdc00&&code<=0xdfff)throw Error(`Invalid ${label}: unpaired Unicode surrogate.`);}
 if(new TextEncoder().encode(value).byteLength>limit)throw Error(`${label} exceeds its size limit.`);
}
function validateText(text){validateString(text,MAX_TEXT_BYTES,'patch input/output');let lines=text.length?1:0;for(let i=0;i<text.length;i++)if(text[i]==='\r'||text[i]==='\n'){if(text[i]==='\r'&&text[i+1]==='\n')i++;if(i+1<text.length&&++lines>MAX_TEXT_LINES)throw Error('Patch input/output exceeds 50,000 lines.');}}
function readPatch(patch){
 validateString(patch,MAX_PATCH_BYTES,'patch');
 const lines=patch.split('\n');if(lines.length>MAX_PATCH_LINES)throw Error('Patch contains too many lines.');
 let i=0,records=0,totalHunks=0,pendingRecord=false;const clean=[];
 const metadata=/^(?:diff --git |index |Index: |={3,}$|new file mode |deleted file mode |old mode |new mode |similarity index |dissimilarity index |rename from |rename to |copy from |copy to )/;
 while(i<lines.length){
  const line=lines[i];if(line===''||metadata.test(line)){if(/^(?:diff --git |Index: )/.test(line)){if(pendingRecord)throw Error('Each patch file record must contain change hunks.');pendingRecord=true;}i++;continue;}
  if(!line.startsWith('--- ')||!lines[i+1]?.startsWith('+++ '))throw Error('Expected unified patch file headers; binary or unsupported patch formats are not accepted.');
  if(++records>MAX_RECORDS)throw Error('Patch contains too many file records.');
  if(!line.slice(4).trim()||!lines[i+1].slice(4).trim())throw Error('Patch file headers require names.');
  pendingRecord=false;clean.push(lines[i++],lines[i++]);let hunks=0,previousOldEnd=0,previousNewEnd=0;
  while(i<lines.length&&lines[i].startsWith('@@')){
   const match=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(lines[i]);if(!match)throw Error('Malformed unified patch hunk header.');
   const oldStart=Number(match[1]),oldCount=match[2]===undefined?1:Number(match[2]),newStart=Number(match[3]),newCount=match[4]===undefined?1:Number(match[4]);
   if([oldStart,newStart,oldCount,newCount].some(n=>!Number.isSafeInteger(n)||n>MAX_TEXT_LINES+1)||oldCount&&oldStart===0||newCount&&newStart===0||oldCount+newCount===0||oldCount&&oldStart+oldCount-1>MAX_TEXT_LINES||newCount&&newStart+newCount-1>MAX_TEXT_LINES)throw Error('Invalid or oversized patch hunk range.');
   const oldPosition=oldStart+(oldCount===0?1:0),newPosition=newStart+(newCount===0?1:0);
   if(oldPosition<previousOldEnd||newPosition<previousNewEnd)throw Error('Patch hunks overlap or are out of order.');
   previousOldEnd=oldPosition+oldCount;previousNewEnd=newPosition+newCount;
   if(++totalHunks>MAX_HUNKS)throw Error('Patch contains too many hunks.');hunks++;clean.push(lines[i++]);
   let oldSeen=0,newSeen=0,previousOperation=null,marked=false,changed=false;
   while(i<lines.length){
    const body=lines[i];
    if(body==='\\ No newline at end of file'){
     if(!previousOperation||marked)throw Error('Invalid patch newline marker.');clean.push(body);marked=true;i++;continue;
    }
    if(oldSeen===oldCount&&newSeen===newCount)break;
    const operation=body[0];if(![' ','+','-'].includes(operation))throw Error('Malformed patch hunk or incorrect line counts.');
    if(operation!=='-')newSeen++;if(operation!=='+')oldSeen++;if(operation!==' ')changed=true;
    if(oldSeen>oldCount||newSeen>newCount)throw Error('Incorrect patch hunk line counts.');
    clean.push(body);previousOperation=operation;marked=false;i++;
   }
   if(oldSeen!==oldCount||newSeen!==newCount||!changed)throw Error('Patch hunk is incomplete or contains no changes.');
  }
  if(!hunks)throw Error('Each patch file record must contain at least one change hunk.');
 }
 if(pendingRecord)throw Error('Each patch file record must contain change hunks.');
 if(!records)throw Error('No unified patch change hunks found.');
 const parsed=parsePatch(clean.join('\n')+'\n');
 if(parsed.length!==records||parsed.some(record=>!record.oldFileName||!record.newFileName||!record.hunks.length||(record.oldFileName==='/dev/null'&&record.newFileName==='/dev/null')))throw Error('Invalid unified patch.');
 return parsed;
}
function inspectTextPatch(patch){return readPatch(patch).map((record,index)=>({index,oldName:record.oldFileName,newName:record.newFileName,hunks:record.hunks.length,added:record.hunks.reduce((sum,h)=>sum+h.lines.filter(line=>line.startsWith('+')).length,0),removed:record.hunks.reduce((sum,h)=>sum+h.lines.filter(line=>line.startsWith('-')).length,0)}));}
function applyTextPatch({text,patch,index=0,reverse=false}={}){
 validateText(text);if(!Number.isInteger(index)||index<0||typeof reverse!=='boolean')throw Error('Choose a valid patch record and direction.');
 const records=readPatch(patch);if(index>=records.length)throw Error('Choose an available patch file record.');
 const selected=reverse?reversePatch(records[index]):records[index];
 if(selected.oldFileName==='/dev/null'&&text!=='')throw Error('A file-creation patch requires empty input text.');
 const result=applyPatch(text,selected,{fuzzFactor:0,autoConvertLineEndings:false});
 if(result===false)throw Error('Patch does not match the current text exactly. No changes were applied.');
 if(selected.newFileName==='/dev/null'&&result!=='')throw Error('A file-deletion patch must remove the entire input text. No changes were applied.');
 validateText(result);return result;
}
module.exports={inspectTextPatch,applyTextPatch,MAX_PATCH_BYTES,MAX_TEXT_BYTES,MAX_TEXT_LINES};
