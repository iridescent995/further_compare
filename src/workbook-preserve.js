import archiveCore from './archive-core.cjs';
import archiveEdit from './archive-edit.cjs';
import cellEdits from './workbook-cell-edits.cjs';
import structuralPlan from './workbook-structural-plan.cjs';
import {sha256} from '@noble/hashes/sha2.js';
import {transformWorkbookStructure} from './workbook-structural-package.js';
import {validateWorkbookTableHeaderEdits} from './workbook-structural-tables.js';
import {applyWorkbookTableHeaderRenames} from './workbook-table-header-renames.js';
import {importWorkbookStyles} from './workbook-style-import.js';

const MAIN = new Set(['http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'http://purl.oclc.org/ooxml/spreadsheetml/main']);
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CONTENT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const OFFICE_REL = ['http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships'];
const encoder = new TextEncoder();
const fail = message => { throw new Error(message); };
const children = (element, name, namespace = element.namespaceURI) => Array.from(element.children).filter(child => child.localName === name && child.namespaceURI === namespace);
function xml(bytes, name, rootName, namespaces) {
  let encoding = 'utf-8';
  if ((bytes[0] === 255 && bytes[1] === 254) || (bytes[0] === 60 && bytes[1] === 0)) encoding = 'utf-16le';
  if ((bytes[0] === 254 && bytes[1] === 255) || (bytes[0] === 0 && bytes[1] === 60)) encoding = 'utf-16be';
  const text = new TextDecoder(encoding, {fatal:true}).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail('Workbook XML must not contain document types or entities.');
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length || document.documentElement?.localName !== rootName || !namespaces.has(document.documentElement.namespaceURI)) fail('Invalid workbook XML: ' + name);
  return document;
}
// XML parsers normalize raw CR/CRLF; character references preserve literal carriage returns.
function serialize(document) { return encoder.encode(new XMLSerializer().serializeToString(document).replace(/\r/g, '&#13;')); }
function targetPath(owner, target) {
  if (typeof target !== 'string' || !target || /[\\\x00-\x20?#]/.test(target) || /^[a-z][a-z0-9+.-]*:/i.test(target)) fail('Unsafe workbook relationship target.');
  let decoded;
  try { decoded = decodeURIComponent(target); } catch { fail('Invalid workbook relationship target.'); }
  if (/[\\\x00-\x20?#]/.test(decoded)) fail('Unsafe workbook relationship target.');
  const parts = target.startsWith('/') ? [] : owner.split('/').slice(0,-1);
  for (const part of decoded.replace(/^\//,'').split('/')) {
    if (part === '.') continue;
    if (part === '..') { if (!parts.length) fail('Workbook relationship escapes the package.'); parts.pop(); }
    else if (!part) fail('Invalid workbook relationship target.');
    else parts.push(part);
  }
  if (!parts.length) fail('Invalid workbook relationship target.');
  return parts.join('/');
}
const relationshipPath = owner => { const pieces = owner.split('/'), name = pieces.pop(); return [...pieces, '_rels', name + '.rels'].join('/'); };
function coordinate(reference) {
  const match = /^([A-Z]{1,3})([1-9]\d*)$/.exec(reference || '');
  if (!match) fail('Invalid worksheet cell reference.');
  let column = 0;
  for (const char of match[1]) column = column * 26 + char.charCodeAt(0) - 64;
  const row = Number(match[2]);
  if (column > 16384 || row > 1048576) fail('Worksheet cell reference is out of range.');
  return {row,column};
}
function address(row, column) { let name = ''; for (; column; column = Math.floor((column-1)/26)) name = String.fromCharCode(65+(column-1)%26)+name; return name + row; }
function range(reference) {
  const pieces = (reference || '').split(':');
  if (pieces.length > 2) fail('Invalid worksheet range.');
  const first = coordinate(pieces[0]), last = coordinate(pieces[1] || pieces[0]);
  if (last.row < first.row || last.column < first.column) fail('Invalid worksheet range.');
  return {first,last};
}
const contains = (area, point) => point.row >= area.first.row && point.row <= area.last.row && point.column >= area.first.column && point.column <= area.last.column;
// OOXML escapes must themselves be escaped or Excel interprets literal _xHHHH_ text.
const excelText = value => value.replace(/_(?=x[0-9a-f]{4}_)/gi, '_x005F_');

/** Export an XLSX package with explicit 1-based cell edits. Untouched ZIP part contents stay byte-identical. */
export async function exportWorkbookCopy(base64Original, sheetName, changes = [], styleOptions = {}) {
  if (typeof base64Original !== 'string' || base64Original.length > 45 * 1024 * 1024 || !Array.isArray(changes) || changes.length > 100000) fail('Invalid or oversized workbook export request.');
  if (!styleOptions || typeof styleOptions !== 'object' || Array.isArray(styleOptions) || Object.keys(styleOptions).some(key => !['styles','sources','structure'].includes(key))) fail('Invalid workbook style export options.');
  const structure = styleOptions.structure == null ? null : structuralPlan.validateWorkbookStructuralPlan(styleOptions.structure);
  if(structure && structure.sheetName !== sheetName)fail('Workbook structural sheet does not match the export target.');
  const requestedStyles = styleOptions.styles ?? [];
  if (!Array.isArray(requestedStyles) || requestedStyles.length > 100000) fail('Invalid workbook style edits.');
  const styles = requestedStyles.map(edit => edit && {...edit});
  const sources = styleOptions.sources === undefined ? {} : {...styleOptions.sources};
  if (styleOptions.sources !== undefined && (!styleOptions.sources || typeof styleOptions.sources !== 'object' || Array.isArray(styleOptions.sources)) || Object.entries(sources).some(([side, data]) => !['a','b'].includes(side) || data !== undefined && (typeof data !== 'string' || data.length > 45 * 1024 * 1024))) fail('Invalid workbook style sources.');
  const styleTargets = new Map();
  for (const edit of styles) {
    if (!edit || !Number.isInteger(edit.row) || edit.row < 1 || edit.row > 1048576 || !Number.isInteger(edit.column) || edit.column < 1 || edit.column > 16384) fail('Workbook style coordinates must be 1-based Excel row and column numbers.');
    const ref = address(edit.row, edit.column);
    if (styleTargets.has(ref)) fail('Duplicate workbook style edit: ' + ref);
    styleTargets.set(ref, edit);
  }
  const edits = new Map();
  for (const change of changes) {
    if (!change || !Number.isInteger(change.row) || change.row < 1 || change.row > 1048576 || !Number.isInteger(change.column) || change.column < 1 || change.column > 16384) fail('Workbook edit coordinates must be 1-based Excel row and column numbers.');
    // Legacy edits are literals: a leading '=' must never imply a formula.
    const type = Object.hasOwn(change, 'type') ? change.type : change.value === null ? 'blank' : typeof change.value === 'string' ? 'text' : typeof change.value;
    const normalized = cellEdits.normalizeWorkbookCellEdit({...change, type});
    const key = address(change.row, change.column);
    if (edits.has(key)) fail('Duplicate workbook cell edit: ' + key);
    edits.set(key, {...change, ...normalized});
  }
  const original = Uint8Array.from(atob(base64Original), char => char.charCodeAt(0));
  if (structure && Array.from(sha256(original),byte=>byte.toString(16).padStart(2,'0')).join('') !== structure.sourceHash)fail('Workbook structural source hash does not match.');
  if (original[0] !== 80 || original[1] !== 75) fail('Workbook preservation requires an XLSX ZIP package.');
  const archive = archiveCore.parseArchive(original), entries = new Map();
  // Read every part before exporting, so corruption cannot be carried silently into a new file.
  for (const entry of archive.entries.values()) if (!entry.implicit) entries.set(entry.path, {...entry, data:entry.kind === 'file' ? await archive.read(entry.path) : new Uint8Array()});
  if (!edits.size && !styles.length && !structure?.operations.length) return original;
  const part = path => { const item = entries.get(path); if (item?.kind !== 'file') fail('Missing workbook part: ' + path); return item.data; };
  const put = (path, document) => { entries.get(path).data = serialize(document); };
  let types = xml(part('[Content_Types].xml'), '[Content_Types].xml', 'Types', new Set([CONTENT]));
  for (const entry of entries.values()) {
    if (/^_xmlsignatures\//i.test(entry.path)) fail('Digitally signed workbooks cannot be edited without invalidating their signatures.');
    if (entry.kind === 'file' && entry.path.endsWith('.rels')) {
      const doc = xml(entry.data, entry.path, 'Relationships', new Set([REL]));
      if (children(doc.documentElement, 'Relationship').some(item => /digital-signature/i.test(item.getAttribute('Type') || ''))) fail('Digitally signed workbooks cannot be edited without invalidating their signatures.');
    }
  }
  if (Array.from(types.documentElement.children).some(item => /digital-signature/i.test(item.getAttribute('ContentType') || ''))) fail('Digitally signed workbooks cannot be edited without invalidating their signatures.');
  const packageRels = xml(part('_rels/.rels'), '_rels/.rels', 'Relationships', new Set([REL]));
  const office = children(packageRels.documentElement, 'Relationship').filter(item => OFFICE_REL.some(ns => item.getAttribute('Type') === ns + '/officeDocument'));
  if (office.length !== 1 || office[0].hasAttribute('TargetMode')) fail('Workbook package requires one internal workbook relationship.');
  const workbookPath = targetPath('', office[0].getAttribute('Target'));
  if(structure?.operations.length){
    await transformWorkbookStructure({entries,workbookPath,sheetName,operations:structure.operations});
    types=xml(part('[Content_Types].xml'),'[Content_Types].xml','Types',new Set([CONTENT]));
  }
  let workbook = xml(part(workbookPath), workbookPath, 'workbook', MAIN);
  const ns = workbook.documentElement.namespaceURI;
  const relsPath = relationshipPath(workbookPath), rels = xml(part(relsPath), relsPath, 'Relationships', new Set([REL]));
  const sheets = children(workbook.documentElement, 'sheets');
  if (sheets.length !== 1) fail('Workbook requires one sheets collection.');
  const sheet = children(sheets[0], 'sheet').filter(item => item.getAttribute('name') === sheetName);
  if (sheet.length !== 1) fail('Choose a uniquely named worksheet to export.');
  const ids = OFFICE_REL.map(uri => sheet[0].getAttributeNS(uri, 'id')).filter(Boolean);
  if (ids.length !== 1) fail('Invalid worksheet relationship.');
  const relationships = children(rels.documentElement, 'Relationship');
  if (new Set(relationships.map(item => item.getAttribute('Id'))).size !== relationships.length) fail('Duplicate workbook relationship identifiers.');
  const relation = relationships.find(item => item.getAttribute('Id') === ids[0]);
  if (!relation || relation.hasAttribute('TargetMode') || !OFFICE_REL.some(uri => relation.getAttribute('Type') === uri + '/worksheet')) fail('Only internal worksheets can be edited.');
  const sheetPath = targetPath(workbookPath, relation.getAttribute('Target'));
  if (relationships.some(other => other !== relation && !other.hasAttribute('TargetMode') && targetPath(workbookPath, other.getAttribute('Target')) === sheetPath)) fail('Ambiguous worksheet part relationships.');
  const renamed=applyWorkbookTableHeaderRenames({entries,workbookPath,worksheetPath:sheetPath,changes:[...edits.values()]});
  if(renamed.changedPaths.includes(workbookPath))workbook=xml(part(workbookPath),workbookPath,'workbook',MAIN);
  validateWorkbookTableHeaderEdits({entries,worksheetPath:sheetPath,changes:[...edits.values()]});
  const worksheet = xml(part(sheetPath), sheetPath, 'worksheet', MAIN);
  if (worksheet.documentElement.namespaceURI !== ns) fail('Workbook and worksheet namespaces do not match.');
  const data = children(worksheet.documentElement, 'sheetData');
  if (data.length !== 1) fail('Worksheet requires one cell data collection.');
  const cells = new Map(), rows = new Map(), guarded = [];
  for (const row of children(data[0], 'row')) {
    const rowNumber = Number(row.getAttribute('r'));
    if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > 1048576 || rows.has(rowNumber)) fail('Invalid or duplicate worksheet row.');
    rows.set(rowNumber,row);
    for (const cell of children(row, 'c')) {
      const ref = cell.getAttribute('r'), point = coordinate(ref);
      if (point.row !== rowNumber || cells.has(ref)) fail('Invalid or duplicate worksheet cell.');
      cells.set(ref,cell);
      for (const formula of children(cell, 'f')) if (formula.hasAttribute('t') && formula.getAttribute('t') !== 'normal') {
        guarded.push(formula.hasAttribute('ref') ? range(formula.getAttribute('ref')) : {first:point,last:point});
      }
    }
  }
  const merged = children(worksheet.documentElement, 'mergeCells').flatMap(group => children(group, 'mergeCell').map(item => range(item.getAttribute('ref'))));
  for (const [ref, edit] of new Map([...edits, ...styleTargets])) {
    if (guarded.some(area => contains(area,edit))) fail('Cannot edit a member of a shared, array or data-table formula: ' + ref);
    if (merged.some(area => contains(area,edit) && (edit.row !== area.first.row || edit.column !== area.first.column))) fail('Cannot edit a subordinate merged cell: ' + ref);
    const cell = cells.get(ref);
    // Metadata can describe a dynamic spill range; changing its anchor without rewriting metadata is unsafe.
    if (cell?.hasAttribute('cm') || cell?.hasAttribute('vm')) fail('Cannot edit a cell with workbook metadata: ' + ref);
  }
  const make = name => worksheet.createElementNS(ns, name);
  const ensureCell = (ref, edit) => {
    let row = rows.get(edit.row), cell = cells.get(ref);
    if (!row) { row = make('row'); row.setAttribute('r', String(edit.row)); data[0].insertBefore(row, children(data[0], 'row').find(other => Number(other.getAttribute('r')) > edit.row) || null); rows.set(edit.row,row); }
    if (!cell) { cell = make('c'); cell.setAttribute('r',ref); row.insertBefore(cell, children(row,'c').find(other => coordinate(other.getAttribute('r')).column > edit.column) || null); cells.set(ref,cell); }
    return {row,cell};
  };
  for (const [ref, edit] of edits) {
    const {row,cell} = ensureCell(ref,edit);
    for (const name of ['f','v','is']) for (const item of children(cell,name)) item.remove();
    cell.removeAttribute('t');
    if (edit.type === 'formula') {
      const formula = make('f'); formula.textContent = edit.value; cell.insertBefore(formula,cell.firstChild);
    } else if (edit.type === 'text') {
      cell.setAttribute('t','inlineStr'); const inline = make('is'), text = make('t');
      text.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve'); text.textContent = excelText(edit.value);
      // A single unformatted run preserves the literal value in readers whose plain
      // inline-string path omits OOXML escape decoding (including ExcelJS).
      if (/_x[0-9a-f]{4}_/i.test(edit.value)) { const run = make('r'); run.append(text); inline.append(run); } else inline.append(text);
      cell.insertBefore(inline,cell.firstChild);
    } else if (edit.value !== null) {
      const value = make('v'); value.textContent = typeof edit.value === 'boolean' ? edit.value ? '1' : '0' : String(edit.value);
      if (typeof edit.value === 'boolean') cell.setAttribute('t','b'); cell.insertBefore(value,cell.firstChild);
    }
    // spans is an optimization; removing it avoids obsolete bounds for new cells.
    row.removeAttribute('spans');
  }
  for (const [ref, edit] of styleTargets) { const {row} = ensureCell(ref,edit); row.removeAttribute('spans'); }
  // The dimension is optional. Derive it from actual cells rather than keeping a stale input bound.
  const dimensions = children(worksheet.documentElement,'dimension');
  if (dimensions.length > 1) fail('Invalid worksheet dimensions.');
  if (dimensions.length) {
    let minRow=1048576,minColumn=16384,maxRow=1,maxColumn=1;
    for (const ref of cells.keys()) { const point=coordinate(ref); minRow=Math.min(minRow,point.row); minColumn=Math.min(minColumn,point.column); maxRow=Math.max(maxRow,point.row); maxColumn=Math.max(maxColumn,point.column); }
    dimensions[0].setAttribute('ref',cells.size?address(minRow,minColumn)+':'+address(maxRow,maxColumn):'A1');
  }
  if (edits.size || structure?.operations.length) {
    let calc = children(workbook.documentElement,'calcPr');
    if (calc.length > 1) fail('Invalid workbook calculation properties.');
    if (!calc.length) {
      const item=workbook.createElementNS(ns,'calcPr');
      const following = new Set(['oleSize','customWorkbookViews','pivotCaches','smartTagPr','smartTagTypes','webPublishing','fileRecoveryPr','webPublishObjects','extLst']);
      workbook.documentElement.insertBefore(item, Array.from(workbook.documentElement.children).find(child=>child.namespaceURI===ns&&following.has(child.localName))||null); calc=[item];
    }
    calc[0].setAttribute('calcMode','auto'); calc[0].setAttribute('fullCalcOnLoad','1'); calc[0].setAttribute('forceFullCalc','1'); calc[0].setAttribute('calcCompleted','0');
    let changedRels=false,changedTypes=false;
    for (const item of relationships) if (OFFICE_REL.some(uri=>item.getAttribute('Type')===uri+'/calcChain')) {
      if (item.hasAttribute('TargetMode')) fail('Invalid external calculation-chain relationship.');
      const path=targetPath(workbookPath,item.getAttribute('Target'));
      // Do not remove any part also referenced for another purpose.
      if (relationships.some(other=>other!==item&&!other.hasAttribute('TargetMode')&&targetPath(workbookPath,other.getAttribute('Target'))===path)) fail('Ambiguous calculation-chain relationship.');
      entries.delete(path); entries.delete(relationshipPath(path)); item.remove(); changedRels=true;
      for (const type of children(types.documentElement,'Override')) if (targetPath('',type.getAttribute('PartName'))===path) { type.remove(); changedTypes=true; }
    }
    put(workbookPath,workbook); if(changedRels)put(relsPath,rels); if(changedTypes)put('[Content_Types].xml',types);
  }
  if (styles.length) {
    const imported = await importWorkbookStyles({entries, workbookPath, styles, sources});
    for (const [ref, index] of imported) {
      if (!styleTargets.has(ref) || !Number.isInteger(index) || index < 0) fail('Invalid imported workbook style.');
      cells.get(ref).setAttribute('s',String(index));
    }
    if (imported.size !== styleTargets.size) fail('Incomplete imported workbook styles.');
  }
  put(sheetPath,worksheet);
  return archiveEdit.writeCompressedZipEntries(entries.values());
}
