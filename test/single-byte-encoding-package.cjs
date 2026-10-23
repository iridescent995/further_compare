'use strict';
// Read-only audit; run after packaging finishes. Optional arguments are ASAR paths.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
const version=process.env.FC_EXPECT_VERSION||manifest.version;
const defaults=['release/mac/Further Compare.app/Contents/Resources/app.asar','release/mac-arm64/Further Compare.app/Contents/Resources/app.asar','release/win-unpacked/resources/app.asar'];
const archives=(process.argv.length>2?process.argv.slice(2):defaults).map(file=>path.resolve(root,file));
const files=new Set(['src/text-codec.cjs','src/multibyte-text-codec.cjs','src/single-byte-text-codec.cjs','src/windows-codepages.cjs']);
const dependencies=['iconv-lite','safer-buffer','buffer','base64-js','ieee754'];
// Include all iconv runtime modules/tables: its codec registry loads tables dynamically.
function collect(directory){for(const entry of fs.readdirSync(path.join(root,directory),{withFileTypes:true})){const relative=directory+'/'+entry.name;if(entry.isDirectory())collect(relative);else if(/\.(js|json)$/.test(entry.name))files.add(relative);}}
collect('node_modules/iconv-lite/lib');collect('node_modules/iconv-lite/encodings');
for(const [name,entry]of [['safer-buffer','safer.js'],['buffer','index.js'],['base64-js','index.js'],['ieee754','index.js']])files.add('node_modules/'+name+'/'+entry);
// electron-builder normalizes dependency manifests; compare resolution fields below.
assert.equal(manifest.dependencies['iconv-lite'],'0.7.2');assert(manifest.dependencies.buffer,'Buffer must remain a production dependency');
for(const file of ['src/text-codec.cjs','src/multibyte-text-codec.cjs','src/single-byte-text-codec.cjs','src/windows-codepages.cjs'])assert(manifest.build.files.includes(file),'Missing native source allowlist entry: '+file);
const result=[];
for(const archive of archives){
 assert(fs.statSync(archive).isFile(),'Missing package: '+archive);
 const packaged=JSON.parse(asar.extractFile(archive,'package.json'));assert.equal(packaged.version,version,archive+': version');
 for(const name of ['iconv-lite','buffer'])assert.equal(packaged.dependencies[name],manifest.dependencies[name],archive+': production '+name);
 for(const name of dependencies){const relative='node_modules/'+name,installed=JSON.parse(fs.readFileSync(path.join(root,relative,'package.json'),'utf8')),meta=JSON.parse(asar.extractFile(archive,relative+'/package.json'));for(const key of ['name','version','main','exports','type','browser','dependencies'])assert.deepEqual(meta[key],installed[key],archive+': '+name+' manifest '+key);assert.equal(meta.version,lock.packages[relative].version,archive+': '+name+' lock version');for(const dependency of Object.keys(meta.dependencies||{}))assert(dependencies.includes(dependency),'Unqualified codec runtime dependency: '+name+' -> '+dependency);}
 for(const file of files)assert.deepEqual(asar.extractFile(archive,file),fs.readFileSync(path.join(root,file)),archive+': stale or missing '+file);
 const entries=new Set(asar.listPackage(archive).map(file=>file.replace(/^\//,'')));
 assert(!entries.has('desktop/explorer-release.json'),archive+': unaccepted production Explorer release configuration must be absent');
 result.push({archive,version:packaged.version,exactRuntimeFiles:files.size,dependencies,productionExplorerConfiguration:false});
}
console.log(JSON.stringify(result,null,2));
console.log('Single-byte codec package audit passed: exact native sources, pinned production dependency closure and no production Explorer authority. This is an asset audit, not Windows runtime acceptance.');
