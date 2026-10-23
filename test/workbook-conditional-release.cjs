'use strict';
// Read-only release audit; run after all builders finish. Optional ASAR paths
// support an installed app. Defaults inspect both Mac builds and Windows assets.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const version=process.env.FC_EXPECT_VERSION||manifest.version;
const defaults=['release/mac/Further Compare.app/Contents/Resources/app.asar','release/mac-arm64/Further Compare.app/Contents/Resources/app.asar','release/win-unpacked/resources/app.asar'];
const archives=(process.argv.length>2?process.argv.slice(2):defaults).map(file=>path.resolve(root,file));
const native=['src/workbook-conditional.cjs'];
const desktop=['desktop/sessions.cjs','desktop/session-defaults.cjs'];
const embedded=['src/workbook-conditional.cjs','src/advanced.js','src/workbook-package.cjs','src/session-defaults-ui.js'];
for(const file of native)assert(manifest.build.files.includes(file),'Missing native package allowlist entry: '+file);
function collect(directory){return fs.readdirSync(path.join(root,directory),{withFileTypes:true}).flatMap(entry=>{const file=directory+'/'+entry.name;if(file==='dist/downloads')return [];if(entry.isDirectory())return collect(file);assert(entry.isFile(),'Unexpected build asset symlink: '+file);return [file];});}
const artifacts=collect('dist');
assert(artifacts.includes('dist/app.js')&&artifacts.includes('dist/app.js.map')&&artifacts.includes('dist/compare.html'),'Missing required renderer build assets');
const results=[];
for(const archive of archives){
 assert(fs.statSync(archive).isFile(),'Missing package: '+archive);
 const packaged=JSON.parse(asar.extractFile(archive,'package.json'));assert.equal(packaged.version,version,archive+': version');
 for(const file of [...native,...desktop,...artifacts])assert.deepEqual(asar.extractFile(archive,file),fs.readFileSync(path.join(root,file)),archive+': stale or missing '+file);
 const map=JSON.parse(asar.extractFile(archive,'dist/app.js.map'));
 assert(Array.isArray(map.sources)&&Array.isArray(map.sourcesContent),'Missing embedded sources');
 for(const file of embedded){const matches=map.sources.map((source,i)=>path.resolve(root,'dist',source)===path.join(root,file)?i:-1).filter(i=>i>=0);assert.equal(matches.length,1,archive+': expected exactly one embedded '+file);assert.equal(map.sourcesContent[matches[0]],fs.readFileSync(path.join(root,file),'utf8'),archive+': stale embedded '+file);}
 results.push({archive,version:packaged.version,exactNativeFiles:native.length+desktop.length,exactBuildAssets:artifacts.length,embeddedSources:embedded});
}
console.log(JSON.stringify(results,null,2));
console.log('Conditional-rule release audit passed: exact reader, native session/default validation, renderer sources and build assets. Asset integrity does not constitute Windows runtime acceptance.');
