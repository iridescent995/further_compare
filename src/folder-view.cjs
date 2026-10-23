'use strict';
const {FOLDER_FILTER_IDS,matchesFolderStatus}=require('../desktop/folder-display.cjs');
// Quoted JSON strings are exact root-relative paths; bare tokens remain globs.
function split(value) {
 const result=[];let token='',quoted=false,escape=false;
 for(const char of String(value||'')){
  if(quoted){token+=char;if(escape)escape=false;else if(char==='\\')escape=true;else if(char==='"')quoted=false;}
  else if(char===';' ){if(token.trim())result.push(token.trim());token='';}
  else{if(char==='"'&&!token.trim())quoted=true;token+=char;}
 }
 if(token.trim())result.push(token.trim());return result;
}
function literal(pattern){if(!pattern.startsWith('"'))return null;try{const value=JSON.parse(pattern);return typeof value==='string'?value:null;}catch{return null;}}
function appendExcludedPaths(expression,paths){
 const patterns=split(expression),known=new Set(patterns);
 if(patterns.some(pattern=>pattern.startsWith('"')&&literal(pattern)===null))throw Error('Fix the unfinished quoted path in filename filters first.');
 for(const path of paths){const pattern=JSON.stringify(path);if(!known.has(pattern)){patterns.push(pattern);known.add(pattern);}}
 const result=patterns.join(';');if(result.length>4096)throw Error('Too many exclusions. Edit filename filters to shorten the list.');return result;
}
const compiled = new Map();
function glob(pattern) {
  if (compiled.has(pattern)) return compiled.get(pattern);
  const tokens = [];
  for (let i=0;i<pattern.length;i++) {
    if (pattern[i] === '*') { let count=1; while(pattern[i+1]==='*'){count++;i++;} tokens.push(count>1?'**':'*'); }
    else tokens.push(pattern[i].toLowerCase());
  }
  // Dynamic programming avoids exponential regular-expression backtracking
  // for masks such as *a*a*a*a*b on a long filename.
  const matcher = {test(value) {
    value=value.toLowerCase();let previous=new Uint8Array(value.length+1);previous[0]=1;
    for(const token of tokens){const current=new Uint8Array(value.length+1),star=token==='*'||token==='**';if(star)current[0]=previous[0];for(let i=1;i<=value.length;i++){const allowed=token==='**'||value[i-1]!=='/';current[i]=star?(previous[i]||(allowed&&current[i-1])):(previous[i-1]&&(token==='?'?allowed:token===value[i-1]));}previous=current;}
    return !!previous[value.length];
  }};
  if(compiled.size>=128)compiled.delete(compiled.keys().next().value);
  compiled.set(pattern,matcher);return matcher;
}
function matches(path, patterns) {
  const name = path.split('/').pop();
  return patterns.some(pattern => {const exact=literal(pattern);return exact!==null?path===exact:glob(pattern).test(pattern.includes('/') ? path : name);});
}
function excluded(path, expression) {
  const patterns = split(expression), parts = path.split('/');
  return patterns.some(pattern => {
    const exact=literal(pattern);if(exact!==null)return path===exact||path.startsWith(exact+'/');
    const test = glob(pattern);
    if (pattern.includes('/')) {
      // Aligned entries can live beneath a different logical parent. Check disk
      // ancestors too, so excluding a directory hides all of its descendants.
      let ancestor = '';
      return parts.some(part => {
        ancestor += (ancestor ? '/' : '') + part;
        return test.test(ancestor) || (pattern.endsWith('/**') && test.test(ancestor + '/'));
      });
    }
    return parts.some(part => test.test(part));
  });
}
// Native aligned rows have independent disk paths and an opaque tree identity.
function entryKey(row) { return typeof row.id === 'string' ? row.id : row.path; }
function entryPaths(row) {
  return typeof row.id === 'string'
    ? [row.pathA, row.pathB].filter(path => typeof path === 'string')
    : [row.path];
}
function filterEntries(rows, {include = '*', exclude = '', query = '', status = 'all', retainDirectories = false, alwaysShowFolders = false} = {}) {
  const patterns = split(include), included = new Set(), byId = new Map(rows.map(row => [entryKey(row), row]));
  const hidden = row => entryPaths(row).some(path => excluded(path, exclude));
  function ancestors(row) {
    const parents = [], visited = new Set([entryKey(row)]);
    if (typeof row.id === 'string') {
      let parent = byId.get(row.parentId);
      while (parent && !visited.has(entryKey(parent))) {
        visited.add(entryKey(parent)); parents.push(parent); parent = byId.get(parent.parentId);
      }
    } else {
      let path = row.path;
      while (path.includes('/')) {
        path = path.slice(0, path.lastIndexOf('/'));
        if (byId.has(path)) parents.push(byId.get(path));
      }
    }
    return parents;
  }
  for (const row of rows) {
    const parents = ancestors(row);
    if (hidden(row) || parents.some(hidden)) continue;
    const paths = entryPaths(row);
    const directory = row.kindA === 'directory' || row.kindB === 'directory';
    // A lazy tree needs its paired containers to remain navigable: unopened
    // children have no comparison result yet. Retention does not classify them.
    const retainedDirectory = retainDirectories && ['diff','context',...FOLDER_FILTER_IDS].includes(status) &&
      row.kindA === 'directory' && row.kindB === 'directory';
    const statusMatch = (alwaysShowFolders === true && directory) || retainedDirectory || matchesFolderStatus(row,status);
    if (!statusMatch || !paths.some(path => path.toLowerCase().includes(query.toLowerCase()))) continue;
    if (!directory && patterns.length && !paths.some(path => matches(path, patterns))) continue;
    included.add(entryKey(row));
    for (const parent of parents) included.add(entryKey(parent));
  }
  return rows.filter(row => included.has(entryKey(row)));
}
function selectEntries(rows, side, rule, current = new Set()) {
  const key = side === 'a' ? 'kindA' : 'kindB';
  return new Set(rows.filter(row => row[key] && (
    rule === 'all' || (['files','files-both'].includes(rule) && row[key]==='file') ||
    (rule === 'one-sided-both' && row.status === (side==='a'?'left':'right')) ||
    (rule === 'newer-both' && row.kindA==='file' && row.kindB==='file' && (side==='a'?row.mtimeA>row.mtimeB:row.mtimeB>row.mtimeA)) ||
    (rule === 'invert' && !current.has(entryKey(row))) ||
    (rule === 'left-only' && row.status === 'left') || (rule === 'right-only' && row.status === 'right') ||
    (rule === 'matching' && row.status === 'equal' && row.kindA === 'file' && row.kindB === 'file') ||
    (rule === 'changed' && ['changed','different','conflict'].includes(row.status)) ||
    (rule === 'newer-left' && row.kindA === 'file' && row.kindB === 'file' && row.mtimeA > row.mtimeB) ||
    (rule === 'newer-right' && row.kindA === 'file' && row.kindB === 'file' && row.mtimeB > row.mtimeA)
  )).map(entryKey));
}
module.exports = {glob, excluded, entryKey, filterEntries, selectEntries, appendExcludedPaths, splitFolderPatterns:split};

// Summarize only supplied rows; never infer equality or read unopened nodes.
function parentsWithDifferences(rows) {
  const byId=new Map(rows.map(row=>[entryKey(row),row])),marked=new Set(),walked=new Set();
  for(const row of rows){
    if(!['changed','different','left','right','conflict'].includes(row.status))continue;
    let parent=byId.get(row.parentId);
    while(parent&&!walked.has(entryKey(parent))){
      const id=entryKey(parent);walked.add(id);
      if(parent.kindA==='directory'&&parent.kindB==='directory')marked.add(id);
      parent=byId.get(parent.parentId);
    }
  }
  return marked;
}
module.exports.parentsWithDifferences=parentsWithDifferences;

function createFolderSummaryCache(){
  let scope=null;const known=new Set();
  return {
    reset(){scope=null;known.clear();},
    summarize(rows,expanded,nextScope){
      if(scope!==nextScope){known.clear();scope=nextScope;}
      for(const row of rows)if(expanded.has(entryKey(row)))known.delete(entryKey(row));
      const remembered=rows.filter(row=>known.has(entryKey(row))&&row.kindA==='directory'&&row.kindB==='directory');
      const seeds=new Set(remembered.map(entryKey));
      const marked=parentsWithDifferences(rows.map(row=>seeds.has(entryKey(row))?{...row,status:'changed'}:row));
      for(const row of remembered)marked.add(entryKey(row));
      for(const row of rows)if(expanded.has(entryKey(row))&&marked.has(entryKey(row)))known.add(entryKey(row));
      while(known.size>50000)known.delete(known.values().next().value);
      return marked;
    }
  };
}
module.exports.createFolderSummaryCache=createFolderSummaryCache;
