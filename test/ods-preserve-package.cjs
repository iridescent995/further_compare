'use strict';
// Read-only release audit: execute after all requested package builders finish.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const defaults=['release/mac-arm64/Further Compare.app/Contents/Resources/app.asar','release/mac/Further Compare.app/Contents/Resources/app.asar','release/win-unpacked/resources/app.asar'];
const archives=(process.argv.length>2?process.argv.slice(2):defaults).map(file=>path.resolve(root,file));
const sources=['src/app.js','src/advanced.js','src/ods-preserve.js','src/ods-cell-edits.cjs','src/ods-input.cjs'];
const nativeSources=['desktop/sessions.cjs','desktop/window-runtime.cjs','desktop/table-value-save-guard.cjs','src/ods-cell-edits.cjs','src/workbook-cell-edits.cjs','src/ods-input.cjs','src/ods-formula.cjs','src/archive-core.cjs'];
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const app=fs.readFileSync(path.join(root,'dist/app.js')),mapBytes=fs.readFileSync(path.join(root,'dist/app.js.map'));
const results=[];
for(const archive of archives){
 assert(fs.statSync(archive).isFile(),`Missing package: ${archive}`);
 const packaged=JSON.parse(asar.extractFile(archive,'package.json'));assert.equal(packaged.version,version,`${archive}: package version differs from current source`);
 const packagedApp=asar.extractFile(archive,'dist/app.js'),packagedMap=asar.extractFile(archive,'dist/app.js.map');assert.deepEqual(packagedApp,app,`${archive}: packaged renderer differs from current dist`);assert.deepEqual(packagedMap,mapBytes,`${archive}: packaged source map differs from current dist`);
 const map=JSON.parse(packagedMap);assert.equal(map.version,3,`${archive}: source-map version`);assert(Array.isArray(map.sources)&&Array.isArray(map.sourcesContent),`${archive}: missing embedded sources`);assert.equal(map.sources.length,map.sourcesContent.length,`${archive}: source-map source/content count mismatch`);
 for(const source of sources){const indexes=map.sources.flatMap((name,index)=>path.resolve(root,'dist',map.sourceRoot||'',name)===path.join(root,source)?[index]:[]);assert.equal(indexes.length,1,`${archive}: ${source} must occur exactly once in renderer map`);assert.equal(map.sourcesContent[indexes[0]],fs.readFileSync(path.join(root,source),'utf8'),`${archive}: stale embedded source ${source}`);}
 for(const source of nativeSources)assert.deepEqual(asar.extractFile(archive,source),fs.readFileSync(path.join(root,source)),`${archive}: stale native or ODS reader dependency ${source}`);
 results.push({archive,version,verifiedNativeSources:nativeSources,rendererSha256:sha256(packagedApp),sourceMapSha256:sha256(packagedMap),verifiedSources:sources});
}
console.log(JSON.stringify(results,null,2));
console.log('ODS preservation package audit passed: current release version, exact renderer/map bytes, embedded app/advanced/preserving engine/ODS reader, native session/runtime/save guard and ODS reader dependencies. Static audit only; Windows runtime is not tested.');
