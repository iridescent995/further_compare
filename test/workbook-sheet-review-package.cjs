'use strict';
// Read-only release audit; run only after all builders finish. Does not launch apps.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),version=process.env.FC_EXPECT_VERSION||manifest.version;
const defaults=['release/mac-arm64/Further Compare.app/Contents/Resources/app.asar','release/mac/Further Compare.app/Contents/Resources/app.asar','release/win-unpacked/resources/app.asar'];
const archives=(process.argv.length>2?process.argv.slice(2):defaults).map(name=>path.resolve(root,name));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const native=new Set();function closure(file,set){if(set.has(file))return;set.add(file);const text=fs.readFileSync(path.join(root,file),'utf8');for(const match of text.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)){if(match[1].startsWith('.')){const resolved=path.resolve(root,path.dirname(file),match[1]);assert(resolved.startsWith(root+path.sep),'Dependency escapes repository');closure(path.relative(root,resolved),set);}}}
closure('src/ods-input.cjs',native);closure('src/workbook-sheet-metadata.cjs',native);
for(const file of native)assert(manifest.build.files.includes(file),'Native metadata/reader dependency missing from package allowlist: '+file);
const legacy=new Set();for(const file of ['src/legacy-workbook-worker.cjs','src/xls-preflight.cjs','src/xlsb-preflight.cjs'])closure(file,legacy);
const review=new Set();closure('src/workbook-sheet-review.cjs',review);
const renderer=['src/advanced.js','src/workbook-sheet-metadata.cjs','src/workbook-package.cjs',...native,...review];
function exact(archive,file){const bytes=asar.extractFile(archive,file);assert.equal(hash(bytes),hash(fs.readFileSync(path.join(root,file))),archive+': stale '+file);return bytes;}
function checkMap(archive,name,sources){const map=JSON.parse(exact(archive,'dist/'+name+'.js.map'));assert.equal(map.version,3);assert.equal(map.sources.length,map.sourcesContent.length);for(const file of new Set(sources)){const indexes=map.sources.flatMap((source,i)=>path.resolve(root,'dist',map.sourceRoot||'',source)===path.join(root,file)?[i]:[]);assert.equal(indexes.length,1,archive+': missing/duplicate '+file+' in '+name);assert.equal(map.sourcesContent[indexes[0]],fs.readFileSync(path.join(root,file),'utf8'),archive+': stale embedded '+file);}return sources.length;}
const reports=[];
for(const archive of archives){assert(fs.statSync(archive).isFile());assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version,version,archive+': version mismatch');for(const file of native)exact(archive,file);
 for(const file of ['dist/app.js','dist/advanced.css','dist/compare.html','dist/workbook-review-worker.js','dist/legacy-workbook-browser-worker.js'])exact(archive,file);
 checkMap(archive,'app',renderer);checkMap(archive,'workbook-review-worker',['src/workbook-review-worker.js',...review]);checkMap(archive,'legacy-workbook-browser-worker',['src/legacy-workbook-browser-worker.js',...legacy]);
 assert.equal(asar.extractFile(archive,'dist/advanced.css').toString(),fs.readFileSync(path.join(root,'public/advanced.css'),'utf8'),archive+': CSS differs from source');
 const advanced=fs.readFileSync(path.join(root,'src/advanced.js'),'utf8');for(const token of ['workbook-review-worker.js','Compare all sheets','Stop sheet review','Workbook sheet review'])assert(advanced.includes(token),'Missing review surface '+token);
 const entries=new Set(asar.listPackage(archive).map(name=>name.replace(/^\//,'')));assert(!entries.has('desktop/explorer-release.json'),'Unaccepted Explorer release authority');
 reports.push({archive,version,nativeReaderFiles:native.size,legacyWorkerSources:legacy.size,reviewSources:review.size,appSha256:hash(asar.extractFile(archive,'dist/app.js')),reviewWorkerSha256:hash(asar.extractFile(archive,'dist/workbook-review-worker.js'))});
}
console.log(JSON.stringify(reports,null,2));console.log('Workbook sheet review package audit passed: exact renderer/worker/CSS, embedded source closures and native metadata/ODS reader closure. Static audit only; no Windows runtime qualification.');
