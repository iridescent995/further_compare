'use strict';
const {listDirectoryPair}=require('./folder-provider-listing.cjs');
const {compareRows,compareFilePairs}=require('./folder-provider-comparison.cjs');
const validSide=side=>{if(!['a','b'].includes(side))throw Error('Invalid folder side.');};
// Retain all native safe-path, identity and open-handle checks unchanged.
function localFolderEndpoint(service,side){
 validSide(side);
 return {get rootId(){return service.roots[side]||null;},inspectRoot:options=>service.inspectRoot(side,options),inspectEntry:(relative,options)=>service.inspectEntry(side,relative,options),enumerateDirectory:(relative,options)=>service.enumerateDirectory(side,relative,options),openFileReader:(relative,options)=>service.openFileReader(side,relative,options),isIgnoredPath:relative=>service.isIgnoredPath(relative)};
}
class ProviderFolderService {
 constructor(endpoints={}){
  this.endpoints=Object.freeze({...endpoints});this.hashCache=new Map();
  this.roots={};for(const side of ['a','b'])Object.defineProperty(this.roots,side,{enumerable:true,get:()=>this.endpoints[side]?.rootId||null});Object.freeze(this.roots);
 }
 endpoint(side){validSide(side);const endpoint=this.endpoints[side];if(!endpoint)throw Error('Choose a folder first.');return endpoint;}
 inspectRoot(side,options){validSide(side);return this.endpoints[side]?.inspectRoot(options)??Promise.resolve(null);}
 inspectEntry(side,relative,options){validSide(side);if(!this.endpoints[side]||relative===null||this.isIgnoredPath(relative))return Promise.resolve(null);return this.endpoint(side).inspectEntry(relative,options);}
 enumerateDirectory(side,relative='',options){return this.endpoint(side).enumerateDirectory(relative,options);}
 openFileReader(side,relative,options){return this.endpoint(side).openFileReader(relative,options);}
 isIgnoredPath(relative){return typeof relative==='string'&&(relative.split('/').some(component=>['.git','node_modules','.DS_Store'].includes(component))||Object.values(this.endpoints).some(endpoint=>endpoint?.isIgnoredPath?.(relative)));}
 listDirectoryPair(nodes,options){return listDirectoryPair(this,nodes,options);}
 compareRows(result,rules,options){return compareRows(this,result,rules,options);}
 compareFilePairs(pairs,rules,options){return compareFilePairs(this,pairs,rules,options);}
}
module.exports={ProviderFolderService,localFolderEndpoint};
