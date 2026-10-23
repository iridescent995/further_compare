'use strict';
// Read-only asset audit. Run only after all builders finish. No application launch.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),version=process.env.FC_EXPECT_VERSION||manifest.version;
const defaults=['release/mac-arm64/Further Compare.app/Contents/Resources/app.asar','release/mac/Further Compare.app/Contents/Resources/app.asar','release/win-unpacked/resources/app.asar'];
const archives=(process.argv.length>2?process.argv.slice(2):defaults).map(file=>path.resolve(root,file)),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const runtime=['desktop/main.cjs','desktop/preload.cjs','desktop/window-runtime.cjs','desktop/sessions.cjs','desktop/document-save-guard.cjs','desktop/local-file-snapshot.cjs','desktop/local-text-save.cjs','desktop/batch-service.cjs','scripts/compare.cjs','scripts/batch.cjs'];
const renderer=['src/app.js','src/advanced.js','src/compact-text-layout.js','src/docx-text.cjs','src/text-input.cjs','src/document-projection.cjs'];
// Verify the entire local literal-require closure of the shared decoder, not only
// the top-level DOCX file: its ordinary codecs and other projection validators
// must remain loadable in the native/session/CLI paths too.
const local=new Set(),external=new Set();
function visit(file){if(local.has(file))return;local.add(file);const source=fs.readFileSync(path.join(root,file),'utf8');for(const match of source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)){const name=match[1];if(name.startsWith('.')){const resolved=path.resolve(root,path.dirname(file),name);assert(resolved.startsWith(root+path.sep),'Dependency escaped workspace');visit(path.relative(root,resolved));}else if(!name.startsWith('node:'))external.add(name);}}
visit('src/text-input.cjs');
for(const file of local)assert(manifest.build.files.includes(file),'Native decoder dependency omitted from package allowlist: '+file);
function filesBelow(directory){const result=[];for(const e of fs.readdirSync(path.join(root,directory),{withFileTypes:true})){const file=directory+'/'+e.name;if(e.isDirectory())result.push(...filesBelow(file));else if(e.isFile()){if(!file.endsWith('.d.ts'))result.push(file);}else throw Error('Unexpected runtime dependency symlink: '+file);}return result;}
const dependencyFiles=new Set();
for(const [name,directories,extra]of [
 ['@xmldom/xmldom',['lib'],['package.json','LICENSE']],
 ['iconv-lite',['lib','encodings'],['package.json','LICENSE']],
 ['safer-buffer',[],['package.json','safer.js','dangerous.js','LICENSE']],
 ['buffer',[],['package.json','index.js','LICENSE']],
 ['base64-js',[],['package.json','index.js','LICENSE']],
 ['ieee754',[],['package.json','index.js','LICENSE']]
]){const base='node_modules/'+name;for(const directory of directories)for(const file of filesBelow(base+'/'+directory))dependencyFiles.add(file);for(const file of extra)dependencyFiles.add(base+'/'+file);}
assert(external.has('@xmldom/xmldom'),'Expected shared decoder XML dependency');assert(external.has('iconv-lite'),'Expected shared legacy codec dependency');
function exact(archive,file){const bytes=asar.extractFile(archive,file);assert.equal(hash(bytes),hash(fs.readFileSync(path.join(root,file))),archive+': stale/missing '+file);return bytes;}
const reports=[];
for(const archive of archives){assert(fs.statSync(archive).isFile(),'Missing package '+archive);const packaged=JSON.parse(asar.extractFile(archive,'package.json'));assert.equal(packaged.version,version,archive+': wrong release version');
 for(const file of new Set([...runtime,...local,...dependencyFiles,'dist/app.js','dist/compare.html'])){
  if(file.startsWith('node_modules/')&&file.endsWith('/package.json')){
   // Electron Builder removes descriptive/development manifest fields. Runtime
   // resolution/version/dependency fields must remain exactly source-equivalent.
   const source=JSON.parse(fs.readFileSync(path.join(root,file),'utf8')),built=JSON.parse(asar.extractFile(archive,file));
   for(const key of ['name','version','main','type','exports','imports','browser','module','dependencies','optionalDependencies','peerDependencies','engines','license'])assert.deepEqual(built[key],source[key],archive+': dependency runtime manifest field differs '+file+' '+key);
  }else exact(archive,file);
 }
 const map=JSON.parse(exact(archive,'dist/app.js.map'));assert.equal(map.version,3);assert(Array.isArray(map.sources)&&Array.isArray(map.sourcesContent));assert.equal(map.sources.length,map.sourcesContent.length);
 for(const file of renderer){const indexes=map.sources.flatMap((source,i)=>path.resolve(root,'dist',map.sourceRoot||'',source)===path.join(root,file)?[i]:[]);assert.equal(indexes.length,1,archive+': expected one embedded '+file);assert.equal(map.sourcesContent[indexes[0]],fs.readFileSync(path.join(root,file),'utf8'),archive+': stale source map '+file);}
 const html=asar.extractFile(archive,'dist/compare.html').toString('utf8');for(const side of ['A','B'])for(const prefix of ['docxScope','reextractDocx'])assert(html.includes('id="'+prefix+side+'"'),archive+': missing DOCX scope control');assert(html.includes('main-and-related-text'),archive+': missing explicit related-text option');
 const engine=asar.extractFile(archive,'src/docx-text.cjs').toString('utf8');for(const token of ['main-and-related-text','RELATED_EXCLUSIONS','relatedParts','version:related?2:1'])assert(engine.includes(token),archive+': missing v2 engine/provenance surface');
 const names=new Set(asar.listPackage(archive).map(name=>name.replace(/^\//,'')));assert(!names.has('desktop/explorer-release.json'),archive+': unaccepted Explorer authority');
 reports.push({archive,version:packaged.version,nativeFiles:runtime.length,sharedDecoderFiles:local.size,runtimeDependencyFiles:dependencyFiles.size,embeddedSources:renderer,rendererSha256:hash(asar.extractFile(archive,'dist/app.js'))});
}
console.log(JSON.stringify(reports,null,2));
console.log('DOCX related-text package audit passed: exact native engine/decoder/session/runtime/source guards and CLI/batch, complete decoder dependency closure and XML/codec runtime files, exact renderer/map and embedded app/advanced sources, explicit v2 option surfaces. Static asset audit only; no Windows runtime or signing qualification.');
