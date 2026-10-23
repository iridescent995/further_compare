'use strict';
const {diffArrays}=require('diff');
const ENDINGS={lf:'\n',crlf:'\r\n',cr:'\r'};
const MAX_LINES=150000,MAX_EDIT_LENGTH=5000;
function tokenize(text){
 const rows=[];let start=0;const pattern=/\r\n|\r|\n/g;let match;
 while((match=pattern.exec(text))){rows.push({text:text.slice(start,match.index),eol:match[0]});start=match.index+match[0].length;}
 if(start<text.length)rows.push({text:text.slice(start),eol:''});return rows;
}
function dominantEol(raw){
 if(typeof raw!=='string')throw new TypeError('Text must be a string.');
 const counts=new Map();for(const match of raw.matchAll(/\r\n|\r|\n/g))counts.set(match[0],(counts.get(match[0])||0)+1);
 let selected='\n',largest=0;for(const [ending,count]of counts)if(count>largest){selected=ending;largest=count;}return selected;
}
function normalized(text){return text.replace(/\r\n|\r/g,'\n');}
function complexityError(){return new Error('This edit is too complex to preserve the original line endings. Choose LF, CRLF, or CR explicitly to convert line endings, then retry.');}
function projectText(raw,edited,eol='preserve'){
 if(typeof raw!=='string'||typeof edited!=='string')throw new TypeError('Text must be a string.');
 if(eol!=='preserve'&&!Object.hasOwn(ENDINGS,eol))throw new Error('Choose preserve, LF, CRLF, or CR line endings.');
 const view=normalized(edited);
 if(eol!=='preserve')return view.replace(/\n/g,ENDINGS[eol]);
 // An untouched textarea must reproduce even mixed CRLF/CR/LF exactly.
 if(normalized(raw)===view)return raw;
 if(view==='')return '';
 // Uniform source separators need no alignment: every surviving or inserted
 // boundary uses the same value. This also covers large first-time pastes.
 const endings=new Set(raw.match(/\r\n|\r|\n/g)||[]);
 if(endings.size<=1){const separator=endings.values().next().value||'\n';return view.replace(/\n/g,separator);}
 const original=tokenize(raw),next=tokenize(view);
 if(original.length>MAX_LINES||next.length>MAX_LINES)throw complexityError();
 const changes=diffArrays(original.map(row=>row.text),next.map(row=>row.text),{timeout:150,maxEditLength:MAX_EDIT_LENGTH});
 if(!changes)throw complexityError();
 const fallback=dominantEol(raw),output=[];let oldIndex=0,newIndex=0;
 for(const change of changes){
  if(change.removed){oldIndex+=change.count;continue;}
  for(let i=0;i<change.count;i++){
   const incoming=next[newIndex++];
   const ending=change.added?fallback:(original[oldIndex++].eol||fallback);
   // Textarea final-newline state is authoritative; no trailing sentinel row is
   // introduced, so adding/removing a final newline does not duplicate lines.
   const needsEnding=newIndex<next.length||incoming.eol!=='';
   output.push(incoming.text+(needsEnding?ending:''));
  }
 }
 return output.join('');
}
module.exports={projectText,dominantEol};
