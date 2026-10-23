'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('native document decoder dependency graph is included in desktop packages',()=>{
 const root=path.resolve(__dirname,'..'),files=new Set(require('../package.json').build.files),seen=new Set();
 function inspect(relative){if(seen.has(relative))return;seen.add(relative);assert(files.has(relative),`Native document dependency missing from package allowlist: ${relative}`);const source=fs.readFileSync(path.join(root,relative),'utf8');
  for(const match of source.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)){const target=path.posix.normalize(path.posix.join(path.posix.dirname(relative),match[1]));assert(!target.startsWith('../'),'Dependency must stay in application');inspect(target);}
 }
 inspect('src/text-input.cjs');assert(seen.has('src/odt-text.cjs'));assert(seen.has('src/ods-input.cjs'));
});
