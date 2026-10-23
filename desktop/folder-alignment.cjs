'use strict';
const {createHash} = require('node:crypto');
const {endpointRelative:relative,validateEndpointKinds,swapEndpointKinds}=require('./folder-endpoint-path-policy.cjs');
const ancestor = (parent,child) => child.startsWith(parent+'/');
function validSide(side) { if (side !== 'a' && side !== 'b') throw new TypeError('Choose a valid alignment side.'); return side === 'a' ? 'b' : 'a'; }
class FolderAlignment {
  constructor(pairs = [], endpointKinds) {
    this.endpointKinds=validateEndpointKinds(endpointKinds);
    if (!Array.isArray(pairs) || pairs.length > 1000) throw new TypeError('Folder alignment supports at most 1,000 pairs.');
    const seenA = new Set(), seenB = new Set();
    const descriptors = Array.from(pairs,pair => {
      if (!pair || Object.getPrototypeOf(pair) !== Object.prototype || Object.keys(pair).some(key => !['a','b','kind'].includes(key)) || !['file','directory'].includes(pair.kind)) throw new TypeError('Invalid folder alignment pair.');
      const a = relative(pair.a,this.endpointKinds.a), b = relative(pair.b,this.endpointKinds.b);
      if (seenA.has(a) || seenB.has(b)) throw new Error('Each alignment endpoint must be unique on its side.');
      seenA.add(a); seenB.add(b);
      return Object.freeze({a,b,kind:pair.kind});
    });
    for (let i = 0; i < descriptors.length; i++) for (let j = i+1; j < descriptors.length; j++) {
      const first = descriptors[i], second = descriptors[j];
      const aForward = ancestor(first.a,second.a), bForward = ancestor(first.b,second.b);
      const aReverse = ancestor(second.a,first.a), bReverse = ancestor(second.b,first.b);
      if (aForward !== bForward || aReverse !== bReverse) throw new Error('Alignment pairs must preserve ancestor relationships.');
      if ((aForward && first.kind === 'file') || (aReverse && second.kind === 'file')) throw new Error('A file alignment cannot contain another endpoint.');
    }
    descriptors.sort((x,y) => x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : x.b > y.b ? 1 : 0);
    this.pairs = Object.freeze(descriptors);
    this.revision = createHash('sha256').update(JSON.stringify({pairs:descriptors,endpointKinds:this.endpointKinds})).digest('hex');
    Object.freeze(this);
  }
  counterpart(side, path) {
    const other = validSide(side);
    if (path === '') return '';
    relative(path,this.endpointKinds[side]);
    const project = (from,to,value) => {
      let chosen = null;
      for (const pair of this.pairs) if (pair[from] === value || pair.kind === 'directory' && ancestor(pair[from],value)) {
        if (!chosen || pair[from].length > chosen[from].length) chosen = pair;
      }
      return chosen ? chosen[to]+value.slice(chosen[from].length) : value;
    };
    const destination = relative(project(side,other,path),this.endpointKinds[other]);
    // A fallback must not claim an explicitly paired endpoint (or directory
    // descendant) belonging to a different source. Check both directions.
    return project(other,side,destination) === path ? destination : null;
  }
  swap() { return new FolderAlignment(this.pairs.map(({a,b,kind}) => ({a:b,b:a,kind})),swapEndpointKinds(this.endpointKinds)); }
  rename(side, oldPath, newPath) {
    validSide(side); relative(oldPath,this.endpointKinds[side]); relative(newPath,this.endpointKinds[side]);
    if (ancestor(oldPath,newPath)) throw new Error('Cannot move an alignment endpoint into its own descendant.');
    return new FolderAlignment(this.pairs.map(pair => ({...pair,[side]:pair[side] === oldPath || ancestor(oldPath,pair[side]) ? newPath+pair[side].slice(oldPath.length) : pair[side]})),this.endpointKinds);
  }
}
module.exports = {FolderAlignment};
