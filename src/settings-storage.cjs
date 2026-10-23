'use strict';
const KEYS=['further-compare.display.v1','further-compare.folder-columns.v1'];
function persistAppearance(storage,{display,folderColumns}){
 const before=KEYS.map(key=>storage.getItem(key));
 const rollback=()=>{const errors=[];for(let i=0;i<KEYS.length;i++){try{if(before[i]===null)storage.removeItem(KEYS[i]);else storage.setItem(KEYS[i],before[i]);}catch(error){errors.push(error.message);}}if(errors.length)throw Error('Could not restore previous preferences: '+errors.join('; '));};
 try{[display,folderColumns].forEach((value,i)=>storage.setItem(KEYS[i],JSON.stringify(value)));}
 catch(error){try{rollback();}catch(restoreError){throw Error(error.message+' '+restoreError.message);}throw error;}
 return rollback;
}
module.exports={persistAppearance};
