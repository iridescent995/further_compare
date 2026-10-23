const test=require('node:test'),assert=require('node:assert/strict');const {zip}=require('./archive-fixture.cjs');const {parseArchive,compareArchiveNode}=require('../src/archive-core.cjs');
test('ZIP stored/deflated entries compare only expanded nodes and preserve binary bytes',async()=>{
 const a=parseArchive(zip([{name:'root.txt',data:'same',deflate:true},{name:'nested/child.bin',data:Buffer.from([0,1,2])}])),b=parseArchive(zip([{name:'root.txt',data:'same'},{name:'nested/child.bin',data:Buffer.from([0,1,3]),deflate:true}]));
 const read=a.read;let calls=[];a.read=async path=>{calls.push(path);return read(path);};const root=await compareArchiveNode(a,b);assert.equal(root.find(r=>r.name==='root.txt').status,'equal');assert.deepEqual(calls,['root.txt']);assert.equal(root.find(r=>r.name==='nested').status,'directory');assert.equal((await compareArchiveNode(a,b,'nested'))[0].status,'changed');assert.deepEqual(await b.read('nested/child.bin'),new Uint8Array([0,1,3]));
});
test('ZIP parser rejects traversal, duplicate names, symlinks, encryption and missing ZIP64 metadata',()=>{
 for(const name of ['../escape','/root','C:/file','a\\b','a/../b'])assert.throws(()=>parseArchive(zip([{name,data:'x'}])),/Unsafe/);
 assert.throws(()=>parseArchive(zip([{name:'x'},{name:'x'}])),/Duplicate/);
 assert.throws(()=>parseArchive(zip([{name:'link',attributes:(0xa000<<16)>>>0}])),/Symbolic/);
 assert.throws(()=>parseArchive(zip([{name:'secret',flags:1}])),/Encrypted/);
 const large=zip([]);large.writeUInt16LE(65535,large.length-12);assert.throws(()=>parseArchive(large),/Multi|ZIP64/);
 const parent=zip([{name:'a',data:'x'},{name:'a/child',data:'z'}]);assert.throws(()=>parseArchive(parent),/parent/);
});
test('ZIP reads enforce CRC and actual decompression bounds',async()=>{
 const corrupt=zip([{name:'x',data:'abc'}]);corrupt[31]^=1;const parsed=parseArchive(corrupt);await assert.rejects(parsed.read('x'),/CRC/);
 const bomb=zip([{name:'x',data:'x'.repeat(10000),deflate:true}]);bomb.writeUInt32LE(1,22);const central=bomb.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));bomb.writeUInt32LE(1,central+24);await assert.rejects(parseArchive(bomb).read('x'),/declared size/);
});

test('ZIP modified times retain wall-clock fields without inventing a timezone',()=>{
 const archive=parseArchive(zip([{name:'dated',date:((2026-1980)<<9)|(10<<5)|20,time:(9<<11)|(30<<5)|5},{name:'nested/child',date:0,time:0}]));
 assert.equal(archive.entries.get('dated').modified,'2026-10-20 09:30:10');assert.equal(archive.entries.get('nested').modified,null);assert.equal(archive.entries.get('nested/child').modified,null);
});
