const {validateTextGrammar,hasTextGrammar,TEXT_GRAMMAR_VERSION}=require('./text-grammar.cjs');
const {validateTextProfile,validateTextProfileMappings,resolveTextProfile,TEXT_PROFILE_RULES_VERSION}=require('./text-profile.cjs');
const {validateIgnoredTextPatterns}=require('./ignored-text-rules.cjs');
const blankRuleApplies=(mode,flag)=>flag===true&&mode.startsWith('text-');
const blankRuleDescription=(description,mode,flag)=>blankRuleApplies(mode,flag)?description.replace(/blank lines and (?:the )?final newline/gi,'the final newline after nonblank text')+' Empty lines and lines containing only spaces or tabs are ignored; other whitespace-only lines remain important.':description;
const {validateWhitespaceScope}=require('./text-whitespace.cjs');
const whitespaceLabel=scope=>({all:'All whitespace within lines',horizontal:'Spaces, tabs',leading:'Leading spaces/tabs',trailing:'Trailing spaces/tabs',edges:'Leading and trailing spaces/tabs',embedded:'Embedded spaces/tabs','leading-embedded':'Leading and embedded spaces/tabs','trailing-embedded':'Trailing and embedded spaces/tabs'})[validateWhitespaceScope(scope,'horizontal')];
const {validateFolderNameRules}=require('./folder-name-rules.cjs');
const {validateRefreshInterval}=require('./folder-refresh.cjs');
const {folderEncodings}=require('./folder-encoding.cjs');
const {ENCODINGS}=require('./text-codec.cjs');
'use strict';
// Portable report serialization: no filesystem, DOM or browser dependencies.
const STATES = new Set(['equal','changed','different','left','right','conflict','unchecked','directory','ignored']);
const text = value => value == null ? '' : String(value);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const bytes = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const iso = value => {
  if (value == null || value === '') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const root = value => typeof value === 'string' ? value : text(value?.path || value?.name);
function createFolderReport(input = {}) {
  const textGrammar=validateTextGrammar(input.rules?.textGrammar),grammarActive=hasTextGrammar(textGrammar);
  const textProfileMappings=validateTextProfileMappings(input.rules?.textProfileMappings);
  const mode = ['content','text-content','text-whitespace','text-case','text-whitespace-case','size','modified','size-modified'].includes(input.rules?.mode) ? input.rules.mode : 'content';
  const alignment = (Array.isArray(input.alignment) ? input.alignment : []).filter(pair => pair && typeof pair.a === 'string' && typeof pair.b === 'string' && ['file','directory'].includes(pair.kind)).map(({a,b,kind})=>({a,b,kind}));
  const entries = (Array.isArray(input.entries) ? input.entries : []).map(source => {
    const row = source || {}, kindA = ['file','directory'].includes(row.kindA) ? row.kindA : null,
      kindB = ['file','directory'].includes(row.kindB) ? row.kindB : null;
    const ignored = row.status === 'ignored' || row.ignored === true;
    let actualStatus = ignored && row.status === 'ignored' ? row.actualStatus : row.status;
    actualStatus = STATES.has(actualStatus) && actualStatus !== 'ignored' ? actualStatus : 'unknown';
    let status = actualStatus;
    const comparison = ['content','metadata','text-normalized'].includes(row.comparison) ? row.comparison : 'pending';
    if (status === 'equal' && (comparison === 'pending' || kindA !== 'file' || kindB !== 'file')) status = 'unchecked';
    actualStatus = status;
    if (ignored) status = 'ignored';
    const native = typeof row.id === 'string' || Object.hasOwn(row,'pathA') || Object.hasOwn(row,'pathB');
    const pathA = kindA ? (native ? (typeof row.pathA === 'string' ? row.pathA : null) : text(row.path)) : null;
    const pathB = kindB ? (native ? (typeof row.pathB === 'string' ? row.pathB : null) : text(row.path)) : null;
    const manuallyAligned = alignment.some(pair => {
      const suffix = (path,anchor) => path === anchor ? '' : pair.kind === 'directory' && path?.startsWith(anchor + '/') ? path.slice(anchor.length) : null;
      const a = suffix(pathA,pair.a), b = suffix(pathB,pair.b);
      return pathA != null && pathB != null ? a != null && a === b : pathA != null ? a != null : pathB != null && b != null;
    });
    return {...(input.rules?.textProfile==='auto'&&comparison==='text-normalized'?{resolvedTextProfile:resolveTextProfile('auto',[pathA,pathB],textProfileMappings),textProfileRulesVersion:TEXT_PROFILE_RULES_VERSION}:{}),...(typeof row.path === 'string' ? {path:row.path,name:text(row.name || row.path.split('/').pop())} : {}),pathA,pathB,nameA:pathA == null ? null : text(row.nameA || pathA.split('/').pop()),nameB:pathB == null ? null : text(row.nameB || pathB.split('/').pop()),manuallyAligned,kindA,kindB,
      sizeA:kindA === 'file' ? bytes(row.sizeA) : null,sizeB:kindB === 'file' ? bytes(row.sizeB) : null,
      mtimeA:kindA ? iso(row.mtimeA) : null,mtimeB:kindB ? iso(row.mtimeB) : null,status,comparison,...(Array.isArray(row.metadataDifferences)?{metadataDifferences:row.metadataDifferences.filter(key=>['filename','permissions','owner','group'].includes(key))}:{}),...(STATES.has(row.contentStatus)?{contentStatus:row.contentStatus}:{}),...(ignored ? {ignored:true,actualStatus} : {})};
  });
  const statistics = {entries:entries.length,files:0,directories:0,conflicts:0,contentMatches:0,metadataMatches:0,normalizedTextMatches:0,different:0,leftOnly:0,rightOnly:0,pending:0,unknown:0,ignored:0,leftBytes:0,rightBytes:0,leftFiles:0,rightFiles:0,leftUnknownSizes:0,rightUnknownSizes:0,statuses:{}};
  for (const row of entries) {
    if (row.ignored) statistics.ignored++;
    statistics.statuses[row.status] = (statistics.statuses[row.status] || 0) + 1;
    if (row.kindA === 'directory' || row.kindB === 'directory') statistics.directories++;
    const file = row.kindA === 'file' || row.kindB === 'file';
    if (file) {
      statistics.files++;
      if (row.status === 'equal') statistics[row.comparison === 'content' ? 'contentMatches' : row.comparison === 'text-normalized' ? 'normalizedTextMatches' : 'metadataMatches']++;
      else if (['changed','different'].includes(row.status)) statistics.different++;
      else if (row.status === 'left') statistics.leftOnly++;
      else if (row.status === 'right') statistics.rightOnly++;
      else if (row.status === 'unchecked') statistics.pending++;
      else if (row.status === 'unknown') statistics.unknown++;
    }
    if (!file && ['changed','different'].includes(row.status)) statistics.different++;
    if (row.status === 'conflict') statistics.conflicts++;
    for (const [side, suffix] of [['left','A'],['right','B']]) if (row['kind'+suffix] === 'file') {
      statistics[side+'Files']++;
      if (row['size'+suffix] == null) statistics[side+'UnknownSizes']++;
      else statistics[side+'Bytes'] += row['size'+suffix];
    }
  }
  return {version:2,nameRules:validateFolderNameRules(input.nameRules),alignment,matchingMode:input.matchingMode==='filename'?'filename':'path',title:'Further Compare — Folder comparison',generatedAt:iso(input.generatedAt) || new Date().toISOString(),
    left:root(input.left),right:root(input.right),
    rules:{mode,...(grammarActive?{textGrammar,textGrammarVersion:TEXT_GRAMMAR_VERSION}:{}),...(textProfileMappings.length?{textProfileMappings}:{}),...(validateTextProfile(input.rules?.textProfile)==='plain'?{}:{textProfile:input.rules.textProfile}),...(validateIgnoredTextPatterns(input.rules?.ignoredTextPatterns).length?{ignoredTextPatterns:validateIgnoredTextPatterns(input.rules?.ignoredTextPatterns)}:{}),...(input.rules?.textWhitespaceScope!==undefined&&validateWhitespaceScope(input.rules.textWhitespaceScope,'horizontal')!=='horizontal'?{textWhitespaceScope:input.rules.textWhitespaceScope}:{}),timeToleranceMs:count(input.rules?.timeToleranceMs),...Object.fromEntries(['ignoreBlankLines','compareFilename','comparePermissions','compareOwner','compareGroup','ignoreDaylightSaving','ignoreTimezone'].filter(key=>input.rules?.[key]===true).map(key=>[key,true])),...Object.fromEntries(['textEncoding','textEncodingA','textEncodingB'].filter(key=>input.rules?.[key]==='auto'||ENCODINGS.includes(input.rules?.[key])).map(key=>[key,input.rules[key]]))},
    scope:['visible','selected'].includes(input.scope) ? input.scope : 'loaded',
    scan:{state:['complete','partial','running','loaded'].includes(input.scan?.state) ? input.scan.state : 'loaded',skipped:count(input.scan?.skipped),nodes:count(input.scan?.nodes),entries:count(input.scan?.entries)},
    filters:{refreshIntervalMs:validateRefreshInterval(input.filters?.refreshIntervalMs),include:text(input.filters?.include ?? '*'),exclude:text(input.filters?.exclude),query:text(input.filters?.query),status:text(input.filters?.status || 'all'),alwaysShowFolders:input.filters?.alwaysShowFolders===true},notes:reportNotes(mode,input.rules?.textWhitespaceScope,input.rules?.ignoreBlankLines)+profileDescription(mode,input.rules?.textProfile,textGrammar)+(input.rules?.ignoredTextPatterns?.length?' Ignored text patterns apply only to text comparison keys within each physical line; original text and bytes are retained.':'')+(input.scope==='selected'?' Selected directories do not include descendants unless those rows are also selected.':''),statistics,entries};
}
const labels = {equal:'Match',changed:'Different',different:'Different',left:'Left only',right:'Right only',conflict:'Type conflict',unchecked:'Pending',directory:'Directory',unknown:'Unknown'};
function normalizedTextLabel(mode, plural = false, scope = 'horizontal',ignoreBlankLines=false) {
  if(blankRuleApplies(mode,ignoreBlankLines))return normalizedTextLabel(mode,plural,scope,false).replace(/\)$/, '; blank lines ignored)');
  if(scope!=='horizontal'&&['text-whitespace','text-whitespace-case'].includes(mode))return `${plural ? 'text matches' : 'Text match'} (${mode==='text-whitespace-case'?'case and ':''}${whitespaceLabel(scope).toLowerCase()} ignored)`;
  const rule = {'text-content':'encoding and line endings ignored','text-whitespace':'whitespace ignored','text-case':'case ignored','text-whitespace-case':'whitespace and case ignored'}[mode] || 'normalized comparison';
  return `${plural ? 'text matches' : 'Text match'} (${rule})`;
}
function profileDescription(mode,profile='plain',grammar){const grammarActive=hasTextGrammar(grammar);profile=validateTextProfile(profile);return profile==='plain'?'':mode.startsWith('text-')?(profile==='auto'?' Automatic filename profiles (rules v'+TEXT_PROFILE_RULES_VERSION+') resolve per pair; unmapped filenames or conflicting resolved profiles use plain text.':' '+profile.toUpperCase()+(grammarActive?' lexical profile uses configured grammar importance;':' comment profile ignores recognized comments;')+' original bytes and final newline are retained.'):' Text profile '+profile+' is retained but not applied by this comparison method.';}
function folderRuleDescription(mode,scope='horizontal',ignoreBlankLines=false,patterns=[],textProfile='plain',mappings=[],grammar){const validated=validateTextProfileMappings(mappings);return (validated.length?' Filename mappings (first match): '+validated.map(rule=>JSON.stringify(rule.pattern)+' → '+rule.profile).join('; ')+(textProfile==='auto'&&mode.startsWith('text-')?'.':' (retained, not applied).'):'')+profileDescription(mode,textProfile,grammar)+ blankRuleDescription(baseFolderRuleDescription(mode,scope),mode,ignoreBlankLines)+(patterns.length?(mode.startsWith('text-')?' Ignored text patterns apply within each physical line; original text and bytes are retained.':' Ignored text patterns are retained but not applied by this comparison method.'):'');}
function baseFolderRuleDescription(mode,scope='horizontal') {
  if(scope!=='horizontal'&&['text-whitespace','text-whitespace-case'].includes(mode))return `${whitespaceLabel(scope)}${mode==='text-whitespace-case'?', case':''} and line-ending styles ignored; blank lines and final newline retained. Binary, undecodable and files over 10 MiB use exact comparison.`;
  if (mode === 'text-whitespace') return 'Spaces, tabs and line-ending styles ignored; blank lines and final newline retained. Binary, undecodable and files over 10 MiB use exact comparison.';
  if (mode === 'text-content') return 'Encoding and line-ending styles ignored; case, spaces, tabs, blank lines and final newline retained. Binary, undecodable and files over 10 MiB use exact comparison.';
  if (mode === 'text-case') return 'Case and line-ending styles ignored; spaces, tabs, blank lines and final newline retained. Binary, undecodable and files over 10 MiB use exact comparison.';
  if (mode === 'text-whitespace-case') return 'Spaces, tabs, case and line-ending styles ignored; blank lines and final newline retained. Binary, undecodable and files over 10 MiB use exact comparison.';
  return mode === 'content' ? 'Exact content comparison.' : 'Metadata matches do not verify contents.';
}
function statusLabel(row, mode, scope='horizontal',ignoreBlankLines=false) { if (row.status === 'ignored') return `Ignored (actual result: ${statusLabel({...row,status:row.actualStatus === 'ignored' ? 'unknown' : row.actualStatus},mode,scope,ignoreBlankLines)})`; if (['changed','different'].includes(row.status)&&row.metadataDifferences?.length) return 'Different: '+row.metadataDifferences.join(', ')+(row.contentStatus==='equal'?' (file comparison matches)':row.contentStatus==='changed'||row.contentStatus==='different'?' and file comparison':''); return row.status === 'equal' ? (row.comparison === 'content' ? 'Content match' : row.comparison === 'text-normalized' ? normalizedTextLabel(mode,false,scope,ignoreBlankLines) : 'Metadata match (contents unverified)') : labels[row.status] || 'Unknown'; }
const columns = ['Left path','Right path','Status','Comparison','Left kind','Left size (bytes)','Left modified (UTC)','Right kind','Right size (bytes)','Right modified (UTC)'];
const values = (row,mode,scope,ignoreBlankLines) => [row.pathA,row.pathB,statusLabel(row,mode,scope,ignoreBlankLines),row.comparison+(row.resolvedTextProfile?' (auto → '+row.resolvedTextProfile+'; rules v'+row.textProfileRulesVersion+')':''),row.kindA,row.sizeA,row.mtimeA,row.kindB,row.sizeB,row.mtimeB];
function context(report) {
  return [['Generated (UTC)',report.generatedAt],['Left root',report.left],['Right root',report.right],['File matching',report.matchingMode==='filename'?'Filename across folders (same paths first, then duplicate names by path order)':'Relative path'],['Tree filename matching',report.matchingMode==='filename'?'Not applied in filename-across-folders view':[['ignoreCase','Ignore letter case'],['normalizeUnicode','Equivalent Unicode names'],['ignoreExtension','Match files with different extensions (full names first; same stem before final extension; ambiguous names unpaired)']].filter(([key])=>report.nameRules?.[key]).map(([,label])=>label).join('; ')||'Exact names'],['Manual alignments',(report.alignment || []).map(pair=>`${pair.a} ↔ ${pair.b} (${pair.kind})`).join('; ') || 'None'],['Scope',report.scope],['Scan state',report.scan.state],['Skipped entries',report.scan.skipped],['Scanned folders',report.scan.nodes],['Scanned entries',report.scan.entries],['Comparison method',report.rules.mode],['Text profile',(report.rules.textProfile||'plain')+(report.rules.mode.startsWith('text-')?'':' (not applied by this comparison method)')],['Grammar configuration',report.rules.textGrammar?JSON.stringify(report.rules.textGrammar)+(report.rules.mode.startsWith('text-')?'':' (retained, not applied)'):'Default grammar importance'],['Filename mappings (first match)',((report.rules.textProfileMappings||[]).map(rule=>JSON.stringify(rule.pattern)+' → '+rule.profile).join('; ')||'Builtin extensions')+(report.rules.textProfile==='auto'&&report.rules.mode.startsWith('text-')?'':' (retained, not applied)')],['Ignored text patterns',(report.rules.ignoredTextPatterns||[]).map(rule=>rule.pattern+(rule.matchCase?' (match case)':' (ignore case)')).join('; ')||'None'],['Ignore blank lines',report.rules.ignoreBlankLines?(blankRuleApplies(report.rules.mode,true)?'Yes (empty or spaces/tabs-only lines)':'Not applied by this comparison method'):'No'],['Whitespace handling',whitespaceLabel(report.rules.textWhitespaceScope)+(['text-whitespace','text-whitespace-case'].includes(report.rules.mode)?' ignored':' (not applied by this comparison method)')],['Time tolerance (ms)',report.rules.timeToleranceMs],['Ignore one-hour timestamp differences',report.rules.ignoreDaylightSaving?'Yes':'No'],['Ignore whole-hour timestamp differences',report.rules.ignoreTimezone?'Yes':'No'],['Additional metadata', [['compareFilename','Filename spelling'],['comparePermissions','Permissions'],['compareOwner','Owner (UID)'],['compareGroup','Group (GID)']].filter(([key])=>report.rules[key]).map(([,label])=>label).join(', ')||'None'],['Text encoding',report.rules.textEncoding||'auto'],['Left text encoding',folderEncodings(report.rules).a],['Right text encoding',folderEncodings(report.rules).b],['Include',report.filters.include],['Exclude',report.filters.exclude],['Search',report.filters.query],['Status filter',report.filters.status],['Always show folders',report.filters.alwaysShowFolders?'Yes':'No'],['Automatic refresh',report.filters.refreshIntervalMs===0?'Off':`Every ${report.filters.refreshIntervalMs/1000} seconds (root and opened tree nodes; recursive and filename views use manual refresh)`]];
}
function summary(report) { const s = report.statistics;return `${s.entries} entries · ${s.files} file rows · ${s.directories} directory rows · ${s.contentMatches} content matches · ${s.metadataMatches} metadata matches · ${s.normalizedTextMatches} ${normalizedTextLabel(report.rules.mode,true,report.rules.textWhitespaceScope,report.rules.ignoreBlankLines)} · ${s.different} different · ${s.leftOnly} left only · ${s.rightOnly} right only · ${s.conflicts} conflicts · ${s.pending} pending · ${s.ignored} ignored · ${s.unknown} unknown · ${s.leftBytes} left bytes (${s.leftUnknownSizes} unknown sizes) · ${s.rightBytes} right bytes (${s.rightUnknownSizes} unknown sizes)`; }
function reportNotes(mode,scope='horizontal',ignoreBlankLines=false){return blankRuleDescription(baseReportNotes(mode,scope),mode,ignoreBlankLines);}
function baseReportNotes(mode,scope='horizontal') {
  const rule = scope!=='horizontal'&&['text-whitespace','text-whitespace-case'].includes(mode)?`Text matches ignore ${mode==='text-whitespace-case'?'case, ':''}${whitespaceLabel(scope).toLowerCase()} and line-ending styles, but retain blank lines and the final newline` : mode === 'text-content' ? 'Text matches ignore encoding and line-ending styles, but retain case, spaces, tabs, blank lines and final newline' : mode === 'text-whitespace' ? 'Text matches (whitespace ignored) ignore spaces, tabs and line-ending styles, but retain blank lines and the final newline' : mode === 'text-case' ? 'Text matches (case ignored) ignore letter case and line-ending styles, but retain spaces, tabs, blank lines and the final newline' : mode === 'text-whitespace-case' ? 'Text matches (whitespace and case ignored) ignore spaces, tabs, letter case and line-ending styles, but retain blank lines and the final newline' : 'Normalized text matches follow the comparison rules captured in the report';
  return `Statistics describe only the exported rows. Ignored rows are temporary session exclusions, counted separately from comparison results; their actual result and comparison method are retained. Ignoring does not imply a match. Directory rows are not recursive content matches. Filename spelling comparison checks actual names of paired files and folders, including case, Unicode spelling and extension; pairing rules are separate and names are not changed. Selected Unix metadata rules compare permission bits and numeric owner/group IDs; they do not modify metadata. Metadata differences do not imply that file contents differ. Metadata matches do not verify contents. Timestamp exceptions apply only to modified-time comparison, with the configured tolerance; original displayed timestamps and newer-file direction are unchanged. ${rule}; they do not imply byte-identical files. Binary, undecodable and files over 10 MiB fall back to exact content comparison. A complete scan does not imply that filtered, visible or selected reports include every entry.`;
}
const escape = value => text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function csvCell(value) {
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  let output = text(value);
  // Neutralize formula and whitespace/control-prefixed text for spreadsheet readers.
  if (/^[=+@\-\s\x00-\x1f\x7f]/u.test(output)) output = "'" + output;
  return '"' + output.replace(/"/g,'""') + '"';
}
function formatFolderReport(report, format = 'json') {
  if (format === 'json') return JSON.stringify(report,null,2) + '\n';
  const metadata = context(report), note = report.notes || reportNotes(report.rules.mode,report.rules.textWhitespaceScope,report.rules.ignoreBlankLines);
  if (format === 'csv') return [...metadata,['Summary',summary(report)],['Note',note],[],columns,...report.entries.map(row=>values(row,report.rules.mode,report.rules.textWhitespaceScope,report.rules.ignoreBlankLines))].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  if (format === 'text' || format === 'txt') return [report.title,...metadata.map(([key,value])=>`${key}: ${value}`),'',summary(report),note,'',columns.join('\t'),...report.entries.map(row=>values(row,report.rules.mode,report.rules.textWhitespaceScope,report.rules.ignoreBlankLines).map(v=>v == null ? '—' : text(v).replace(/[\t\r\n]/g,' ')).join('\t'))].join('\n') + '\n';
  if (format !== 'html') throw new Error('Unsupported folder report format.');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(report.title)}</title><style>body{font:14px system-ui,sans-serif;color:#15243a;background:#f5f8fc;margin:24px}h1{font-size:24px}dl{display:grid;grid-template-columns:180px 1fr;gap:5px 16px}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}table{border-collapse:collapse;background:white;width:100%;font-size:12px}th,td{padding:6px 8px;border-bottom:1px solid #dbe3ee;text-align:left;vertical-align:top}th{background:#e4ecf6}td:nth-child(-n+2){overflow-wrap:anywhere;max-width:480px}tr:nth-child(even){background:#f7f9fc}.changed,.different,.conflict{color:#b02635}.left{color:#a77026}.right{color:#7b57c6}.equal{color:#17704d}.equal.metadata-match{color:#6270a2;background:#f4f3fc}.equal.text-normalized-match{color:#7b3c84;background:#fcf2fb}.unchecked,.unknown{color:#795500}.ignored{color:#64748b}.note{color:#475569;max-width:1000px}.table-wrap{overflow:auto}@media print{body{margin:0;background:white}th{display:table-cell}.table-wrap{overflow:visible}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><h1>${escape(report.title)}</h1><dl>${metadata.map(([key,value])=>`<dt>${escape(key)}</dt><dd>${escape(value)}</dd>`).join('')}</dl><p>${escape(summary(report))}</p><p class="note">${escape(note)}</p><div class="table-wrap"><table><thead><tr>${columns.map(v=>`<th scope="col">${escape(v)}</th>`).join('')}</tr></thead><tbody>${report.entries.map(row=>`<tr class="${STATES.has(row.status)?row.status:'unknown'}${row.status==='equal'&&row.comparison==='metadata'?' metadata-match':row.status==='equal'&&row.comparison==='text-normalized'?' text-normalized-match':''}">${values(row,report.rules.mode,report.rules.textWhitespaceScope,report.rules.ignoreBlankLines).map(v=>`<td>${v == null ? '—' : escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></body></html>`;
}
module.exports = {createFolderReport,formatFolderReport,normalizedTextLabel,folderRuleDescription,statusLabel};
