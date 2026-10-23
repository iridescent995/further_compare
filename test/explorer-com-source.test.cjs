'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{promisify}=require('node:util'),{execFile}=require('node:child_process'),{DOMParser}=require('@xmldom/xmldom');const exec=promisify(execFile),root=process.env.FC_EXPLORER_SOURCE_DIR||path.resolve('desktop/native/explorer');
test('Explorer manifest has matching native CLSID and file/folder contexts, no registration build target',async()=>{
 const source=await fs.readFile(path.join(root,'ExplorerCommand.cpp'),'utf8'),manifest=await fs.readFile(path.join(root,'Package.appxmanifest.in'),'utf8'),def=await fs.readFile(path.join(root,'ExplorerCommand.def'),'utf8'),cmake=await fs.readFile(path.join(root,'CMakeLists.txt'),'utf8');
 const errors=[],doc=new DOMParser({onError:(_level,message)=>errors.push(message)}).parseFromString(manifest,'application/xml');assert.deepEqual(errors,[]);
 const classes=Array.from(doc.getElementsByTagNameNS('*','Class'));assert.equal(classes.length,1);const clsid=classes[0].getAttribute('Id');assert.equal(clsid,'B93D608A-F29E-4B13-A268-0B0729A4DED8');assert.match(source,/0xb93d608a,0xf29e,0x4b13,\{0xa2,0x68,0x0b,0x07,0x29,0xa4,0xde,0xd8\}/);assert.deepEqual(Array.from(doc.getElementsByTagNameNS('*','Verb'),node=>node.getAttribute('Clsid')),[clsid,clsid]);assert.deepEqual(Array.from(doc.getElementsByTagNameNS('*','ItemType'),node=>node.getAttribute('Type')),['*','Directory']);assert.equal(classes[0].getAttribute('Path'),'FurtherCompareExplorer.dll');
 assert.match(def,/DllGetClassObject PRIVATE/);assert.match(def,/DllCanUnloadNow PRIVATE/);assert.doesNotMatch(def,/DllRegisterServer/);assert.doesNotMatch(cmake,/add_custom_target\([^)]*(?:register|install)/i);
 const menu=source.slice(source.indexOf('HRESULT selectionKinds'),source.indexOf('HRESULT captureSelection'));assert.match(menu,/SFGAO_FILESYSTEM\|SFGAO_FOLDER\|SFGAO_STREAM/);assert.doesNotMatch(menu,/GetDisplayName|CreateProcess|RegGetValue|GetFileAttributes|FindFirstFile/);
 assert.match(source,/CreateProcessW\(executable\.c_str\(\),line\.data\(\)/);assert.match(source,/const fc::Request request/);assert.doesNotMatch(source,/ShellExecute|system\(|WinExec|DllRegisterServer/);
});
test('native metadata policy treats filesystem ZIP containers as files and virtual streams as unsupported',async()=>{
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'fc-explorer-metadata-'));
 try{const source=path.join(temporary,'check.cpp'),binary=path.join(temporary,'check');await fs.writeFile(source,`#include "ShellMetadataPolicy.hpp"\n#include <cassert>\nusing namespace further_compare::explorer;\nint main(){assert(kindFromShellMetadata(true,true,false)==Kind::Folder);assert(kindFromShellMetadata(true,false,true)==Kind::File);assert(kindFromShellMetadata(true,true,true)==Kind::File);assert(kindFromShellMetadata(false,true,true)==Kind::Virtual);assert(kindFromShellMetadata(false,false,true)==Kind::Virtual);assert(kindFromShellMetadata(true,false,false)==Kind::File);const Item zip{u"C:\\\\a.zip",kindFromShellMetadata(true,true,true)},file{u"C:\\\\a.txt",Kind::File},folder{u"C:\\\\dir",Kind::Folder};assert(selectionPolicy({zip,file}).compareSelected);assert(!selectionPolicy({zip,folder}).compareSelected);}\n`);await exec(process.env.CXX||'clang++',['-std=c++17','-Wall','-Wextra','-Werror','-pedantic','-I',root,'-I',path.resolve('desktop/native/explorer'),source,'-o',binary],{timeout:60000});await exec(binary,[],{timeout:10000});}finally{await fs.rm(temporary,{recursive:true,force:true});}
});

test('Windows SDK contract includes metadata fakes without valid-selection invocation',async()=>{
 const source=await fs.readFile(path.join(root,'ComContractTests.cpp'),'utf8');
 assert.match(source,/class Item final : public IShellItem/);assert.match(source,/class Selection final : public IShellItemArray/);
 for(const marker of ['SFGAO_STREAM','failedCount','failedItem','missingItem','E_ACCESSDENIED','liveFakes==0','selectionCases(command,children)'])assert.ok(source.includes(marker),marker);
 assert.match(source,/GetDisplayName\(SIGDN type,PWSTR\* out\) override\{assert\(denyPath\)/);
 const invocations=[...source.matchAll(/->Invoke\(([^;]+)\)/g)].map(match=>match[1]);
 assert.equal(invocations.length,2);assert.ok(invocations.some(call=>call.startsWith('nullptr,nullptr)')));assert.ok(invocations.some(call=>call.startsWith('denied,nullptr)==E_ACCESSDENIED')));
 assert.match(source,/countCalls==1&&denied->itemCalls==1&&denied->first\(\)->pathCalls==1/);
 const implementation=await fs.readFile(path.join(root,'ExplorerCommand.cpp'),'utf8');
 const capture=implementation.slice(implementation.indexOf('HRESULT captureSelection'),implementation.indexOf('fc::DisplayLeftHint readLeftHint'));
 assert.equal((capture.match(/->GetItemAt\(/g)||[]).length,1);assert.equal((capture.match(/->GetCount\(/g)||[]).length,1);assert.doesNotMatch(capture,/selectionKinds|RegGetValue|configuredExecutable|CreateProcess/);
});
