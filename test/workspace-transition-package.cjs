'use strict';
// Read-only audit of the shipped renderer, including transition and line-copy sources.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
const defaults=['release/mac-arm64/Further Compare.app/Contents/Resources/app.asar','release/mac/Further Compare.app/Contents/Resources/app.asar','release/win-unpacked/resources/app.asar'];
for(const file of process.argv.length>2?process.argv.slice(2):defaults){
 const archive=path.resolve(root,file);
 assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version,version);
 for(const name of ['dist/app.js','dist/app.js.map','dist/compare.html'])assert.deepEqual(asar.extractFile(archive,name),fs.readFileSync(path.join(root,name)),file+': stale '+name);
 const map=JSON.parse(asar.extractFile(archive,'dist/app.js.map'));
 for(const source of ['src/app.js','src/text-tools.js','src/live-text-diff.js']){
  const indexes=map.sources.flatMap((name,i)=>path.resolve(root,'dist',map.sourceRoot||'',name)===path.join(root,source)?[i]:[]);
  assert.equal(indexes.length,1,file+': missing or duplicate '+source);
  assert.equal(map.sourcesContent[indexes[0]],fs.readFileSync(path.join(root,source),'utf8'),file+': stale embedded '+source);
 }
 console.log('PASS '+file+': '+version+' exact renderer and transition/aligned-copy sources');
}
