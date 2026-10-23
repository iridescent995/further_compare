'use strict';
// Coordinates refer to the complete comparison, never its filtered/page view.
const rowId = row => `${row.leftIndex === null ? '-' : row.leftIndex}:${row.rightIndex === null ? '-' : row.rightIndex}`;
function denseArray(value,max) {
  if (!Array.isArray(value) || value.length > max) return false;
  for (let i=0;i<value.length;i++) if (!Object.hasOwn(value,i)) return false;
  return true;
}
function literalRow(value) { return denseArray(value,512) && value.every(cell=>typeof cell==='string'); }
function comparisonIndex(comparison) {
  if (!comparison || !denseArray(comparison.rows,100000) || !denseArray(comparison.duplicates,0)) throw Error('Resolve duplicate table keys before copying.');
  const index = new Map(), seenLeft = new Set(), seenRight = new Set();
  let leftCells=0,rightCells=0;
  for (const row of comparison.rows) {
    if (!row || typeof row!=='object') throw Error('Invalid comparison coordinate.');
    for (const [key,source,seen] of [['leftIndex','left',seenLeft],['rightIndex','right',seenRight]]) {
      if (row[key] !== null && (!Number.isSafeInteger(row[key]) || row[key] < 0 || row[key]>=50000)) throw Error('Invalid comparison coordinate.');
      if ((row[key]===null)!==(row[source]===null)) throw Error('Comparison source and coordinate disagree.');
      if (row[key]!==null) {
        if (seen.has(row[key])) throw Error('Ambiguous comparison coordinates.');
        seen.add(row[key]);
        if (!literalRow(row[source])) throw Error('Table cells must be dense literal strings within column limits.');
      }
    }
    if (row.leftIndex === null && row.rightIndex === null) throw Error('Invalid comparison coordinate.');
    leftCells+=row.left?.length||0;rightCells+=row.right?.length||0;
    if(leftCells>500000||rightCells>500000) throw Error('Table exceeds cell limits.');
    index.set(rowId(row),row);
  }
  return index;
}
function validateContext(context) { if (typeof context !== 'string' || !context.length || context.length>4096) throw Error('A table source binding of at most 4096 characters is required.'); }
function validateTableCopyBinding(value,rowCount) {
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(key=>!['version','side','headerOffset','context','rowIds'].includes(key)) || value.version!==1 || !['a','b'].includes(value.side) || ![0,1].includes(value.headerOffset)) throw Error('Invalid table copy binding.');
  validateContext(value.context);
  if (!denseArray(value.rowIds,50000) || (rowCount!==undefined && (!Number.isSafeInteger(rowCount)||rowCount<0||rowCount!==value.rowIds.length))) throw Error('Result row mapping changed. Choose a result side again.');
  if(value.headerOffset && value.rowIds[0]!==null) throw Error('Table header mapping changed.');
  const seen=new Set();
  for(const id of value.rowIds) {
    if(id===null) continue;
    if(typeof id!=='string'||! /^(?:-|0|[1-9][0-9]{0,4}):(?:-|0|[1-9][0-9]{0,4})$/.test(id)||id==='-:-'||id.split(':').some(part=>part!=='-'&&Number(part)>=50000)||seen.has(id)) throw Error('Result row mapping is stale or ambiguous.');
    seen.add(id);
  }
  return {version:1,side:value.side,headerOffset:value.headerOffset,context:value.context,rowIds:value.rowIds.slice()};
}
function createTableCopyOrigin({comparison,side,headerOffset=0,context}) {
  validateContext(context);
  if (!['a','b'].includes(side) || ![0,1].includes(headerOffset)) throw Error('Invalid table result origin.');
  const index = comparisonIndex(comparison), key = side === 'a' ? 'leftIndex' : 'rightIndex';
  const ordered = [...index].filter(([,row]) => row[key] !== null).sort((a,b) => a[1][key]-b[1][key]);
  if (ordered.some(([,row],i) => row[key] !== i)) throw Error('Incomplete table comparison coordinates.');
  return validateTableCopyBinding({version:1,side,headerOffset,context,rowIds:[...Array(headerOffset).fill(null),...ordered.map(([id]) => id)]});
}
function copyTableDifferences({comparison,rows,origin,context,sourceSide,selections}) {
  validateContext(context);
  const index = comparisonIndex(comparison);
  if (!origin || origin.version !== 1 || origin.context !== context || !['a','b'].includes(origin.side) || ![0,1].includes(origin.headerOffset)) throw Error('The table comparison changed. Choose a result side again.');
  if (!['a','b'].includes(sourceSide)) throw Error('Choose a source side.');
  if (!denseArray(rows,50000) || !rows.every(literalRow) || rows.reduce((n,row)=>n+row.length,0)>500000) throw Error('Invalid result table or result limits exceeded.');
  origin=validateTableCopyBinding(origin,rows.length);
  if (!Array.isArray(origin.rowIds) || origin.rowIds.length !== rows.length) throw Error('Result row mapping changed. Choose a result side again.');
  const positions = new Map();
  origin.rowIds.forEach((id,i) => {
    if (id === null) return;
    if (!index.has(id) || positions.has(id)) throw Error('Result row mapping is stale or ambiguous.');
    positions.set(id,i);
  });
  if (!denseArray(selections,500000) || !selections.length) throw Error('Select comparison rows or cells first.');
  const selected = new Map();
  for (const selection of selections) {
    if (!selection || !index.has(selection.rowId) || !(selection.column === null || Number.isSafeInteger(selection.column) && selection.column >= 0)) throw Error('Invalid selected comparison coordinate.');
    const row = index.get(selection.rowId), width = Math.max(row.left?.length || 0,row.right?.length || 0);
    if (selection.column !== null && selection.column >= width) throw Error('Selected column is outside the comparison.');
    if (!selected.has(selection.rowId)) selected.set(selection.rowId,new Set());
    selected.get(selection.rowId).add(selection.column);
  }
  let projectedRows=rows.length,projectedCells=rows.reduce((n,row)=>n+row.length,0);
  for(const [id,columns] of selected) {
    const source=index.get(id)[sourceSide==='a'?'left':'right'];
    if(source===null) throw Error('The selected source row is missing. Use Delete row to remove a result row.');
    if(!positions.has(id)) {
      if(!columns.has(null)) throw Error('Select the whole row to insert a missing result row.');
      projectedRows++;projectedCells+=source.length;
    } else {
      const length=rows[positions.get(id)].length;
      let width=length;
      for(let c=length;c<source.length;c++) if(source[c]!==''&&(columns.has(null)||columns.has(c))) width=c+1;
      projectedCells+=width-length;
    }
    if(projectedRows>50000||projectedCells>500000) throw Error('Result exceeds row or cell limits.');
  }
  const next = rows.map(row => row.slice()), ids = origin.rowIds.slice();
  let structural = false, copiedCells = 0, insertedRows = 0, skippedCells = 0;
  const sourceKey = sourceSide === 'a' ? 'left' : 'right';
  // Comparison order makes bulk insertion independent of click/selection order.
  for (const [id,row] of index) {
    if (!selected.has(id)) continue;
    const columns = selected.get(id), source = row[sourceKey];
    if (source === null) throw Error('The selected source row is missing. Use Delete row to remove a result row.');
    if (!positions.has(id)) {
      if (!columns.has(null)) throw Error('Select the whole row to insert a missing result row.');
      next.push(source.slice());ids.push(id);positions.set(id,next.length-1);
      insertedRows++;copiedCells+=source.length;structural=true;continue;
    }
    const target = next[positions.get(id)];
    const chosen = columns.has(null) ? Array.from({length:Math.max(source.length,target.length)},(_,i)=>i) : [...columns].sort((a,b)=>a-b);
    for (const column of chosen) {
      // A missing cell clears its value; it never shifts unrelated columns.
      const value = source[column] ?? '';
      if ((target[column] ?? '') === value) { skippedCells++;continue; }
      while (target.length <= column) target.push('');
      target[column]=value;copiedCells++;
    }
  }
  if (next.length > 50000 || next.some(row=>row.length>512) || next.reduce((n,row)=>n+row.length,0)>500000) throw Error('Result exceeds row or cell limits.');
  return {rows:next,origin:{...origin,rowIds:ids},structural,copiedCells,insertedRows,skippedCells};
}
module.exports = {tableComparisonRowId:rowId,createTableCopyOrigin,copyTableDifferences,validateTableCopyBinding};
