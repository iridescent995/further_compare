'use strict';
const path=require('node:path');
const {classifySnapshotEntries}=require('./folder-snapshot-comparison.cjs');
function buildOperationInventory(pair,alignment,side,rules){
  const other=side==='a'?'b':'a',rows=[],used=new Set(),lookup={a:new Map(),b:new Map()};
  function add(sourcePath,targetPath){
    const paths={[side]:sourcePath,[other]:targetPath},a=paths.a===null?null:pair.a.entries.get(paths.a),b=paths.b===null?null:pair.b.entries.get(paths.b);
    const row={id:String(rows.length),parentId:'root',pathA:paths.a,pathB:paths.b,kindA:a?.kind??null,kindB:b?.kind??null,sizeA:a?.size,sizeB:b?.size,mtimeA:a?.mtimeMs,mtimeB:b?.mtimeMs,...classifySnapshotEntries(a,b,rules,paths)};
    rows.push(row);for(const s of ['a','b'])if(paths[s]!==null)lookup[s].set(paths[s],row);
  }
  for(const relative of pair[side].entries.keys()){
    const mapped=alignment.counterpart(side,relative),target=mapped!==null&&pair[other].entries.has(mapped)?mapped:null;
    if(target!==null){if(used.has(target))throw Error('Ambiguous operation alignment.');used.add(target);}add(relative,target);
  }
  for(const relative of pair[other].entries.keys())if(!used.has(relative))add(null,relative);
  for(const row of rows){const s=row[side==='a'?'pathA':'pathB']!==null?side:other,relative=row[s==='a'?'pathA':'pathB'],parent=path.posix.dirname(relative);if(parent!=='.')row.parentId=lookup[s].get(parent)?.id??'missing';}
  return rows;
}
module.exports={buildOperationInventory};
