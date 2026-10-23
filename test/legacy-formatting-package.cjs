'use strict';
// Read-only audit. Run after all release builders complete; no app is launched.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),version=process.env.FC_EXPECT_VERSION||manifest.version;
const archives=(process.argv.length>2?process.argv.slice(2):['release/mac-arm64/Further Compare.app/Contents/Resources/app.asar','release/mac/Further Compare.app/Contents/Resources/app.asar','release/win-unpacked/resources/app.asar']).map(file=>path.resolve(root,file));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function closure(file,set=new Set()) {if(set.has(file))return set;set.add(file);const text=fs.readFileSync(path.join(root,file),'utf8');for(const match of text.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)){if(!match[1].startsWith('.'))continue;const resolved=path.resolve(root,path.dirname(file),match[1]);assert(resolved.startsWith(root+path.sep));closure(path.relative(root,resolved),set);}return set;}
const legacy=new Set();for(const entry of ['src/legacy-workbook-worker.cjs','src/xls-preflight.cjs','src/xlsb-preflight.cjs'])closure(entry,legacy);
for(const required of ['src/xls-formatting.cjs','src/xlsb-formatting.cjs','src/legacy-workbook-reader.cjs','src/legacy-workbook-formatting.cjs','src/workbook-compare.cjs'])assert(legacy.has(required),'Missing worker dependency '+required);
const review=closure('src/workbook-sheet-review.cjs');assert(review.has('src/legacy-formatting-compare.cjs'));assert(review.has('src/workbook-compare.cjs'));
// These native package entrypoints continue to require loose source modules.
// The legacy native-record decoders themselves run bundled in the browser worker.
const loose=new Set();for(const entry of ['src/ods-input.cjs','src/workbook-sheet-metadata.cjs'])closure(entry,loose);
for(const file of loose)assert(manifest.build.files.includes(file),'Missing native dependency allowlist: '+file);
function bundles(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(entry=>entry.name==='downloads'?[]:entry.isDirectory()?bundles(dir+'/'+entry.name):/\.(?:js|mjs|cjs|map|css|html)$/.test(entry.name)?[dir+'/'+entry.name]:[]);}
const assets=bundles('dist');
function exact(archive,file){const bytes=asar.extractFile(archive,file);assert.equal(hash(bytes),hash(fs.readFileSync(path.join(root,file))),archive+': stale '+file);return bytes;}
function mapCheck(archive,name,required){const map=JSON.parse(exact(archive,'dist/'+name+'.js.map'));assert.equal(map.version,3);assert.equal(map.sources.length,map.sourcesContent.length);for(const file of new Set(required)){const matches=map.sources.flatMap((source,i)=>path.resolve(root,'dist',map.sourceRoot||'',source)===path.join(root,file)?[i]:[]);assert.equal(matches.length,1,archive+': missing or duplicate '+file+' in '+name);assert.equal(map.sourcesContent[matches[0]],fs.readFileSync(path.join(root,file),'utf8'),archive+': stale embedded '+file);}}
const reports=[];
for(const archive of archives){assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version,version);for(const file of [...assets,...loose])exact(archive,file);
 mapCheck(archive,'legacy-workbook-browser-worker',['src/legacy-workbook-browser-worker.js',...legacy,'node_modules/xlsx/xlsx.mjs']);
 mapCheck(archive,'app',['src/app.js','src/advanced.js',...review]);
 mapCheck(archive,'workbook-review-worker',['src/workbook-review-worker.js',...review]);
 exact(archive,'node_modules/xlsx/xlsx.mjs');assert.equal(JSON.parse(asar.extractFile(archive,'node_modules/xlsx/package.json')).version,'0.20.3');
 for(const file of ['dist/licenses/sheetjs/LICENSE','dist/licenses/sheetjs/NOTICE.txt'])exact(archive,file);
 assert.equal(asar.extractFile(archive,'dist/advanced.css').toString(),fs.readFileSync(path.join(root,'public/advanced.css'),'utf8'));
 reports.push({archive,version,exactBundleAssets:assets.length,legacyWorkerSources:legacy.size,reviewSources:review.size,nativeLooseSources:loose.size,workerSha256:hash(asar.extractFile(archive,'dist/legacy-workbook-browser-worker.js'))});
}
console.log(JSON.stringify(reports,null,2));console.log('Legacy base-formatting package audit passed: exact bundles, native-record decoder/reader closure, sparse comparison in app and review worker, native loose dependencies and pinned parser. Static audit only; no Windows runtime claim.');
