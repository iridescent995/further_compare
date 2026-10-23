'use strict';
const {compareTables} = require('./structured-diff.cjs');

const STYLE_GROUPS = Object.freeze({numFmt:'Number format',font:'Font',fill:'Fill',border:'Border',alignment:'Alignment',protection:'Protection',richText:'Rich text'});
const plain = value => value !== null && typeof value === 'object' && [Object.prototype,null].includes(Object.getPrototypeOf(value));
function workbookStyleSignature(style) {
  if (style === undefined || style === null) return '{}';
  if (!plain(style)) throw new TypeError('Workbook style must be a plain object.');
  const visiting = new Set(); let nodes = 0;
  function canonical(value, depth = 0) {
    if (++nodes > 10000 || depth > 20) throw new TypeError('Workbook style is too complex.');
    if (value === undefined) return undefined;
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') { if (value.length > 65536) throw new TypeError('Workbook style is too large.'); return value; }
    if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError('Workbook style numbers must be finite.'); return value; }
    if (!Array.isArray(value) && !plain(value)) throw new TypeError('Invalid workbook style value.');
    if (visiting.has(value)) throw new TypeError('Workbook style must not contain cycles.');
    visiting.add(value);
    let result;
    if (Array.isArray(value)) result = Array.from(value,item => canonical(item,depth+1) ?? null);
    else {
      result = Object.create(null);
      for (const key of Object.keys(value).sort()) {
        const child = canonical(value[key],depth+1);
        if (child !== undefined) result[key] = child;
      }
      if (!Object.keys(result).length) result = undefined;
    }
    visiting.delete(value); return result;
  }
  const selected = Object.create(null);
  for (const group of Object.keys(STYLE_GROUPS).sort()) {
    const value = style[group];
    if (value === undefined) continue;
    if (group === 'numFmt' ? typeof value !== 'string' : group === 'richText' ? !Array.isArray(value) : !plain(value)) throw new TypeError('Invalid workbook style group: '+group+'.');
    const normalized = canonical(value);
    if (normalized === undefined || group === 'numFmt' && normalized === 'General') continue;
    if (group === 'fill' && normalized.type === 'pattern' && normalized.pattern === 'none' && Object.keys(normalized).length === 2) continue;
    selected[group] = normalized;
  }
  const signature = JSON.stringify(selected);
  if (signature.length > 65536) throw new TypeError('Workbook style is too large.');
  return signature;
}
function validateStyles(matrix, parsed = new Map([['{}',{}]])) {
  if (!Array.isArray(matrix) || matrix.length > 100001) throw new TypeError('Workbook styles must be a matrix of canonical style signatures.');
  let cells = 0, length = 0;
  for (const signature of parsed.keys()) length += signature.length;
  for (const row of matrix) {
    if (!Array.isArray(row)) throw new TypeError('Workbook styles must contain array rows.');
    for (const signature of row) {
      if (++cells > 1000000 || typeof signature !== 'string' || signature.length > 65536) throw new TypeError('Invalid or oversized workbook style matrix.');
      if (!parsed.has(signature)) {
        if ((length += signature.length) > 33554432) throw new TypeError('Workbook style signatures are too large.');
        let style; try { style = JSON.parse(signature); } catch { throw new TypeError('Invalid workbook style signature.'); }
        if (!plain(style) || workbookStyleSignature(style) !== signature) throw new TypeError('Workbook style signatures must be canonical.');
        parsed.set(signature,style);
      }
    }
  }
  return parsed;
}

function validateStyleAvailability(matrix) {
  if (!Array.isArray(matrix) || matrix.length > 100001) throw new TypeError('Invalid formatting availability matrix.');
  let cells=0,text=0;const seen=new Set();
  for (const row of matrix) {if(!Array.isArray(row))throw new TypeError('Invalid formatting availability row.');for(const groups of row){
    if(++cells>1000000||!plain(groups))throw new TypeError('Invalid formatting availability entry.');
    if(seen.has(groups))continue;seen.add(groups);
    for(const [group,reason]of Object.entries(groups)){if(!Object.hasOwn(STYLE_GROUPS,group)||typeof reason!=='string'||!reason||reason.length>4096)throw new TypeError('Invalid unavailable formatting group.');text+=reason.length;if(text>16777216)throw new TypeError('Formatting availability exceeds bounds.');}
  }}
}

function validateFormulas(matrix) {
  if (!Array.isArray(matrix)) throw new TypeError('Workbook formulas must be a matrix of null or formula strings.');
  for (const row of matrix) {
    if (!Array.isArray(row)) throw new TypeError('Workbook formulas must contain array rows.');
    for (const formula of row) if (formula !== null && (typeof formula !== 'string' || !formula.length || formula.startsWith('='))) {
      throw new TypeError('Workbook formulas must be null or nonempty formula strings without a leading equals sign.');
    }
  }
}

function validateFormulaIdentities(matrix, formulas) {
  if (matrix === null) return;
  if (!Array.isArray(matrix) || matrix.length !== formulas.length) throw new TypeError('Formula identities must match their formula matrix.');
  let size = 0;
  for (const [r,row] of matrix.entries()) {
    if (!Array.isArray(row) || row.length !== formulas[r].length) throw new TypeError('Formula identity rows must match their formulas.');
    for (const [c,identity] of row.entries()) {
      if (formulas[r][c] === null ? identity !== null : identity !== null && (typeof identity !== 'string' || !identity.length || identity.length > 65536)) throw new TypeError('Invalid formula identity.');
      size += identity?.length || 0;
      if (size > 64 * 1024 * 1024) throw new TypeError('Formula identities exceed supported bounds.');
    }
  }
}
const formulaIdentity = (matrix, row, column, expression) => matrix === null
  ? JSON.stringify({dialect:'http://schemas.openxmlformats.org/spreadsheetml/2006/main',expression})
  : matrix[row]?.[column];

function compareWorkbookTables(left, right, {keyColumns = [], formulasA = [], formulasB = [], formulaIdentitiesA = null, formulaIdentitiesB = null, mode = 'values', headerOffset = 0, compareFormatting = false, stylesA = [], stylesB = [], formattingAvailableA = true, formattingAvailableB = true, styleStatusA = [], styleStatusB = []} = {}) {
  if (!['values','formulas'].includes(mode)) throw new TypeError('Unknown workbook comparison mode.');
  if (!Number.isSafeInteger(headerOffset) || headerOffset < 0) throw new TypeError('Workbook header offset must be a nonnegative integer.');
  if (typeof compareFormatting !== 'boolean') throw new TypeError('Compare formatting must be a boolean.');
  if (typeof formattingAvailableA !== 'boolean' || typeof formattingAvailableB !== 'boolean') throw new TypeError('Formatting availability must be boolean.');
  validateStyleAvailability(styleStatusA); validateStyleAvailability(styleStatusB);
  validateFormulas(formulasA); validateFormulas(formulasB);
  validateFormulaIdentities(formulaIdentitiesA, formulasA); validateFormulaIdentities(formulaIdentitiesB, formulasB);
  const parsedA = validateStyles(stylesA), parsedB = validateStyles(stylesB,parsedA), changes = new Map();
  const dialects=new Map();
  const dialect=identity=>{if(!dialects.has(identity)){let value=null;try{const parsed=JSON.parse(identity);if(typeof parsed?.dialect==='string'&&parsed.dialect)value=parsed.dialect;}catch{}dialects.set(identity,value);}return dialects.get(identity);};
  // Keys and row pairing always use original displayed values, never formulas.
  const result = compareTables(left,right,{keyColumns});
  for (const row of result.rows) {
    for (const cell of row.cells) {
      cell.formulaLeft = row.leftIndex === null || cell.left === null ? null : formulasA[row.leftIndex + headerOffset]?.[cell.column] ?? null;
      cell.formulaRight = row.rightIndex === null || cell.right === null ? null : formulasB[row.rightIndex + headerOffset]?.[cell.column] ?? null;
      cell.styleLeft = row.leftIndex === null || cell.left === null ? '{}' : stylesA[row.leftIndex + headerOffset]?.[cell.column] ?? '{}';
      cell.styleRight = row.rightIndex === null || cell.right === null ? '{}' : stylesB[row.rightIndex + headerOffset]?.[cell.column] ?? '{}';
      if (!changes.has(cell.styleLeft)) changes.set(cell.styleLeft,new Map());
      const rightChanges = changes.get(cell.styleLeft);
      if (!rightChanges.has(cell.styleRight)) {
        const styleA = parsedA.get(cell.styleLeft), styleB = parsedB.get(cell.styleRight);
        rightChanges.set(cell.styleRight,Object.entries(STYLE_GROUPS).filter(([group]) => JSON.stringify(styleA[group]) !== JSON.stringify(styleB[group])).map(([,label]) => label));
      }
      cell.styleChanges = [...rightChanges.get(cell.styleRight)];
      if (mode === 'formulas' && cell.left !== null && cell.right !== null && (cell.formulaLeft !== null || cell.formulaRight !== null)) {
        const identityLeft=cell.formulaLeft === null ? null : formulaIdentity(formulaIdentitiesA, row.leftIndex + headerOffset, cell.column, cell.formulaLeft);
        const identityRight=cell.formulaRight === null ? null : formulaIdentity(formulaIdentitiesB, row.rightIndex + headerOffset, cell.column, cell.formulaRight);
        if(cell.formulaLeft !== null && identityLeft === null || cell.formulaRight !== null && identityRight === null)cell.formulaUnavailable=true;
        if(identityLeft!==null&&identityRight!==null&&dialect(identityLeft)!==dialect(identityRight)){cell.formulaUnavailable=true;cell.formulaUnavailableReason='Formula dialects require a qualified translation before comparison.';}
        cell.equal = cell.formulaLeft !== null && cell.formulaRight !== null && !cell.formulaUnavailable && identityLeft === identityRight;
      }
      const unknownGroups={...(row.leftIndex===null?{}:styleStatusA[row.leftIndex+headerOffset]?.[cell.column]),...(row.rightIndex===null?{}:styleStatusB[row.rightIndex+headerOffset]?.[cell.column])};
      if (!formattingAvailableA || !formattingAvailableB) for(const group of Object.keys(STYLE_GROUPS))unknownGroups[group]='Formatting metadata is unavailable.';
      if (compareFormatting && Object.keys(unknownGroups).length) {
        cell.styleChanges=cell.styleChanges.filter(label=>!Object.entries(STYLE_GROUPS).some(([group,name])=>name===label&&Object.hasOwn(unknownGroups,group)));
        cell.knownDifference = !cell.equal && !cell.formulaUnavailable || cell.left!==null && cell.right!==null && cell.styleChanges.length>0;
        cell.formattingUnavailable = true;
        cell.formattingUnavailableGroups=unknownGroups;
        cell.equal = false;
      } else if (compareFormatting && cell.left !== null && cell.right !== null) cell.equal = cell.equal && cell.styleLeft === cell.styleRight;
    }
    if (row.left !== null && row.right !== null) row.status = row.cells.every(cell => cell.equal) ? 'equal' : row.cells.every(cell => cell.equal || cell.formattingUnavailable && !cell.knownDifference) ? 'unknown' : 'changed';
  }
  result.equal = !result.duplicates.length && result.rows.every(row => row.status === 'equal');
  return result;
}
module.exports = {compareWorkbookTables,workbookStyleSignature};
