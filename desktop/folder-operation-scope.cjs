'use strict';
const {validateFolderRules}=require('./folder-rules.cjs');
const {FOLDER_FILTER_IDS}=require('./folder-display.cjs');
const {filterEntries}=require('../src/folder-view.cjs');
const statuses=new Set(['all','diff','context','same',...FOLDER_FILTER_IDS]);
function validateOperationScope(value={}) {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).some(k=>!['include','exclude','query','status','rules'].includes(k)))throw Error('Invalid operation scope.');
  const result={include:value.include===undefined?'*':value.include,exclude:value.exclude===undefined?'':value.exclude,query:value.query===undefined?'':value.query,status:value.status===undefined?'all':value.status,rules:validateFolderRules(value.rules===undefined?{}:value.rules)};
  for(const key of ['include','exclude','query'])if(typeof result[key]!=='string'||result[key].length>4096||result[key].includes('\0'))throw Error('Invalid operation '+key+'.');
  if(!statuses.has(result.status))throw Error('Invalid operation status.');
  Object.freeze(result.rules);return Object.freeze(result);
}
const {validEndpointRelative,validateEndpointKinds}=require('./folder-endpoint-path-policy.cjs');
// Inventory must contain every source descendant, including hidden entries.
// Logical parentage controls display; actual disk ancestry controls safe removal.
function selectOperationEntries(rows,scope,side,endpointKinds) {
  endpointKinds=validateEndpointKinds(endpointKinds);
  scope=validateOperationScope(scope);
  if(!['a','b'].includes(side)||!Array.isArray(rows)||rows.length>50000)throw Error('Invalid operation inventory.');
  const byId=new Map(),paths={a:new Map(),b:new Map()};
  for(const row of rows){
    if(!row||typeof row!=='object'||typeof row.id!=='string'||!row.id||row.id==='root'||row.id.length>32768||byId.has(row.id)||!(row.parentId===null||typeof row.parentId==='string')||typeof row.status!=='string'||!['equal','changed','different','conflict','left','right','unchecked'].includes(row.status))throw Error('Invalid operation row.');
    let exists=false;
    for(const s of ['a','b']){
      const path=row[s==='a'?'pathA':'pathB'],kind=row[s==='a'?'kindA':'kindB'];
      if(path===null&&kind===null)continue;
      if(!validEndpointRelative(path,endpointKinds[s])||!['file','directory'].includes(kind)||paths[s].has(path))throw Error('Invalid operation endpoint.');
      paths[s].set(path,row);exists=true;
      for(const field of [s==='a'?'sizeA':'sizeB',s==='a'?'mtimeA':'mtimeB'])if(row[field]!==undefined&&row[field]!==null&&(!Number.isFinite(row[field])||(field.startsWith('size')&&row[field]<0)))throw Error('Invalid operation metadata.');
    }
    if(!exists)throw Error('Empty operation row.');byId.set(row.id,row);
  }
  const visited=new Set();
  for(const row of rows){
    const chain=new Set();let current=row;
    while(current&&!visited.has(current.id)){
      if(chain.has(current.id))throw Error('Cyclic operation inventory.');chain.add(current.id);
      if(current.parentId===null||current.parentId==='root')break;
      const parent=byId.get(current.parentId);if(!parent||!(parent.kindA==='directory'||parent.kindB==='directory'))throw Error('Missing operation parent.');current=parent;
    }
    for(const id of chain)visited.add(id);
  }
  for(const s of ['a','b'])for(const [path]of paths[s]){
    const parts=path.split('/');for(let n=1;n<parts.length;n++)if(paths[s].get(parts.slice(0,n).join('/'))?.[s==='a'?'kindA':'kindB']!=='directory')throw Error('Missing disk ancestor in operation inventory.');
  }
  const pathKey=side==='a'?'pathA':'pathB',kindKey=side==='a'?'kindA':'kindB';
  const eligible=new Set(filterEntries(rows,{...scope,retainDirectories:false}).filter(row=>row[kindKey]).map(row=>row.id));
  const fileIds=new Set(),directoryIds=new Set(),removableDirectoryIds=new Set();
  for(const row of rows)if(eligible.has(row.id))(row[kindKey]==='file'?fileIds:directoryIds).add(row.id);
  // Every excluded actual descendant prevents removal of all its ancestors,
  // regardless of its alignment or logical parent in the rendered tree.
  const retained=new Set();
  for(const row of rows)if(row[kindKey]&&!eligible.has(row.id)){
    const parts=row[pathKey].split('/');for(let n=1;n<parts.length;n++)retained.add(parts.slice(0,n).join('/'));
  }
  for(const id of directoryIds)if(!retained.has(byId.get(id)[pathKey]))removableDirectoryIds.add(id);
  return {fileIds,directoryIds,removableDirectoryIds};
}
module.exports={validateOperationScope,selectOperationEntries};
