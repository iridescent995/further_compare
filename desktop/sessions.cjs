const {validateOdsCellEdits}=require('../src/ods-cell-edits.cjs');
'use strict';
const {validateDocumentProjection}=require('../src/document-projection.cjs');
const {validateTableCopyBinding}=require('../src/table-difference-copy.cjs');
const {validateWorkbookCellEdits}=require('../src/workbook-cell-edits.cjs');
const {validateWorkbookStructuralRows}=require('../src/workbook-structural-plan.cjs');
const {validateWorkbookStyleEdits}=require('../src/workbook-style-edits.cjs');
const {validateTextGrammar}=require('../src/text-grammar.cjs');
const {validateTextProfile,validateTextProfileMappings}=require('../src/text-profile.cjs');

const {validateIgnoredTextPatterns}=require('../src/ignored-text-rules.cjs');
const {WHITESPACE_SCOPES}=require('../src/text-whitespace.cjs');
const {validateFolderNameRules}=require('./folder-name-matching.cjs');
const {FOLDER_FILTER_IDS}=require('./folder-display.cjs');
const {validateRefreshInterval}=require('../src/folder-refresh.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const {FolderService} = require('./folders.cjs');
const {ThreeWayFolders} = require('./folder-threeway.cjs');
const {FolderAlignment} = require('./folder-alignment.cjs');
const {validateFolderRules} = require('./folder-rules.cjs');
const {decodeText,validateText,validateFormat,ENCODINGS}=require('../src/text-codec.cjs');
const MAX_TEXT_BYTES = 10 * 1024 * 1024;
const MAX_SESSION_BYTES = 25 * 1024 * 1024;
const MAX_DATA_BYTES = 32 * 1024 * 1024;
const TYPES = ['text-compare', 'text-merge', 'folder-compare', 'folder-merge', 'folder-sync', 'binary-compare', 'table-compare', 'picture-compare', 'text-merge3', 'audio-compare', 'archive-compare', 'registry-compare', 'folder-merge3'];
function record(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function decodeData(data, limit = MAX_DATA_BYTES) {
  if (typeof data !== 'string' || data.length > 4 * Math.ceil(limit / 3) || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error('Invalid or oversized base64 data.');
  const buffer = Buffer.from(data, 'base64');
  if (buffer.length > limit || buffer.toString('base64') !== data) throw new Error('Invalid or oversized base64 data.');
  return buffer;
}
function jsonOptions(value, depth = 0) {
  if (depth > 20) throw new Error('Advanced options are too deeply nested.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (Array.isArray(value)) return value.map(v => jsonOptions(v, depth + 1));
  if (record(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      if (['__proto__','prototype','constructor'].includes(key)) throw new Error('Invalid advanced option.');
      result[key] = jsonOptions(val, depth + 1);
    }
    return result;
  }
  throw new Error('Advanced options must contain JSON values.');
}
function validateAdvanced(value, type) {
  if (!record(value) || !record(value.inputs) || !record(value.options)) throw new Error('Invalid advanced session.');
  if(value.options.tableTemplate?.format==='xlsx'){const template={...value.options.tableTemplate};delete template.format;value={...value,options:{...value.options,tableTemplate:template}};}
  const inputs = {};
  for (const side of ['a','b','base']) {
    const input = value.inputs[side];
    if (input === null) { inputs[side] = null; continue; }
    if (!record(input) || typeof input.name !== 'string' || input.name.length > 255 || input.name.includes('\0')) throw new Error('Invalid advanced input.');
    decodeData(input.data);
    inputs[side] = {name:input.name,data:input.data};
  }
  if (value.options.workbookMode !== undefined && !['values','formulas'].includes(value.options.workbookMode)) throw new Error('Invalid workbook comparison mode.');
  if (value.options.compareFormatting !== undefined && typeof value.options.compareFormatting !== 'boolean') throw new Error('Invalid workbook formatting option.');
  if (value.options.compareLayout !== undefined && typeof value.options.compareLayout !== 'boolean') throw new Error('Invalid workbook layout option.');
  if (value.options.compareNumberFormats !== undefined && typeof value.options.compareNumberFormats !== 'boolean') throw new Error('Invalid workbook number format option.');
  if (value.options.compareConditionalRules !== undefined && typeof value.options.compareConditionalRules !== 'boolean') throw new Error('Invalid workbook conditional rule option.');
  if(value.options.tableTemplate!==undefined&&value.options.tableTemplate!==null){
    const template=value.options.tableTemplate;
    if(!record(template)||Object.keys(template).some(key=>!['side','sheetName','sourceHash','structural','format'].includes(key))||!['a','b'].includes(template.side)||typeof template.sheetName!=='string'||!template.sheetName||template.sheetName.length>255||template.sheetName.includes('\0')||typeof template.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(template.sourceHash)||typeof template.structural!=='boolean')throw Error('Invalid workbook result template.');
    const format=template.format===undefined?'xlsx':template.format;
    if(!['xlsx','ods'].includes(format)||!inputs[template.side]||!(format==='ods'?/\.ods$/i:/\.xlsx$/i).test(inputs[template.side].name)||!Array.isArray(value.options.tableResult))throw Error('Workbook result template requires its source and result in the matching format.');
    if(format==='ods'&&(template.structural||value.options.tableStyleEdits!=null||value.options.tableStructure!=null))throw Error('ODS workbook results do not support structural or formatting edits.');
  }
  if (value.options.mergeWrap !== undefined && typeof value.options.mergeWrap !== 'boolean') throw new Error('Invalid merge word wrap option.');
  for (const key of ['mergeReadEncodings','mergeDrafts']) if (value.options[key] !== undefined) {
    const map=value.options[key];
    if(!record(map)||Object.keys(map).some(side=>!['base','a','b'].includes(side)))throw new Error('Invalid merge source options.');
    for(const entry of Object.values(map)) {
      if(key==='mergeReadEncodings') {
        if(entry!=='auto'&&!ENCODINGS.includes(entry))throw new Error('Invalid merge input encoding.');
      } else {
        if(typeof entry!=='string')throw new Error('Invalid merge source draft.');
        validateText(entry);
      }
    }
  }
  const documentProjections=value.options.mergeDocumentProjections,pdfOrders=value.options.mergePdfOrders,docxScopes=value.options.mergeDocxScopes,odtScopes=value.options.mergeOdtScopes,docScopes=value.options.mergeDocScopes;
  const strictSideMap=(map,label)=>{if(!map||![Object.prototype,null].includes(Object.getPrototypeOf(map))||Reflect.ownKeys(map).some(side=>!['base','a','b'].includes(side)))throw Error('Invalid '+label+'.');};
  if(documentProjections!==undefined||pdfOrders!==undefined||docxScopes!==undefined||odtScopes!==undefined||docScopes!==undefined){
    if(type!=='text-merge3')throw Error('Document merge settings require a three-way text merge.');
    if(docxScopes!==undefined){strictSideMap(docxScopes,'merge DOCX text scopes');for(const scope of Object.values(docxScopes))if(!['main-document','main-and-related-text'].includes(scope))throw Error('Invalid merge DOCX text scope.');}
    if(odtScopes!==undefined){strictSideMap(odtScopes,'merge ODT text scopes');for(const scope of Object.values(odtScopes))if(!['main-document','main-and-related-text'].includes(scope))throw Error('Invalid merge ODT text scope.');}
    if(docScopes!==undefined){strictSideMap(docScopes,'merge DOC text scopes');for(const scope of Object.values(docScopes))if(!['main-document','main-and-related-text'].includes(scope))throw Error('Invalid merge DOC text scope.');}
    if(pdfOrders!==undefined){strictSideMap(pdfOrders,'merge PDF ordering settings');for(const order of Object.values(pdfOrders))if(!['document','page-rows','page-columns','tagged-structure'].includes(order))throw Error('Invalid merge PDF ordering policy.');}
    if(documentProjections!==undefined){strictSideMap(documentProjections,'merge document projections');for(const [side,value]of Object.entries(documentProjections)){
      const projection=validateDocumentProjection(value),kind=inputs[side]?.name.match(/\.(doc|docx|pdf|rtf|odt)$/i)?.[1].toLowerCase();
      if(!kind||kind!==projection.kind)throw Error('Merge document projection requires its matching original input.');
      if(kind==='docx'&&(docxScopes?.[side]||'main-document')!==projection.scope)throw Error('Merge DOCX text scope disagrees with saved extraction provenance.');
      if(kind==='odt'&&(odtScopes?.[side]||'main-document')!==projection.scope)throw Error('Merge ODT text scope disagrees with saved extraction provenance.');
      if(kind==='doc'&&(docScopes?.[side]||'main-document')!==projection.scope)throw Error('Merge DOC text scope disagrees with saved extraction provenance.');
      if(kind==='pdf'&&(pdfOrders?.[side]||'document')!==(projection.order||'document'))throw Error('Merge PDF ordering policy disagrees with saved extraction provenance.');
    }}
  }
  if(type==='text-merge3'){
    const hasEdits=value.output!==undefined&&value.output!==null||Object.keys(value.options.mergeDrafts||{}).length>0||Object.keys(value.choices||{}).length>0||Object.keys(value.options.choices||{}).length>0;
    for(const side of ['base','a','b'])if(/\.(doc|docx|pdf|rtf|odt)$/i.test(inputs[side]?.name||'')&&!Object.hasOwn(documentProjections||{},side)&&hasEdits)throw Error('Saved document merge edits require extraction provenance. Reopen the original documents in a new merge.');
  }
  if(value.options.mergeOutputFormat!==undefined)validateFormat(value.options.mergeOutputFormat);
  const result = {inputs,options:jsonOptions(value.options)};
  if(docxScopes!==undefined)result.options.mergeDocxScopes={...docxScopes};
  if(odtScopes!==undefined)result.options.mergeOdtScopes={...odtScopes};
  if(docScopes!==undefined)result.options.mergeDocScopes={...docScopes};
  if(documentProjections!==undefined)result.options.mergeDocumentProjections=Object.fromEntries(Object.entries(documentProjections).map(([side,value])=>[side,validateDocumentProjection(value)]));
  if(value.options.tableStructure!=null){
    const structure=validateWorkbookStructuralRows(value.options.tableStructure,{rows:value.options.tableResult,template:value.options.tableTemplate});
    if(!inputs[structure.side]||!/\.xlsx$/i.test(inputs[structure.side].name))throw Error('Workbook structural edits require the original XLSX input.');
    result.options.tableStructure=structure;
  }
  if(value.options.tableCellEdits!==undefined&&value.options.tableCellEdits!==null){
    result.options.tableCellEdits=(value.options.tableTemplate?.format==='ods'?validateOdsCellEdits:validateWorkbookCellEdits)(value.options.tableCellEdits,{rows:value.options.tableResult,template:value.options.tableTemplate,structure:value.options.tableStructure});
  }
  if(value.options.tableStyleEdits!==undefined&&value.options.tableStyleEdits!==null){
    const styles=validateWorkbookStyleEdits(value.options.tableStyleEdits,{rows:value.options.tableResult,template:value.options.tableTemplate,structure:value.options.tableStructure});
    for(const side of new Set(styles.cells.map(cell=>cell.sourceSide)))if(!inputs[side]||!/\.xlsx$/i.test(inputs[side].name))throw Error('Workbook formatting requires its XLSX source.');
    result.options.tableStyleEdits=styles;
  }
  if (value.options.tableCopyBinding !== undefined && value.options.tableCopyBinding !== null) {
    const rows=value.options.tableResult;
    if (!Array.isArray(rows)||rows.length>50000) throw Error('Table copy binding requires a bounded result table.');
    let cells=0;
    for (const row of rows) {
      if (!Array.isArray(row)||row.length>512) throw Error('Invalid table copy result row.');
      for (const cell of row) if (typeof cell!=='string') throw Error('Table copy result cells must be strings.');
      cells+=row.length;
      if(cells>500000) throw Error('Table copy result exceeds cell limits.');
    }
    const binding=validateTableCopyBinding(value.options.tableCopyBinding,rows.length);
    if (!inputs[binding.side]) throw Error('Table copy binding requires its source.');
    result.options.tableCopyBinding=binding;
  }
  if (value.output !== undefined) {
    if (value.output !== null && typeof value.output !== 'string') throw new Error('Invalid advanced output.');
    result.output = value.output;
  }
  if (value.choices !== undefined) {
    if (!record(value.choices) || Object.entries(value.choices).some(([key, choice]) => !/^\d+$/.test(key) || !['base','left','right','both','both-reverse'].includes(choice))) throw new Error('Invalid merge choices.');
    result.choices = {...value.choices};
  }
  return result;
}
// Saved remote endpoints are inert descriptions, never connection authority.
function validateRemoteFolderDescriptor(value) {
  const allowed=['protocol','host','port','username','root'];
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).some(key=>!allowed.includes(key))||allowed.some(key=>!Object.hasOwn(value,key))||value.protocol!=='sftp')throw Error('Invalid saved remote folder.');
  const {isIP}=require('node:net'),{domainToASCII}=require('node:url');
  let {host,root}=value;const {port,username}=value;
  if(typeof host!=='string')throw Error('Invalid saved remote host.');host=host.trim().toLowerCase();
  if(/[\s\x00-\x1f\x7f/\\@?#]/.test(host))throw Error('Invalid saved remote host.');
  if(host.startsWith('[')&&host.endsWith(']'))host=host.slice(1,-1);
  if(!isIP(host)){host=domainToASCII(host.replace(/\.$/,''));if(!host||!host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))throw Error('Invalid saved remote host.');}
  if(!host||host.length>253||!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid saved remote address.');
  if(typeof username!=='string'||!username||username.length>256||/[\x00-\x1f\x7f]/.test(username))throw Error('Invalid saved remote username.');
  if(typeof root!=='string'||!root.startsWith('/')||root.length>4096||/[\\\x00-\x1f\x7f]/.test(root)||root.split('/').some(part=>part==='.'||part==='..'))throw Error('Invalid saved remote root.');
  root=path.posix.normalize(root);if(root!=='/')root=root.replace(/\/$/,'');
  return {protocol:'sftp',host,port,username,root};
}
function validateSession(value) {
  if (!record(value) || value.version !== 1 || !TYPES.includes(value.type) || typeof value.name !== 'string' || value.name.length > 255) throw new Error('Invalid comparison session.');
  if (!record(value.text) || !record(value.files) || !record(value.folders) || !record(value.options)) throw new Error('Invalid session contents.');
  const descriptor = (v, nullable) => {
    if (nullable && v === null) return null;
    if (!record(v) || typeof v.name !== 'string' || v.name.length > 255 || typeof v.path !== 'string' || v.path.length > 32768 || v.path.includes('\0') || (v.path && !path.isAbsolute(v.path))) throw new Error('Invalid session path.');
    return {name: v.name, path: v.path};
  };
  const text = {}, files = {}, folders = {};
  for (const side of ['a', 'b']) {
    if (typeof value.text[side] !== 'string' || value.text[side].length > MAX_TEXT_BYTES) throw new Error('Session text exceeds 10 MB.');
    text[side] = value.text[side]; files[side] = descriptor(value.files[side], false); folders[side] = descriptor(value.folders[side], true);
    if(value.files[side].documentProjection!==undefined){
      if(!['text-compare','text-merge'].includes(value.type))throw Error('Document projections require a text comparison session.');
      files[side].documentProjection=validateDocumentProjection(value.files[side].documentProjection);
    }
    if (folders[side] && !folders[side].path) throw new Error('Invalid folder path.');
  }
  let remoteFolders;
  if(value.remoteFolders!==undefined){
    const remote=value.remoteFolders;
    if(!['folder-compare','folder-merge','folder-sync'].includes(value.type)||!remote||typeof remote!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(remote))||Reflect.ownKeys(remote).length!==2||Reflect.ownKeys(remote).some(key=>!['a','b'].includes(key))||!Object.hasOwn(remote,'a')||!Object.hasOwn(remote,'b'))throw Error('Invalid saved remote folders.');
    remoteFolders={};for(const side of ['a','b']){remoteFolders[side]=remote[side]===null?null:validateRemoteFolderDescriptor(remote[side]);if(remoteFolders[side]&&folders[side])throw Error('A folder side cannot be both local and remote.');}
  }
  const o = value.options;
  if (typeof o.ignoreWhitespace !== 'boolean' || !['all','diff','same','context',...(['folder-compare','folder-merge','folder-sync'].includes(value.type)?FOLDER_FILTER_IDS:[])].includes(o.filter) || !['a-to-b','b-to-a'].includes(o.direction)) throw new Error('Invalid session options.');
  const result = {version:1, type:value.type, name:value.name, text, files, folders, ...(remoteFolders?{remoteFolders}:{}), options:{ignoreWhitespace:o.ignoreWhitespace,filter:o.filter,direction:o.direction}};
  if (value.locked !== undefined) {
    if(typeof value.locked !== 'boolean') throw new Error('Invalid session lock.');
    result.locked=value.locked;
  }
  if (value.type === 'folder-merge3') {
    const review = value.threeWay;
    if (!record(review) || !record(review.roots) || !record(review.choices) || Object.keys(review.choices).length > 100000) throw new Error('Invalid three-way folder review.');
    const roots = {}, choices = Object.create(null);
    for (const side of ['base','left','right']) {
      roots[side] = descriptor(review.roots[side],true);
      if (roots[side] && !roots[side].path) throw new Error('Invalid three-way folder path.');
    }
    for (const [key,side] of Object.entries(review.choices)) {
      if (!key || key.length > 32768 || /[\\\x00-\x1f]/.test(key) || path.posix.isAbsolute(key) || path.win32.isAbsolute(key) || key.split('/').some(part=>!part || part==='.' || part==='..') || !['base','left','right'].includes(side)) throw new Error('Invalid three-way folder choice.');
      choices[key] = side;
    }
    result.threeWay = {roots,choices};
    if(review.output!==undefined){
      result.threeWay.output=descriptor(review.output,true);
      if(result.threeWay.output&&!result.threeWay.output.path)throw new Error('Invalid three-way output folder path.');
    }
    // Cached scans and revisions are process-local authority, never session data.
    if (value.advanced !== undefined) throw new Error('Three-way folders require folder review state.');
  } else if (value.threeWay !== undefined) throw new Error('Folder review state requires a three-way folder session.');
  if(o.textGrammar!==undefined)result.options.textGrammar=validateTextGrammar(o.textGrammar);
  if(o.textProfileMappings!==undefined)result.options.textProfileMappings=validateTextProfileMappings(o.textProfileMappings);
  if(o.textProfile!==undefined)result.options.textProfile=validateTextProfile(o.textProfile);
  if(o.ignoredTextPatterns!==undefined){const patterns=validateIgnoredTextPatterns(o.ignoredTextPatterns);if(patterns.length)result.options.ignoredTextPatterns=patterns;}
  if(o.ignoreBlankLines!==undefined){if(typeof o.ignoreBlankLines!=='boolean')throw Error('Invalid blank line comparison rule.');if(o.ignoreBlankLines)result.options.ignoreBlankLines=true;}
  if(o.syntaxAlignment!==undefined){if(typeof o.syntaxAlignment!=='boolean')throw Error('Invalid code structure alignment option.');result.options.syntaxAlignment=o.syntaxAlignment;}
  if(o.showMovedBlocks!==undefined){if(typeof o.showMovedBlocks!=='boolean')throw Error('Invalid moved text display option.');result.options.showMovedBlocks=o.showMovedBlocks;}
  if (o.showMinor !== undefined) {
    if (typeof o.showMinor !== 'boolean') throw new Error('Invalid minor difference display option.');
    result.options.showMinor = o.showMinor;
  }
  if (o.whitespaceScope !== undefined) {
    if (!WHITESPACE_SCOPES.includes(o.whitespaceScope)) throw new Error('Invalid whitespace comparison scope.');
    result.options.whitespaceScope = o.whitespaceScope;
  }
  if (o.ignoreCase !== undefined) {
    if (typeof o.ignoreCase !== 'boolean') throw new Error('Invalid ignore case option.');
    result.options.ignoreCase = o.ignoreCase;
  }
  if (o.textAlignment !== undefined) {
    const anchors = o.textAlignment;
    if (!Array.isArray(anchors) || anchors.length > 1000) throw new Error('Invalid text alignment.');
    const count = side => text[side] === '' ? 0 : text[side].replace(/\r\n?/g, '\n').split('\n').length;
    const limits = {a:count('a'),b:count('b')};
    let previous = {a:-1,b:-1};
    result.options.textAlignment = Array.from(anchors, anchor => {
      if (!record(anchor) || ![Object.prototype,null].includes(Object.getPrototypeOf(anchor)) || Object.keys(anchor).some(key => !['a','b'].includes(key)) || ['a','b'].some(side => !Number.isSafeInteger(anchor[side]) || anchor[side] <= previous[side] || anchor[side] >= limits[side])) throw new Error('Invalid text alignment.');
      previous = {a:anchor.a,b:anchor.b};
      return previous;
    });
  }
  if (o.folderSyncMode !== undefined) {
    if(value.type !== 'folder-sync' || !['mirror','update','update-both'].includes(o.folderSyncMode)) throw new Error('Invalid folder synchronization method.');
    result.options.folderSyncMode=o.folderSyncMode;
  }
  if (o.folderRules !== undefined) result.options.folderRules = validateFolderRules(o.folderRules);
  if (o.folderNameRules !== undefined) {
    if (!['folder-compare','folder-merge','folder-sync'].includes(value.type)) throw Error('Filename matching requires a folder session.');
    result.options.folderNameRules=validateFolderNameRules(o.folderNameRules);
  }
  if (o.folderAlignment !== undefined) {
    const alignment = new FolderAlignment(o.folderAlignment,{a:remoteFolders?.a?'remote':'local',b:remoteFolders?.b?'remote':'local'});
    if (alignment.pairs.length && !['folder-compare','folder-merge','folder-sync'].includes(value.type)) throw new Error('Folder alignment requires a folder session.');
    result.options.folderAlignment = alignment.pairs.map(pair=>({...pair}));
  }
  if (o.readEncodings !== undefined) {
    if (!record(o.readEncodings) || Object.keys(o.readEncodings).some(key=>!['a','b'].includes(key)) || !['auto',...ENCODINGS].includes(o.readEncodings.a) || !['auto',...ENCODINGS].includes(o.readEncodings.b)) throw new Error('Invalid requested read encodings.');
    result.options.readEncodings = {a:o.readEncodings.a,b:o.readEncodings.b};
  }
  if(o.docxScopes!==undefined){if(!record(o.docxScopes)||Reflect.ownKeys(o.docxScopes).some(side=>!['a','b'].includes(side))||!['a','b'].every(side=>['main-document','main-and-related-text'].includes(o.docxScopes[side])))throw Error('Invalid DOCX text scopes.');result.options.docxScopes={...o.docxScopes};}
  if(o.odtScopes!==undefined){if(!record(o.odtScopes)||Reflect.ownKeys(o.odtScopes).some(side=>!['a','b'].includes(side))||!['a','b'].every(side=>['main-document','main-and-related-text'].includes(o.odtScopes[side])))throw Error('Invalid ODT text scopes.');result.options.odtScopes={...o.odtScopes};}
  if(o.docScopes!==undefined){if(!record(o.docScopes)||Reflect.ownKeys(o.docScopes).some(side=>!['a','b'].includes(side))||!['a','b'].every(side=>['main-document','main-and-related-text'].includes(o.docScopes[side])))throw Error('Invalid DOC text scopes.');result.options.docScopes={...o.docScopes};}
  for(const side of ['a','b'])if(files[side].documentProjection?.kind==='docx'&&(o.docxScopes?.[side]||'main-document')!==files[side].documentProjection.scope)throw Error('DOCX text scope disagrees with saved extraction provenance.');
  for(const side of ['a','b'])if(files[side].documentProjection?.kind==='odt'&&(o.odtScopes?.[side]||'main-document')!==files[side].documentProjection.scope)throw Error('ODT text scope disagrees with saved extraction provenance.');
  for(const side of ['a','b'])if(files[side].documentProjection?.kind==='doc'&&(o.docScopes?.[side]||'main-document')!==files[side].documentProjection.scope)throw Error('DOC text scope disagrees with saved extraction provenance.');
  if(o.pdfOrders!==undefined){
    if(!record(o.pdfOrders)||Object.keys(o.pdfOrders).some(side=>!['a','b'].includes(side))||!['a','b'].every(side=>['document','page-rows','page-columns','tagged-structure'].includes(o.pdfOrders[side])))throw Error('Invalid PDF ordering settings.');
    // Older sessions persisted a pending selector alongside committed PDF text.
    // Validated extraction provenance owns its order; retain the edited draft.
    result.options.pdfOrders=Object.fromEntries(['a','b'].map(side=>[side,files[side].documentProjection?.kind==='pdf'?(files[side].documentProjection.order||'document'):o.pdfOrders[side]]));
  }
  if (o.textInputEncodings !== undefined) {
    if (!record(o.textInputEncodings)) throw new Error('Invalid source text encodings.');
    result.options.textInputEncodings = {};
    for (const side of ['a','b']) {
      if (!['auto',...ENCODINGS].includes(o.textInputEncodings[side])) throw new Error('Invalid source text encoding.');
      result.options.textInputEncodings[side] = o.textInputEncodings[side];
    }
  }
  if (o.textFormats !== undefined) {
    if (!record(o.textFormats)) throw new Error('Invalid text formats.');
    result.options.textFormats = {};
    for (const side of ['a','b']) result.options.textFormats[side] = validateFormat(o.textFormats[side]);
  }
  if (o.folderView !== undefined) {
    const view = o.folderView;
    if (!record(view) || !['tree','flat','recursive','filename'].includes(view.mode) || !['name','path','size-left','size-right','modified-left','modified-right'].includes(view.sort) || typeof view.descending !== 'boolean') throw new Error('Invalid folder view.');
    if(view.alwaysShowFolders!==undefined&&typeof view.alwaysShowFolders!=='boolean')throw new Error('Invalid folder visibility.');
    if(view.hideLegend!==undefined&&typeof view.hideLegend!=='boolean')throw new Error('Invalid legend visibility.');
    result.options.folderView = {mode:view.mode,sort:view.sort,descending:view.descending,...(view.alwaysShowFolders!==undefined?{alwaysShowFolders:view.alwaysShowFolders}:{}),...(view.hideLegend!==undefined?{hideLegend:view.hideLegend}:{}),...(view.refreshIntervalMs!==undefined?{refreshIntervalMs:validateRefreshInterval(view.refreshIntervalMs)}:{})};
  }
  for (const key of ['folderInclude','folderExclude','folderSearch']) if (o[key] !== undefined) {
    if (typeof o[key] !== 'string' || o[key].length > 4096 || o[key].includes('\0')) throw new Error('Invalid folder filter.');
    result.options[key] = o[key];
  }
  if (o.textTools !== undefined) {
    const tools = o.textTools;
    if (!record(tools) || !['a','b'].includes(tools.side) || !record(tools.bookmarks)) throw new Error('Invalid text tools.');
    const clean = {side:tools.side,bookmarks:{}};
    for (const key of ['query','replacement']) {
      if (typeof tools[key] !== 'string' || Buffer.byteLength(tools[key]) > MAX_TEXT_BYTES) throw new Error('Invalid text tool search.');
      clean[key] = tools[key];
    }
    for (const key of ['matchCase','wrap','whitespace']) {
      if (typeof tools[key] !== 'boolean') throw new Error('Invalid text tool option.');
      clean[key] = tools[key];
    }
    if(tools.regex!==undefined&&typeof tools.regex!=='boolean')throw new Error('Invalid pattern search option.');
    clean.regex=tools.regex===true;
    for (const side of ['a','b']) {
      const marks = tools.bookmarks[side];
      if (!Array.isArray(marks) || marks.length > 100000 || marks.some(n => !Number.isSafeInteger(n) || n < 1)) throw new Error('Invalid bookmarks.');
      clean.bookmarks[side] = [...new Set(marks)].sort((a,b) => a-b);
    }
    result.options.textTools = clean;
  }
  if (value.advanced !== undefined) {
    if(value.advanced?.options?.tableCellEdits!=null&&value.type!=='table-compare')throw Error('Workbook cell edits require a table comparison.');
    if(value.advanced?.options?.tableStructure!=null&&value.type!=='table-compare')throw Error('Workbook structural edits require a table comparison.');
    if(value.advanced?.options?.tableStyleEdits!=null&&value.type!=='table-compare')throw Error('Workbook formatting edits require a table comparison.');
    result.advanced = validateAdvanced(value.advanced,value.type);
  }
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_SESSION_BYTES) throw new Error('Session exceeds 25 MB.');
  return result;
}
async function readLimited(file, limit) {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error('File is too large or is not a regular file.');
    const buffer = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const {bytesRead} = await handle.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > stat.size) throw new Error('File changed while reading. Try again.');
    return new TextDecoder('utf-8', {fatal:true}).decode(buffer.subarray(0,offset));
  } finally { await handle.close(); }
}
async function readDataLimited(file, limit = MAX_DATA_BYTES) {
  const {constants} = require('node:fs');
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const before = await handle.stat({bigint:true});
    if (!before.isFile() || before.size > BigInt(limit)) throw new Error(`File is too large or is not a regular file (${Math.floor(limit/1024/1024)} MB maximum).`);
    const buffer = Buffer.alloc(Number(before.size) + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const {bytesRead} = await handle.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await handle.stat({bigint:true});
    const current = await fs.lstat(file, {bigint:true});
    const signature = stat => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    if (!current.isFile() || offset !== Number(before.size) || signature(before) !== signature(after) || signature(after) !== signature(current)) throw new Error('File changed while reading. Try again.');
    return buffer.subarray(0,offset);
  } finally { await handle.close(); }
}
async function readTextLimited(file, encoding = 'auto') {
  return decodeText(await readDataLimited(file, MAX_TEXT_BYTES), encoding);
}
async function stageSession(file, backupRoot) {
  return stageSessionData(JSON.parse(await readLimited(file, MAX_SESSION_BYTES)), backupRoot);
}
async function stageSessionData(value, backupRoot) {
  const data = validateSession(value);
  const folders = new FolderService(backupRoot);
  let threeWay;
  if (data.type === 'folder-merge3') {
    threeWay = new ThreeWayFolders(backupRoot);
    for (const side of ['base','left','right']) if (data.threeWay.roots[side]) data.threeWay.roots[side] = await threeWay.select(side,data.threeWay.roots[side].path);
    if(data.threeWay.output)data.threeWay.output=await threeWay.selectOutput(data.threeWay.output.path);
  }
  const textPaths = {};
  for (const side of ['a','b']) {
    if (data.folders[side]) data.folders[side] = await folders.select(side, data.folders[side].path);
    if (data.files[side].path) {
      const canonical = await fs.realpath(data.files[side].path);
      if (!(await fs.stat(canonical)).isFile()) throw new Error('A session text path is not a file.');
      textPaths[side] = canonical;
      data.files[side].path = canonical;
    }
  }
  const pairs = data.options.folderAlignment || [];
  if (pairs.length) {
    if (['a','b'].some(side=>!folders.roots[side]&&!data.remoteFolders?.[side])) throw new Error('Saved folder alignment requires both folder roots.');
    const localSides=['a','b'].filter(side=>!data.remoteFolders?.[side]);
    const stamp = stat => `${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    const roots = {};
    for (const side of localSides) roots[side] = stamp(await fs.lstat(folders.roots[side],{bigint:true}));
    const endpoint = async (side,relative,kind) => {
      if (folders.isIgnoredPath(relative)) throw new Error('Saved folder alignment points into an excluded folder.');
      try {
        const full = await folders.safe(side,relative), stat = await fs.lstat(full,{bigint:true});
        if (stat.isSymbolicLink() || (kind === 'file' ? !stat.isFile() : !stat.isDirectory())) throw new Error('A saved folder alignment endpoint changed type.');
        if (await folders.safe(side,relative) !== full) throw new Error('A saved folder alignment endpoint changed.');
        return stamp(stat);
      } catch (error) {
        if (['ENOENT','ENOTDIR'].includes(error.code)) return null;
        throw error;
      }
    };
    const checked = [];
    for (const pair of pairs) for (const side of localSides) checked.push({side,relative:pair[side],kind:pair.kind,stamp:await endpoint(side,pair[side],pair.kind)});
    for (const item of checked) if (await endpoint(item.side,item.relative,item.kind) !== item.stamp) throw new Error('A saved folder alignment endpoint changed while restoring.');
    for (const side of localSides) if (await fs.realpath(folders.roots[side]) !== folders.roots[side] || stamp(await fs.lstat(folders.roots[side],{bigint:true})) !== roots[side]) throw new Error('A saved folder alignment root changed while restoring.');
  }
  return {data, folders, textPaths, threeWay};
}
module.exports = {validateRemoteFolderDescriptor,validateSession, readLimited, stageSession, stageSessionData, MAX_TEXT_BYTES, MAX_SESSION_BYTES, MAX_DATA_BYTES, TYPES, decodeData, readDataLimited, readTextLimited};
