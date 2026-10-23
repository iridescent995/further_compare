'use strict';
// Rows are immutable and shared across revisions; editing a cell copies one row.
const retainedRows=new WeakSet(),retainedTables=new WeakSet();
const snapshot = rows => {
 if(rows==null)return null;
 if(!Array.isArray(rows))throw new TypeError('Table result must contain rows.');
 if(retainedTables.has(rows))return rows;
 const result=rows.map(row=>{
  if(!Array.isArray(row))throw new TypeError('Table rows must be arrays.');
  if(retainedRows.has(row))return row;
  const copy=row.map(value=>{if(value!==null&&typeof value!=='string'&&typeof value!=='boolean'&&!(typeof value==='number'&&Number.isFinite(value)))throw new TypeError('Table cells must contain literal values.');return value;});
  Object.freeze(copy);retainedRows.add(copy);return copy;
 });
 Object.freeze(result);retainedTables.add(result);return result;
};
const same = (a,b) => a === b || a != null && b != null && a.length === b.length && a.every((row,i)=>row === b[i] || row.length === b[i].length && row.every((v,j)=>v === b[i][j]));
class TableEditHistory {
 #undo=[]; #redo=[]; #group=null; #tokens=new WeakMap(); #maxEntries; #maxBytes;
 constructor({maxEntries=100,maxBytes=32*1024*1024}={}) {
  if(!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>100||!Number.isInteger(maxBytes)||maxBytes<0||maxBytes>32*1024*1024)throw new RangeError('Invalid table history limits.');
  this.#maxEntries=maxEntries;this.#maxBytes=maxBytes;
 }
 get canUndo(){return this.#undo.length>0;} get canRedo(){return this.#redo.length>0;}
 flush(){this.#group=null;}
 clear(){this.#undo=[];this.#redo=[];this.flush();}
 #trim(other,active){
  const size=()=>{const seen=new Set();let total=0;for(const rows of [...other,...active])if(rows){total+=rows.length*8;for(const row of rows)if(!seen.has(row)){seen.add(row);total+=row.length*8;for(const cell of row)total+=String(cell??'').length*2;}}return total;};
  while(other.length+active.length>this.#maxEntries||size()>this.#maxBytes){if(!other.length&&!active.length)break;(other.length?other:active).shift();}
 }
 apply(current,next,group=null){
  const before=snapshot(current),after=snapshot(next);
  if(same(before,after))return current;
  if(group===null||group!==this.#group){this.#undo.push(before);this.#redo=[];this.#trim(this.#redo,this.#undo);}
  this.#group=group;return after;
 }
 #move(current,from,to){this.flush();if(!from.length)return current;const retained=snapshot(current),next=from.pop();to.push(retained);this.#trim(from,to);return next;}
 undo(current){return this.#move(current,this.#undo,this.#redo);}
 redo(current){return this.#move(current,this.#redo,this.#undo);}
 capture(){this.flush();const token=Object.freeze({});this.#tokens.set(token,{undo:this.#undo.slice(),redo:this.#redo.slice()});return token;}
 restore(token){const value=token&&typeof token==='object'?this.#tokens.get(token):null;if(!value)return false;this.#undo=value.undo.slice();this.#redo=value.redo.slice();this.flush();return true;}
}
module.exports={TableEditHistory};
