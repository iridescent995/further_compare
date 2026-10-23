'use strict';
// Read-only packaged asset audit. Run only after package builds have finished.
// Default: both Mac architectures and Windows app.asar. Optional positional ASAR
// paths also support an installed application's Resources/app.asar.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const expectedVersion=process.env.FC_EXPECT_VERSION||JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const defaults=['release/mac/Further Compare.app/Contents/Resources/app.asar','release/mac-arm64/Further Compare.app/Contents/Resources/app.asar','release/win-unpacked/resources/app.asar'];
const archives=(process.argv.length>2?process.argv.slice(2):defaults).map(file=>path.resolve(root,file));
const artifacts=['dist/app.js','dist/app.js.map','dist/legacy-workbook-browser-worker.js','dist/legacy-workbook-browser-worker.js.map','dist/licenses/sheetjs/LICENSE','dist/licenses/sheetjs/NOTICE.txt'];
const native=['table-value-save-guard.cjs','local-text-save.cjs','window-runtime.cjs','preload.cjs','sessions.cjs','shell-requests.cjs','data-dialogs.cjs'].map(f=>'desktop/'+f);
const workerSources=['src/workbook-number-formats.cjs','src/legacy-workbook-browser-worker.js','src/legacy-workbook-worker.cjs','src/legacy-workbook-reader.cjs','src/workbook-date.cjs','src/xls-preflight.cjs','src/xlsb-preflight.cjs','node_modules/xlsx/xlsx.mjs'];
const appSources=['src/workbook-number-formats.cjs','src/app.js','src/advanced.js','src/workbook-package.cjs','src/ods-formula.cjs','src/ods-input.cjs','src/workbook-compare.cjs','src/legacy-workbook-input.js','src/legacy-workbook-worker-client.cjs'];
function same(actual,expected,label){assert.deepEqual(digest(actual),digest(expected),`${label}: SHA-256 differs`);assert.equal(actual.length,expected.length,`${label}: length differs`);}
function verifyMap(archive,mapName,required){const map=JSON.parse(asar.extractFile(archive,mapName));assert(Array.isArray(map.sources)&&Array.isArray(map.sourcesContent));for(const file of required){const matches=map.sources.map((source,i)=>({source,i})).filter(({source})=>path.resolve(path.dirname(path.join(root,mapName)),source)===path.join(root,file));assert.equal(matches.length,1,`${archive}: ${file} must appear exactly once in ${mapName}`);assert.equal(map.sourcesContent[matches[0].i],fs.readFileSync(path.join(root,file),'utf8'),`${archive}: stale embedded source ${file}`);}}
const tar=fs.readFileSync(path.join(root,'vendor/xlsx-0.20.3.tgz')),lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
assert.equal(digest(tar),'8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8');assert.equal(lock.packages['node_modules/xlsx'].integrity,'sha512-'+crypto.createHash('sha512').update(tar).digest('base64'));
const result=[];
for(const archive of archives){
 assert(fs.statSync(archive).isFile(),`Missing package ${archive}`);
 const packaged=JSON.parse(asar.extractFile(archive,'package.json'));assert.equal(packaged.version,expectedVersion,`${archive}: release version`);assert.equal(packaged.dependencies.xlsx,'file:vendor/xlsx-0.20.3.tgz');
 for(const file of [...artifacts,...native,'src/workbook-number-formats.cjs'])same(asar.extractFile(archive,file),fs.readFileSync(path.join(root,file)),`${archive}: ${file}`);
 verifyMap(archive,'dist/legacy-workbook-browser-worker.js.map',workerSources);verifyMap(archive,'dist/app.js.map',appSources);
 const parserMeta=JSON.parse(asar.extractFile(archive,'node_modules/xlsx/package.json'));assert.equal(parserMeta.version,'0.20.3');
 same(asar.extractFile(archive,'node_modules/xlsx/LICENSE'),fs.readFileSync(path.join(root,'public/licenses/sheetjs/LICENSE')),`${archive}: parser license`);
 same(asar.extractFile(archive,'node_modules/xlsx/xlsx.mjs'),fs.readFileSync(path.join(root,'node_modules/xlsx/xlsx.mjs')),`${archive}: parser module`);
 result.push({archive,version:packaged.version,parser:parserMeta.version,workerSha256:digest(asar.extractFile(archive,'dist/legacy-workbook-browser-worker.js')),exactArtifacts:artifacts.length+native.length+1,workerSources:workerSources.length,appSources:appSources.length});
}
console.log(JSON.stringify(result,null,2));console.log('Packaged legacy workbook assets passed: exact current app/worker bytes, embedded sources, native protection/routing and number-format census/helper, parser version and distributed license. This does not execute Windows or prove runtime acceptance.');
