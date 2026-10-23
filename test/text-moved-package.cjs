'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
const defaults=['release/mac/Further Compare.app/Contents/Resources/app.asar','release/mac-arm64/Further Compare.app/Contents/Resources/app.asar','release/win-unpacked/resources/app.asar'];
for(const name of process.argv.length>2?process.argv.slice(2):defaults){
 const archive=path.resolve(root,name);assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version,version);
 for(const file of ['desktop/sessions.cjs','desktop/session-defaults.cjs','dist/compare.html','dist/style.css','dist/live-text-diff.css','dist/app.js','dist/app.js.map','dist/worker.js','dist/worker.js.map'])assert.deepEqual(asar.extractFile(archive,file),fs.readFileSync(path.join(root,file)),file);
 for(const [bundle,required] of [['worker',['src/worker.js','src/text-moved-blocks.cjs']],['app',['src/app.js','src/live-text-diff.js','src/compact-text-layout.js']]]){
  const map=JSON.parse(asar.extractFile(archive,'dist/'+bundle+'.js.map'));
  for(const file of required){const positions=map.sources.map((source,i)=>path.resolve(root,'dist',source)===path.join(root,file)?i:-1).filter(i=>i>=0);assert.equal(positions.length,1,file);assert.equal(map.sourcesContent[positions[0]],fs.readFileSync(path.join(root,file),'utf8'),file);}
 }
 console.log(name+': moved-text worker, live editor, options and native preferences match source.');
}
