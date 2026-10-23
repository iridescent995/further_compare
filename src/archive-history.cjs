'use strict';
const LIMIT=100, BYTES=64*1024*1024;
const freeze=history=>Object.freeze({undo:Object.freeze(history.undo),redo:Object.freeze(history.redo)});
const empty=()=>freeze({undo:[],redo:[]});
const snapshot=inputs=>Object.freeze({a:inputs.a?Object.freeze({...inputs.a}):null,b:inputs.b?Object.freeze({...inputs.b}):null});
const sameInput=(a,b)=>a===b||(!a&&!b)||Boolean(a&&b&&a.name===b.name&&a.data===b.data&&a.diskToken===b.diskToken);
const same=(a,b)=>Boolean(a&&b&&sameInput(a.a,b.a)&&sameInput(a.b,b.b));
function size(history){const seen=new Set();let total=0;for(const pair of [...history.undo,...history.redo])for(const input of [pair.a,pair.b])if(input&&!seen.has(input.data)){seen.add(input.data);total+=Math.floor(input.data.length*3/4)-(input.data.endsWith('==')?2:input.data.endsWith('=')?1:0);}return total;}
function trim(history){const next={undo:[...history.undo],redo:[...history.redo]};while(next.undo.length+next.redo.length>LIMIT||size(next)>BYTES){if(next.undo.length)next.undo.shift();else next.redo.shift();}return freeze(next);}
const record=(history,before)=>trim({undo:[...history.undo,snapshot(before)],redo:[]});
function move(history,current,direction){const source=history[direction];if(!source.length)return null;const other=direction==='undo'?'redo':'undo';return {target:source.at(-1),history:trim({[direction]:source.slice(0,-1),[other]:[...history[other],snapshot(current)]})};}
module.exports={empty,snapshot,same,size,record,move,LIMIT,BYTES};
