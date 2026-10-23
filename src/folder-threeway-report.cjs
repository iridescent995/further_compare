'use strict';
// Portable, detached review export. This module never reads or writes compared files.
const SIDES = ['base', 'left', 'right'];
const STATUSES = ['unchanged', 'both', 'left', 'right', 'merged', 'conflict'];
const MAX_ROWS = 200000, MAX_OPERATIONS = 300000, MAX_PATH_BYTES = 48 * 1024 * 1024;
function string(value, label = 'Text') {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > 32768) throw new TypeError(`${label} must be bounded text.`);
  return value;
}
function array(value, limit, label) {
  if (!Array.isArray(value) || value.length > limit) throw new RangeError(`${label} exceeds the report limit or is not an array.`);
  return value;
}
function number(value, nullable = false) {
  if (nullable && value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Expected a nonnegative safe integer.');
  return value;
}
const kind = value => value == null ? null : ['file', 'directory'].includes(value) ? value : (() => {throw new TypeError('Invalid entry kind.');})();
const root = value => string(typeof value === 'string' ? value : value?.path);
function paths(limit = MAX_PATH_BYTES) {
  let bytes = 0;
  return value => {
    const path = string(value, 'Path');
    if (!path) throw new TypeError('Entry paths must not be empty.');
    bytes += new TextEncoder().encode(path).length;
    if (bytes > limit) throw new RangeError('Report paths exceed the comparison limit.');
    return path;
  };
}
function createThreeWayReport({name, analysis, choices = {}, resolution, output, plan, appliedResult, generatedAt} = {}) {
  if (!analysis) throw new TypeError('Analyze folders before creating a report.');
  const path = paths(), seen = new Set();
  const entries = array(analysis.rows, MAX_ROWS, 'Analysis rows').map(source => {
    const row = {path:path(source.path),status:source.status,reason:string(source.reason) || null,blockedBy:string(source.blockedBy) || null,choice:null};
    if (seen.has(row.path)) throw new TypeError('Duplicate analysis path.');
    seen.add(row.path);
    if (!STATUSES.includes(row.status)) throw new TypeError('Invalid analysis status.');
    if (row.status === 'conflict' && !row.blockedBy && Object.hasOwn(choices, row.path) && SIDES.includes(choices[row.path])) row.choice = choices[row.path];
    for (const side of SIDES) {
      const suffix = side[0].toUpperCase() + side.slice(1);
      row['kind'+suffix] = kind(source['kind'+suffix]);
      row['size'+suffix] = row['kind'+suffix] === 'file' ? number(source['size'+suffix], true) : null;
    }
    return row;
  });
  const statistics = {entries:entries.length,statuses:Object.fromEntries(STATUSES.map(status=>[status,0])),conflictAnchors:0,selectedConflicts:0,unselectedConflicts:0,blockedEntries:0,skippedEntries:0};
  for (const row of entries) {
    statistics.statuses[row.status]++;
    if (row.blockedBy) statistics.blockedEntries++;
    else if (row.status === 'conflict') {statistics.conflictAnchors++;statistics[row.choice ? 'selectedConflicts' : 'unselectedConflicts']++;}
  }
  const skipped = Object.fromEntries(SIDES.map(side=>[side,number(analysis.skipped?.[side])]));
  statistics.skippedEntries = SIDES.reduce((sum,side)=>sum+skipped[side],0);
  if (!Number.isSafeInteger(statistics.skippedEntries)) throw new RangeError('Skipped entry count exceeds the report limit.');
  let reviewed = null, preview = null, applied = null;
  if (resolution) {
    const entryPath = paths(), conflictPath = paths();
    reviewed = {state:'reviewed-not-applied',entries:array(resolution.entries,MAX_ROWS,'Resolved entries').map(entry=>({path:entryPath(entry.path),kind:kind(entry.kind),size:entry.kind === 'file' ? number(entry.size,true) : null,sourceSide:SIDES.includes(entry.sourceSide)?entry.sourceSide:null,sourcePath:entry.sourceSide?string(entry.sourcePath)||null:null})),conflicts:array(resolution.conflicts,MAX_ROWS,'Unresolved conflicts').map(conflictPath)};
  }
  if (plan) {
    const operationPath = paths(64 * 1024 * 1024), counts = {};
    const operations = array(plan.operations,MAX_OPERATIONS,'Output operations').map(operation=>{
      if (!['delete-file','delete-directory','create-directory','copy-file'].includes(operation.type)) throw new TypeError('Invalid output operation.');
      counts[operation.type] = (counts[operation.type] || 0) + 1;
      return {type:operation.type,path:operationPath(operation.path),sourceSide:SIDES.includes(operation.sourceSide)?operation.sourceSide:null,sourcePath:operation.sourceSide?string(operation.sourcePath)||null:null,size:number(operation.size,true),oldSize:number(operation.oldSize,true)};
    });
    preview = {state:'preview-not-applied',output:root(plan.output),counts,operations};
  }
  if (appliedResult && !appliedResult.cancelled) applied = {state:'reported-completed',completed:number(appliedResult.completed),backupPath:string(appliedResult.backupPath)||null};
  const date = generatedAt == null ? new Date() : new Date(generatedAt);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid report generation time.');
  return {version:1,title:'Further Compare — Three-way folder review',name:string(name),generatedAt:date.toISOString(),roots:Object.fromEntries(SIDES.map(side=>[side,root(analysis.roots?.[side])])),skipped,
    coverage:{scope:'all-analysis-rows',state:statistics.skippedEntries?'incomplete':'complete',entries:entries.length},statistics,entries,
    resolution:reviewed,output:root(output),plan:preview,applied,
    notes:'Frozen analysis snapshot; no files were rescanned for this report. External changes require Analyze folders again. All analysis rows are included regardless of search, collapsed folders or pagination. Skipped entries are excluded from analysis and prevent a complete resolution. Selected conflict choices are review decisions, not proof of resolution or applied changes. Resolution and output plans are previews. Only the separate applied summary records an operation result; this report does not verify the current output.'};
}
const text = value => value == null ? '' : String(value);
const escape = value => text(value).replace(/[&<>"']/g, character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
function csv(value) {
  if (typeof value === 'number') return String(value);
  let result = text(value);
  if (/^[=+@\-\s\x00-\x1f\x7f]/u.test(result)) result = "'" + result;
  return '"'+result.replace(/"/g,'""')+'"';
}
function sections(report) {
  const metadata = [['Name',report.name],['Generated (UTC)',report.generatedAt],...SIDES.map(side=>[`${side} root`,report.roots[side]]),['Coverage',report.coverage.state],['Scope',report.coverage.scope],...SIDES.map(side=>[`${side} skipped`,report.skipped[side]]),...Object.entries(report.statistics).filter(([,value])=>typeof value==='number'),['Output folder',report.output],['Notes',report.notes]];
  const result = [{title:'Report details',columns:['Field','Value'],rows:metadata},{title:'Analysis entries',columns:['Path','Status','Reason','Blocked by','Selected choice','Base kind','Base size','Left kind','Left size','Right kind','Right size'],rows:report.entries.map(row=>[row.path,row.status,row.reason,row.blockedBy,row.choice,row.kindBase,row.sizeBase,row.kindLeft,row.sizeLeft,row.kindRight,row.sizeRight])}];
  if (report.resolution) {
    result.push({title:'Reviewed resolution — not applied',columns:['Path','Kind','Size','Source side','Source path'],rows:report.resolution.entries.map(row=>[row.path,row.kind,row.size,row.sourceSide,row.sourcePath])});
    result.push({title:'Unresolved conflicts in reviewed resolution',columns:['Path'],rows:report.resolution.conflicts.map(path=>[path])});
  } else result.push({title:'Resolution',columns:['State'],rows:[['Not reviewed']]});
  if (report.plan) {
    result.push({title:'Output plan — preview, not applied',columns:['Target','Operations'],rows:[[report.plan.output,report.plan.operations.length]]});
    result.push({title:'Planned operations',columns:['Type','Path','Source side','Source path','Size','Previous size'],rows:report.plan.operations.map(row=>[row.type,row.path,row.sourceSide,row.sourcePath,row.size,row.oldSize])});
  } else result.push({title:'Output plan',columns:['State'],rows:[['No current preview']]});
  result.push({title:'Applied result',columns:['State','Completed operations','Backup path'],rows:report.applied?[[report.applied.state,report.applied.completed,report.applied.backupPath]]:[['No applied result recorded',null,null]]});
  return result;
}
function formatThreeWayReport(report, format = 'json') {
  if (format === 'json') return JSON.stringify(report,null,2)+'\n';
  const groups = sections(report);
  if (format === 'csv') return [[report.title],...groups.flatMap(group=>[[],[group.title],group.columns,...group.rows])].map(row=>row.map(csv).join(',')).join('\r\n')+'\r\n';
  if (format === 'text' || format === 'txt') return [report.title,...groups.flatMap(group=>['',group.title,group.columns.join('\t'),...group.rows.map(row=>row.map(value=>text(value).replace(/[\r\n\t\x00-\x1f\x7f]/g,' ')).join('\t'))])].join('\n')+'\n';
  if (format !== 'html') throw new TypeError('Unsupported three-way report format.');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(report.title)}</title><style>body{font:14px system-ui,sans-serif;margin:24px;background:#faf8fc;color:#332c40}h1{font-size:24px}h2{font-size:18px;margin-top:28px}table{border-collapse:collapse;width:100%;background:white}th,td{padding:6px 9px;text-align:left;vertical-align:top;overflow-wrap:anywhere;max-width:540px}th{background:#ede6f5}tr:nth-child(even){background:#f7f4fa}.table{overflow:auto}@media print{body{margin:0}.table{overflow:visible}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><h1>${escape(report.title)}</h1>${groups.map(group=>`<section><h2>${escape(group.title)}</h2><div class="table"><table><thead><tr>${group.columns.map(value=>`<th>${escape(value)}</th>`).join('')}</tr></thead><tbody>${group.rows.map(row=>`<tr>${row.map(value=>`<td>${escape(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`).join('')}</body></html>`;
}
module.exports = {createThreeWayReport,formatThreeWayReport};
