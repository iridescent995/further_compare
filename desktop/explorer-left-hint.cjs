'use strict';
// Advisory display metadata only. Never publish a selected filesystem path.
const MAX_NAME_UNITS=96;
function displayName(value,kind){
 if(typeof value!=='string')throw new TypeError('Left selection needs a display name.');
 const leaf=value.split(/[\\/]/u).filter(Boolean).at(-1)||'';
 let name=leaf.replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u206f]/gu,' ').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu,'\uFFFD').trim();
 if(!name)name=kind==='folder'?'Selected folder':'Selected file';
 if(name.length>MAX_NAME_UNITS){let end=MAX_NAME_UNITS-1;if(/[\uD800-\uDBFF]/u.test(name[end-1]))end--;name=name.slice(0,end)+'…';}
 return name;
}
function encodeLeftHint(state){
 if(!state||typeof state!=='object'||typeof state.available!=='boolean')throw new TypeError('Invalid left-selection hint.');
 let kind=0,name='';
 if(state.left!=null){if(!['file','folder'].includes(state.left.kind))throw new TypeError('Invalid left-selection kind.');kind=state.left.kind==='file'?1:2;name=displayName(state.left.name,state.left.kind);}
 else if(state.available)throw new TypeError('An empty left selection cannot be available.');
 const output=Buffer.alloc(10+name.length*2);output.write('FCLH',0,'ascii');output.writeUInt16LE(1,4);output[6]=kind;output[7]=state.available?1:0;output.writeUInt16LE(name.length,8);output.write(name,10,'utf16le');return output;
}
// The caller supplies an owned, installation-validated registry transport.
// Serialize publication so a slow previous write cannot overwrite a new hint.
// Snapshot before queuing; a failed publication must not poison later updates.
function createLeftHintPublisher(write){
 if(typeof write!=='function')throw new TypeError('A hint transport is required.');
 let tail=Promise.resolve();
 return state=>{const bytes=encodeLeftHint(state);const result=tail.then(()=>write(Buffer.from(bytes)));tail=result.catch(()=>{});return result;};
}
module.exports={encodeLeftHint,createLeftHintPublisher};
