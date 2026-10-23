'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseArchive}=require('../src/archive-core.cjs');
const {writeZipEntries,writeTarEntries,writeArchive,prepareArchiveAdd,prepareArchiveFolderAdd}=require('../src/archive-edit.cjs');
const file=permissions=>({path:'x',kind:'file',data:new Uint8Array([1,2]),...(permissions===undefined?{}:{permissions})});
function tarMode(bytes,text){const copy=bytes.slice();copy.fill(0,100,108);copy.set(new TextEncoder().encode(text),100);copy.fill(32,148,156);let sum=0;for(const b of copy.subarray(0,512))sum+=b;copy.set(new TextEncoder().encode(sum.toString(8).padStart(6,'0')+'\0 '),148);return copy;}
function zipAttributes(bytes,host,mode){const copy=bytes.slice(),view=new DataView(copy.buffer);let at=-1;for(let i=0;i<copy.length-4;i++)if(view.getUint32(i,true)===0x02014b50){at=i;break;}assert.ok(at>=0);view.setUint16(at+4,(host<<8)|20,true);view.setUint32(at+38,(mode<<16)>>>0,true);return copy;}
test('archive permission input rejects special bits and malformed caller values',()=>{
 for(const permissions of [-1,0o1000,0o100644,1.5,'755',null,NaN])for(const writer of [writeZipEntries,writeTarEntries])assert.throws(()=>writer([file(permissions)]),/permissions/);
 assert.throws(()=>prepareArchiveAdd(null,[{name:'x',data:new Uint8Array(),permissions:0o4755}]),/permissions/);
 assert.throws(()=>prepareArchiveFolderAdd(null,[{path:'dir',kind:'directory',permissions:0o1755}]),/permissions/);
});
test('ZIP host semantics distinguish typed zero, unknown Unix mode and foreign attributes',async()=>{
 const bytes=writeZipEntries([file(0o751)]);
 assert.equal(parseArchive(zipAttributes(bytes,3,0o100000)).entries.get('x').permissions,0);
 for(const [host,mode]of [[3,0],[0,0o100751],[19,0o100751]]){
 const archive=parseArchive(zipAttributes(bytes,host,mode));assert.equal(archive.entries.get('x').permissions,undefined);assert.equal(parseArchive(await writeArchive(archive)).entries.get('x').permissions,undefined);assert.equal(parseArchive(await writeArchive(archive,{compression:'stored'})).entries.get('x').permissions,0o644);
 }
 assert.equal(parseArchive(zipAttributes(bytes,3,0o104751)).entries.get('x').permissions,0o751);
 for(const host of [0,3,19])assert.throws(()=>parseArchive(zipAttributes(bytes,host,0o120777)),/Symbolic links/);
});
test('TAR empty mode is unknown while explicit zero remains zero and special bits are discarded',async()=>{
 const bytes=writeTarEntries([file(0o755)]);
 const unknown=parseArchive(tarMode(bytes,''));assert.equal(unknown.entries.get('x').permissions,undefined);assert.equal(parseArchive(await writeArchive(unknown,{format:'tar'})).entries.get('x').permissions,0o644);
 assert.equal(parseArchive(tarMode(bytes,'0000000')).entries.get('x').permissions,0);
 const archive=parseArchive(tarMode(bytes,'0006751'));assert.equal(archive.entries.get('x').permissions,0o751);const exported=await writeArchive(archive,{format:'tar'});assert.equal(new TextDecoder().decode(exported.subarray(100,107)),'0000751');
});
test('implicit directories use safe defaults without inheriting child mode',async()=>{
 const archive=parseArchive(writeZipEntries([{...file(0),path:'parent/child'}]));assert.equal(archive.entries.get('parent').permissions,0o755);assert.equal(archive.entries.get('parent/child').permissions,0);
 const tar=parseArchive(await writeArchive(archive,{format:'tar'}));assert.equal(tar.entries.get('parent').permissions,0o755);assert.equal(tar.entries.get('parent/child').permissions,0);
});
