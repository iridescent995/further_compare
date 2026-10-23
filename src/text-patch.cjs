'use strict';
const {createTwoFilesPatch}=require('diff');
const MAX_PATCH_TEXT_BYTES=10*1024*1024;
const MAX_PATCH_LINES=50000;
function validateUnicode(value){
 for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw Error('Patch text contains an unpaired Unicode surrogate and cannot be exported losslessly.');}else if(code>=0xdc00&&code<=0xdfff)throw Error('Patch text contains an unpaired Unicode surrogate and cannot be exported losslessly.');}
}
function validateText(value){
 if(typeof value!=='string'||value.length>MAX_PATCH_TEXT_BYTES||new TextEncoder().encode(value).byteLength>MAX_PATCH_TEXT_BYTES)throw Error('Patch inputs must be text no larger than 10 MB per side.');
 validateUnicode(value);
 let lines=value.length?1:0;
 for(let i=0;i<value.length;i++)if(value[i]==='\n'||value[i]==='\r'){if(value[i]==='\r'&&value[i+1]==='\n')i++;if(i+1<value.length&&++lines>MAX_PATCH_LINES)throw Error('Patch inputs must contain no more than 50,000 lines per side.');}
}
function patchName(value,side){
 if(value===undefined||value===null||value==='')return side+'/untitled.txt';
 if(typeof value!=='string'||value.length>32768)throw Error('Invalid patch filename.');
 validateUnicode(value);
 // Headers describe files without exposing local directories or permitting extra
 // patch headers. Remove control characters, including invisible direction marks.
 let name=value.split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim();
 if(!name||name==='.'||name==='..')name='untitled.txt';
 name=Array.from(name).slice(0,200).join('');
 return side+'/'+name;
}
function createTextPatch({left,right,leftName,rightName,context=3}={}){
 validateText(left);validateText(right);
 if(!Number.isInteger(context)||context<0||context>100)throw Error('Patch context must be a whole number from 0 to 100.');
 const oldName=patchName(leftName,'left'),newName=patchName(rightName,'right');
 if(left===right)return '';
 // Patches always describe the exact inputs, irrespective of display comparison
 // rules. Keep CRLF and missing final newline markers supplied by the library.
 const patch=createTwoFilesPatch(oldName,newName,left,right,undefined,undefined,{context,timeout:2500,maxEditLength:12000});
 if(typeof patch!=='string')throw Error('Patch generation exceeded its complexity or time limit. Try a smaller comparison.');
 return patch;
}
module.exports={createTextPatch,MAX_PATCH_TEXT_BYTES,MAX_PATCH_LINES};
