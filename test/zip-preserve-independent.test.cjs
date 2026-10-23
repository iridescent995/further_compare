'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {parseArchiveInput}=require('../src/archive-core.cjs');
const {preserveZipArchive,hasZipSource}=require('../src/zip-preserve.cjs');
const root=path.join(__dirname,'fixtures/zip-preserve-independent'),expected=JSON.parse(fs.readFileSync(path.join(root,'expected.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function records(archive){const output=[];for(const entry of archive.entries.values())if(!entry.implicit)output.push({...entry,data:entry.kind==='file'?await archive.read(entry.path):new Uint8Array()});return output;}
function readback(bytes){const folder=fs.mkdtempSync(path.join(os.tmpdir(),'fc-zip-independent-'));try{const file=path.join(folder,'result.zip');fs.writeFileSync(file,bytes);return JSON.parse(execFileSync('python3',[path.join(root,'readback.py'),file],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024}));}finally{fs.rmSync(folder,{recursive:true,force:true});}}
for(const name of Object.keys(expected))test('independent producer preserves no-op and retained compressed data: '+name,async()=>{
 const bytes=fs.readFileSync(path.join(root,name)),original=Buffer.from(bytes),archive=await parseArchiveInput(bytes);assert.equal(hash(bytes),expected[name].sha256);assert(hasZipSource(archive));const desired=await records(archive);
 const noop=await preserveZipArchive(archive,desired);assert.deepEqual(Buffer.from(noop),original);
 const editedName=name==='infozip.zip'?'readme.txt':'plain.txt',edited=desired.map(entry=>entry.path===editedName?{...entry,data:Buffer.from('Edited independently verified text Ω\n')}:entry);
 const output=await preserveZipArchive(archive,edited),actual=readback(output),before=expected[name];const reopened=await parseArchiveInput(output);for(const entry of reopened.entries.values())if(entry.kind==='file')await reopened.read(entry.path);assert.equal(actual.comment,before.comment);assert.equal(actual.entries.length,before.entries.length);
 for(const previous of before.entries){const current=actual.entries.find(entry=>entry.name===previous.name);assert(current);for(const field of ['comment','externalAttributes','internalAttributes','createSystem','dateTime','rawLocalTimestamp'])assert.deepEqual(current[field],previous[field],previous.name+' '+field);if(previous.name!==editedName){for(const field of ['method','payloadSha256','compressedSha256','crc','size','compressedSize','extra','rawLocalExtra'])assert.deepEqual(current[field],previous[field],previous.name+' '+field);}}
 assert.equal(actual.entries.find(entry=>entry.name===editedName).payloadSha256,hash(Buffer.from('Edited independently verified text Ω\n')));assert.deepEqual(bytes,original);assert.equal(hash(await archive.read(editedName)),before.entries.find(entry=>entry.name===editedName).payloadSha256);
});
test('unselected corrupted stored payload refuses a preserving edit and leaves source immutable',async()=>{
 const bytes=fs.readFileSync(path.join(root,'python-mixed.zip')),archive=await parseArchiveInput(bytes),desired=await records(archive);const corrupted=Buffer.from(bytes),nameLength=corrupted.readUInt16LE(26),extraLength=corrupted.readUInt16LE(28);corrupted[30+nameLength+extraLength]^=1;const snapshot=Buffer.from(corrupted);
 await assert.rejects(async()=>preserveZipArchive(await parseArchiveInput(corrupted),desired),/CRC|integrity|checksum/i);assert.deepEqual(corrupted,snapshot);
});
test('unqualified extra fields refuse edits rather than silently dropping metadata',async()=>{
 const bytes=fs.readFileSync(path.join(root,'python-mixed.zip'));let changed=0;
 for(let i=0;i<bytes.length-46;i++){const signature=bytes.readUInt32LE(i);if(signature===0x04034b50){const start=i+30+bytes.readUInt16LE(i+26);if(bytes.readUInt16LE(start)===0x5455){bytes.writeUInt16LE(0xbeef,start);changed++;}}else if(signature===0x02014b50){const start=i+46+bytes.readUInt16LE(i+28);if(bytes.readUInt16LE(start)===0x5455){bytes.writeUInt16LE(0xbeef,start);changed++;}}}
 assert(changed>0);const original=Buffer.from(bytes),archive=await parseArchiveInput(bytes),desired=await records(archive);desired.find(entry=>entry.path==='plain.txt').data=Buffer.from('changed');await assert.rejects(preserveZipArchive(archive,desired),/extra|metadata|preserv|unsupported/i);assert.deepEqual(bytes,original);
});
test('overlapping local entry references are rejected before output',async()=>{
 const bytes=fs.readFileSync(path.join(root,'python-mixed.zip')),central=[];for(let i=0;i<bytes.length-46;i++)if(bytes.readUInt32LE(i)===0x02014b50)central.push(i);assert(central.length>1);bytes.writeUInt32LE(bytes.readUInt32LE(central[0]+42),central[1]+42);const before=Buffer.from(bytes);
 await assert.rejects(async()=>{const archive=await parseArchiveInput(bytes);return preserveZipArchive(archive,await records(archive));},/overlap|header|name|local|mismatch/i);assert.deepEqual(bytes,before);
});
test('conflicting valid Unicode path extras cannot silently change logical names on edit',async()=>{
 const bytes=fs.readFileSync(path.join(root,'python-mixed.zip'));let changed=0;
 for(let i=0;i<bytes.length-46;i++){const sig=bytes.readUInt32LE(i);if(sig!==0x04034b50&&sig!==0x02014b50)continue;const central=sig===0x02014b50,head=central?46:30,n=bytes.readUInt16LE(i+(central?28:26)),x=bytes.readUInt16LE(i+(central?30:28));if(bytes.subarray(i+head,i+head+n).toString()!=='plain.txt')continue;for(let p=i+head+n;p<i+head+n+x;){const size=bytes.readUInt16LE(p+2);if(bytes.readUInt16LE(p)===0x7075){assert.equal(size,14);Buffer.from('other.txt').copy(bytes,p+9);changed++;}p+=4+size;}}
 assert.equal(changed,2);const before=Buffer.from(bytes);await assert.rejects(async()=>{const archive=await parseArchiveInput(bytes),desired=await records(archive);desired.find(e=>e.path==='run.sh').data=Buffer.from('changed');return preserveZipArchive(archive,desired);},/Unicode|name|extra|metadata|preserv/i);assert.deepEqual(bytes,before);
});
test('parser-owned source snapshot survives caller buffer changes and no-op output mutation',async()=>{
 const source=fs.readFileSync(path.join(root,'python-mixed.zip')),original=Buffer.from(source),archive=await parseArchiveInput(source),desired=await records(archive);source.fill(0);
 const first=await preserveZipArchive(archive,desired);assert.deepEqual(Buffer.from(first),original);first.fill(0);assert.deepEqual(Buffer.from(await preserveZipArchive(archive,desired)),original);
});
function extraFields(hex){const data=Buffer.from(hex,'hex'),fields=new Map();for(let p=0;p<data.length;){const n=data.readUInt16LE(p+2);fields.set(data.readUInt16LE(p),data.subarray(p+4,p+4+n));p+=4+n;}return fields;}
test('timestamp edits keep DOS, UT and NTFS modification times consistent without changing access/create times',async()=>{
 const bytes=fs.readFileSync(path.join(root,'python-ntfs.zip')),before=Buffer.from(bytes),archive=await parseArchiveInput(bytes),desired=await records(archive);desired.find(e=>e.path==='plain.txt').modified='2024-04-05 06:07:08.123 UTC';
 const output=await preserveZipArchive(archive,desired),actual=readback(output),entry=actual.entries.find(e=>e.name==='plain.txt'),original=expected['python-ntfs.zip'].entries.find(e=>e.name==='plain.txt');assert.deepEqual(entry.dateTime,[2024,4,5,6,7,8]);assert.equal(entry.compressedSha256,original.compressedSha256);
 for(const key of ['extra','rawLocalExtra']){const fields=extraFields(entry[key]),prior=extraFields(original[key]);assert.equal(fields.get(0x5455).readUInt32LE(1),Math.floor(Date.UTC(2024,3,5,6,7,8,123)/1000));assert.equal(fields.get(0x000a).readBigUInt64LE(8),BigInt(Date.UTC(2024,3,5,6,7,8,123))*10000n+116444736000000000n);assert.deepEqual(fields.get(0x000a).subarray(16),prior.get(0x000a).subarray(16));}
 const reopened=await parseArchiveInput(output);assert.equal(reopened.entries.get('plain.txt').modified,'2024-04-05 06:07:08');assert.deepEqual(bytes,before);
});
test('explicit missing origin refuses rather than inventing replacement metadata',async()=>{
 const archive=await parseArchiveInput(fs.readFileSync(path.join(root,'python-mixed.zip')));await assert.rejects(preserveZipArchive(null,[{path:'new.txt',kind:'file',data:new Uint8Array([1])}],{origins:new Map([['new.txt',{archive,path:'missing.txt'}]])}),/origin|source|missing|exist|preserv/i);
});
test('aggregate payload budget is enforced before snapshotting excess bytes',async()=>{
 const data=new Uint8Array(1024*1024),desired=Array.from({length:65},(_,i)=>({path:'file'+i,kind:'file',data})),original=Uint8Array.from;let copied=0;
 // Count attempted snapshots without allocating 65 copies merely to test refusal.
 Uint8Array.from=function(value,...args){if(value===data){copied+=value.byteLength;return value;}return original.call(this,value,...args);};
 try{await assert.rejects(preserveZipArchive(null,desired),/64|limit|exceed|budget/i);assert(copied<=64*1024*1024,'excess payload bytes were copied before aggregate rejection');}finally{Uint8Array.from=original;}
});
