'use strict';
// Read-only packaged audit. Run after all package builders finish. Optional
// positional ASARs allow inspecting an installed app; defaults cover 3 releases.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),version=process.env.FC_EXPECT_VERSION||manifest.version;
const defaults=['release/mac/Further Compare.app/Contents/Resources/app.asar','release/mac-arm64/Further Compare.app/Contents/Resources/app.asar','release/win-unpacked/resources/app.asar'],archives=(process.argv.length>2?process.argv.slice(2):defaults).map(file=>path.resolve(root,file));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const native=['src/pdf-text-core.mjs','src/pdf-page-order.mjs','src/pdf-tagged-order.mjs','src/pdf-text-node.cjs','src/pdf-text-node-child.cjs','src/document-projection.cjs','src/text-input.cjs','src/docx-text.cjs','src/rtf-text.cjs','src/odt-text.cjs','scripts/compare.cjs','scripts/batch.cjs'];
const desktop=['desktop/main.cjs','desktop/session-defaults.cjs','desktop/local-text-save.cjs','desktop/pdf-text-service.cjs','desktop/pdf-text-preload.cjs','desktop/pdf-text-entry.html','desktop/window-runtime.cjs','desktop/preload.cjs','desktop/sessions.cjs','desktop/document-save-guard.cjs'];
const artifacts=['dist/app.js','dist/app.js.map','dist/compare.html','dist/pdf/entry.js','dist/pdf/entry.js.map','dist/pdf/entry.html','dist/pdf/pdf.mjs','dist/pdf/pdf.worker.mjs','dist/pdf/LICENSE'];
for(const file of native)assert(manifest.build.files.includes(file),'Native PDF package allowlist missing '+file);
function same(archive,file,source=file){assert.equal(hash(asar.extractFile(archive,file)),hash(fs.readFileSync(path.join(root,source))),archive+': stale or missing '+file);}
function verifyMap(archive,name,required){const map=JSON.parse(asar.extractFile(archive,name));assert(Array.isArray(map.sources)&&Array.isArray(map.sourcesContent));for(const file of required){const positions=map.sources.map((source,i)=>path.resolve(path.dirname(path.join(root,name)),source)===path.join(root,file)?i:-1).filter(i=>i>=0);assert.equal(positions.length,1,archive+': expected exactly one '+file+' in '+name);assert.equal(map.sourcesContent[positions[0]],fs.readFileSync(path.join(root,file),'utf8'),archive+': embedded source differs '+file);}}
function resourceFiles(directory){const files=[];for(const e of fs.readdirSync(path.join(root,directory),{withFileTypes:true})){const name=directory+'/'+e.name;if(e.isDirectory())files.push(...resourceFiles(name));else if(e.isFile())files.push(name);else throw Error('Unexpected resource symlink: '+name);}return files;}
const resources=['cmaps','standard_fonts'].flatMap(dir=>resourceFiles('node_modules/pdfjs-dist/'+dir));assert(resources.some(f=>f.endsWith('/UniJIS-UCS2-H.bcmap')));assert(resources.some(f=>f.endsWith('/Adobe-Japan1-UCS2.bcmap')));
const pdfMeta=JSON.parse(fs.readFileSync(path.join(root,'node_modules/pdfjs-dist/package.json'),'utf8'));assert.equal(pdfMeta.version,'6.2.108');
const results=[];
for(const archive of archives){assert(fs.statSync(archive).isFile());const packaged=JSON.parse(asar.extractFile(archive,'package.json'));assert.equal(packaged.version,version,archive+': version');for(const file of [...native,...desktop,...artifacts])same(archive,file);
 verifyMap(archive,'dist/app.js.map',['src/advanced.js','src/docx-text.cjs','src/rtf-text.cjs','src/odt-text.cjs','src/app.js','src/pdf-page-order.mjs','src/pdf-tagged-order.mjs','src/pdf-text-core.mjs','src/pdf-text-browser.js','src/document-projection.cjs','src/text-input.cjs']);
 verifyMap(archive,'dist/pdf/entry.js.map',['src/pdf-page-order.mjs','src/pdf-tagged-order.mjs','src/pdf-text-core.mjs','src/pdf-text-browser.js','src/pdf-text-service-entry.js']);
 for(const source of resources)same(archive,source.replace('node_modules/pdfjs-dist/','dist/pdf/'),source);
 for(const file of ['pdf.mjs','pdf.worker.mjs'])same(archive,'dist/pdf/'+file,'node_modules/pdfjs-dist/build/'+file);same(archive,'dist/pdf/LICENSE','node_modules/pdfjs-dist/LICENSE');
 const names=new Set(asar.listPackage(archive).map(name=>name.replace(/^\//,'')));assert(!names.has('desktop/explorer-release.json'),'Unaccepted Explorer production authority');
 results.push({archive,version:packaged.version,exactArtifacts:native.length+desktop.length+artifacts.length,sourceMaps:2,pdfEngine:pdfMeta.version,resourceFiles:resources.length});
}
console.log(JSON.stringify(results,null,2));console.log('PDF reading-order policies and three-way document package audit passed: exact core/geometry, document decoders, native transports/provenance/session guards, browser and service source maps, engine/worker and all font/CMap assets. This asset audit does not execute Windows or the standalone Node CLI.');
