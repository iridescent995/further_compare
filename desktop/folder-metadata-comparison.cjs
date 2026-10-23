'use strict';
const path=require('node:path');
const keys={comparePermissions:'permissions',compareOwner:'owner',compareGroup:'group'};
function assertMetadataPlatform(rules,platform=process.platform){
  if(platform==='win32'&&Object.keys(keys).some(key=>rules?.[key]))throw Error('Unix permissions, owner and group comparison is not supported on Windows. Disable these comparison options.');
}
function applyMetadataComparison(result,a,b,rules,paths){
  assertMetadataPlatform(rules);
  const enabled=Object.keys(keys).filter(key=>rules?.[key]);
  if((!enabled.length&&!rules?.compareFilename)||!a||!b||result.status==='conflict')return result;
  const metadataDifferences=[];
  for(const key of enabled){
    const field=key==='comparePermissions'?'mode':key==='compareOwner'?'uid':'gid';
    const values=[a,b].map(entry=>Number(entry[field]));
    if([a,b].some(entry=>entry[field]===undefined||entry[field]===null)||values.some(value=>!Number.isSafeInteger(value)||value<0))throw Error('Incomplete Unix metadata in comparison snapshot. Capture the comparison again.');
    if((field==='mode'?values[0]&0o7777:values[0])!==(field==='mode'?values[1]&0o7777:values[1]))metadataDifferences.push(keys[key]);
  }
  if(rules.compareFilename){
    if(!paths||['a','b'].some(side=>typeof paths[side]!=='string'||!paths[side]||paths[side].endsWith('/')||paths[side].includes('\\')||paths[side].includes('\0')))throw Error('Actual endpoint paths are required for filename comparison.');
    if(path.posix.basename(paths.a)!==path.posix.basename(paths.b))metadataDifferences.push('filename');
  }
  return {...result,contentStatus:result.status,metadataDifferences:Object.freeze(metadataDifferences),status:metadataDifferences.length?'changed':result.status};
}
module.exports={assertMetadataPlatform,applyMetadataComparison};
