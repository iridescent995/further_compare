'use strict';
const {diffChars} = require('diff');
// Only visible, bounded lines need detailed spans. A timed-out line still
// retains its complete text and its line-level difference indication.
function inlineDiff(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') throw new TypeError('Expected two text lines.');
  if (left === right) return {a:[{text:left,changed:false}],b:[{text:right,changed:false}],detailed:true};
  const fallback = () => ({a:[{text:left,changed:true}],b:[{text:right,changed:true}],detailed:false});
  if (left.length > 2000 || right.length > 2000) return fallback();
  const changes = diffChars(left,right,{timeout:15,maxEditLength:1000});
  if (!changes) return fallback();
  const a = [], b = [];
  for (const part of changes) {
    if (!part.added) a.push({text:part.value,changed:!!part.removed});
    if (!part.removed) b.push({text:part.value,changed:!!part.added});
  }
  return {a,b,detailed:true};
}
module.exports = {inlineDiff};
